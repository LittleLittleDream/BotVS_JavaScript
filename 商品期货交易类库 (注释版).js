/*
Interval                       失败重试间隔(毫秒)       数字型(number)      500
SlideTick                      滑价点数(整数)          数字型(number)       1
RiskControl                    开启风控               布尔型(true/false)   false
MaxTrade@RiskControl           工作日最多交易交易次数    数字型(number)      50
MaxTradeAmount@RiskControl     单笔最多下单量           数字型(number)      1000
*/

var __orderCount = 0                                                               // 记录当前工作日的下单次数
var __orderDay = 0                                                                 // 记录当前工作日的日期

function CanTrade(tradeAmount) {                                                   // 风险控制模块， 参数：  交易数量
    if (!RiskControl) {                                                            // 默认 不开启风控模块，如果不开启，CanTrade 函数返回 true
        return true
    }
    if (typeof(tradeAmount) == 'number' && tradeAmount > MaxTradeAmount) {         // 传入参数 tradeAmount 为数值类型， 并且 下单量 大于 模板参数设定的 单笔最多下单量
        Log("风控模块限制, 超过最大下单量", MaxTradeAmount, "#ff0000 @");              // 输出提示信息， 中断执行。
        throw "中断执行"
        return false;
    }
    var nowDay = new Date().getDate();                                             // 获取 当前日期
    if (nowDay != __orderDay) {                                                    // getDate() 从 Date 对象返回一个月中的某一天 (1 ~ 31)。初始为0 的__orderDay第一次不会等于nowDay
        __orderDay = nowDay;                                                       // __orderDay 全局变量会记录第一次进入风控模块的触发日期、每当日期变更，
        __orderCount = 0;                                                          // 更新 __orderDay这个变量， 重置 __orderCount这个变量
    }
    __orderCount++;                                                                // 全局变量 __orderCount 下单次数，自加累计。
    if (__orderCount > MaxTrade) {                                                 // 判断 是否超过 参数设定的 单日最大交易次数
        Log("风控模块限制, 不可交易, 超过最大下单次数", MaxTrade, "#ff0000 @");          // 超过了，输出提示信息，中断执行。
        throw "中断执行"
        return false;
    }
    return true;                                                                   // 以上条件都未触发，返回 true ， 即可以交易。
}

function init() {                                                                  // 模板初始化函数 ， 在模板加载的时候会先执行该函数。
    if (typeof(SlideTick) === 'undefined') {                                       // 检查SlideTick 是否未定义。
        SlideTick = 1;                                                             // 设置 默认值 1
    } else {                                                                       // 解析字符串 转换为数值，不过 如果是 非数字字符开头的字符串会 返回 NaN，可能引起错误
        SlideTick = parseInt(SlideTick);
    }
    Log("商品交易类库加载成功");
}

function GetPosition(e, contractType, direction, positions) {                      // 合并一个合约的  同方向的昨仓今仓，参数以此： 交易所对象、合约类型、方向、API返回的持仓数据(可空缺)              
    var allCost = 0;                                                               // contractType 合约 在 direction 方向  总花费的资金，没有乘一手合约多少分（因为整体可以约掉）
    var allAmount = 0;                                                             // 总合约手数
    var allProfit = 0;                                                             // 盈亏汇总
    var allFrozen = 0;                                                             // 总冻结数量
    var posMargin = 0;                                                             // 持仓合约 杠杆
    if (typeof(positions) === 'undefined' || !positions) {                         // 如果参数 没有传入 API 返回的持仓信息
        positions = _C(e.GetPosition);                                             // 则在此调用API 获取持仓信息。
    }
    for (var i = 0; i < positions.length; i++) {                                   // 遍历该 持仓信息数组。
        if (positions[i].ContractType == contractType &&                           // 当前索引的持仓信息的合约代码 == 参数指定的合约代码（contractType） 并且 方向等同于 参数传递的方向（direction）的今仓或者昨仓
            (((positions[i].Type == PD_LONG || positions[i].Type == PD_LONG_YD) && direction == PD_LONG) || ((positions[i].Type == PD_SHORT || positions[i].Type == PD_SHORT_YD) && direction == PD_SHORT))
        ) {                                                                        // 符合条件执行 if 块
            posMargin = positions[i].MarginLevel;                                  // 获取杠杆值 赋值给posMargin
            allCost += (positions[i].Price * positions[i].Amount);                 // 总体花费（已约掉一手合约份数 ，当前索引持仓价格 * 持仓量） 累计
            allAmount += positions[i].Amount;                                      // 合约手数累计
            allProfit += positions[i].Profit;                                      // 合约浮动盈亏累计
            allFrozen += positions[i].FrozenAmount;                                // 冻结的合约手数累计
        }
    }
    if (allAmount === 0) {                                                         // 如果遍历完成后 累计出的符合条件的合约手数为0，返回null ，即没有条件限定的合约持仓
        return null;
    }
    return {                                                                       // allAmount 不为 0 ，返回一个对象 合并后的持仓信息。
        MarginLevel: posMargin,
        FrozenAmount: allFrozen,
        Price: _N(allCost / allAmount),
        Amount: allAmount,
        Profit: allProfit,
        Type: direction,
        ContractType: contractType
    };
}


function Open(e, contractType, direction, opAmount) {                              // 操作单品种合约的 开仓函数，参数： 交易所对象、合约代码、方向、操作数量
    var initPosition = GetPosition(e, contractType, direction);                    // 调用 上边的 GetPosition 函数获取合并后的 持仓信息。 
    var isFirst = true;                                                            // 设置标记  isFirst （表示 以下while 是第一次循环 为真）
    var initAmount = initPosition ? initPosition.Amount : 0;                       // 如果 initPosition 为null 则 initAmount 赋值 0 ，否则赋值 initPosition.Amount
    var positionNow = initPosition;                                                // 声明一个变量  positionNow 表示当前持仓信息
    while (true) {                                                                 // while 循环
        var needOpen = opAmount;                                                   // 声明临时变量 needOpen  并用 参数 需要交易的量 给其赋值
        if (isFirst) {                                                             // 如果是第一次执行，则只更新 isFirst 标记为false  ，由于更新为false 了下次循环到此会执行 else 块
            isFirst = false;
        } else {
            positionNow = GetPosition(e, contractType, direction);                 // 更新 positionNow ，当前的持仓信息。
            if (positionNow) {                                                     // 如果 有持仓信息，接下来需要开仓的数量 needOpen 等于 参数要求的操作量 减去 此次获取的持仓信息与上次之差（即 新开了多少手）
                needOpen = opAmount - (positionNow.Amount - initAmount);
            }
        }
        var insDetail = _C(e.SetContractType, contractType);                       // 设置合约类型。
                                                                                   // Log("初始持仓", initAmount, "当前持仓", positionNow, "需要加仓", needOpen);
        if (needOpen < insDetail.MinLimitOrderVolume) {                            // 如果接下来要开仓的手数 小于该合约的限价单最小开仓手数
            break;                                                                 // 跳出循环
        }
        if (!CanTrade(opAmount)) {                                                 // 风控模块 检测，如果返回false  跳出循环不交易。
            break;
        }
        var depth = _C(e.GetDepth);                                                // 获取市场深度信息。
        var amount = Math.min(insDetail.MaxLimitOrderVolume, needOpen);            // 限制一下 下单量不能大于 合约的限价单最大下单量
        e.SetDirection(direction == PD_LONG ? "buy" : "sell");                     // 根据参数 direction 设置下单方向。
        var orderId;
        if (direction == PD_LONG) {                                                // 根据参数 direction 方向 调用不同的API 进行交易（开多 或者 开空）
            orderId = e.Buy(depth.Asks[0].Price + (insDetail.PriceTick * SlideTick), Math.min(amount, depth.Asks[0].Amount), contractType, 'Ask', depth.Asks[0]);
                                                                                   // 具体参见API文档， CTP商品期货滑价一跳 为 insDetail.PriceTick ，必须是这个值的整数倍
                                                                                   // 调用API 的实际下单量不大于盘口 一档的量
        } else {
            orderId = e.Sell(depth.Bids[0].Price - (insDetail.PriceTick * SlideTick), Math.min(amount, depth.Bids[0].Amount), contractType, 'Bid', depth.Bids[0]);
        }
        // CancelPendingOrders
        while (true) {                                                             // 下单后 间隔一个 Interval 时间， 取消 未完成的订单。
            Sleep(Interval);
            var orders = _C(e.GetOrders);                                          // 获取所有未完成的订单
            if (orders.length === 0) {                                             // 如果orders 是空数组 ，跳出当前 while
                break;
            }
            for (var j = 0; j < orders.length; j++) {                              // 遍历未完成的订单数组
                e.CancelOrder(orders[j].Id);                                       // 按当前索引的订单信息中的ID 取消订单。
                if (j < (orders.length - 1)) {                                     // 遍历间隔一定时间，一面 频率过高。
                    Sleep(Interval);                                               // Sleep 暂停  Interval 毫秒
                }
            }
        }
    }                                                                              // 如果主循环while 退出
    var ret = {                                                                    // 声明一个用于返回的对象
        price: 0,                                                                  // 成交均价
        amount: 0,                                                                 // 成交数量
        position: positionNow                                                      // 最近获取的 该品种的持仓信息
    };
    if (!positionNow) {                                                            // 如果没有持仓信息，直接返回初始化的 ret
        return ret;
    }
    if (!initPosition) {                                                           // 如果开始执行 当前函数时，没有任何该品种的持仓信息。
        ret.price = positionNow.Price;                                             // 当前的持仓信息positionNow中的 price 就是 此次交易完成的 持仓均价
        ret.amount = positionNow.Amount;                                           // 同上
    } else {                                                                       // 如果开始的时候已经有过该品种的持仓信息。
        ret.amount = positionNow.Amount - initPosition.Amount;                     // 差值为新开仓的数量
        ret.price = _N(((positionNow.Price * positionNow.Amount) - (initPosition.Price * initPosition.Amount)) / ret.amount);  // 此次交易新增加的 花费除以新增开仓得出 此次交易均价
    }
    return ret;                                                                    // 返回 ret
}

function Cover(e, contractType) {                                                  // 单品种 平仓函数，参数： 交易所对象、 合约代码
    var insDetail = _C(e.SetContractType, contractType);                           // 设置合约类型
    while (true) {                                                                 // 主循环 while
        var n = 0;                                                                 // 平仓操作计数
        var opAmount = 0;                                                          // 声明 操作 变量
        var positions = _C(e.GetPosition);                                         // 调用API 获取 持仓信息，区别上面的 获取持仓函数。详细参见 API文档
        for (var i = 0; i < positions.length; i++) {                               // 遍历 持仓信息
            if (positions[i].ContractType != contractType) {                       // 如果当前索引的持仓信息 合约 不等于 要操作的合约 即： contractType
                continue;                                                          // 跳过
            }
            var amount = Math.min(insDetail.MaxLimitOrderVolume, positions[i].Amount);  // 控制 不高于报单的最大交易量
            var depth;
            if (positions[i].Type == PD_LONG || positions[i].Type == PD_LONG_YD) {      // 处理 多仓
                depth = _C(e.GetDepth);                                                 // 调用 API 获取当前  盘口数据
                opAmount = Math.min(amount, depth.Bids[0].Amount);                      // 限制 操作量 不大于盘口一档 的量
                if (!CanTrade(opAmount)) {                                              // 风控模块检测
                    return;
                }
                e.SetDirection(positions[i].Type == PD_LONG ? "closebuy_today" : "closebuy");  // 设置 交易方向，具体参见 API 文档
                
                e.Sell(depth.Bids[0].Price - (insDetail.PriceTick * SlideTick), opAmount, contractType, positions[i].Type == PD_LONG ? "平今" : "平昨", 'Bid', depth.Bids[0]);
                                                                                               // 执行平仓 API ，详细参见 API文档。
                n++;                                                                           // 操作计数累加
            } else if (positions[i].Type == PD_SHORT || positions[i].Type == PD_SHORT_YD) {    // 处理 空仓 类似多仓处理
                depth = _C(e.GetDepth);
                opAmount = Math.min(amount, depth.Asks[0].Amount);
                if (!CanTrade(opAmount)) {
                    return;
                }
                e.SetDirection(positions[i].Type == PD_SHORT ? "closesell_today" : "closesell");
                e.Buy(depth.Asks[0].Price + (insDetail.PriceTick * SlideTick), opAmount, contractType, positions[i].Type == PD_SHORT ? "平今" : "平昨", 'Ask', depth.Asks[0]);
                n++;
            }
        }
        if (n === 0) {                                                                         // 如果n 等于 0 ，即初始为0 ，在遍历时没有累加，没有可平的仓位。
            break;                                                                             // 跳出主while循环
        }
        while (true) {                                                                         // 间隔一定时间后， 取消所有挂单。类似Open函数的  CancelPendingOrders
            Sleep(Interval);
            var orders = _C(e.GetOrders);
            if (orders.length === 0) {
                break;
            }
            for (var j = 0; j < orders.length; j++) {
                e.CancelOrder(orders[j].Id);
                if (j < (orders.length - 1)) {
                    Sleep(Interval);
                }
            }
        }
    }
}

var trans = {                                                                                  // 用于显示在状态栏的详细账户信息的中文翻译，字典
    "AccountID": "投资者帐号",
    "Available": "可用资金",
    "Balance": "期货结算准备金",
    "BrokerID": "经纪公司代码",
    "CashIn": "资金差额",
    "CloseProfit": "平仓盈亏",
    "Commission": "手续费",
    "Credit": "信用额度",
    "CurrMargin": "当前保证金总额",
    "CurrencyID": "币种代码",
    "DeliveryMargin": "投资者交割保证金",
    "Deposit": "入金金额",
    "ExchangeDeliveryMargin": "交易所交割保证金",
    "ExchangeMargin": "交易所保证金",
    "FrozenCash": "冻结的资金",
    "FrozenCommission": "冻结的手续费",
    "FrozenMargin": "冻结的保证金",
    "FundMortgageAvailable": "货币质押余额",
    "FundMortgageIn": "货币质入金额",
    "FundMortgageOut": "货币质出金额",
    "Interest": "利息收入",
    "InterestBase": "利息基数",
    "Mortgage": "质押金额",
    "MortgageableFund": "可质押货币金额",
    "PositionProfit": "持仓盈亏",
    "PreBalance": "上次结算准备金",
    "PreCredit": "上次信用额度",
    "PreDeposit": "上次存款额",
    "PreFundMortgageIn": "上次货币质入金额",
    "PreFundMortgageOut": "上次货币质出金额",
    "PreMargin": "上次占用的保证金",
    "PreMortgage": "上次质押金额",
    "Reserve": "基本准备金",
    "ReserveBalance": "保底期货结算准备金",
    "SettlementID": "结算编号",
    "SpecProductCloseProfit": "特殊产品持仓盈亏",
    "SpecProductCommission": "特殊产品手续费",
    "SpecProductExchangeMargin": "特殊产品交易所保证金",
    "SpecProductFrozenCommission": "特殊产品冻结手续费",
    "SpecProductFrozenMargin": "特殊产品冻结保证金",
    "SpecProductMargin": "特殊产品占用保证金",
    "SpecProductPositionProfit": "特殊产品持仓盈亏",
    "SpecProductPositionProfitByAlg": "根据持仓盈亏算法计算的特殊产品持仓盈亏",
    "TradingDay": "交易日",
    "Withdraw": "出金金额",
    "WithdrawQuota": "可取资金",
};

function AccountToTable(jsStr, title) {                                         // 函数功能为把账户信息输出到状态栏表格，参数： 要显示的JSON结构字符串、标题
    if (typeof(title) === 'undefined') {                                        // 如果 title 参数没有传入， 初始化为： 账户信息
        title = '账户信息';
    }
    var tbl = {                                                                 // 声明一个 表格对象，用于传入 LogStatus 函数，显示在状态栏
        type: "table",                                                          // 类型 指定为 "table"
        title: title,                                                           // 参数  title 赋值给 tbl的title 字段
        cols: ["字段", "描述", "值"],                                             // 表格 列标题
        rows: []                                                                // 表格每行储存数据的数组字段，初始为  空数组。
    };
    try {                                                                       // 检测异常
        var fields = JSON.parse(jsStr);                                         // 解析 jsStr 字符串
        for (var k in fields) {                                                 // 遍历 fields 对象 的属性 ， k 为属性值， 不明白可以查阅JS 教程。
            if (k == 'AccountID' || k == 'BrokerID') {                          // 如果当前遍历的属性是 这两个属性， 跳过。
                continue
            }
            var desc = trans[k];                                                // 根据 trans 字典的属性名 获取到中文描述 desc
            var v = fields[k];                                                  // 获取 当前属性名的值
            if (typeof(v) === 'number') {                                       // 如果属性值是 数值型，保留5位小数。
                v = _N(v, 5);
            }
            tbl.rows.push([k, typeof(desc) === 'undefined' ? '--' : desc, v]);  // 把当前的 属性、属性描述、属性值 组合的一维数组 压入 表格对象tbl的 rows属性（数组）中。
        }
    } catch (e) {}                                                              // 捕获异常，但是不处理
    return tbl;                                                                 // 返回 tbl 对象
}

var PositionManager = (function() {                                             // 声明一个变量 PositionManager 接受一个匿名函数 的返回值，该返回值为一个构造出的对象
    function PositionManager(e) {                                               // 声明一个函数 PositionManager 是匿名函数内部的。
        if (typeof(e) === 'undefined') {                                        // 如果参数e 没有传入， 默认把 全局变量  交易所对象 exchange 赋值给 e
            e = exchange;
        }
        if (e.GetName() !== 'Futures_CTP') {                                    // 检测主交易所对象 e 是不是 商品期货交易所， 如果不是抛出异常。
            throw 'Only support CTP';                                           // 只支持 CTP
        }
        this.e = e;                                                             // 给当前函数（其实也是对象）添加一个属性 e， 并把 参数e 赋值给它
        this.account = null;                                                    // 添加一个 account 变量 初始为 null
    }
    // Get Cache
    PositionManager.prototype.Account = function() {                            // 给 上面声明的 PositionManager 添加方法函数 Account
        if (!this.account) {                                                    // 如果 PositionManager的 account 属性为 null 值则
            this.account = _C(this.e.GetAccount);                               // 调用 this.e 交易所对象的  GetAccount 函数  （就是交易所对象 API） 获取账户信息。
        }
        return this.account;                                                    // 该方法返回这个 PositionManager.account  账户信息。
    };
    PositionManager.prototype.GetAccount = function(getTable) {                 // 添加方法 该方法获取最新的账户信息
        this.account = _C(this.e.GetAccount);
        if (typeof(getTable) !== 'undefined' && getTable) {                     // 如果要把 最近一次获取的账户信息的详细信息 返回成一个 对象，getTable 要为true
            return AccountToTable(this.e.GetRawJSON())                          // GetRawJSON 函数 详见 API 文档
        }
        return this.account;                                                    // 返回 更新过后的账户信息。
    };

    PositionManager.prototype.GetPosition = function(contractType, direction, positions) { // 给 PositionManager 添加方法 用于在主策略中调用该模板的 函数
        return GetPosition(this.e, contractType, direction, positions);
    };

    PositionManager.prototype.OpenLong = function(contractType, shares) {                  // 添加 开多仓 方法
        if (!this.account) {
            this.account = _C(this.e.GetAccount);
        }
        return Open(this.e, contractType, PD_LONG, shares);
    };

    PositionManager.prototype.OpenShort = function(contractType, shares) {                 // 添加 开空仓 方法
        if (!this.account) {
            this.account = _C(this.e.GetAccount);
        }
        return Open(this.e, contractType, PD_SHORT, shares);
    };

    PositionManager.prototype.Cover = function(contractType) {                             // 添加 平仓 方法
        if (!this.account) {
            this.account = _C(this.e.GetAccount);
        }
        return Cover(this.e, contractType);
    };
    PositionManager.prototype.CoverAll = function() {                                      // 添加 所有仓位全平方法
        if (!this.account) {
            this.account = _C(this.e.GetAccount);
        }
        while (true) {
            var positions = _C(this.e.GetPosition)
            if (positions.length == 0) {
                break
            }
            for (var i = 0; i < positions.length; i++) {                                   // 首先平掉 对冲合约 对冲合约 举例 MA709&MA705
                // Cover Hedge Position First
                if (positions[i].ContractType.indexOf('&') != -1) {
                    Cover(this.e, positions[i].ContractType)
                    Sleep(1000)
                }
            }
            for (var i = 0; i < positions.length; i++) {
                if (positions[i].ContractType.indexOf('&') == -1) {
                    Cover(this.e, positions[i].ContractType)
                    Sleep(1000)
                }
            }
        }
    };
    PositionManager.prototype.Profit = function(contractType) {                            // 添加计算收益的方法
        var accountNow = _C(this.e.GetAccount);
        return _N(accountNow.Balance - this.account.Balance);
    };

    return PositionManager;                                                                // 匿名函数返回 在自身内声明的 PositionManager 函数（对象）。
})();

$.NewPositionManager = function(e) {                                                       // 导出函数 ，构造一个 PositionManager对象
    return new PositionManager(e);
};

// Via: http://mt.sohu.com/20160429/n446860150.shtml
$.IsTrading = function(symbol) {                                                           // 判断合约 是否在交易 时间段内，参数 symbol 合约代码
    var now = new Date();                                                                  // 获取当前时间对象
    var day = now.getDay();                                                                // 获取当前时间是一周内的具体哪一天。
    var hour = now.getHours();                                                             // 获取小时24小时中那一小时
    var minute = now.getMinutes();                                                         // 获取分钟一分钟内的哪一分钟

    if (day === 0 || (day === 6 && (hour > 2 || hour == 2 && minute > 30))) {              // 第一个过滤， day == 0 星期天  或者  day == 6 星期六并且
        return false;                                                                      // 2点30以后 。 星期五 夜盘结束。  返回 false  即所有品种不在交易时间
    }
    symbol = symbol.replace('SPD ', '').replace('SP ', '');                                // 正则表达式 匹配其交易系统用“SPD”表示跨期套利交易,若指令买进“SPD CF1609&CF17...
                                                                                           // 过滤掉 跨期套利的 合约编码
    var p, i, shortName = "";
    for (i = 0; i < symbol.length; i++) {                                                  // 遍历合约代码字符串，取出 代码（排除数字的部分）赋值给shortName 并且转换为大写
        var ch = symbol.charCodeAt(i);
        if (ch >= 48 && ch <= 57) {
            break;
        }
        shortName += symbol[i].toUpperCase();
    }

    var period = [                                                                         // 通常交易时间  9：00 - 10：15，
        [9, 0, 10, 15],                                                                    //             10：30 - 11：30
        [10, 30, 11, 30],                                                                  //              13：30 - 15：00
        [13, 30, 15, 0]
    ];
    if (shortName === "IH" || shortName === "IF" || shortName === "IC") {                  // 如果是这些 品种，交易时间 period 调整
        period = [
            [9, 30, 11, 30],
            [13, 0, 15, 0]
        ];
    } else if (shortName === "TF" || shortName === "T") {                                  // 国债品种  时间调整
        period = [
            [9, 15, 11, 30],
            [13, 0, 15, 15]
        ];
    }


    if (day >= 1 && day <= 5) {                                                            // 如果是 周一 到周五， 不考虑夜盘。 判断当前时间是否符合 period 设定的时间表
        for (i = 0; i < period.length; i++) {
            p = period[i];
            if ((hour > p[0] || (hour == p[0] && minute >= p[1])) && (hour < p[2] || (hour == p[2] && minute < p[3]))) {
                return true;                                                               // 符合遍历出的  时间表 中的 时间段，  即该品种在交易时间内。
            }
        }
    }

    var nperiod = [                                                                        // 额外判断 夜盘品种  nperiod[n][0] 是夜盘时间相同的一类
                                                                                           // 品种汇总，nperiod[n][1] 就是该类品种的夜盘交易时间
        [
            ['AU', 'AG'],
            [21, 0, 02, 30]
        ],
        [
            ['CU', 'AL', 'ZN', 'PB', 'SN', 'NI'],
            [21, 0, 01, 0]
        ],
        [
            ['RU', 'RB', 'HC', 'BU'],
            [21, 0, 23, 0]
        ],
        [
            ['P', 'J', 'M', 'Y', 'A', 'B', 'JM', 'I'],
            [21, 0, 23, 30]
        ],
        [
            ['SR', 'CF', 'RM', 'MA', 'TA', 'ZC', 'FG', 'IO'],
            [21, 0, 23, 30]
        ],
    ];
    for (i = 0; i < nperiod.length; i++) {                                                // 遍历所有夜盘品种 交易时间段，对比当前时间。
        for (var j = 0; j < nperiod[i][0].length; j++) {
            if (nperiod[i][0][j] === shortName) {
                p = nperiod[i][1];
                var condA = hour > p[0] || (hour == p[0] && minute >= p[1]);
                var condB = hour < p[2] || (hour == p[2] && minute < p[3]);
                // in one day
                if (p[2] >= p[0]) {
                    if ((day >= 1 && day <= 5) && condA && condB) {
                        return true;
                    }
                } else {
                    if (((day >= 1 && day <= 5) && condA) || ((day >= 2 && day <= 6) && condB)) {
                        return true;
                    }
                }
                return false;
            }
        }
    }
    return false;
};

$.NewTaskQueue = function(onTaskFinish) {  // 用于 进行多品种交易的 队列对象构造函数。 参数 ： 任务完成时的回调函数。
    var self = {}                          // 声明一个空对象
    self.ERR_SUCCESS = 0                   // 定义返回信息  成功
    self.ERR_SET_SYMBOL = 1                //             设置合约错误
    self.ERR_GET_RECORDS = 2               //             获取K线错误
    self.ERR_GET_ORDERS = 3                //             获取未完成订单错误
    self.ERR_GET_POS = 4                   //             获取持仓信息错误
    self.ERR_TRADE = 5                     //             交易错误
    self.ERR_GET_DEPTH = 6                 //             获取深度行情错误
    self.ERR_NOT_TRADING = 7               //             不在交易时间
    self.ERR_BUSY = 8                      //             阻塞

    self.onTaskFinish = typeof(onTaskFinish) === 'undefined' ? null : onTaskFinish  // 如果在 初始化队列对象时没有 传入需要回调的匿名函数，该属性赋值为null，否则赋值回调函数
    self.retryInterval = 300                                                        // 重试间隔 毫秒数
    self.tasks = []                                                                 // 这个是一个重要的属性，队列中储存任务的数组。
    self.pushTask = function(e, symbol, action, amount, arg, onFinish) {            // 给空对象添加函数，该函数是压入 新任务 到任务数组中。参数分别为：
                                                                                    // 交易所对象、合约代码、执行动作、数量、回调函数参数、回调函数
        var task = {                                                                // 构造一个任务对象
            e: e,                                                                   // 交易所对象
            action: action,                                                         // 执行的动作
            symbol: symbol,                                                         // 合约代码
            amount: amount,                                                         // 操作数量
            init: false,                                                            // 是否初始化
            finished: false,                                                        // 是否任务完成
            dealAmount: 0,                                                          // 已处理的 量
            preAmount: 0,                                                           // 上一次的 量
            preCost: 0,                                                             // 上一次的 花费
            retry: 0,                                                               // 重试次数
            maxRetry: 10,                                                           // 最大重试次数
            arg: typeof(onFinish) !== 'undefined' ? arg : undefined,                // 如果没有传入 回调函数，此项 设置为 undefined
            onFinish: typeof(onFinish) == 'undefined' ? arg : onFinish              // 如果没有传入回调函数，把 arg 复制给 onFinish（实际上是 arg没传入，中间隔过去了）
        }
        
        switch (task.action) {                                                      // 根据执行的动作初始化描述信息
            case "buy":
                task.desc = task.symbol + " 开多仓, 数量 " + task.amount
                break
            case "sell":
                task.desc = task.symbol + " 开空仓, 数量 " + task.amount
                break
            case "closebuy":
                task.desc = task.symbol + " 平多仓, 数量 " + task.amount
                break
            case "closesell":
                task.desc = task.symbol + " 平空仓, 数量 " + task.amount
                break
            default:
                task.desc = task.symbol + " " + task.action + ", 数量 " + task.amount
        }

        self.tasks.push(task)                                                       // 压入任务数组中
        Log("接收到任务", task.desc)                                                  // 输出日志 显示 接收到任务。
    }

    self.cancelAll = function(e) {                                                  // 添加函数，取消所有，参数： 交易所对象
        while (true) {                                                              // 遍历未完成的所有订单，逐个取消。
            var orders = e.GetOrders();
            if (!orders) {                                                          // 所有API 调用都不重试，如果API调用失败，立即返回。
                return self.ERR_GET_ORDERS;
            }
            if (orders.length == 0) {
                break;
            }
            for (var i = 0; i < orders.length; i++) {
                e.CancelOrder(orders[i].Id);
                Sleep(self.retryInterval);
            }
        }
        return self.ERR_SUCCESS                                                      // 返回 完成标记
    }

    self.pollTask = function(task) {                                                 // 执行数组中弹出的任务
        var insDetail = task.e.SetContractType(task.symbol);                         // 切换到当前 任务 task 对象保存的合约类型
        if (!insDetail) {                                                            // 切换失败 立即返回
            return self.ERR_SET_SYMBOL;
        }
        var ret = null;
        var isCover = task.action != "buy" && task.action != "sell";                 // 根据执行的动作，设置 是否是平仓的 标记
        do {                                                                         // do while 循环，先执行 do 以内
            if (!$.IsTrading(task.symbol)) {                                         // 判断是否在交易时间
                return self.ERR_NOT_TRADING;                                         // 不在交易时间立即返回
            }
            if (self.cancelAll(task.e) != self.ERR_SUCCESS) {                        // 调用全部取消函数 ，如果不等于 完成状态
                return self.ERR_TRADE;                                               // 返回交易失败
            }
            if (!CanTrade(task.amount)) {                                            // 风控模块检测。
                ret = null
                break
            }
            var positions = task.e.GetPosition();                                    // 获取持仓信息
            // Error
            if (!positions) {
                return self.ERR_GET_POS;                                             // 如果调用获取持仓 API 错误，立即返回
            }
            // search position
            var pos = null;
            for (var i = 0; i < positions.length; i++) {                             // 遍历持仓信息，查找持仓合并持仓，类似 上面的 GetPosition 函数
                if (positions[i].ContractType == task.symbol && (((positions[i].Type == PD_LONG || positions[i].Type == PD_LONG_YD) && (task.action == "buy" || task.action == "closebuy")) || ((positions[i].Type == PD_SHORT || positions[i].Type == PD_SHORT_YD) && (task.action == "sell" || task.action == "closesell")))) {
                    if (!pos) {
                        pos = positions[i];
                        pos.Cost = positions[i].Price * positions[i].Amount;
                    } else {
                        pos.Amount += positions[i].Amount;
                        pos.Profit += positions[i].Profit;
                        pos.Cost += positions[i].Price * positions[i].Amount;
                    }
                }
            }
            // record pre position
            if (!task.init) {                                                        // 如果任务没有初始化，执行以下
                task.init = true;                                                    // 更新为已初始化
                if (pos) {                                                           // 如果查找到之前的持仓，把之前的持仓数量、 花费 复制给task 的相应变量保存
                    task.preAmount = pos.Amount;
                    task.preCost = pos.Cost;
                } else {                                                             // 如果执行这个任务 时没有 ，同样的方向  同样合约的持仓，把task相关变量赋值0
                    task.preAmount = 0;
                    task.preCost = 0;
                    if (isCover) {                                                   // 如果是 平仓动作，输出日志 ： 找不到仓位，跳出循环。
                        Log("找不到仓位", task.symbol, task.action);
                        ret = null;
                        break;
                    }
                }
            }
            var remain = task.amount;                                                // 声明一个局部变量，用 任务的属性 amount（任务设定的交易量） 初始化
            if (isCover && !pos) {                                                   // 如果 第二次循环中 ， 该任务动作是平仓，并且 没有持仓了，给pos 赋值
                pos = {Amount:0, Cost: 0, Price: 0}
            }
            if (pos) {                                                               // 如果 pos 不为null 
                task.dealAmount = pos.Amount - task.preAmount;                       // 已经处理的任务量 等于 每次获取的持仓信息持仓量 与最初开始循环的初始持仓信息持仓量的差值
                if (isCover) {                                                       // 如果是 平仓动作， dealAmount 是负值， 这里取反操作
                    task.dealAmount = -task.dealAmount;
                }
                remain = parseInt(task.amount - task.dealAmount);                    // 任务的 交易量 减去 已经处理的交易量  得出 剩余需要处理的交易量
                if (remain <= 0 || task.retry >= task.maxRetry) {                    // 如果剩余需要的交易量小于等于0（此处分析应该是不会小于0，有兴趣的可以分析下。） 或者重试次数大于最大重试上限.
                    ret = {                                                          // 更新ret 对象，  更新为已经成交的信息，和 当前仓位信息。
                        price: (pos.Cost - task.preCost) / (pos.Amount - task.preAmount),
                        amount: (pos.Amount - task.preAmount),
                        position: pos
                    };
                    if (isCover) {                                                   // 如果是 平仓动作
                        ret.amount = -ret.amount;                                    // 平仓时计算出的是负值  ，取反操作
                        if (pos.Amount == 0) {                                       // 如果持仓量为0了， 把ret 的持仓信息 赋值为 null
                            ret.position = null;
                        }
                    }
                    break;                                                           // remain <= 0 || task.retry >= task.maxRetry 符合这个条件，跳出while循环
                }
            } else if (task.retry >= task.maxRetry) {                                // 如果不是 平仓操作。pos 为null 没有持仓（平仓操作 pos 此处不会是null）
                ret = null;                                                          // 并且 该任务重试测试 大于最大重试次数。跳出循环。
                break;                                                               // 即此时  ， 超过最大重试次数，并且 没有增加持仓（开仓 每次都失败了。），跳出循环
            }

            var depth = task.e.GetDepth();                                           // 获取 深度数据
            if (!depth) {
                return self.ERR_GET_DEPTH;                                           // 获取失败立即返回
            }
            var orderId = null;                                                      // 订单ID
            var slidePrice = insDetail.PriceTick * SlideTick;                        // 计算具体滑价值
            if (isCover) {                                                           // 如果是平仓操作
                for (var i = 0; i < positions.length; i++) {                         // 遍历本轮的  API 返回的持仓信息。
                    if (positions[i].ContractType !== task.symbol) {                 // 不是当前任务 品种的  跳过。
                        continue;
                    }
                    if (parseInt(remain) < 1) {                                      // 需要处理的 交易的量 如果小于1，跳出 while
                        break
                    }
                    var amount = Math.min(insDetail.MaxLimitOrderVolume, positions[i].Amount, remain);  // 在合约规定的最大下单量、持仓量、需要处理的量中取最小值。 
                    if (task.action == "closebuy" && (positions[i].Type == PD_LONG || positions[i].Type == PD_LONG_YD)) {   // 如果是平多仓， 持仓信息 为 今日多仓  或者 昨日多仓
                        task.e.SetDirection(positions[i].Type == PD_LONG ? "closebuy_today" : "closebuy");                  // 设置方向
                        amount = Math.min(amount, depth.Bids[0].Amount)                                                     // 根据盘口量 和 下单量 再取一个最小值。
                        orderId = task.e.Sell(_N(depth.Bids[0].Price - slidePrice, 2), amount, task.symbol, positions[i].Type == PD_LONG ? "平今" : "平昨", 'Bid', depth.Bids[0]);
                                                                                                                            // 执行具体的 API 操作，以下平空类似
                    } else if (task.action == "closesell" && (positions[i].Type == PD_SHORT || positions[i].Type == PD_SHORT_YD)) {
                        task.e.SetDirection(positions[i].Type == PD_SHORT ? "closesell_today" : "closesell");
                        amount = Math.min(amount, depth.Asks[0].Amount)
                        orderId = task.e.Buy(_N(depth.Asks[0].Price + slidePrice, 2), amount, task.symbol, positions[i].Type == PD_SHORT ? "平今" : "平昨", 'Ask', depth.Asks[0]);
                    }
                    // assume order is success insert
                    remain -= amount;                                                // 假设是成功执行， 需要处理的交易量 减去 此次交易的量。
                }
            } else {                                                                 // 开仓
                if (task.action == "buy") {
                    task.e.SetDirection("buy");
                    orderId = task.e.Buy(_N(depth.Asks[0].Price + slidePrice, 2), Math.min(remain, depth.Asks[0].Amount), task.symbol, 'Ask', depth.Asks[0]);
                } else {
                    task.e.SetDirection("sell");
                    orderId = task.e.Sell(_N(depth.Bids[0].Price - slidePrice, 2), Math.min(remain, depth.Bids[0].Amount), task.symbol, 'Bid', depth.Bids[0]);
                }
            }
            // symbol not in trading or other else happend
            if (!orderId) {                                                          // 没有返回具体的ID ，可能是 交易不在交易队列，或者其他错误。
                task.retry++;                                                        // 累计重试次数
                return self.ERR_TRADE;                                               // 返回错误信息。即使不成功， 重新 执行该任务的时候 会重新一次流程。除了task对象的数据 所有数据都会刷新
            }
        } while (true);                                                              // 循环判断 恒为真
        task.finished = true                                                         // 如果在 while 循环中没有直接 return  顺序执行到此，则任务完成                                                      

        if (self.onTaskFinish) {                                                     // 如果队列控制对象的 回调函数 设置 不为null（即 self.onTaskFinish 存在）
            self.onTaskFinish(task, ret)                                             // 执行回调函数。把 task 任务 对象  和 交易的结果  ret 对象 传入回调函数。 
        }

        if (task.onFinish) {                                                         // 处理 任务的回调函数
            task.onFinish(task, ret);
        }
        return self.ERR_SUCCESS;
    }

    self.poll = function() {                                                         // 迭代执行 弹出 tasks 中的任务 ，并调用 pollTask 执行任务。
        var processed = 0                                                            // 未执行完成的任务计数 ，每次初始0
        _.each(self.tasks, function(task) {                                          // 迭代  可以搜索 _.each 的用法
            if (!task.finished) {                                                    // 如果 任务不是完成状态，
                processed++                                                          // 未完成任务 计数 累计
                self.pollTask(task)                                                  // 执行弹出的任务
            }
        })
        if (processed == 0) {                                                        // 如果没有未完成的任务，即 所有任务队列内的任务完成 ，执行清空 队列对象中 tasks 数组.
            self.tasks = []
        }
    }

    self.size = function() {                                                         // 给队列对象添加 函数 size 获取 任务队列 中 任务个数
        return self.tasks.length
    }

    return self                                                                      // 返回构造好的队列对象
}

$.AccountToTable = AccountToTable;                                                   // 把 AccountToTable 引用传递给 导出函数 （接口）

// 测试用 主函数
function main() {
    var p = $.NewPositionManager();
    p.OpenShort("MA701", 1);
    p.OpenShort("MA705", 1);
    Log(p.GetPosition("MA701", PD_SHORT));
    Log(p.GetAccount());
    Log(p.Account());
    Sleep(60000 * 10);
    p.CoverAll();
    LogProfit(p.Profit());
    Log($.IsTrading("MA701"));
    // 多品种时使用交易队列来完成非阻塞的交易任务
    var q = $.NewTaskQueue();
    q.pushTask(exchange, "MA701", "buy", 3, function(task, ret) {                   // 最后一个参数  function（task,ret）{....} 就是一个 匿名函数作为回调函数传入任务对象task
        Log(task.desc, ret)                                                         // 回调函数中 输出了该任务的描述，  和任务完成的返回值，这些是预设，并不会马上执行。
        if (ret) {
            q.pushTask(exchange, "MA701", "closebuy", 1, 123, function(task, ret) { // 在第一个压入队列的任务的回调函数中，压入匹配的任务到任务队列。用来实现配对交易。
                                                                                    // 只要第一个任务交易完成就会触发回调函数中的匹配操作。
                Log("q", task.desc, ret, task.arg)
            })
        }
    })
    while (true) {
        // 在空闲时调用poll来完成未完成的任务
        q.poll()
        Sleep(1000)
    }
}
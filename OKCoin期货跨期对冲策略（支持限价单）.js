// botvs@d6e4ed5fc801528b2346e0c95bacf758
/* 临时参数
1、合约1 最大开仓量
2、合约2 最大开仓量
3、ATR 系数
4、ATR 柱数
5、ATR 更新周期（秒）
6、样本数量
7、样本采集轮询比例
8、触发线调整周期（秒）
9、合约1 杠杆参数
10、合约2 杠杆参数
11、合约1 字符串
12、合约2 字符串
13、盘口扫描深度
14、轮询周期
15、正对冲 开仓
16、正对冲 平仓
17、反对冲 开仓
18、反对冲 平仓
// 控制开关
19、是否开启自动触发控制
20、是否开启 交易控制表
21、是否开启常规错误过滤
22、是否开启回测 模式
*/
var checkTime = 0;
var residualTime = 0;
var checkPreTime = 0;
var JGDate = [];                                     // 交割模拟。 ["BTC1129", "BTC1229", "BTC0316"];
var JGDateIndex = 0;                                 // 模拟交割索引。
var JGHoursCorrect = 8;                              // 检测交割剩余小时，在实盘中需要修正 8小时。 模拟时该值设置为0
function init(){
    if(istry){
        JGHoursCorrect = 0;                          // 模拟中 该值修改为0
        Log("启用模拟 交割，初始化交割日期列表。");
        UpdateJGDate();
    }
}

function UpdateJGDate(){                             
    // 循环31次 遍历出 当前月份的所有 星期5的 日期， 取时间戳， 对比当前时间戳，小于当前的 丢弃，大于当前的第一个即是 
    // 在用时间戳恢复日期，拿到 字符串
    var array_JG_stamp = [];
    var date = new Date();
    var nowStamp = date.getTime();
    var nowMonth = date.getMonth();
    var nextJG_Stamp = 0;
    date.setHours(16);                     // 0~23
    date.setMinutes(0);                    // 0~59
    date.setSeconds(0);                    // 0~59
    for(var i = 1 ; i <= 31; i++){
        date.setDate(i);
        var EveryDay = date.getDay();        // 1~6
        if(EveryDay === 5 && nowMonth == date.getMonth()){
            var fridayStamp = date.getTime();
            array_JG_stamp.push(fridayStamp);
        }
    }
    for(var j = 0 ; j < array_JG_stamp.length ; j++){
        if(nowStamp <= array_JG_stamp[j]){
            nextJG_Stamp = array_JG_stamp[j];
            break;
        }
        if(j == array_JG_stamp.length - 1){
            nextJG_Stamp = array_JG_stamp[j] + 1000 * 7 * 24 * 60 * 60;
        }
    }
    array_JG_stamp = [];
    for(var n = 1 ; n <= 100; n++){  // 生成 100 个 模拟交割日期。
        if(n == 1){
            array_JG_stamp.push(nextJG_Stamp);
        }else{
            nextJG_Stamp += 1000 * 7 * 24 * 60 * 60;
            array_JG_stamp.push(nextJG_Stamp);
        }
    }
    var date2 = new Date();
    for(var m = 0 ; m < array_JG_stamp.length ; m++){
        date2.setTime(array_JG_stamp[m]);
        var strMonth = date2.getMonth() + 1;
        var strDate = date2.getDate();
        if(strMonth < 10){
            strMonth = '0' + strMonth;
        }
        if(strDate < 10){
            strDate = '0' + strDate;
        }
        JGDate.push("BTC" + strMonth + strDate);
    }
    Log("模拟生成的交割日期：", JGDate);
}

function CancelPendingOrders(e, orderType) {
    while (true) {
        var orders = e.GetOrders();
        if (!orders) {
            Sleep(Interval);
            continue;
        }
        var processed = 0;
        for (var j = 0; j < orders.length; j++) {
            if (typeof(orderType) === 'number' && orders[j].Type !== orderType) {
                continue;
            }
            e.CancelOrder(orders[j].Id, orders[j]);
            processed++;
            if (j < (orders.length - 1)) {
                Sleep(Interval);
            }
        }
        if (processed === 0) {
            break;
        }
    }
}

function CheckDelivery(nowTime, Symbol, task) {
    var contractInfo = null;
    if(checkTime <= 0){
        var contractName = "";
        var ContractIndex = 0;
        if(Symbol === "this_week"){
            ContractIndex = 0;
        }else if(Symbol === "next_week"){
            ContractIndex = 1;
        }else if(Symbol === "quarter"){
            ContractIndex = 2;
        }
        if(istry === true){                          // 判断是不是 模拟测试
            try{
                contractName = JGDate[JGDateIndex];  // 模拟测试 交割日期
                JGDateIndex++;
            } catch(e){
                Log("回测模式，更新交割日期错误", e);
                JGDateIndex--;
            }
        }
        while (contractName == "") {
            //var contractInfo = HttpQuery("https://www.okcoin.com/api/v1/future_hold_amount.do?symbol=btc_usd&contract_type=this_week"); //只是检测this_week ,避免重复调用提高效率
            switch(ContractIndex){
                case 0: contractInfo = HttpQuery("https://www.okcoin.com/api/v1/future_hold_amount.do?symbol=btc_usd&contract_type=this_week");
                        break;
                case 1: contractInfo = HttpQuery("https://www.okcoin.com/api/v1/future_hold_amount.do?symbol=btc_usd&contract_type=next_week");
                        break;
                case 2: contractInfo = HttpQuery("https://www.okcoin.com/api/v1/future_hold_amount.do?symbol=btc_usd&contract_type=quarter");
                        break;
                default: Log("contractInfo:", contractInfo); 
                         //throw "switch NumContractType Error!";
            }            //根据 contractType 类型 选择读取合约交割日期
            if (!contractInfo || contractInfo.length === 0) {
                Sleep(100);
                continue;
            }
            try {
                contractName = (JSON.parse(contractInfo))[0].contract_name;
                //Log("contractName:", contractName); // ceshi  BTC1230
            } catch (e) {
                Log("CheckDelivery Error",contractInfo, e);
                return 0;
            }
        }
        var nowDateTime = new Date();
        contractName = contractName.split("BTC")[1]; //抽取BTC后的字符串 重新赋值
        var strMonth = contractName[0] + contractName[1];
        var strDay = contractName[2] + contractName[3];
        var strYear = nowDateTime.getFullYear() + ""; //获取 年份字符串
        
        // 处理跨年问题
        var nowMonth = nowDateTime.getMonth(); // 获取月份
        if(strMonth < nowMonth){
            strYear = (strYear - 0) + 1;
            strYear = strYear + "";
        }
        
        var strDate = strYear + '-' + strMonth + '-' + strDay + ' ' + "16:00:00";
        // Log(strDate); // ceshi
        var deliveryTime = (new Date(strDate)).getTime();             // + 16 * 60 * 60 * 1000;
        nowTime = nowDateTime.getTime();
        residualTime = (deliveryTime - nowTime) / 1000 / 60 / 60 - JGHoursCorrect; //单位是小时
        checkTime = (deliveryTime - nowTime) - JGHoursCorrect * 1000 * 60 * 60;    //还差多少毫秒交割
        checkPreTime = nowTime;                                       //记录开始的时间
        Log("合约", Symbol, "交割日期获取：", strDate); 
    }else{
        checkTime -= nowTime - checkPreTime;                          //减去消耗的时间
        checkPreTime = nowTime;
        residualTime = checkTime / 1000 / 60 / 60;                    // 计算距离交割多少小时
    }
    if(residualTime < 24){                                            //交割小于24小时
        MSG_String = "　　" + Symbol + " 交割时间剩余：" + residualTime + "小时！！#FF0000";
        if((checkTime / 1000 / 60) <= 5 && task.isFrozen == false){   // 每次交割前5分钟 锁定。
            Log("距离交割剩余5分钟，平掉所有仓位！#FF0000");
            for(var index = 0; index < task.dic.length; index++){
                if(task.dic[index].hold > 0){  // 平空A 平多B
                    task.action = [index, "closesell", "closebuy", task.dic[index].hold];
                    Log(JSON.stringify(task.action));
                    // Buy_SymbolA_Sell_SymbolB(task);
                    Hedge_Open_Cover(task);
                    $.PlotFlag(nowTime, "C", "closesell-closebuy", "circlepin");
                    //task.nowAccount = _C(task.e.GetAccount);
                }else if(task.dic[index].hold < 0){  // 平多A 平空B
                    task.action = [index, "closebuy", "closesell", task.dic[index].hold];
                    Log(JSON.stringify(task.action));
                    // Sell_SymbolA_Buy_SymbolB(task);
                    Hedge_Open_Cover(task);
                    $.PlotFlag(nowTime, "C", "closebuy-closesell", "circlepin");
                    //task.nowAccount = _C(task.e.GetAccount);
                }
            }
            task.nowAccount = _C(task.e.GetAccount);
            Log("全部仓位已平，检查持仓：", _C(task.e.GetPosition), "程序冻结15分钟！#FF0000");
            task.isFrozen = true;
            task.FrozenStartTime = new Date().getTime();
        }
    }else{
        MSG_String = "　　" + Symbol + " 交割时间剩余：" + residualTime + "小时！！";
    }
    return _N(residualTime, 3);
}


function OpenPriceToActual(Price, Piece){
    var OnePieceEquivalentCoin = 100 / Price;
    var OpenFee = Piece * (OnePieceEquivalentCoin) * (0.03 * 0.01);
    var Actual = Price + (OpenFee * Price) / (OnePieceEquivalentCoin * Piece);
    return Actual;
    //Log("Actual:", Actual, "OpenFee:", OpenFee, "OnePieceEquivalentCoin:", OnePieceEquivalentCoin, "保证金：", OpenFee / 0.01 / 0.03 / 10); // 测试
    //var Actual = Price + ((0.03 * 0.01) * Price);
}

function CreateHedgeList(Begin, End, Size, Step, AmountOfPoint, SymbolA, SymbolB){
    // "(this_week&quarter)100:90:1;110:100:1;120:110:1;130:120:1;140:130:1;150:140:1;160:150:1;170:160:1;180:170:1;190:180:1";
    if((SymbolA !== "this_week" && SymbolA !== "next_week" && SymbolA !== "quarter") || (SymbolB !== "this_week" && SymbolB !== "next_week" && SymbolB !== "quarter")){
        throw "合约代码错误： SymbolA " + SymbolA + " SymbolB " + SymbolB;
    }
    var BodyString = "";
    var HeadString = '(' + SymbolA + '&' + SymbolB + ')';
    for(var i = Begin ; i <= End ; i += Step){
        if(i + Step > End){
            BodyString += (i + ':') + (i - Size) + (':' + AmountOfPoint);
        }else{
            BodyString += (i + ':') + (i - Size) + (':' + AmountOfPoint) + ';';
        }
    }
    var HL = HeadString + BodyString;
    Log("按参数生成对冲列表:", HL);
    return HL;
}

var idA = null;
var idB = null;
var A = 0;
var B = 1;
var PRE = 2;

function DealAction(task, AorB, amount){
    if(AorB == A){
        task.e.SetContractType(task.symbolA);
        task.e.SetDirection(task.action[1]);
        if(task.action[1] == "buy" || task.action[1] == "closesell"){
            idA = task.e.Buy(-1, typeof(amount) == "undefined" ? Math.abs(task.action[3]) : amount, task.symbolA);
        }else if(task.action[1] == "sell" || task.action[1] == "closebuy"){
            idA = task.e.Sell(-1, typeof(amount) == "undefined" ? Math.abs(task.action[3]) : amount, task.symbolA);
        }
    }
    if(AorB == B){
        task.e.SetContractType(task.symbolB);
        task.e.SetDirection(task.action[2]);
        if(task.action[2] == "buy" || task.action[2] == "closesell"){
            idB = task.e.Buy(-1, typeof(amount) == "undefined" ? Math.abs(task.action[3]) : amount, task.symbolB);
        }else if(task.action[2] == "sell" || task.action[2] == "closebuy"){
            idB = task.e.Sell(-1, typeof(amount) == "undefined" ? Math.abs(task.action[3]) : amount, task.symbolB);
        }
    }
}

function UpdatePosition(task, Positions, onlyAorBorPRE){
    if(Positions.length > 2){
        Log(Positions, "Positions 长度大于2！#FF0000");
        throw "同类型合约不能同时持有多仓空仓。";
    }
    if(onlyAorBorPRE == PRE){
        task.Pre_APositions = task.APositions;
        task.Pre_BPositions = task.BPositions;
    }
    for(var i = 0; i < Positions.length; i++){
        if(Positions[i].ContractType == task.symbolA && onlyAorBorPRE !== B){
            task.APositions = Positions[i];
        }
        if(Positions[i].ContractType == task.symbolB && onlyAorBorPRE !== A){
            task.BPositions = Positions[i];
        }
    }
    if(Positions.length == 0){
        if(onlyAorBorPRE !== B){
            task.APositions = {MarginLevel: 0, Amount: 0, FrozenAmount: 0, Price: 0, Profit: 0, Type: 0, ContractType: ""};
        }
        if(onlyAorBorPRE !== A){
            task.BPositions = {MarginLevel: 0, Amount: 0, FrozenAmount: 0, Price: 0, Profit: 0, Type: 0, ContractType: ""};
        }
        if(onlyAorBorPRE !== A && onlyAorBorPRE !== B){
            task.APositions = {MarginLevel: 0, Amount: 0, FrozenAmount: 0, Price: 0, Profit: 0, Type: 0, ContractType: ""}; 
            task.BPositions = {MarginLevel: 0, Amount: 0, FrozenAmount: 0, Price: 0, Profit: 0, Type: 0, ContractType: ""};
        }
    }
}

function CalcActualPrice(task){
    if(task.action[0] == 0){
        var A_Pv = task.APositions.Price;
        var B_Pv = task.BPositions.Price; 
        task.dic[task.action[0]].ActualPrice = A_Pv - B_Pv;
        Log(task.symbolA, A_Pv, task.symbolB, B_Pv, "#FF0000");
    }else{
        var A_Pv = task.APositions.Price;
        var A_P1 = task.Pre_APositions.Price;
        var A_m = task.APositions.Amount - task.Pre_APositions.Amount;
        var A_n = task.Pre_APositions.Amount;

        var B_Pv = task.BPositions.Price; 
        var B_P1 = task.Pre_BPositions.Price;
        var B_m = task.BPositions.Amount - task.Pre_BPositions.Amount;
        var B_n = task.Pre_BPositions.Amount;

        var A_P2 = A_Pv * A_P1 * A_m / ((A_m + A_n) * A_P1 - A_n * A_Pv);
        var B_P2 = B_Pv * B_P1 * B_m / ((B_m + B_n) * B_P1 - B_n * B_Pv);

        task.dic[task.action[0]].ActualPrice = A_P2 - B_P2;
        Log(task.symbolA, A_P2, task.symbolB, B_P2, "#FF0000");
    }
}

function Hedge_Open_Cover(task){
    // task.action = [index, "sell", "buy", task.dic[index].amount];
    // task.action = [index, "closebuy", "closesell", task.dic[index].hold];
    if(task.isUseMarketOrder === false){       // 限价单
        if((task.action[1] === "buy" && task.action[2] === "sell") || (task.action[1] === "sell" && task.action[2] === "buy")){ // open
            
        }else if((task.action[1] === "closesell" && task.action[2] === "closebuy") || (task.action[1] === "closesell" && task.action[2] === "closebuy")){ // cover
            
        }
    }else if(task.isUseMarketOrder === true){  // 市价单
        if((task.action[1] === "buy" && task.action[2] === "sell") || (task.action[1] === "sell" && task.action[2] === "buy")){ // open
            // DealAction()
            DealAction(task, A);
            DealAction(task, B);

            while(!idA || !idB){
                if(!idA){
                    DealAction(task, A);
                }
                if(!idB){
                    DealAction(task, B);
                }
            }
            
            var AOK = false;
            var BOK = false;
            var ADealAmount = Math.abs(task.action[3]);
            var BDealAmount = Math.abs(task.action[3]);
            while(true){
                Sleep(500);
                var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                if(AOK == false){
                    // 撤掉，获取持仓，计算成功多少，重新挂。
                    CancelPendingOrders(task.e, task.action[1] == "buy" ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
                    var APreAmount = task.APositions.Amount;  // 获取更新前的持仓量。
                    UpdatePosition(task, Positions, A);          // 更新
                    var AnowAmount = task.APositions.Amount;  // 获取当前的持仓量。
                    ADealAmount = ADealAmount - (AnowAmount - APreAmount);
                    if(ADealAmount !== 0){
                        DealAction(task, A, ADealAmount);
                    }else{
                        AOK = true;
                    }  
                }
                if(BOK == false){
                    CancelPendingOrders(task.e, task.action[2] == "buy" ? ORDER_TYPE_BUY : ORDER_TYPE_SELL);
                    var BPreAmount = task.BPositions.Amount;  // 获取更新前的持仓量。
                    UpdatePosition(task, Positions, B);         // 更新
                    var BnowAmount = task.BPositions.Amount;  // 获取当前的持仓量。
                    BDealAmount = BDealAmount - (BnowAmount - BPreAmount);
                    if(BDealAmount !== 0){
                        DealAction(task, B, BDealAmount);
                    }else{
                        BOK = true;
                    }  
                }
                if(AOK && BOK){
                    break;
                }
            }

            //Log("Open symbolA:", task.APositions, "symbolB:", task.BPositions);
            task.dic[task.action[0]].hold = task.action[3];
            //task.dic[task.action[0]].ActualPrice = ;
        }else if((task.action[1] === "closesell" && task.action[2] === "closebuy") || (task.action[1] === "closebuy" && task.action[2] === "closesell")){ // cover
            // DealAction()
            DealAction(task, A);
            DealAction(task, B);

            while(!idA || !idB){
                if(!idA){
                    DealAction(task, A);
                }
                if(!idB){
                    DealAction(task, B);
                }
            }

            var AOK = false;
            var BOK = false;
            var ADealAmount = Math.abs(task.action[3]);
            var BDealAmount = Math.abs(task.action[3]);
            while(true){
                Sleep(500);
                var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                if(AOK == false){
                    // 撤掉，获取持仓，计算成功多少，重新挂。
                    CancelPendingOrders(task.e, task.action[1] == "closebuy" ? ORDER_TYPE_SELL : ORDER_TYPE_BUY);
                    var APreAmount = task.APositions.Amount;  // 获取更新前的持仓量。
                    UpdatePosition(task, Positions, A);          // 更新
                    var AnowAmount = task.APositions.Amount;  // 获取当前的持仓量。
                    ADealAmount = ADealAmount - (APreAmount - AnowAmount);
                    if(ADealAmount !== 0){
                        DealAction(task, A, ADealAmount);
                    }else{
                        AOK = true;
                    }  
                    Log(ADealAmount, APreAmount, AnowAmount, Positions);  // ceshi
                }
                if(BOK == false){
                    CancelPendingOrders(task.e, task.action[2] == "closebuy" ? ORDER_TYPE_SELL : ORDER_TYPE_BUY);
                    var BPreAmount = task.BPositions.Amount;  // 获取更新前的持仓量。
                    UpdatePosition(task, Positions, B);         // 更新
                    var BnowAmount = task.BPositions.Amount;  // 获取当前的持仓量。
                    BDealAmount = BDealAmount - (BPreAmount - BnowAmount);
                    if(BDealAmount !== 0){
                        DealAction(task, B, BDealAmount);
                    }else{
                        BOK = true;
                    }  
                    Log(BDealAmount, BPreAmount, BnowAmount, Positions);  // ceshi
                }
                if(AOK && BOK){
                    break;
                }
            }

            //Log("Cover symbolA:", task.APositions, "symbolB:", task.BPositions);
            //task.dic[task.action[0]].PointProfit += _N(Math.abs(task.dic[task.action[0]].ActualPrice - (orderA.AvgPrice - orderB.AvgPrice)));
            task.dic[task.action[0]].hold = 0;
            task.dic[task.action[0]].ActualPrice = 0;
            task.dic[task.action[0]].CoverTimes += 1;
        }
        Sleep(100); // 避免访问过于频繁。
    }
}

function TasksController(){ // 任务控制器 构造函数
    // 构造用于返回的 控制器对象
    var self = {};
    self.tasks = []; // 控制器的任务数组。

    self.AddTask = function(e, symbolA, symbolB, HedgeList){ // 添加对冲 任务, 函数中进行 构造， 部分参数变量未初始化。在main 函数开始 根据界面参数列表，确定task 个数 进行构造。
        var task = {
            // 任务的参数变量
            e : e,
            symbolA : symbolA,
            symbolB : symbolB,
            HedgeList : HedgeList,
            dic : [],
            Adepth : null,
            Bdepth : null,
            Adiff : 0,
            Bdiff : 0,
            action : null,
            lastUpdateLineTime : 0,
            MarginLevel : MarginLevel,
            isUseMarketOrder : true,
            // 账户信息
            initAccount : _C(e.GetAccount),
            nowAccount : null,
            isFrozen : false,
            FrozenStartTime : 0,
            APositions : {MarginLevel: 0, Amount: 0, FrozenAmount: 0, Price: 0, Profit: 0, Type: 0, ContractType: ""},
            BPositions : {MarginLevel: 0, Amount: 0, FrozenAmount: 0, Price: 0, Profit: 0, Type: 0, ContractType: ""},
            Pre_APositions : null,
            Pre_BPositions : null,
            PositionsLastUpdateTime : 0,
            isLogProfit : false,
            taskProfit : 0,
        };
        self.tasks.push(task);
    }
    
    self.InitTask = function(){ // 初始化 任务，设置合约 杠杆等
        _.each(self.tasks, function(task){
            var arr = task.HedgeList.split(';');
            var hedgeDirection = 1;
            // 可扩展 恢复持仓，读取当前持仓。
            _.each(arr, function(pair){
                var tmp = pair.split(':');                               // 把每个 网格节点的 单元 按照':'字符 分割成 参数 数组 tmp
                if (tmp.length != 3) {                                   // 由于 格式 是  30:15:1  即   开仓差价: 平仓差价: 下单量    ，所以 用 ':' 分割后 tmp长度 不是3的 即 格式错误
                    throw "开仓表不正确";                                  // 抛出异常  格式错误
                }
                var st = {                                               // 每次迭代的时候 构造一个对象 
                    open: Number(tmp[0]),                                // 开仓  把 tmp[0]  即 30:15:1 按 ':' 分割后 生成的数组中的 第一个元素  30 ， 通过 Number 函数 转换为数值
                    cover: Number(tmp[1]),                               // 平仓..
                    amount: Number(tmp[2]),                              // 量..
                    hold: 0,                                             // 持仓 初始为0
                    ActualPrice: 0,
                    PointProfit : 0,                                     // 但个仓位累计差价。
                    CoverTimes : 0,                                      // 平仓次数
                };
                task.dic.push(st);
            });
            // 处理其它 初始化工作
            task.e.SetMarginLevel(task.MarginLevel);                     // 设置杠杆
            task.nowAccount = _C(task.e.GetAccount);                     // 初始化 当前账户信息
            // 检查， 启用的网格 是否会 耗尽资金
            if(task.dic[0].open < 0 && isCreateHedgeList){
                throw "自动网格生成错误：第一个节点开仓值小于0，会引起产生重复部分。" +JSON.stringify(task.dic);
            }

            var dic_length = task.dic.length;
            var sumPiece = 0;
            for(var i = 0; i < dic_length; i++){
                sumPiece += task.dic[i].amount;
            }
            sumPiece = sumPiece * 2;
            task.e.SetContractType(task.symbolA);
            var tickerA = _C(task.e.GetTicker);
            task.e.SetContractType(task.symbolB);
            var tickerB = _C(task.e.GetTicker);
            var Margin = sumPiece * 100 * OK_Rate / ((tickerA.Last + tickerB.Last) / 2) / task.MarginLevel;
            if(MarginRatio * task.initAccount.Stocks < Margin){
                if(istry == false || IsVirtual()){
                    throw "满仓所需保证金：" + Margin + " 超出 限制比例： " + MarginRatio;
                }else{
                    Log("注意，实盘测试模式开启！#FF0000");
                }
            } 
            Log("按照当前初始化，满仓将开" + sumPiece + "张合约，共需要 保证金：" + Margin + "BTC");
        });
    }

    self.DealTask = function(nowTime){
        // 处理task 任务
        tbls = []; // 每次初始清空
        _.each(self.tasks, function(task){
            // 迭代处理 task 
            task.e.SetContractType(task.symbolA);
            var Adepth = task.e.GetDepth();
            task.e.SetContractType(task.symbolB);
            var Bdepth = task.e.GetDepth();
            
            if(!Adepth || !Bdepth || Adepth.Asks.length === 0 || Adepth.Bids.length === 0 || Bdepth.Asks.length === 0 || Bdepth.Bids.length === 0){
                return;
            }
            
            task.Adepth = Adepth;
            task.Bdepth = Bdepth;
            
            task.Adiff = _N(Adepth.Bids[0].Price - Bdepth.Asks[0].Price);
            task.Bdiff = _N(Adepth.Asks[0].Price - Bdepth.Bids[0].Price);
            
            if(nowTime - task.lastUpdateLineTime > 1000 * 60){
                $.PlotLine("plus", task.Adiff);
                $.PlotLine("minus", task.Bdiff);
                task.lastUpdateLineTime = nowTime;
            }

            // 判断解除冻结
            if(nowTime - task.FrozenStartTime > 1000 * 15 * 60 && task.isFrozen == true){
                task.isFrozen = false;
                if(For_USD == false){
                    var lastRate = OK_Rate;
                    OK_Rate = task.e.GetUSDCNY();
                    task.e.SetRate(OK_Rate);
                }
                Log("冻结解除！", For_USD == false ? "并且更新汇率，上次汇率：" + lastRate + "更新后汇率：" + OK_Rate + "#FF0000" : "#FF0000");
            }

            // 交易逻辑
            var SumHold = task.dic.length;
            for(var index = 0; index < task.dic.length && task.isFrozen == false; index++){
                if(task.dic[index].hold === 0){
                    if(task.dic[index].open <= task.Adiff){                            // 正对冲 空A 多B
                        task.action = [index, "sell", "buy", task.dic[index].amount];
                        Log(JSON.stringify(task.action), "A->B:", task.Adiff);
                        // Sell_SymbolA_Buy_SymbolB(task);
                        Hedge_Open_Cover(task);
                        $.PlotFlag(nowTime, "O", "sell-buy", "flag", "red");
                        task.isLogProfit = false;
                        task.nowAccount = _C(task.e.GetAccount);
                        var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                        UpdatePosition(task, Positions);
                        CalcActualPrice(task);
                        UpdatePosition(task, Positions, PRE);
                        Log("Open symbolA:", task.APositions, "symbolB:", task.BPositions);
                    }else if(task.dic[index].open <= -task.Bdiff){                     // 反对冲 多A 空B
                        task.action = [index, "buy", "sell", -task.dic[index].amount];
                        Log(JSON.stringify(task.action), "B->A:", task.Bdiff);
                        // Buy_SymbolA_Sell_SymbolB(task);
                        Hedge_Open_Cover(task);
                        $.PlotFlag(nowTime, "O", "buy-sell", "flag", "red");
                        task.isLogProfit = false;
                        task.nowAccount = _C(task.e.GetAccount);
                        var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                        UpdatePosition(task, Positions);
                        CalcActualPrice(task);
                        UpdatePosition(task, Positions, PRE);
                        Log("Open symbolA:", task.APositions, "symbolB:", task.BPositions);
                    }else{
                        SumHold--;
                    }
                }else{
                    if(task.dic[index].hold > 0 && task.dic[index].cover >= task.Bdiff){  // 平空A 平多B
                        task.action = [index, "closesell", "closebuy", task.dic[index].hold];
                        Log(JSON.stringify(task.action));
                        // Buy_SymbolA_Sell_SymbolB(task);
                        Hedge_Open_Cover(task);
                        $.PlotFlag(nowTime, "C", "closesell-closebuy", "circlepin");
                        task.nowAccount = _C(task.e.GetAccount);
                        var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                        UpdatePosition(task, Positions, PRE);
                        Log("Cover symbolA:", task.APositions, "symbolB:", task.BPositions);
                    }else if(task.dic[index].hold < 0 && task.dic[index].cover >= -task.Adiff){  // 平多A 平空B
                        task.action = [index, "closebuy", "closesell", task.dic[index].hold];
                        Log(JSON.stringify(task.action));
                        // Sell_SymbolA_Buy_SymbolB(task);
                        Hedge_Open_Cover(task);
                        $.PlotFlag(nowTime, "C", "closebuy-closesell", "circlepin");
                        task.nowAccount = _C(task.e.GetAccount);
                        var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                        UpdatePosition(task, Positions, PRE);
                        Log("Cover symbolA:", task.APositions, "symbolB:", task.BPositions);
                    }
                }
            }

            // 更新持仓信息， 计算爆仓风险。
            if(SumHold != 0 && nowTime - task.PositionsLastUpdateTime > 1000 * 30){
                // var Positions = _C(task.e.GetPosition);  // 获取持仓信息。
                // task.APositions = Positions[0];
                // task.BPositions = Positions[1];
                task.PositionsLastUpdateTime = nowTime;
            }else if(SumHold == 0 && task.isLogProfit == false){
                // LogProfit(task.nowAccount.Stocks - task.initAccount.Stocks, "当前：", task.nowAccount, "初始：", task.initAccount);
                sumProfit = 0;
                for(var a = 0 ; a < TC.tasks.length; a++){
                    sumProfit += TC.tasks[a].taskProfit;
                }
                LogProfit(sumProfit, "当前：", task.nowAccount, "初始：", task.initAccount);
                task.taskProfit = task.nowAccount.Stocks - task.initAccount.Stocks;
                task.isLogProfit = true;
            }

            // 检测交割剩余时间、发送 交割前平仓命令
            CheckDelivery(nowTime, "this_week", task);  // 检测 当周交割。 必须在当周交割前平仓。

            // 测试 将数据现在状态栏
            var tbl = {
                type : "table",
                title : task.symbolA + "&" + task.symbolB,
                cols : ["key", "value"],
                rows : []
            };
            for(var key in task){
                value = task[key];
                if(key === "dic" || key === "Adepth" || key === "Bdepth" || key === "initAccount" || key === "nowAccount" || key === "isFrozen" || 
                    key === "FrozenStartTime" || key === "Pre_APositions" || key === "Pre_BPositions"){ // 过滤显示
                    continue;
                }
                if(key === "e"){
                    value = "初始: " + JSON.stringify(task.initAccount) + " 当前: " + JSON.stringify(task.nowAccount);
                    key = task[key].GetName();
                }
                tbl.rows.push([key, value]);
            }
            // 判断下网格方向
            if(task.dic[0].hold < 0){
                for(var j = 0; j < task.dic.length; j++){
                    var task_dic = JSON.stringify(task.dic[j]);
                    if(task.dic[j].hold > 0){
                        task_dic += "#FF0000";
                    }else if(task.dic[j].hold < 0){
                        task_dic += "#32CD32";
                    }
                    tbl.rows.push([j, task_dic]);
                }
            }else if(task.dic[0].hold > 0){
                for(var j = task.dic.length - 1; j >= 0; j--){
                    var task_dic = JSON.stringify(task.dic[j]);
                    if(task.dic[j].hold > 0){
                        task_dic += "#FF0000";
                    }else if(task.dic[j].hold < 0){
                        task_dic += "#32CD32";
                    }
                    tbl.rows.push([j, task_dic]);
                }
            }else{
                for(var j = 0; j < task.dic.length; j++){
                    var task_dic = JSON.stringify(task.dic[j]);
                    if(task.dic[j].hold > 0){
                        task_dic += "#FF0000";
                    }else if(task.dic[j].hold < 0){
                        task_dic += "#32CD32";
                    }
                    tbl.rows.push([j, task_dic]);
                }
            }
            tbls.push(tbl);
        });
        if(tbls.length === 0){ // 容错模式，或者实盘中 可能有原因导致 _.each 迭代中 返回，tbls 为  [] ，处理此种情况。
            return;
        }
        LogStatus("轮询耗时:" + StrLoopTime + " 当前时间：" + _D() + MSG_String + '\n`' + JSON.stringify(tbls) + '`'); // 输出到状态栏
    }

    // 返回对象
    return self;
}



var TC = null; // TasksController 对象
var tbls = [];
var MSG_String = "　　";
var StrLoopTime = "";
var OK_Rate = 0;
var SumUseTime = 0;
var times = 0;
var sumTimes = 0;
var sumProfit = 0;
function main(){
    // 测试代码 模拟界面参数
    //var HedgeTable = "(this_week&quarter)30:15:1;40:25:1;50:35:1;60:45:1(this_week&next_week)10:0:1;15:5:1;20:10:1;25:15:1";
    //var HedgeTable = "(this_week&quarter)100:90:1;110:100:1;120:110:1;130:120:1;140:130:1;150:140:1;160:150:1;170:160:1;180:170:1;190:180:1";
    if(isFilter){
        Log("启用过滤常规错误信息。");
        SetErrorFilter("502:|503:|tcp|character|unexpected|network|timeout|WSARecv|Connect|GetAddr|no such|reset|http|received|EOF|reused");
    }

    var Positions = [];
    for(var j = 0 ; j < exchanges.length ; j++){
        var position = _C(exchanges[j].GetPosition);
        if(position.length !== 0){
            Positions.push(position);
        }
    }
    if(AutoRecoveryState == false && Positions.length == 0){  // 没有持仓，并且关闭了自动恢复
        if(isCreateHedgeList == true){
            HedgeTable = CreateHedgeList(begin, end, size, step, amountOfPoint, symbolA, symbolB);
        }

        // 输出对冲控制表，并检查。
        Log("对冲控制表", HedgeTable);
        if(HedgeTable == "(this_week&quarter)30:15:1"){
            Log("注意！对冲控制表 当前为 默认值！可能引起亏损。");
        }
    
        // 创建控制器对象
        TC = TasksController();
    
        var exchangesNum = 0;
        var e_index = 0;
        for(var i = 0; i < exchanges.length; i++){ // 遍历交易所对象数组
            exchangesNum++;
        }

        var arr = HedgeTable.split('(');

        _.each(arr, function(item) {
            if (item != '') {
                var tmp = item.split(')');
                var pair = tmp[0].replace('(', '').split('&');
                // Log("pair:", pair, "tmp:", tmp); // 测试 显示 处理后的 控制表字符串
                TC.AddTask(exchanges[e_index], pair[0], pair[1], tmp[1]);
                if(For_USD){                                                     // 设置汇率
                    OK_Rate = 1;
                    exchanges[e_index].SetRate(1);
                    Log("使用的价格为美元计价,汇率：", OK_Rate, "，请注意 ”对冲 控制表“ 是否为美元差价#FF0000"); // 币种提示
                }else{
                    OK_Rate = exchanges[e_index].GetUSDCNY();
                    exchanges[e_index].SetRate(OK_Rate);
                    Log("使用的价格为RMB计价,汇率：", OK_Rate, "，请注意 ”对冲 控制表“ 是否为RMB差价#FF0000");  // 币种提示
                }
                if(--exchangesNum < 0){
                    throw "添加的交易所 和 对冲控制表 不匹配！交易所个数：" + exchanges.length + " arr：" + arr;
                }else if(exchangesNum !== 0){
                    e_index++;
                }
            }
        });
    
        Log("交易所对象最大索引 e_index:", e_index, "关联后剩余交易所数量： exchangesNum:", exchangesNum); // 测试
    
        // 调用控制器对象的初始化函数
        TC.InitTask();
    }else if(AutoRecoveryState == false && Positions.length !== 0){                    // 未开启恢复，有持仓
        throw "未开启自动恢复，检测到有持仓信息：" + JSON.stringify(Positions);
    }else if(AutoRecoveryState == true && Positions.length == 0 && (istry == false || IsVirtual())){    // 开启自动恢复， 无持仓信息
        throw "未检测到持仓信息，无法恢复！";
    }else{                                                                             // 恢复持仓
        Log("恢复持仓！");
        if(isCreateHedgeList == true){
            HedgeTable = CreateHedgeList(begin, end, size, step, amountOfPoint, symbolA, symbolB);
        }

        // 输出对冲控制表，并检查。
        Log("对冲控制表", HedgeTable);
        if(HedgeTable == "(this_week&quarter)30:15:1"){
            Log("注意！对冲控制表 当前为 默认值！可能引起亏损。");
        }
    
        // 创建控制器对象
        TC = TasksController();
    
        var exchangesNum = 0;
        var e_index = 0;
        for(var i = 0; i < exchanges.length; i++){ // 遍历交易所对象数组
            exchangesNum++;
        }

        var arr = HedgeTable.split('(');

        _.each(arr, function(item) {
            if (item != '') {
                var tmp = item.split(')');
                var pair = tmp[0].replace('(', '').split('&');
                // Log("pair:", pair, "tmp:", tmp); // 测试 显示 处理后的 控制表字符串
                TC.AddTask(exchanges[e_index], pair[0], pair[1], tmp[1]);
                if(For_USD){                                                     // 设置汇率
                    OK_Rate = 1;
                    exchanges[e_index].SetRate(1);
                    Log("使用的价格为美元计价,汇率：", OK_Rate, "，请注意 ”对冲 控制表“ 是否为美元差价#FF0000"); // 币种提示
                }else{
                    OK_Rate = exchanges[e_index].GetUSDCNY();
                    exchanges[e_index].SetRate(OK_Rate);
                    Log("使用的价格为RMB计价,汇率：", OK_Rate, "，请注意 ”对冲 控制表“ 是否为RMB差价#FF0000");  // 币种提示
                }
                if(--exchangesNum < 0){
                    throw "添加的交易所 和 对冲控制表 不匹配！交易所个数：" + exchanges.length + " arr：" + arr;
                }else if(exchangesNum !== 0){
                    e_index++;
                }
            }
        });
    
        Log("交易所对象最大索引 e_index:", e_index, "关联后剩余交易所数量： exchangesNum:", exchangesNum); // 测试
    
        // 调用控制器对象的初始化函数
        TC.InitTask();
        var PreTC = _G("TC");
        for(var index = 0; index < TC.tasks.length ; index++){
            for(var key in TC.tasks[index]){
                if(key == "e" || key == "Adepth" || key == "Bdepth"){
                    continue;
                }
                TC.tasks[index][key] = PreTC.tasks[index][key];
            }
        }
        //Log(TC); // 测试
    }
    
    ///*
    while(true){
        var nowTime = new Date().getTime();
        TC.DealTask(nowTime);
        Sleep(Interval);
        var endTime = new Date().getTime();
        if(times < 100000){
            SumUseTime += (endTime - nowTime);
            times++;
        }else{
            SumUseTime = 0;
            times = 0;
            SumUseTime += (endTime - nowTime);
            times++;
        }
        sumTimes++;
        var avgUseTime = _N(SumUseTime / times);
        StrLoopTime = (endTime - nowTime) + " ms " + "平均耗时：" + avgUseTime + "循环次数：" + sumTimes;
        //测试
        //OpenPriceToActual(1000, 5, TC.tasks[0]); 
        //throw "stop";
    }
    //*/
}

function onexit(){
    Log("退出策略，自动保存状态。");
    _G("TC", TC);
}
/*
1、需要是一个 期货账户 的模式。
2、合约开仓手续费 0.03%
3、计算手续费进开仓均价
4、可以用市价单。
*/
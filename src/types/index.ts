export interface User {
    userId: number;
    userName: string;
    userStatus: boolean;
    roleId: number;
    roleName: string;
}

export interface Route {
    routeId: number;
    routeName: string;
}

export interface Machine {
    machineId: number;
    numberMachine: string;
    typeMachineId: number;
    typeMachineName: string | null;
    coinTypeId: number;
    numCoin: number | null;
    routeId: number;
    routeName: string | null;
}

export interface CounterRecord {
    counterRecordId: number;
    recordDate: string;
    counterIn: number;
    counterOut: number;
    totalDelivered: number;
    machineId: number;
}

export interface RouteSummaryMachine {
    machineId: number;
    numberMachine: string;
    typeMachineName: string | null;
    // false = la máquina no tuvo registros en el período (sumas en 0)
    liquidated: boolean;
    inOut: number;
    total: number;
    saldo: number;
    faltaSobra: number;
}

export interface RouteSummary {
    routeId: number;
    routeName: string;
    fromDate: string;
    toDate: string;
    machines: RouteSummaryMachine[];
    totalInOut: number;
    totalDelivered: number;
    totalSaldo: number;
    totalFaltaSobra: number;
    machinesLiquidated: number;
    machinesTotal: number;
}

export interface TypeMachine {
    typeMachineId: number;
    nameTypeMachine: string;
}

export interface CoinType {
    coinTypeId: number;
    numCoin: number;
}

export interface CounterRecordWithCalc {
    counterRecordId: number;
    recordDate: string;
    counterIn: number;
    counterOut: number;
    totalDelivered: number;
    isBaseline: boolean;
    inOut: number | null;
    saldo: number | null;
    faltaSobra: number | null;
}
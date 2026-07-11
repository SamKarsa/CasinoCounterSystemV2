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

export interface TypeMachine {
    typeMachineId: number;
    nameTypeMachine: string;
}

export interface CoinType {
    coinTypeId: number;
    numCoin: number;
}
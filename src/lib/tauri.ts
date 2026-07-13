import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import type { User, Route, Machine, TypeMachine, CoinType, CounterRecordWithCalc } from "../types";

// Tamaño de la ventana antes de entrar: el mismo que declara tauri.conf.json
const DEFAULT_WINDOW_SIZE = new LogicalSize(900, 600);

export async function maximizeWindow(): Promise<void> {
  await getCurrentWindow().maximize();
}

export async function restoreDefaultWindow(): Promise<void> {
  const win = getCurrentWindow();
  await win.unmaximize();
  await win.setSize(DEFAULT_WINDOW_SIZE);
  await win.center();
}

export function authenticateUser(
  username: string,
  password: string
): Promise<User> {
  return invoke<User>("authenticate_user", { username, password });
}

export function getAllRoutes(): Promise<Route[]> {
  return invoke<Route[]>("get_all_routes");
}

export function createRoute(routeName: string): Promise<Route> {
  return invoke<Route>("create_route", { routeName });
}

export function updateRoute(routeId: number, routeName: string): Promise<Route> {
  return invoke<Route>("update_route", { routeId, routeName });
}

export function deleteRoute(routeId: number): Promise<void> {
  return invoke("delete_route", { routeId });
}

export function getAllTypeMachines(): Promise<TypeMachine[]> {
  return invoke<TypeMachine[]>("get_all_type_machines");
}

export function getAllCoinTypes(): Promise<CoinType[]> {
  return invoke<CoinType[]>("get_all_coin_types");
}

export function getMachinesByRoute(routeId: number): Promise<Machine[]> {
  return invoke<Machine[]>("get_machines_by_route", { routeId });
}

export function createMachine(data: {
  numberMachine: string;
  typeMachineId: number;
  coinTypeId: number;
  routeId: number;
  initialIn: number;
  initialOut: number;
}): Promise<Machine> {
  return invoke<Machine>("create_machine", { ...data });
}

export function updateMachine(data: {
  machineId: number;
  numberMachine: string;
  typeMachineId: number;
  coinTypeId: number;
  routeId: number;
}): Promise<Machine> {
  return invoke<Machine>("update_machine", { ...data });
}

export function deleteMachine(machineId: number): Promise<void> {
  return invoke("delete_machine", { machineId });
}

export function getRecordsByMachine(
  machineId: number
): Promise<CounterRecordWithCalc[]> {
  return invoke<CounterRecordWithCalc[]>("get_records_by_machine", {
    machineId,
  });
}

export function createCounterRecord(data: {
  machineId: number;
  recordDate: string;
  counterIn: number;
  counterOut: number;
  totalDelivered: number;
}): Promise<CounterRecordWithCalc> {
  return invoke<CounterRecordWithCalc>("create_counter_record", { ...data });
}

export function updateCounterRecord(data: {
  counterRecordId: number;
  recordDate: string;
  counterIn: number;
  counterOut: number;
  totalDelivered: number;
}): Promise<CounterRecordWithCalc> {
  return invoke<CounterRecordWithCalc>("update_counter_record", { ...data });
}

export function deleteCounterRecord(counterRecordId: number): Promise<void> {
  return invoke("delete_counter_record", { counterRecordId });
}
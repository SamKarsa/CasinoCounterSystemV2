import { invoke } from "@tauri-apps/api/core";
import type { User } from "../types";

export function authenticateUser(
  username: string,
  password: string
): Promise<User> {
  return invoke<User>("authenticate_user", { username, password });
}
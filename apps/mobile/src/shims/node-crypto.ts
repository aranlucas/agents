import { randomUUID as expoRandomUUID } from "expo-crypto";

export function randomUUID() {
  return expoRandomUUID();
}

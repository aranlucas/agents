import { getRandomValues, randomUUID as expoRandomUUID } from "expo-crypto";

export { getRandomValues };

export function randomUUID() {
  return expoRandomUUID();
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-explicit-any
const runtime = globalThis as any;
runtime.crypto ??= {};
runtime.crypto.getRandomValues ??= getRandomValues;
runtime.crypto.randomUUID ??= randomUUID;

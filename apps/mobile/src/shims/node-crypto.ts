import { randomUUID as expoRandomUUID, getRandomValues as expoGetRandomValues } from "expo-crypto";

export function randomUUID() {
  return expoRandomUUID();
}

export function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return expoGetRandomValues(array as ArrayBufferView) as T;
}

// Patch global.crypto so uuid and other libs can call crypto.getRandomValues directly.
if (typeof global !== "undefined") {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const g = global as any;
  if (!g.crypto) {
    g.crypto = {};
  }
  if (!g.crypto.getRandomValues) {
    g.crypto.getRandomValues = getRandomValues;
  }
  if (!g.crypto.randomUUID) {
    g.crypto.randomUUID = randomUUID;
  }
}

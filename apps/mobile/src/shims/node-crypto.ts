import { getRandomValues, randomUUID as expoRandomUUID } from "expo-crypto";

export { getRandomValues };

export function randomUUID() {
  return expoRandomUUID();
}

// Patch global.crypto so uuid and other libs can call crypto.getRandomValues directly.
if (typeof global !== "undefined") {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-explicit-any
  const g = global as any;
  g.crypto ??= {};
  g.crypto.getRandomValues ??= getRandomValues;
  g.crypto.randomUUID ??= randomUUID;
}

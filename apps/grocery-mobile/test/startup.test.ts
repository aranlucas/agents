import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entrySource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { main?: string };

describe("native startup", () => {
  it("loads secure crypto and CopilotKit polyfills before Expo Router", () => {
    const cryptoImport = entrySource.indexOf('import "./src/shims/node-crypto";');
    const polyfillImport = entrySource.indexOf('import "@copilotkit/react-native/polyfills";');
    const routerImport = entrySource.indexOf('import "expo-router/entry";');

    expect(packageJson.main).toBe("./index.js");
    expect(cryptoImport).toBeGreaterThanOrEqual(0);
    expect(polyfillImport).toBeGreaterThan(cryptoImport);
    expect(routerImport).toBeGreaterThan(polyfillImport);
  });
});

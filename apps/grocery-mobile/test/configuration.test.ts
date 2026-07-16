import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
const eas = JSON.parse(readFileSync(join(root, "eas.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("native configuration", () => {
  it("exposes deterministic Android and iOS build commands", () => {
    expect(pkg.scripts.build).toBe("pnpm build:android && pnpm build:ios");
    expect(pkg.scripts["build:android"]).toBe("node ./scripts/native-export.mjs android");
    expect(pkg.scripts["build:ios"]).toBe("node ./scripts/native-export.mjs ios");
  });

  it("can build and distribute an iOS app", () => {
    expect(pkg.scripts.ios).toBe("expo run:ios");
    expect(pkg.scripts["build:simulator:ios"]).toContain("--profile ios-simulator --platform ios");
    expect(pkg.scripts["build:production:ios"]).toContain("--profile production --platform ios");
    expect(app.expo.ios.bundleIdentifier).toBe("dev.agents.grocery");
    expect(eas.build["ios-simulator"].ios.simulator).toBe(true);
  });

  it("keeps every test module outside the source and Expo Router trees", () => {
    expect(
      readdirSync(join(root, "src"), { recursive: true }).filter((name) =>
        String(name).match(/\.test\.(?:ts|tsx)$/u),
      ),
    ).toEqual([]);
  });

  it("follows system appearance and keeps Android keyboard resize", () => {
    expect(app.expo.userInterfaceStyle).toBe("automatic");
    expect(app.expo.android.softwareKeyboardLayoutMode).toBe("resize");
  });
});

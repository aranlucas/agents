import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { runtimeUrlForKey } = require("../../app.config.js") as {
  runtimeUrlForKey: (clerkPublishableKey: string, productionRuntimeUrl: string) => string;
};

describe("grocery mobile environment pairing", () => {
  it("routes development Clerk sessions to the development gateway", () => {
    expect(runtimeUrlForKey("pk_test_example", "https://gateway.example.com")).toBe(
      "https://agents-gateway-development.up.railway.app",
    );
  });

  it("keeps live Clerk sessions on the configured production gateway", () => {
    expect(runtimeUrlForKey("pk_live_example", "https://gateway.example.com")).toBe(
      "https://gateway.example.com",
    );
  });
});

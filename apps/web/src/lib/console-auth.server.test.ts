import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, protect } = vi.hoisted(() => {
  const protect = vi.fn();
  return { auth: Object.assign(vi.fn(), { protect }), protect };
});

vi.mock("@clerk/nextjs/server", () => ({ auth }));

import { requireConsoleAuth } from "./console-auth.server";

describe("requireConsoleAuth", () => {
  beforeEach(() => {
    auth.mockReset();
    protect.mockReset();
  });

  it("allows the public Resume agent without reading Clerk auth", async () => {
    await requireConsoleAuth("resume");

    expect(auth).not.toHaveBeenCalled();
    expect(protect).not.toHaveBeenCalled();
  });

  it("protects authenticated-only agents at the resource boundary", async () => {
    await requireConsoleAuth("travel");

    expect(protect).toHaveBeenCalledOnce();
  });
});

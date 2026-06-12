import { createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PROTECTED_ROUTES } from "./proxy";

const matcher = createRouteMatcher(PROTECTED_ROUTES);
const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("protected route matcher", () => {
  it.each([
    "/travel",
    "/grocery",
    "/fitness",
    "/wellness",
    "/oral-boards",
    "/a2ui",
    "/console/travel",
    "/console/grocery",
    "/console/fitness",
    "/console/wellness",
    "/console/oral-boards",
    "/console/a2ui",
    "/console/settings",
  ])("protects %s", (path) => {
    expect(matcher(req(path))).toBe(true);
  });

  it.each(["/", "/console/resume", "/resume", "/sign-in", "/api/agents/health"])(
    "leaves %s public",
    (path) => {
      expect(matcher(req(path))).toBe(false);
    },
  );
});

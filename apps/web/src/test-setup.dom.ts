import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

expect.extend(matchers);

// @testing-library/react needs afterEach wired up explicitly when vitest
// does not run with globals:true (its default).
afterEach(() => {
  cleanup();
});

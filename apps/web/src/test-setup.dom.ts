// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react needs afterEach wired up explicitly when vitest
// does not run with globals:true (its default).
afterEach(() => {
  cleanup();
});

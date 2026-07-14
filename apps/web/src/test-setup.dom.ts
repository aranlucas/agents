// oxlint-disable-next-line import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react needs afterEach wired up explicitly when vitest
// does not run with globals:true (its default).
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia; useIsMobile (and CopilotKit's sidebar)
// call it on mount. Default to desktop (no media query matches).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

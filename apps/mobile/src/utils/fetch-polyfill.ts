// This MUST be first to ensure that `fetch` is defined in the React Native environment.
import "react-native/Libraries/Core/InitializeCore";
// Ensure fetch is installed before adding our fetch polyfill to ensure Headers and Request are available globally.
import "whatwg-fetch";
// This MUST be imported to ensure URL is installed.
import "expo";
// This file configures the runtime environment to increase compatibility with WinterCG.
// https://wintercg.org/
import Constants from "expo-constants";

import { fetch } from "expo/fetch";

const manifest = Constants.expoConfig;

const polyfillSymbol = Symbol.for("expo.polyfillFetchWithWindowLocation");

export function wrapFetchWithWindowLocation(baseFetch: Function & { [polyfillSymbol]?: boolean }) {
  if (baseFetch[polyfillSymbol]) {
    return baseFetch;
  }

  const _fetch = (...props: unknown[]) => {
    const arg0 = props[0];
    if (typeof arg0 === "string" && arg0.startsWith("/")) {
      props[0] = new URL(arg0, getOrigin()).toString();
    } else if (arg0 && typeof arg0 === "object") {
      const req = arg0 as { url?: string };
      if (req.url && typeof req.url === "string" && req.url.startsWith("/")) {
        req.url = new URL(req.url, getOrigin()).toString();
      }
    }

    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    return (baseFetch as (...args: unknown[]) => unknown)(...props);
  };

  _fetch[polyfillSymbol] = true;

  return _fetch;
}

const extra = manifest?.extra;

function getOrigin() {
  assertOrigin();
  return window.location?.origin;
}

function assertOrigin() {
  // We use the dev server in development but should attempt to warn early if the origin will be disabled in production.
  if (extra?.router?.origin === false) {
    throw new Error(
      "The server origin cannot be false in the app.json. Setup server deployments to ensure production fetch requests work https://docs.expo.dev/router/reference/api-routes/#native-deployment",
    );
  }
  if (typeof window !== "undefined" && !window.location) {
    throw new Error(
      "window.location is not defined. Setup server deployments to ensure relative fetch requests work in production https://docs.expo.dev/router/reference/api-routes/#native-deployment",
    );
  }
}

// Defer the assertion in release builds so the app doesn't crash instantly.
if (__DEV__) assertOrigin();

// Polyfill window.location in native runtimes.
if (typeof window !== "undefined") {
  // Polyfill native fetch to support relative URLs
  Object.defineProperty(globalThis, "fetch", {
    value: wrapFetchWithWindowLocation(fetch),
  });
}

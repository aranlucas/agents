// Test-only stub for the deprecated `text-encoding` CJS polyfill imported by
// `@copilotkit/react-native/polyfills`. Its UMD build has no statically
// detectable named exports, so Node's ESM loader (and vitest 5) cannot bind
// `TextDecoder`/`TextEncoder` from it. Node 24 provides both globals natively,
// so re-export them from `node:util`. Wired via `resolve.alias` below.
export { TextDecoder, TextEncoder } from "node:util";

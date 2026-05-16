import Constants, { ExecutionEnvironment } from "expo-constants";

import { MainHeader as FallbackMainHeader } from "./main-header.fallback";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const SwiftUIMainHeader: typeof FallbackMainHeader | undefined = isExpoGo
  ? undefined
  : require("./main-header.swiftui").MainHeader;

export function MainHeader() {
  if (SwiftUIMainHeader) {
    return <SwiftUIMainHeader />;
  }
  return <FallbackMainHeader />;
}

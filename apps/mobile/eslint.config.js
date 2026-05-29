// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: [
      "src/components/chat/conversation.tsx",
      "src/components/drawer-layout.tsx",
      "src/utils/use-agent.ts",
    ],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
]);

import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL(".", import.meta.url)),
  resolvePluginsRelativeTo: path.dirname(require.resolve("eslint-config-next")),
});

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // CommonJS is required by the isolated provider-mock test loader.
  { files: ["scripts/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
];
export default config;

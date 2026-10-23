import { defineConfig } from "vitest/config";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        "postgresql://test:test_password@127.0.0.1:54340/ygg_http_test",
      APP_ORIGIN: "http://localhost:3000",
      MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      PAYMENT_PROVIDER: "disabled",
      DELIVERY_FLAT_RATE_CENTS: "1500",
      TRUST_PROXY: "false",
    },
  },
});

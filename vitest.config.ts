import { defineConfig } from "vitest/config";
import { randomBytes } from "node:crypto";
export default defineConfig({
  test: {
    include: ["tests/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://test:test_password@127.0.0.1:54339/ygg_test",
      APP_ORIGIN: "http://localhost:3000",
      MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      DELIVERY_FLAT_RATE_CENTS: "1500",
      PAYMENT_PROVIDER: "disabled",
      TRUST_PROXY: "false",
    },
  },
});

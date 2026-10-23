import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.E2E_BASE_URL || "http://localhost:18080");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
  "Este teste de rajada só pode atingir o laboratório local.",
);
const request = (path, init = {}) =>
  fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(10000) });
const graphql = (query, extraHeaders = {}) =>
  request("/api/graphql", {
    method: "POST",
    headers: {
      origin: base.origin,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({ query }),
  });
const health = await request("/api/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).status, "ok");
const introspection = await graphql("{__schema{queryType{name}}}");
assert.equal(introspection.status, 400);
await introspection.arrayBuffer();
const origin = await graphql("{me{id}}", { origin: "https://evil.example" });
assert.equal(origin.status, 403);
await origin.arrayBuffer();
const method = await request("/api/graphql");
assert.equal(method.status, 405);
await method.arrayBuffer();
const oversized = await request("/api/graphql", {
  method: "POST",
  headers: { origin: base.origin, "content-type": "application/json" },
  body: "x".repeat(70000),
});
assert.equal(oversized.status, 413);
await oversized.arrayBuffer();
const statuses = await Promise.all(
  Array.from({ length: 80 }, async (_, i) => {
    const response = await request("/api/health", {
      headers: {
        "x-real-ip": `192.0.2.${i + 1}`,
        "x-forwarded-for": `192.0.2.${i + 1}`,
      },
    });
    await response.arrayBuffer();
    return response.status;
  }),
);
const accepted = statuses.filter((status) => status === 200).length;
const limited = statuses.filter((status) => status === 429).length;
assert(
  accepted > 0 && limited > 0 && accepted + limited === 80,
  "O proxy deve aceitar parte da rajada e limitar o restante, mesmo com IPs forjados.",
);
const report = {
  testedAt: new Date().toISOString(),
  origin: base.origin,
  health: 200,
  introspection: 400,
  crossOrigin: 403,
  invalidMethod: 405,
  oversizedBody: 413,
  burst: { total: 80, accepted, limited, spoofedIpHeaders: true },
};
const directory = new URL("../test-results/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("proxy-security.json", directory),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));

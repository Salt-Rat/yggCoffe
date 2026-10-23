import { describe, it, expect } from "vitest";
import { parse } from "graphql";
import { enforceQueryLimits } from "../src/lib/graphql";
import {
  checkOrigin,
  encrypt,
  decrypt,
  ipKey,
  readBody,
} from "../src/lib/security";
import { productInput, mediaUrl } from "../src/lib/validation";
import { validateCheckoutUrl, paymentProvider } from "../src/lib/payments";
describe("request boundaries", () => {
  it("rejects cross-site requests even with a cookie", () => {
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000/api/graphql", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
            cookie: "coffee_session=stolen",
          },
        }),
      ),
    ).toThrow("Origem");
  });
  it("ignores spoofed forwarding headers by default", () => {
    expect(
      ipKey(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" },
        }),
      ),
    ).toBe("untrusted-shared");
  });
  it("limits streamed bodies, not just Content-Length", async () => {
    await expect(
      readBody(
        new Request("http://localhost", {
          method: "POST",
          body: "x".repeat(33000),
        }),
      ),
    ).rejects.toThrow("grande");
  });
  it("rejects GraphQL batching and mutation aliases", () => {
    expect(() =>
      enforceQueryLimits(parse("query A{me{id}} query B{me{id}}")),
    ).toThrow();
    expect(() =>
      enforceQueryLimits(parse("mutation {a:logout b:logout}")),
    ).toThrow();
  });
  it("counts fields expanded through fragments", () => {
    const query = `{${Array.from({ length: 8 }, (_, i) => `p${i}:products{...P}`).join(" ")}} fragment P on Product{${Array.from({ length: 25 }, (_, i) => `x${i}:name`).join(" ")}}`;
    expect(() => enforceQueryLimits(parse(query))).toThrow("complexa");
  });
  it("rejects recursive fragments and deep queries", () => {
    expect(() =>
      enforceQueryLimits(parse("{me{...A}} fragment A on User{...A}")),
    ).toThrow("recursivo");
    expect(() =>
      enforceQueryLimits(parse("{a{b{c{d{e{f{g{h{id}}}}}}}}}")),
    ).toThrow("profunda");
  });
  it("accepts a bounded catalog query", () => {
    expect(
      enforceQueryLimits(
        parse(
          "{products(first:12){id name variants{sku available}} roasts{id name}}",
        ),
      ).operation,
    ).toBe("query");
  });
  it("bounds fragment-only expansion before validation (undefined leaves)", () => {
    const fragments = Array.from(
      { length: 22 },
      (_, i) => `fragment F${i} on Query {...F${i + 1} ...F${i + 1}}`,
    ).join(" ");
    expect(() => enforceQueryLimits(parse(`{...F0} ${fragments}`))).toThrow(
      "complexa",
    );
  });
  it("bounds inline-fragment recursion independently of field depth", () => {
    const query = `{${"... on Query {".repeat(40)}me{id}${"}".repeat(40)}}`;
    expect(() => enforceQueryLimits(parse(query))).toThrow("fragmentos");
  });
  it("encrypts secrets and detects tampering", () => {
    const encrypted = encrypt("totp-secret");
    expect(encrypted).not.toContain("totp-secret");
    expect(decrypt(encrypted)).toBe("totp-secret");
    const [iv, tag, body] = encrypted.split(".");
    expect(() => decrypt(`${iv}.${tag}.${body.slice(0, -2)}aa`)).toThrow();
  });
  it("blocks executable and insecure media URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,x",
      "http://evil.test/a.png",
    ])
      expect(mediaUrl.safeParse(url).success).toBe(false);
  });
  it("does not enable unimplemented payment providers", () => {
    expect(() => paymentProvider("mercado-pago")).toThrow("disponíveis");
  });
  it("rejects malicious payment redirects", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://mercadopago.com.br.evil.test",
      "https://evil.test",
      "http://mercadopago.com.br",
    ])
      expect(() => validateCheckoutUrl(url)).toThrow();
    expect(
      validateCheckoutUrl("https://www.mercadopago.com.br/checkout"),
    ).toContain("mercadopago");
  });
  it("rejects role/owner injection and negative prices", () => {
    expect(
      productInput.safeParse({
        role: "ADMIN",
        userId: "x",
        variants: [{ priceCents: -1 }],
      }).success,
    ).toBe(false);
  });
});

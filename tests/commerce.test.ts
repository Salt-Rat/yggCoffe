import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { TOTP, Secret } from "otpauth";
import { db, rows, transaction } from "../src/lib/db";
import { migrate } from "../scripts/migrate";
import { seed } from "../scripts/seed";
import {
  createOrder,
  getOrder,
  cancelOrder,
  expireReservations,
  processPaymentEvent,
} from "../src/lib/orders";
import {
  passwordHash,
  consumeTotp,
  adminMutation,
  getSession,
  login,
  logout,
  redeemToken,
  requestReset,
  register,
  type Context,
} from "../src/lib/auth";
import {
  saveAddress,
  saveRoast,
  roasts,
  setCartItem,
  cart,
  saveProduct,
} from "../src/lib/catalog";
import { defaultRoasts } from "../src/lib/defaults";
import { encrypt, hash, token, rateLimit, decrypt } from "../src/lib/security";
import { graphqlRequest } from "../src/lib/graphql";
import type {
  PaymentProvider,
  VerifiedPaymentEvent,
} from "../src/lib/payments";
let pg: EmbeddedPostgres, passwordDigest: string;
const testPassword = "Password-for-tests-123!";
const gateway: PaymentProvider = {
  name: "test-only",
  async createCheckout(intent) {
    return {
      paymentId: `p-${intent.orderId}`,
      url: `https://www.mercadopago.com.br/checkout/${intent.orderId}`,
    };
  },
  async verifyWebhook() {
    throw new Error("Test adapter cannot accept webhooks");
  },
};
beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "ygg-postgres-test-"));
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "test",
    password: "test_password",
    port: 54339,
    persistent: false,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("ygg_test");
  await migrate();
  await seed();
  passwordDigest = await passwordHash(testPassword);
});
afterAll(async () => {
  await db.end();
  if (pg) await pg.stop();
});
async function actor(role = "CUSTOMER") {
  const [u] = await rows(
    "INSERT INTO users(name,email,password_hash,role,email_verified_at) VALUES($1,$2,$3,$4,now()) RETURNING id,name,email,role",
    ["Test", `${randomUUID()}@example.test`, passwordDigest, role],
  );
  const raw = token(),
    csrf = token();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,csrf_token,user_agent_hash,mfa_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",
    [
      hash(raw),
      u.id,
      csrf,
      hash("test-agent"),
      role === "ADMIN" ? new Date() : null,
    ],
  );
  const ctx: Context = {
    request: new Request("http://localhost:3000/api/graphql", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "user-agent": "test-agent",
        cookie: `coffee_session=${raw}`,
        "x-csrf-token": csrf,
      },
    }),
    headers: new Headers(),
    session: {
      tokenHash: hash(raw),
      csrfToken: csrf,
      mfaVerifiedAt: role === "ADMIN" ? new Date() : null,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role,
        emailVerified: true,
      },
    },
    cartKey: `u:${u.id}`,
    ip: randomUUID(),
  };
  const addressId = await saveAddress(ctx, {
    recipient: "Pessoa Teste",
    postalCode: "39100000",
    street: "Rua Teste",
    number: "10",
    district: "Centro",
    city: "Diamantina",
    state: "MG",
    complement: "",
  });
  return { ctx, addressId, raw };
}
async function variant(stock = 1) {
  const suffix = randomUUID();
  const [p] = await rows(
    `INSERT INTO products(item_index,slug,name,description,category,roast_id,image_url) VALUES($1,$1,'Café teste','Notas de teste','Café','media','/images/coffee-bean.png') RETURNING id`,
    [suffix],
  );
  const [v] = await rows(
    `INSERT INTO product_variants(product_id,sku,label,price_cents,stock) VALUES($1,$2,'250 g',4900,$3) RETURNING id`,
    [p.id, suffix, stock],
  );
  return v.id as string;
}
const input = (addressId: string, variantId: string, key = randomUUID()) => ({
  addressId,
  key,
  items: [{ variantId, quantity: 1 }],
});
const event = (
  order: Record<string, unknown>,
  eventId = randomUUID(),
): VerifiedPaymentEvent => ({
  orderId: order.id as string,
  eventId,
  paymentId: `p-${order.id}`,
  amountCents: order.totalCents as number,
  currency: "BRL",
  status: "PAID",
});
it("reserves the last unit for exactly one of two simultaneous buyers", async () => {
  const [a, b, v] = await Promise.all([actor(), actor(), variant()]);
  const results = await Promise.allSettled([
    createOrder(a.ctx, input(a.addressId, v), gateway),
    createOrder(b.ctx, input(b.addressId, v), gateway),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const [inventory] = await rows(
    "SELECT stock,reserved FROM product_variants WHERE id=$1",
    [v],
  );
  expect(inventory).toEqual({ stock: 1, reserved: 1 });
});
it("deduplicates simultaneous checkout retries", async () => {
  const a = await actor(),
    v = await variant(5),
    payload = input(a.addressId, v);
  const orders = await Promise.all([
    createOrder(a.ctx, payload, gateway),
    createOrder(a.ctx, payload, gateway),
  ]);
  expect(orders[0].id).toBe(orders[1].id);
  expect(
    (await rows("SELECT reserved FROM product_variants WHERE id=$1", [v]))[0]
      .reserved,
  ).toBe(1);
});
it("rejects reusing an idempotency key for different items", async () => {
  const a = await actor(),
    v = await variant(5),
    payload = input(a.addressId, v);
  await createOrder(a.ctx, payload, gateway);
  await expect(
    createOrder(
      a.ctx,
      { ...payload, items: [{ variantId: v, quantity: 2 }] },
      gateway,
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("calculates current server prices and preserves snapshots", async () => {
  const a = await actor(),
    v = await variant(2);
  await db.query("UPDATE product_variants SET price_cents=5900 WHERE id=$1", [
    v,
  ]);
  const o = await createOrder(a.ctx, input(a.addressId, v), gateway);
  expect(o.totalCents).toBe(7400);
  await db.query("UPDATE product_variants SET price_cents=9999 WHERE id=$1", [
    v,
  ]);
  const snapshot = await getOrder(a.ctx, o.id);
  expect(snapshot.items[0].unitPriceCents).toBe(5900);
});
it("rejects forged client totals and duplicate item IDs", async () => {
  const a = await actor(),
    v = await variant(3),
    payload = input(a.addressId, v);
  await expect(
    createOrder(a.ctx, { ...payload, totalCents: 1 }, gateway),
  ).rejects.toThrow();
  await expect(
    createOrder(
      a.ctx,
      { ...payload, items: [...payload.items, ...payload.items] },
      gateway,
    ),
  ).rejects.toMatchObject({ code: "DUPLICATE_ITEM" });
});
it("does not disclose, cancel, or deliver to another customer order/address", async () => {
  const a = await actor(),
    b = await actor(),
    v = await variant(3);
  const o = await createOrder(a.ctx, input(a.addressId, v), gateway);
  await expect(getOrder(b.ctx, o.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(cancelOrder(b.ctx, o.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    createOrder(b.ctx, input(a.addressId, v), gateway),
  ).rejects.toMatchObject({ code: "ADDRESS" });
});
it("deduplicates payment webhooks and never double-decrements inventory", async () => {
  const a = await actor(),
    v = await variant(1),
    o = await createOrder(a.ctx, input(a.addressId, v), gateway),
    e = event(o);
  expect(await processPaymentEvent(gateway.name, e)).toBe("PAID");
  expect(await processPaymentEvent(gateway.name, e)).toBe("DUPLICATE");
  expect(
    await processPaymentEvent(gateway.name, {
      ...e,
      eventId: randomUUID(),
      status: "FAILED",
    }),
  ).toBe("IGNORED");
  expect(
    (
      await rows("SELECT stock,reserved FROM product_variants WHERE id=$1", [v])
    )[0],
  ).toEqual({ stock: 0, reserved: 0 });
});
it("rejects payment amount/currency/provider mismatches", async () => {
  const a = await actor(),
    v = await variant(),
    o = await createOrder(a.ctx, input(a.addressId, v), gateway);
  await expect(
    processPaymentEvent(gateway.name, { ...event(o), amountCents: 1 }),
  ).rejects.toMatchObject({ code: "PAYMENT_MISMATCH" });
  await expect(
    processPaymentEvent(gateway.name, { ...event(o), currency: "USD" }),
  ).rejects.toThrow();
  await expect(
    processPaymentEvent("wrong-provider", event(o)),
  ).rejects.toThrow();
  expect((await getOrder(a.ctx, o.id)).status).toBe("PENDING");
});
it("releases expired reservations once and sends late approvals to review", async () => {
  const a = await actor(),
    v = await variant(),
    o = await createOrder(a.ctx, input(a.addressId, v), gateway);
  await db.query(
    "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [o.id],
  );
  await Promise.all([expireReservations(), expireReservations()]);
  expect(await processPaymentEvent(gateway.name, event(o))).toBe(
    "PAYMENT_REVIEW",
  );
  expect(
    (
      await rows("SELECT stock,reserved FROM product_variants WHERE id=$1", [v])
    )[0],
  ).toEqual({ stock: 1, reserved: 0 });
});
it("serializes cancellation against payment confirmation", async () => {
  const a = await actor(),
    v = await variant(),
    o = await createOrder(a.ctx, input(a.addressId, v), gateway);
  await Promise.allSettled([
    cancelOrder(a.ctx, o.id),
    processPaymentEvent(gateway.name, event(o)),
  ]);
  const current = await getOrder(a.ctx, o.id);
  expect(["PAID", "PAYMENT_REVIEW"]).toContain(current.status);
  const [inventory] = await rows(
    "SELECT stock,reserved FROM product_variants WHERE id=$1",
    [v],
  );
  expect(inventory.reserved).toBe(0);
  expect(inventory.stock).toBe(current.status === "PAID" ? 0 : 1);
});
it("retains a reservation after gateway timeout and retries without a second hold", async () => {
  const a = await actor(),
    v = await variant(2),
    payload = input(a.addressId, v);
  await expect(
    createOrder(a.ctx, payload, {
      ...gateway,
      async createCheckout() {
        throw new Error("timeout");
      },
    }),
  ).rejects.toThrow("timeout");
  await createOrder(a.ctx, payload, gateway);
  expect(
    (await rows("SELECT reserved FROM product_variants WHERE id=$1", [v]))[0]
      .reserved,
  ).toBe(1);
});
it("does not reserve inventory when payment is disabled", async () => {
  const a = await actor(),
    v = await variant();
  await expect(createOrder(a.ctx, input(a.addressId, v))).rejects.toMatchObject(
    { code: "PAYMENT_UNAVAILABLE" },
  );
  expect(
    (await rows("SELECT reserved FROM product_variants WHERE id=$1", [v]))[0]
      .reserved,
  ).toBe(0);
});
it("enforces a shared atomic rate limit under concurrency", async () => {
  const key = randomUUID();
  const result = await Promise.allSettled(
    Array.from({ length: 12 }, () => rateLimit(key, 3, 60)),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(3);
});
it("rejects admin writes from customers and stolen sessions without a fresh OTP", async () => {
  const customer = await actor();
  await expect(
    adminMutation(customer.ctx, "TEST", undefined, async () => true),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const admin = await actor("ADMIN");
  await expect(
    adminMutation(admin.ctx, "TEST", undefined, async () => true),
  ).rejects.toThrow();
});
it("accepts a valid TOTP only once, even concurrently", async () => {
  const a = await actor("ADMIN"),
    secret = new Secret({ size: 20 }),
    totp = new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
  await db.query("UPDATE users SET mfa_secret=$2 WHERE id=$1", [
    a.ctx.session!.user.id,
    encrypt(secret.base32),
  ]);
  const code = totp.generate();
  const attempts = await Promise.allSettled([
    transaction((tx) => consumeTotp(tx, a.ctx.session!.user.id, code)),
    transaction((tx) => consumeTotp(tx, a.ctx.session!.user.id, code)),
  ]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
});
it("requires password and OTP on admin login", async () => {
  const a = await actor("ADMIN");
  await expect(
    login(a.ctx, { email: a.ctx.session!.user.email, password: testPassword }),
  ).rejects.toThrow();
});
it("invalidates a session on logout and binds admin sessions to the user agent", async () => {
  const a = await actor("ADMIN");
  expect(await getSession(a.ctx.request)).not.toBeNull();
  const headers = new Headers(a.ctx.request.headers);
  headers.set("user-agent", "attacker");
  expect(await getSession(new Request(a.ctx.request, { headers }))).toBeNull();
  await logout(a.ctx);
  expect(await getSession(a.ctx.request)).toBeNull();
});
it("prevents GraphQL owner and role escalation", async () => {
  const a = await actor();
  const request = new Request("http://localhost:3000/api/graphql", {
    method: "POST",
    headers: a.ctx.request.headers,
    body: JSON.stringify({ query: "{adminProducts{id name}}" }),
  });
  const response = await graphqlRequest(request);
  expect(response.status).toBe(403);
  expect((await response.json()).errors[0].extensions.code).toBe("FORBIDDEN");
});
it("rejects mutations without the session CSRF token", async () => {
  const a = await actor();
  const headers = new Headers(a.ctx.request.headers);
  headers.delete("x-csrf-token");
  const response = await graphqlRequest(
    new Request("http://localhost:3000/api/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "mutation{logout}" }),
    }),
  );
  expect(response.status).toBe(403);
});
it("limits GraphQL pagination and excludes inactive products", async () => {
  const a = await actor();
  const request = (query: string) =>
    new Request("http://localhost:3000/api/graphql", {
      method: "POST",
      headers: a.ctx.request.headers,
      body: JSON.stringify({ query }),
    });
  expect(
    (await graphqlRequest(request("{products(first:99999){id}}"))).status,
  ).toBe(400);
  const v = await variant();
  await db.query(
    "UPDATE products SET active=false WHERE id=(SELECT product_id FROM product_variants WHERE id=$1)",
    [v],
  );
  const response = await graphqlRequest(
    request("{products(first:30){id active}}"),
  );
  expect(
    (await response.json()).data.products.every(
      (p: { active: boolean }) => p.active,
    ),
  ).toBe(true);
});
it("uses single-use reset tokens and revokes all sessions", async () => {
  const a = await actor();
  await requestReset(a.ctx, a.ctx.session!.user.email);
  const [mail] = await rows(
    "SELECT encrypted_text FROM email_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1",
    [a.ctx.session!.user.email],
  );
  const raw = /token=([\w-]+)/.exec(decrypt(mail.encrypted_text))![1];
  await redeemToken(raw, "RESET", "a-brand-new-password-123");
  expect(await getSession(a.ctx.request)).toBeNull();
  await expect(
    redeemToken(raw, "RESET", "another-brand-new-password"),
  ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
});
it("never accepts role injection at registration", async () => {
  const a = await actor();
  await expect(
    register(a.ctx, {
      name: "Attacker",
      email: `${randomUUID()}@example.test`,
      password: testPassword,
      consent: true,
      role: "ADMIN",
    }),
  ).rejects.toThrow();
});
it("keeps audit logs and order history append-only", async () => {
  await expect(
    db.query("UPDATE audit_logs SET action='tampered'"),
  ).rejects.toThrow("append-only");
  await expect(db.query("DELETE FROM order_history")).rejects.toThrow(
    "append-only",
  );
});

async function adminWithCode() {
  const a = await actor("ADMIN"),
    secret = new Secret({ size: 20 }),
    totp = new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
  await db.query("UPDATE users SET mfa_secret=$2 WHERE id=$1", [
    a.ctx.session!.user.id,
    encrypt(secret.base32),
  ]);
  const headers = new Headers(a.ctx.request.headers);
  headers.set("x-admin-totp", totp.generate());
  a.ctx.request = new Request(a.ctx.request, { headers });
  return a;
}
it("persists an admin roast edit and audit atomically, then rejects OTP replay", async () => {
  const a = await adminWithCode();
  await saveRoast(a.ctx, { ...defaultRoasts[0], flavor: "Frutado de teste" });
  expect((await roasts())[0].flavor).toBe("Frutado de teste");
  expect(
    (
      await rows("SELECT action FROM audit_logs WHERE actor_id=$1", [
        a.ctx.session!.user.id,
      ])
    ).map((r) => r.action),
  ).toContain("ROAST_UPDATE");
  await expect(
    saveRoast(a.ctx, { ...defaultRoasts[0], flavor: "Replay" }),
  ).rejects.toMatchObject({ code: "MFA_INVALID" });
});
it("rejects stale admin contexts after session revocation or reauth expiry", async () => {
  const a = await adminWithCode();
  await db.query("DELETE FROM sessions WHERE token_hash=$1", [
    a.ctx.session!.tokenHash,
  ]);
  await expect(
    adminMutation(a.ctx, "SHOULD_NOT_RUN", undefined, async () => true),
  ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
  const b = await adminWithCode();
  await db.query(
    "UPDATE sessions SET mfa_verified_at=now()-interval '11 minutes' WHERE token_hash=$1",
    [b.ctx.session!.tokenHash],
  );
  await expect(
    adminMutation(b.ctx, "SHOULD_NOT_RUN", undefined, async () => true),
  ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
});
it("prevents admin stock edits below quantities already reserved", async () => {
  const buyer = await actor(),
    a = await adminWithCode(),
    v = await variant(1);
  await createOrder(buyer.ctx, input(buyer.addressId, v), gateway);
  const [p] = await rows(
    "SELECT p.*,v.id AS variant_id,v.sku FROM products p JOIN product_variants v ON v.product_id=p.id WHERE v.id=$1",
    [v],
  );
  await expect(
    saveProduct(a.ctx, {
      id: p.id,
      itemIndex: p.item_index,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      roastId: p.roast_id,
      imageUrl: p.image_url,
      active: true,
      displayOrder: 0,
      variants: [
        {
          id: v,
          sku: p.sku,
          label: "250 g",
          priceCents: 4900,
          stock: 0,
          active: true,
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "STOCK_RESERVED" });
  expect(
    (
      await rows("SELECT stock,reserved FROM product_variants WHERE id=$1", [v])
    )[0],
  ).toEqual({ stock: 1, reserved: 1 });
});
it("merges anonymous and authenticated baskets on login without exposing an owner selector", async () => {
  const a = await actor(),
    v = await variant(10),
    anon = token();
  await setCartItem(a.ctx, v, 2);
  await db.query(
    "INSERT INTO cart_items(owner_key,variant_id,quantity) VALUES($1,$2,3)",
    [`a:${hash(anon)}`, v],
  );
  const headers = new Headers(a.ctx.request.headers);
  headers.set("cookie", `${headers.get("cookie")}; coffee_cart=${anon}`);
  a.ctx.request = new Request(a.ctx.request, { headers });
  await login(a.ctx, {
    email: a.ctx.session!.user.email,
    password: testPassword,
  });
  expect((await cart(a.ctx))[0].quantity).toBe(5);
  expect(
    await rows("SELECT 1 FROM cart_items WHERE owner_key=$1", [
      `a:${hash(anon)}`,
    ]),
  ).toHaveLength(0);
});
it("enforces cart item limits even during simultaneous inserts", async () => {
  const a = await actor();
  const ids = await Promise.all(Array.from({ length: 32 }, () => variant()));
  const outcomes = await Promise.allSettled(
    ids.map((v) => setCartItem(a.ctx, v, 1)),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(30);
  expect(
    Number(
      (
        await rows("SELECT count(*) FROM cart_items WHERE owner_key=$1", [
          a.ctx.cartKey,
        ])
      )[0].count,
    ),
  ).toBe(30);
});

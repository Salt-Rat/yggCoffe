import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import { db, rows } from "../../src/lib/db";
import { migrate } from "../../scripts/migrate";
import { seed } from "../../scripts/seed";
import { graphqlRequest } from "../../src/lib/graphql";
import { webhookRequest } from "../../src/lib/webhook";
import { GET as sessionRequest } from "../../src/app/api/session/route";
import { passwordHash } from "../../src/lib/auth";
import { encrypt, decrypt, hash } from "../../src/lib/security";
import { AppError } from "../../src/lib/errors";
import { expireReservations } from "../../src/lib/orders";
import { runJobs } from "../../src/lib/worker";
import type {
  PaymentProvider,
  PaymentIntent,
  VerifiedPaymentEvent,
} from "../../src/lib/payments";

// Only this test module knows the simulator/signing key. No production switch enables it.
const signingKey = randomUUID();
const sign = (body: string) =>
  createHmac("sha256", signingKey).update(body).digest("hex");
let server: Server, gatewayServer: Server, base: string, gatewayBase: string;
const gatewayIntents = new Map<string, PaymentIntent>();
const password = "Integration-password-123!";
const address = {
  recipient: "Pessoa Teste",
  postalCode: "39100000",
  street: "Rua Teste",
  number: "10",
  complement: "",
  district: "Centro",
  city: "Diamantina",
  state: "MG",
};
const saveAddressMutation =
  "mutation($input:AddressInput!){saveAddress(input:$input)}";
const createOrderMutation =
  "mutation($input:CheckoutInput!){createOrder(input:$input){id status totalCents checkoutUrl items{quantity unitPriceCents}}}";
const saveProductMutation =
  "mutation($input:ProductInput!){saveProduct(input:$input)}";
const provider: PaymentProvider = {
  name: "http-test-only",
  async createCheckout(intent) {
    const result = await fetch(`${gatewayBase}/checkout`, {
      method: "POST",
      body: JSON.stringify(intent),
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) throw new Error("Simulator unavailable");
    return result.json();
  },
  async verifyWebhook(body, headers) {
    const signature = headers.get("x-test-signature") || "";
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(body)))
    )
      throw new AppError("SIGNATURE", "Assinatura inválida.", 401);
    return JSON.parse(body) as VerifiedPaymentEvent;
  },
};

async function listen(instance: Server) {
  await new Promise<void>((resolve) =>
    instance.listen(0, "127.0.0.1", resolve),
  );
  const info = instance.address();
  if (!info || typeof info === "string") throw new Error("Missing port");
  return `http://127.0.0.1:${info.port}`;
}
async function close(instance?: Server) {
  if (instance) {
    instance.closeAllConnections();
    await new Promise<void>((resolve) => instance.close(() => resolve()));
  }
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith("_test"))
    throw new Error("Integration requires a dedicated *_test database");
  await migrate();
  await seed();
  gatewayServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const intent = JSON.parse(
      Buffer.concat(chunks).toString(),
    ) as PaymentIntent;
    gatewayIntents.set(intent.orderId, intent);
    res.setHeader("content-type", "application/json");
    // URL is never opened: only the server-to-server simulator receives traffic.
    res.end(
      JSON.stringify({
        paymentId: `test-${intent.orderId}`,
        url: `https://www.mercadopago.com.br/test/${intent.orderId}`,
      }),
    );
  });
  gatewayBase = await listen(gatewayServer);
  server = createServer(async (req, res) => {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const init: RequestInit & { duplex?: "half" } = {
        method: req.method,
        headers,
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = Readable.toWeb(req) as ReadableStream;
        init.duplex = "half";
      }
      const request = new Request(`http://localhost:3000${req.url}`, init);
      const response =
        req.url === "/api/session"
          ? await sessionRequest(request)
          : req.url === "/api/graphql"
            ? await graphqlRequest(request, { payments: provider })
            : req.url === "/api/production-graphql"
              ? await graphqlRequest(request)
              : req.url === "/api/webhooks/test"
                ? await webhookRequest(request, provider.name, provider)
                : new Response(null, { status: 404 });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") res.setHeader(key, value);
      });
      res.setHeader("set-cookie", response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.end("Test transport error");
    }
  });
  base = await listen(server);
});
beforeEach(async () => {
  await db.query("DELETE FROM rate_limits");
});
afterAll(async () => {
  await close(server);
  await close(gatewayServer);
  await db.end();
});

class Browser {
  cookies = new Map<string, string>();
  csrf = "public";
  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers({
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "user-agent": "integration-browser",
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      "x-csrf-token": this.csrf,
    });
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const response = await fetch(base + path, {
      ...init,
      headers,
      signal: AbortSignal.timeout(10000),
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0],
        split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  }
  gql(query: string, variables = {}, headers = {}) {
    return this.request("/api/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
  }
  async ok(query: string, variables = {}, headers = {}) {
    const result = await this.gql(query, variables, headers);
    expect(result.body.errors, JSON.stringify(result.body)).toBeUndefined();
    expect(result.status).toBe(200);
    return result.body.data;
  }
  async refresh() {
    const response = await this.request("/api/session");
    this.csrf = response.body.csrfToken;
    return response.body;
  }
}
async function actionToken(email: string, kind: "VERIFY" | "RESET") {
  const messages = await rows(
    "SELECT encrypted_text FROM email_outbox WHERE recipient=$1 AND subject LIKE $2 ORDER BY created_at DESC LIMIT 1",
    [email, kind === "RESET" ? "Redefina%" : "Confirme%"],
  );
  const value =
    messages[0] &&
    decrypt(messages[0].encrypted_text).match(/#token=([\w-]{43})/)?.[1];
  if (!value) throw new Error("Action email missing");
  return value;
}
async function customer(verified = true) {
  const client = new Browser(),
    email = `${randomUUID()}@example.test`;
  await client.ok("mutation($input:RegisterInput!){register(input:$input)}", {
    input: { name: "Pessoa HTTP", email, password, consent: true },
  });
  await client.refresh();
  if (verified)
    await client.ok("mutation($token:String!){verifyEmail(token:$token)}", {
      token: await actionToken(email, "VERIFY"),
    });
  return { client, email };
}
async function administrator() {
  // Provisioning replaces only the interactive CLI, not the login/2FA protocol.
  const secret = new Secret(),
    email = `${randomUUID()}@admin.example.test`;
  await db.query(
    "INSERT INTO users(name,email,password_hash,role,email_verified_at,mfa_secret) VALUES('Admin HTTP',$1,$2,'ADMIN',now(),$3)",
    [email, await passwordHash(password), encrypt(secret.base32)],
  );
  const totp = new TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
  const client = new Browser();
  const code = totp.generate({ timestamp: Date.now() - 30000 });
  await client.ok("mutation($input:LoginInput!){login(input:$input)}", {
    input: { email, password, code },
  });
  await client.refresh();
  return { client, email, totp, otp: { "x-admin-totp": totp.generate() } };
}
function productInput(stock = 5) {
  const unique = randomUUID();
  return {
    itemIndex: unique,
    slug: unique,
    name: `Café ${unique}`,
    description: "Produto da suíte HTTP",
    category: "Teste",
    roastId: "media",
    imageUrl: "/images/coffee-bean.png",
    active: true,
    displayOrder: 0,
    variants: [
      { sku: unique, label: "250 g", priceCents: 4900, stock, active: true },
    ],
  };
}
async function product(stock = 5) {
  const admin = await administrator(),
    input = productInput(stock);
  const { saveProduct: id } = await admin.client.ok(
    saveProductMutation,
    { input },
    admin.otp,
  );
  const { productBySlug: saved } = await new Browser().ok(
    "query($slug:String!){productBySlug(slug:$slug){id name variants{id sku label priceCents stock active}}}",
    { slug: input.slug },
  );
  return {
    id,
    input: { ...input, id, variants: saved.variants },
    variantId: saved.variants[0].id as string,
  };
}
async function checkout(client: Browser, variantId: string, quantity = 1) {
  const { saveAddress: addressId } = await client.ok(saveAddressMutation, {
    input: address,
  });
  return { key: randomUUID(), addressId, items: [{ variantId, quantity }] };
}
async function paid(
  orderId: string,
  override: Partial<VerifiedPaymentEvent> = {},
  signature = true,
) {
  const intent = gatewayIntents.get(orderId)!;
  const body = JSON.stringify({
    eventId: randomUUID(),
    orderId,
    paymentId: `test-${orderId}`,
    status: "PAID",
    amountCents: intent.amountCents,
    currency: "BRL",
    ...override,
  });
  return new Browser().request("/api/webhooks/test", {
    method: "POST",
    body,
    headers: { "x-test-signature": signature ? sign(body) : "bad" },
  });
}

it("registers over HTTP, verifies mail token, reads/updates profile, logs out/in and revokes the old cookie", async () => {
  const { client, email } = await customer();
  const state = await client.refresh();
  expect(state.user.emailVerified).toBe(true);
  const stolen = new Browser();
  stolen.cookies = new Map(client.cookies);
  await client.ok('mutation{updateProfile(name:"Nome atualizado")}');
  expect((await client.refresh()).user.name).toBe("Nome atualizado");
  await client.ok("mutation{logout}");
  expect((await stolen.refresh()).user).toBeNull();
  await client.refresh();
  const wrong = await client.gql(
    "mutation($input:LoginInput!){login(input:$input)}",
    { input: { email, password: "invalid-password-123" } },
  );
  expect(wrong.status).toBe(401);
  const login = await client.gql(
    "mutation($input:LoginInput!){login(input:$input)}",
    { input: { email, password } },
  );
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
  expect((await client.refresh()).user.email).toBe(email);
});
it("rejects role injection and duplicate registration without creating a second account", async () => {
  const { client, email } = await customer();
  const input = { name: "Attacker", email, password, consent: true };
  expect(
    (
      await new Browser().gql(
        "mutation($input:RegisterInput!){register(input:$input)}",
        { input: { ...input, role: "ADMIN" } },
      )
    ).status,
  ).toBe(400);
  const duplicate = await new Browser().gql(
    "mutation($input:RegisterInput!){register(input:$input)}",
    { input },
  );
  expect(duplicate.status).toBe(400);
  expect(duplicate.body.errors[0].extensions.code).toBe("REGISTER_FAILED");
  expect(
    (
      await rows("SELECT count(*)::int AS count FROM users WHERE email=$1", [
        email,
      ])
    )[0].count,
  ).toBe(1);
  expect((await client.refresh()).user.role).toBe("CUSTOMER");
});
it("performs address create/read/update/delete and blocks another account's IDs", async () => {
  const a = await customer(),
    b = await customer();
  const { saveAddress: id } = await a.client.ok(saveAddressMutation, {
    input: address,
  });
  expect(
    (
      await b.client.gql(saveAddressMutation, {
        input: { ...address, id, city: "Invadida" },
      })
    ).status,
  ).toBe(404);
  expect(
    (await b.client.gql("mutation($id:ID!){deleteAddress(id:$id)}", { id }))
      .status,
  ).toBe(404);
  await a.client.ok(saveAddressMutation, {
    input: { ...address, id, city: "Serro" },
  });
  expect((await a.client.ok("{addresses{id city}}")).addresses).toEqual([
    { id, city: "Serro" },
  ]);
  await a.client.ok("mutation($id:ID!){deleteAddress(id:$id)}", { id });
  expect((await a.client.ok("{addresses{id}}")).addresses).toEqual([]);
});
it("performs cart create/read/update/delete without trusting client prices", async () => {
  const { variantId } = await product(),
    { client } = await customer();
  const mutation =
    "mutation($id:ID!,$qty:Int!){setCartItem(variantId:$id,quantity:$qty){variantId quantity priceCents}}";
  await client.ok(mutation, { id: variantId, qty: 1 });
  const data = await client.ok(mutation, { id: variantId, qty: 2 });
  expect(data.setCartItem[0]).toMatchObject({ quantity: 2, priceCents: 4900 });
  expect((await client.ok("{cart{variantId}}")).cart).toHaveLength(1);
  expect(
    (await client.ok(mutation, { id: variantId, qty: 0 })).setCartItem,
  ).toEqual([]);
  expect((await client.gql(mutation, { id: variantId, qty: -1 })).status).toBe(
    400,
  );
});
it("performs product create/read/update/archive with a fresh 2FA code on every administrative write", async () => {
  const p = await product();
  const editor = await administrator();
  await editor.client.ok(
    saveProductMutation,
    { input: { ...p.input, name: "Novo nome" } },
    editor.otp,
  );
  const archiver = await administrator();
  await archiver.client.ok(
    "mutation($id:ID!){archiveProduct(id:$id)}",
    { id: p.id },
    archiver.otp,
  );
  expect(
    (
      await new Browser().ok(
        "query($slug:String!){productBySlug(slug:$slug){id}}",
        { slug: p.input.slug },
      )
    ).productBySlug,
  ).toBeNull();
  expect(
    (await rows("SELECT active,name FROM products WHERE id=$1", [p.id]))[0],
  ).toMatchObject({ active: false, name: "Novo nome" });
});
it("rejects repeated variant IDs and omission of saved variants", async () => {
  const p = await product(),
    editor = await administrator();
  const v = p.input.variants[0];
  expect(
    (
      await editor.client.gql(
        saveProductMutation,
        { input: { ...p.input, variants: [v, { ...v, sku: randomUUID() }] } },
        editor.otp,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await editor.client.gql(
        saveProductMutation,
        {
          input: {
            ...p.input,
            variants: [{ ...v, id: undefined, sku: randomUUID() }],
          },
        },
        editor.otp,
      )
    ).body.errors[0].extensions.code,
  ).toBe("VARIANT_MISSING");
});
it("requires admin 2FA at login and rejects a stolen session token without the operation code", async () => {
  const admin = await administrator();
  expect(
    (
      await new Browser().gql(
        "mutation($input:LoginInput!){login(input:$input)}",
        { input: { email: admin.email, password } },
      )
    ).status,
  ).not.toBe(200);
  const result = await admin.client.gql(saveProductMutation, {
    input: productInput(),
  });
  expect(result.status).not.toBe(200);
  const changedAgent = await admin.client.gql(
    "{adminProducts{id}}",
    {},
    { "user-agent": "stolen-token-agent" },
  );
  expect(changedAgent.status).toBe(401);
  await admin.client.ok(
    saveProductMutation,
    { input: productInput() },
    admin.otp,
  );
  expect(
    (
      await admin.client.gql(
        saveProductMutation,
        { input: productInput() },
        admin.otp,
      )
    ).status,
  ).not.toBe(200);
});
it("blocks customer access to administration, audits and order data", async () => {
  const { client } = await customer();
  for (const query of [
    "{adminProducts{id}}",
    "{adminOrders{id}}",
    "{auditLog{id}}",
  ])
    expect((await client.gql(query)).status).toBe(403);
  expect(
    (await client.gql(saveProductMutation, { input: productInput() })).status,
  ).toBe(403);
});
it("updates monthly roast information and records an audit entry", async () => {
  const admin = await administrator();
  await admin.client.ok(
    "mutation($input:HomepageInput!){saveHomepage(input:$input)}",
    {
      input: {
        featuredRoast: "escura",
        monthLabel: "Outubro HTTP",
        headline: "Café testado",
      },
    },
    admin.otp,
  );
  expect(
    (await new Browser().ok("{homepage{featuredRoast monthLabel}}")).homepage,
  ).toEqual({ featuredRoast: "escura", monthLabel: "Outubro HTTP" });
  expect(
    (await admin.client.ok("{auditLog{action}}")).auditLog.map(
      (entry: { action: string }) => entry.action,
    ),
  ).toContain("HOMEPAGE_UPDATE");
});
it("creates/reads/cancels an order, releases stock and preserves its address snapshot", async () => {
  const p = await product(),
    { client } = await customer();
  const input = await checkout(client, p.variantId);
  const { createOrder: order } = await client.ok(createOrderMutation, {
    input,
  });
  expect(order.totalCents).toBe(6400);
  expect(order.status).toBe("PENDING");
  expect(gatewayIntents.get(order.id)?.amountCents).toBe(6400);
  await client.ok("mutation($id:ID!){deleteAddress(id:$id)}", {
    id: input.addressId,
  });
  const outsider = await customer();
  expect(
    (
      await outsider.client.gql("query($id:ID!){order(id:$id){id}}", {
        id: order.id,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await outsider.client.gql("mutation($id:ID!){cancelOrder(id:$id)}", {
        id: order.id,
      })
    ).status,
  ).toBe(404);
  expect(
    (await client.ok("{myOrders{id}}")).myOrders.map(
      (o: { id: string }) => o.id,
    ),
  ).toContain(order.id);
  await client.ok("mutation($id:ID!){cancelOrder(id:$id)}", { id: order.id });
  const [saved] = await rows(
    "SELECT status,address_snapshot FROM orders WHERE id=$1",
    [order.id],
  );
  expect(saved.status).toBe("CANCELLED");
  expect(saved.address_snapshot.city).toBe(address.city);
  expect(
    (
      await rows("SELECT reserved FROM product_variants WHERE id=$1", [
        p.variantId,
      ])
    )[0].reserved,
  ).toBe(0);
});
it("serializes two HTTP buyers racing for the final unit", async () => {
  const p = await product(1),
    a = await customer(),
    b = await customer();
  const inputs = await Promise.all([
    checkout(a.client, p.variantId),
    checkout(b.client, p.variantId),
  ]);
  const results = await Promise.all([
    a.client.gql(createOrderMutation, { input: inputs[0] }),
    b.client.gql(createOrderMutation, { input: inputs[1] }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (
      await rows("SELECT stock,reserved FROM product_variants WHERE id=$1", [
        p.variantId,
      ])
    )[0],
  ).toEqual({ stock: 1, reserved: 1 });
});
it("waits for a concurrent product archive and refuses checkout after it commits", async () => {
  const p = await product(),
    { client } = await customer(),
    input = await checkout(client, p.variantId);
  const lock = await db.connect();
  let pending: ReturnType<Browser["gql"]> | undefined;
  try {
    await lock.query("BEGIN");
    await lock.query("UPDATE products SET active=false WHERE id=$1", [p.id]);
    pending = client.gql(createOrderMutation, { input });
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      const waiters = await rows(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM products%' AND pid<>pg_backend_pid()",
      );
      if (waiters.length) {
        blocked = true;
        break;
      }
      await delay(50);
    }
    expect(blocked).toBe(true);
    await lock.query("COMMIT");
    expect((await pending).status).toBe(409);
    expect(
      (
        await rows("SELECT reserved FROM product_variants WHERE id=$1", [
          p.variantId,
        ])
      )[0].reserved,
    ).toBe(0);
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
    if (pending) await pending;
  }
});
it("reuses an idempotency key under simultaneous HTTP retries without reserving twice", async () => {
  const p = await product(3),
    { client } = await customer(),
    input = await checkout(client, p.variantId);
  const responses = await Promise.all([
    client.ok(createOrderMutation, { input }),
    client.ok(createOrderMutation, { input }),
  ]);
  expect(responses[0].createOrder.id).toBe(responses[1].createOrder.id);
  const conflict = await client.gql(createOrderMutation, {
    input: { ...input, items: [{ variantId: p.variantId, quantity: 2 }] },
  });
  expect(conflict.status).toBe(409);
  expect(
    (
      await rows("SELECT reserved FROM product_variants WHERE id=$1", [
        p.variantId,
      ])
    )[0].reserved,
  ).toBe(1);
});
it("blocks unverified checkout, another user's address and forged prices", async () => {
  const p = await product(),
    a = await customer(false),
    b = await customer();
  const input = await checkout(b.client, p.variantId);
  expect((await a.client.gql(createOrderMutation, { input })).status).toBe(403);
  await a.client.ok("mutation($token:String!){verifyEmail(token:$token)}", {
    token: await actionToken(a.email, "VERIFY"),
  });
  expect(
    (await a.client.gql(createOrderMutation, { input })).body.errors[0]
      .extensions.code,
  ).toBe("ADDRESS");
  expect(
    (
      await b.client.gql(createOrderMutation, {
        input: { ...input, totalCents: 1 },
      })
    ).status,
  ).toBe(400);
});
it("validates webhook signature, amount and deduplication before consuming inventory", async () => {
  const p = await product(2),
    { client } = await customer(),
    input = await checkout(client, p.variantId);
  const { createOrder: order } = await client.ok(createOrderMutation, {
    input,
  });
  expect((await paid(order.id, {}, false)).status).toBe(401);
  expect((await paid(order.id, { amountCents: 1 })).status).not.toBe(200);
  const eventId = randomUUID();
  expect((await paid(order.id, { eventId })).status).toBe(200);
  expect((await paid(order.id, { eventId })).status).toBe(200);
  expect(
    (
      await rows("SELECT stock,reserved FROM product_variants WHERE id=$1", [
        p.variantId,
      ])
    )[0],
  ).toEqual({ stock: 1, reserved: 0 });
  expect(
    (
      await client.gql("mutation($id:ID!){cancelOrder(id:$id)}", {
        id: order.id,
      })
    ).status,
  ).not.toBe(200);
});
it("advances a paid order through processing, shipping and delivery with admin 2FA", async () => {
  const p = await product(),
    { client } = await customer(),
    input = await checkout(client, p.variantId);
  const { createOrder: order } = await client.ok(createOrderMutation, {
    input,
  });
  await paid(order.id);
  for (const status of ["PROCESSING", "SHIPPED", "DELIVERED"]) {
    const admin = await administrator();
    await admin.client.ok(
      "mutation($id:ID!,$status:String!,$trackingCode:String){updateOrderStatus(id:$id,status:$status,trackingCode:$trackingCode)}",
      { id: order.id, status, trackingCode: "BR123456789" },
      admin.otp,
    );
  }
  expect(
    (
      await client.ok("query($id:ID!){order(id:$id){status history{status}}}", {
        id: order.id,
      })
    ).order.status,
  ).toBe("DELIVERED");
});
it("expires reservations and routes late payments to review without overselling", async () => {
  const p = await product(1),
    { client } = await customer(),
    input = await checkout(client, p.variantId);
  const { createOrder: order } = await client.ok(createOrderMutation, {
    input,
  });
  await db.query(
    "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [order.id],
  );
  await expireReservations();
  expect((await paid(order.id)).status).toBe(200);
  expect(
    (await client.ok("query($id:ID!){order(id:$id){status}}", { id: order.id }))
      .order.status,
  ).toBe("PAYMENT_REVIEW");
  expect(
    (
      await rows("SELECT stock,reserved FROM product_variants WHERE id=$1", [
        p.variantId,
      ])
    )[0],
  ).toEqual({ stock: 1, reserved: 0 });
});
it("does not expose the simulator through the production GraphQL handler", async () => {
  const { client } = await customer();
  const response = await client.request("/api/production-graphql", {
    method: "POST",
    body: JSON.stringify({ query: "{paymentsEnabled}" }),
  });
  expect(response.body.data.paymentsEnabled).toBe(false);
});
it("resets a password once, revokes sessions and rejects the old password", async () => {
  const { client, email } = await customer();
  await new Browser().ok(
    "mutation($email:String!){requestPasswordReset(email:$email)}",
    { email },
  );
  const token = await actionToken(email, "RESET"),
    nextPassword = "Changed-password-456!";
  await new Browser().ok(
    "mutation($token:String!,$password:String!){resetPassword(token:$token,password:$password)}",
    { token, password: nextPassword },
  );
  expect((await client.refresh()).user).toBeNull();
  expect(
    (
      await new Browser().gql(
        "mutation($token:String!,$password:String!){resetPassword(token:$token,password:$password)}",
        { token, password: nextPassword },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await client.gql("mutation($input:LoginInput!){login(input:$input)}", {
        input: { email, password },
      })
    ).status,
  ).toBe(401);
  await client.ok("mutation($input:LoginInput!){login(input:$input)}", {
    input: { email, password: nextPassword },
  });
});
it("deactivates a customer only with its password, clears addresses and revokes sessions", async () => {
  const { client, email } = await customer();
  await client.ok(saveAddressMutation, { input: address });
  expect(
    (
      await client.gql(
        "mutation($password:String!){deactivateAccount(password:$password)}",
        { password: "wrong-password-123" },
      )
    ).status,
  ).toBe(401);
  await client.ok(
    "mutation($password:String!){deactivateAccount(password:$password)}",
    { password },
  );
  expect((await client.refresh()).user).toBeNull();
  expect(
    (
      await client.gql("mutation($input:LoginInput!){login(input:$input)}", {
        input: { email, password },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await rows(
        "SELECT count(*)::int AS count FROM addresses a JOIN users u ON u.id=a.user_id WHERE u.email=$1",
        [email],
      )
    )[0].count,
  ).toBe(0);
});
it("refuses account deactivation while an order is open", async () => {
  const p = await product(),
    { client } = await customer(),
    input = await checkout(client, p.variantId);
  await client.ok(createOrderMutation, { input });
  expect(
    (
      await client.gql(
        "mutation($password:String!){deactivateAccount(password:$password)}",
        { password },
      )
    ).status,
  ).toBe(409);
});
it("blocks CSRF, cross-site requests and client-controlled owner/role fields", async () => {
  const { client } = await customer();
  expect(
    (
      await client.gql(
        'mutation{updateProfile(name:"Injected")}',
        {},
        { "x-csrf-token": "public" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await client.gql("{me{id}}", {}, { origin: "https://evil.example" }))
      .status,
  ).toBe(403);
  expect(
    (
      await client.gql(saveAddressMutation, {
        input: { ...address, userId: randomUUID() },
      })
    ).status,
  ).toBe(400);
});
it("rejects malformed GraphQL, batches, recursive/expanding fragments and oversized requests", async () => {
  const client = new Browser();
  for (const query of [
    "{broken",
    "query A{me{id}} query B{me{id}}",
    "{...A} fragment A on Query{...A}",
    `{...F0} ${Array.from({ length: 22 }, (_, i) => `fragment F${i} on Query{...F${i + 1} ...F${i + 1}}`).join(" ")}`,
  ]) {
    const response = await client.gql(query);
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain("stack");
  }
  expect(
    (
      await client.request("/api/graphql", {
        method: "POST",
        body: JSON.stringify([{ query: "{me{id}}" }]),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await client.request("/api/graphql", {
        method: "POST",
        body: "x".repeat(33000),
      })
    ).status,
  ).toBe(413);
});
it("treats SQL injection strings as data", async () => {
  const response = await new Browser().ok(
    "query($search:String!){products(search:$search){id}}",
    { search: "' OR 1=1; DROP TABLE users; --" },
  );
  expect(response.products).toEqual([]);
  expect(
    (await rows("SELECT count(*)::int AS count FROM users"))[0].count,
  ).toBeGreaterThan(0);
});
it("limits password guessing and returns Retry-After even for resolver-level limits", async () => {
  const client = new Browser(),
    input = {
      email: `${randomUUID()}@example.test`,
      password: "wrong-password-123",
    };
  for (let i = 0; i < 8; i++)
    expect(
      (
        await client.gql("mutation($input:LoginInput!){login(input:$input)}", {
          input,
        })
      ).status,
    ).toBe(401);
  const limited = await client.gql(
    "mutation($input:LoginInput!){login(input:$input)}",
    { input },
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
});
it("does not let forwarding-header spoofing evade the global rate limit", async () => {
  await db.query(
    "INSERT INTO rate_limits(key,count,reset_at) VALUES($1,180,now()+interval '1 minute')",
    [hash("global:untrusted-shared")],
  );
  const response = await new Browser().gql(
    "{me{id}}",
    {},
    { "x-forwarded-for": "8.8.8.8", "x-real-ip": "1.1.1.1" },
  );
  expect(response.status).toBe(429);
});
it("delivers verification mail through the real SMTP worker into the isolated Mailpit inbox", async () => {
  // Older scenarios deliberately inspect the encrypted outbox instead of sending mail.
  await db.query(
    "UPDATE email_outbox SET available_at=now()+interval '1 day' WHERE sent_at IS NULL",
  );
  const { email } = await customer(false);
  const previous = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    from: process.env.SMTP_FROM,
  };
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1026";
  process.env.SMTP_FROM = "tests@example.test";
  try {
    expect((await runJobs()).sent).toBe(1);
    const inbox = await fetch("http://127.0.0.1:8026/api/v1/messages").then(
      (r) => r.json(),
    );
    const message = inbox.messages.find((m: { To: { Address: string }[] }) =>
      m.To.some((to) => to.Address === email),
    );
    expect(message).toBeDefined();
    const content = await fetch(
      `http://127.0.0.1:8026/api/v1/message/${message.ID}`,
    ).then((r) => r.json());
    expect(content.Text).toContain("/conta/verificar#token=");
    const [stored] = await rows(
      "SELECT encrypted_text,sent_at FROM email_outbox WHERE recipient=$1",
      [email],
    );
    expect(stored.encrypted_text).toBe("");
    expect(stored.sent_at).toBeTruthy();
  } finally {
    for (const [key, value] of Object.entries({
      SMTP_HOST: previous.host,
      SMTP_PORT: previous.port,
      SMTP_FROM: previous.from,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

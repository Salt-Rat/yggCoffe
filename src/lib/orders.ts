import { z } from "zod";
import { db, rows, transaction, type Sql } from "./db";
import {
  requireUser,
  requireAdmin,
  adminMutation,
  queueMail,
  type Context,
} from "./auth";
import { hash, rateLimit } from "./security";
import { checkoutInput, id } from "./validation";
import { insist } from "./errors";
import { history } from "./catalog";
import {
  paymentProvider,
  shippingCents,
  validateCheckoutUrl,
  type PaymentProvider,
  type VerifiedPaymentEvent,
} from "./payments";
export async function createOrder(
  ctx: Context,
  input: unknown,
  providerOverride?: PaymentProvider,
) {
  const user = requireUser(ctx);
  insist(
    user.emailVerified,
    "EMAIL_UNVERIFIED",
    "Confirme seu e-mail antes de comprar.",
    403,
  );
  const data = checkoutInput.parse(input);
  const provider = providerOverride || paymentProvider();
  await rateLimit(`checkout:${user.id}`, 10, 600);
  const items = [...data.items].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  );
  insist(
    new Set(items.map((i) => i.variantId)).size === items.length,
    "DUPLICATE_ITEM",
    "Agrupe as quantidades de cada produto.",
  );
  const fingerprint = hash(
    JSON.stringify({ items, addressId: data.addressId }),
  );
  const order = await transaction(async (tx) => {
    // Serializes a user's retries, while variant row locks serialize competing buyers.
    const account = await tx.query(
      "SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL FOR UPDATE",
      [user.id],
    );
    insist(account.rowCount, "UNAUTHENTICATED", "Entre novamente.", 401);
    const [existing] = await rows(
      "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
      [user.id, data.key],
      tx,
    );
    if (existing) {
      insist(
        existing.request_hash === fingerprint,
        "IDEMPOTENCY_CONFLICT",
        "Esta tentativa já foi usada para outro carrinho.",
        409,
      );
      return existing;
    }
    const [{ count }] = await rows(
      "SELECT count(*) FROM orders WHERE user_id=$1 AND status='PENDING'",
      [user.id],
      tx,
    );
    insist(
      Number(count) < 3,
      "PENDING_LIMIT",
      "Finalize ou cancele um dos seus pedidos pendentes.",
    );
    const [address] = await rows(
      "SELECT recipient,postal_code,street,number,complement,district,city,state FROM addresses WHERE id=$1 AND user_id=$2",
      [data.addressId, user.id],
      tx,
    );
    insist(address, "ADDRESS", "Selecione um endereço da sua conta.");
    // Product edits/archive lock parents before variants too. Re-check active state
    // only after these locks, so a concurrent archive cannot slip through checkout.
    await tx.query(
      "SELECT id FROM products WHERE id IN (SELECT product_id FROM product_variants WHERE id=ANY($1::uuid[])) ORDER BY id FOR SHARE",
      [items.map((i) => i.variantId)],
    );
    const variants = await rows(
      `SELECT v.*,p.name,p.active AS product_active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=ANY($1::uuid[]) ORDER BY v.id FOR UPDATE OF v`,
      [items.map((i) => i.variantId)],
      tx,
    );
    let subtotal = 0;
    for (const item of items) {
      const v = variants.find((v) => v.id === item.variantId);
      insist(
        v &&
          v.active &&
          v.product_active &&
          v.stock - v.reserved >= item.quantity,
        "OUT_OF_STOCK",
        "Um item acabou de esgotar ou não tem essa quantidade disponível.",
        409,
      );
      subtotal += v.price_cents * item.quantity;
      await tx.query(
        "UPDATE product_variants SET reserved=reserved+$2 WHERE id=$1",
        [v.id, item.quantity],
      );
    }
    insist(
      subtotal <= 100000000,
      "ORDER_LIMIT",
      "Valor acima do limite por pedido.",
    );
    const shipping = shippingCents();
    const [created] = await rows(
      `INSERT INTO orders(user_id,idempotency_key,request_hash,subtotal_cents,shipping_cents,total_cents,address_snapshot,provider,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '15 minutes') RETURNING *`,
      [
        user.id,
        data.key,
        fingerprint,
        subtotal,
        shipping,
        subtotal + shipping,
        JSON.stringify(address),
        provider.name,
      ],
      tx,
    );
    for (const item of items) {
      const v = variants.find((v) => v.id === item.variantId)!;
      await tx.query(
        "INSERT INTO order_items(order_id,variant_id,product_name,sku,quantity,unit_price_cents) VALUES($1,$2,$3,$4,$5,$6)",
        [created.id, v.id, v.name, v.sku, item.quantity, v.price_cents],
      );
    }
    await history(
      tx,
      created.id,
      "PENDING",
      "Estoque reservado por 15 minutos.",
    );
    return created;
  });
  if (order.checkout_url || order.status !== "PENDING")
    return getOrder(ctx, order.id);
  insist(
    order.expires_at > new Date(),
    "ORDER_EXPIRED",
    "Reserva expirada. Crie um novo pedido.",
    409,
  );
  // An uncertain gateway timeout retains the reservation; retry with the same key.
  const checkout = await provider.createCheckout({
    orderId: order.id,
    amountCents: order.total_cents,
    currency: "BRL",
    expiresAt: order.expires_at,
    idempotencyKey: order.id,
    description: `Grão na Porta · ${order.id}`,
  });
  const url = validateCheckoutUrl(checkout.url);
  await transaction(async (tx) => {
    const [locked] = await rows(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [order.id],
      tx,
    );
    if (locked.status === "PENDING" && locked.expires_at > new Date()) {
      insist(
        !locked.provider_payment_id ||
          locked.provider_payment_id === checkout.paymentId,
        "PAYMENT_CONFLICT",
        "Conflito na intenção de pagamento.",
        502,
      );
      await tx.query(
        "UPDATE orders SET provider_payment_id=$2,checkout_url=$3 WHERE id=$1",
        [order.id, checkout.paymentId, url],
      );
    }
  });
  return getOrder(ctx, order.id);
}
const orderSelect = `SELECT id,status,total_cents AS "totalCents",subtotal_cents AS "subtotalCents",shipping_cents AS "shippingCents",created_at AS "createdAt",expires_at AS "expiresAt",checkout_url AS "checkoutUrl",tracking_code AS "trackingCode" FROM orders`;
export async function getOrder(ctx: Context, orderId: string) {
  const user = requireUser(ctx);
  id.parse(orderId);
  const [order] = await rows(`${orderSelect} WHERE id=$1 AND user_id=$2`, [
    orderId,
    user.id,
  ]);
  insist(order, "NOT_FOUND", "Pedido não encontrado.", 404);
  order.items = await rows(
    'SELECT product_name AS "productName",sku,quantity,unit_price_cents AS "unitPriceCents" FROM order_items WHERE order_id=$1 ORDER BY id',
    [orderId],
  );
  order.history = await rows(
    'SELECT status,note,created_at AS "createdAt" FROM order_history WHERE order_id=$1 ORDER BY id',
    [orderId],
  );
  return order;
}
export async function getAdminOrder(ctx: Context, orderId: string) {
  const user = requireAdmin(ctx);
  id.parse(orderId);
  const [order] = await rows(`${orderSelect} WHERE id=$1`, [orderId]);
  insist(order, "NOT_FOUND", "Pedido não encontrado.", 404);
  const [details] = await rows(
    `SELECT o.address_snapshot AS address,u.name,u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=$1`,
    [orderId],
  );
  order.customerName = details.name;
  order.customerEmail = details.email;
  order.shippingAddress = {
    ...details.address,
    postalCode: details.address.postal_code,
  };
  order.items = await rows(
    'SELECT product_name AS "productName",sku,quantity,unit_price_cents AS "unitPriceCents" FROM order_items WHERE order_id=$1 ORDER BY id',
    [orderId],
  );
  order.history = await rows(
    'SELECT status,note,created_at AS "createdAt" FROM order_history WHERE order_id=$1 ORDER BY id',
    [orderId],
  );
  await db.query(
    "INSERT INTO audit_logs(actor_id,action,target_id) VALUES($1,$2,$3)",
    [user.id, "ORDER_DETAILS_READ", orderId],
  );
  return order;
}
export async function listOrders(ctx: Context, page = 1, admin = false) {
  const user = admin ? requireAdmin(ctx) : requireUser(ctx);
  z.number().int().min(1).max(10000).parse(page);
  return rows(
    `${orderSelect} WHERE ($1 OR user_id=$2) ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $3`,
    [admin, user.id, (page - 1) * 20],
  );
}
async function release(tx: Sql, orderId: string) {
  const items = await rows(
    "SELECT variant_id,quantity FROM order_items WHERE order_id=$1 ORDER BY variant_id",
    [orderId],
    tx,
  );
  for (const i of items)
    await tx.query(
      "UPDATE product_variants SET reserved=reserved-$2 WHERE id=$1",
      [i.variant_id, i.quantity],
    );
}
export async function cancelOrder(ctx: Context, orderId: string) {
  const user = requireUser(ctx);
  id.parse(orderId);
  return transaction(async (tx) => {
    const [order] = await rows(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [orderId, user.id],
      tx,
    );
    insist(order, "NOT_FOUND", "Pedido não encontrado.", 404);
    if (order.status === "CANCELLED") return true;
    insist(
      order.status === "PENDING",
      "ORDER_STATE",
      "Só pedidos aguardando pagamento podem ser cancelados.",
    );
    await release(tx, orderId);
    await tx.query(
      "UPDATE orders SET status='CANCELLED',checkout_url=NULL WHERE id=$1",
      [orderId],
    );
    await history(tx, orderId, "CANCELLED", "Cancelado pelo cliente.");
    return true;
  });
}
export async function expireReservations() {
  return transaction(async (tx) => {
    const orders = await rows(
      "SELECT id FROM orders WHERE status='PENDING' AND expires_at<=now() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED",
      [],
      tx,
    );
    for (const order of orders) {
      await release(tx, order.id);
      await tx.query(
        "UPDATE orders SET status='EXPIRED',checkout_url=NULL WHERE id=$1",
        [order.id],
      );
      await history(tx, order.id, "EXPIRED", "Prazo da reserva encerrado.");
    }
    return orders.length;
  });
}
export async function processPaymentEvent(
  provider: string,
  event: VerifiedPaymentEvent,
) {
  z.object({
    eventId: z.string().min(1).max(200),
    orderId: id,
    paymentId: z.string().min(1).max(200),
    status: z.enum(["PAID", "FAILED"]),
    amountCents: z.number().int().min(0),
    currency: z.string().max(10),
  })
    .strict()
    .parse(event);
  return transaction(async (tx) => {
    const [order] = await rows(
      "SELECT * FROM orders WHERE id=$1 AND provider=$2 FOR UPDATE",
      [event.orderId, provider],
      tx,
    );
    insist(order, "NOT_FOUND", "Pedido não encontrado.", 404);
    insist(
      order.total_cents === event.amountCents &&
        event.currency === order.currency,
      "PAYMENT_MISMATCH",
      "Pagamento não corresponde ao pedido.",
      409,
    );
    insist(
      !order.provider_payment_id ||
        order.provider_payment_id === event.paymentId,
      "PAYMENT_MISMATCH",
      "Identificador de pagamento divergente.",
      409,
    );
    const inserted = await tx.query(
      "INSERT INTO payment_events(provider,event_id,order_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [provider, event.eventId, order.id],
    );
    if (!inserted.rowCount) return "DUPLICATE";
    if (
      ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "PAYMENT_REVIEW"].includes(
        order.status,
      )
    )
      return "IGNORED";
    if (event.status === "FAILED") return "IGNORED"; // A failed attempt must not override a future approval.
    let status = "PAID";
    if (order.status !== "PENDING" || order.expires_at <= new Date()) {
      if (order.status === "PENDING") await release(tx, order.id);
      status = "PAYMENT_REVIEW"; // Paid after release: reconcile/refund; never sell missing inventory.
    } else {
      const items = await rows(
        "SELECT variant_id,quantity FROM order_items WHERE order_id=$1 ORDER BY variant_id",
        [order.id],
        tx,
      );
      for (const i of items)
        await tx.query(
          "UPDATE product_variants SET stock=stock-$2,reserved=reserved-$2 WHERE id=$1",
          [i.variant_id, i.quantity],
        );
    }
    await tx.query(
      "UPDATE orders SET status=$2,provider_payment_id=$3,checkout_url=NULL WHERE id=$1",
      [order.id, status, event.paymentId],
    );
    await history(
      tx,
      order.id,
      status,
      status === "PAYMENT_REVIEW"
        ? "Pagamento recebido após encerramento da reserva. Revisão necessária."
        : "Pagamento confirmado pelo provedor.",
    );
    const [user] = await rows(
      "SELECT email FROM users WHERE id=$1",
      [order.user_id],
      tx,
    );
    await queueMail(
      tx,
      user.email,
      `Pedido ${order.id.slice(0, 8)} — Grão na Porta`,
      status === "PAID"
        ? "Seu pagamento foi confirmado. Acompanhe seu pedido na sua conta."
        : "Recebemos seu pagamento após o prazo da reserva. Seu pedido está em análise; a equipe fará a conciliação.",
      `order:${order.id}:${status}`,
    );
    return status;
  });
}
export async function updateOrderStatus(
  ctx: Context,
  orderId: string,
  status: string,
  trackingCode?: string,
) {
  id.parse(orderId);
  z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]).parse(status);
  return adminMutation(ctx, "ORDER_STATUS", orderId, async (tx) => {
    const [order] = await rows(
      "SELECT status FROM orders WHERE id=$1 FOR UPDATE",
      [orderId],
      tx,
    );
    insist(order, "NOT_FOUND", "Pedido não encontrado.", 404);
    const next: Record<string, string> = {
      PAID: "PROCESSING",
      PROCESSING: "SHIPPED",
      SHIPPED: "DELIVERED",
    };
    insist(
      next[order.status] === status,
      "ORDER_STATE",
      "Transição de pedido não permitida.",
    );
    if (status === "SHIPPED")
      z.string().trim().min(3).max(100).parse(trackingCode);
    await tx.query(
      "UPDATE orders SET status=$2,tracking_code=COALESCE($3,tracking_code) WHERE id=$1",
      [orderId, status, trackingCode],
    );
    await history(tx, orderId, status);
    return true;
  });
}

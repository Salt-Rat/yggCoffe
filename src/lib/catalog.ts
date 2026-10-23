import { z } from "zod";
import { db, rows, transaction, type Sql } from "./db";
import { adminMutation, requireAdmin, requireUser, type Context } from "./auth";
import { addressInput, id, productInput, roastInput } from "./validation";
import { insist } from "./errors";
import type { Product, Roast, Homepage } from "./defaults";
export async function roasts(): Promise<Roast[]> {
  return rows(
    `SELECT id,name,subtitle,flavor,acidity,body,sweetness,bitterness,preparation,image_url AS "imageUrl",origin,description FROM roast_profiles ORDER BY CASE id WHEN 'clara' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`,
  );
}
export async function homepage(): Promise<Homepage> {
  return (
    await rows(
      `SELECT featured_roast AS "featuredRoast",month_label AS "monthLabel",headline FROM homepage WHERE id=true`,
    )
  )[0] as Homepage;
}
const productSelect = `SELECT p.id,p.item_index AS "itemIndex",p.slug,p.name,p.description,p.category,p.roast_id AS "roastId",p.image_url AS "imageUrl",p.active,p.display_order AS "displayOrder",COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'label',v.label,'priceCents',v.price_cents,'stock',v.stock,'reserved',v.reserved,'available',v.stock-v.reserved,'active',v.active) ORDER BY v.price_cents) FILTER (WHERE v.id IS NOT NULL),'[]') AS variants FROM products p LEFT JOIN product_variants v ON v.product_id=p.id`;
export async function products(
  input: {
    search?: string;
    roast?: string;
    category?: string;
    page?: number;
    first?: number;
  } = {},
  admin = false,
): Promise<Product[]> {
  const {
    search = "",
    roast = "",
    category = "",
    page = 1,
    first = 12,
  } = z
    .object({
      search: z.string().max(100).optional(),
      roast: z.string().max(10).optional(),
      category: z.string().max(60).optional(),
      page: z.number().int().min(1).max(10000).optional(),
      first: z.number().int().min(1).max(30).optional(),
    })
    .parse(input);
  return rows(
    `${productSelect} WHERE ($1 OR (p.active AND v.active)) AND ($2='' OR p.name ILIKE '%'||$2||'%' OR p.item_index ILIKE '%'||$2||'%') AND ($3='' OR p.roast_id=$3) AND ($4='' OR p.category=$4) GROUP BY p.id ORDER BY p.display_order,p.id LIMIT $5 OFFSET $6`,
    [admin, search, roast, category, first, (page - 1) * first],
  );
}
export async function productBySlug(slug: string) {
  return (
    (
      await rows(
        `${productSelect} WHERE p.slug=$1 AND p.active AND v.active GROUP BY p.id`,
        [z.string().max(100).parse(slug)],
      )
    )[0] || null
  );
}
export async function saveProduct(ctx: Context, input: unknown) {
  const p = productInput.parse(input);
  insist(
    new Set(p.variants.map((v) => v.sku)).size === p.variants.length,
    "SKU",
    "Cada variante precisa de SKU único.",
  );
  const variantIds = p.variants.flatMap((v) => (v.id ? [v.id] : []));
  insist(
    new Set(variantIds).size === variantIds.length,
    "VARIANT_DUPLICATE",
    "Variante repetida.",
  );
  return adminMutation(
    ctx,
    p.id ? "PRODUCT_UPDATE" : "PRODUCT_CREATE",
    p.id || p.itemIndex,
    async (tx) => {
      let productId = p.id;
      if (productId) {
        const [current] = await rows(
          "SELECT id FROM products WHERE id=$1 FOR UPDATE",
          [productId],
          tx,
        );
        insist(current, "NOT_FOUND", "Produto não encontrado.", 404);
        await tx.query(
          `UPDATE products SET item_index=$2,slug=$3,name=$4,description=$5,category=$6,roast_id=$7,image_url=$8,active=$9,display_order=$10,updated_at=now() WHERE id=$1`,
          [
            productId,
            p.itemIndex,
            p.slug,
            p.name,
            p.description,
            p.category,
            p.roastId,
            p.imageUrl,
            p.active,
            p.displayOrder,
          ],
        );
      } else {
        const [created] = await rows(
          `INSERT INTO products(item_index,slug,name,description,category,roast_id,image_url,active,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            p.itemIndex,
            p.slug,
            p.name,
            p.description,
            p.category,
            p.roastId,
            p.imageUrl,
            p.active,
            p.displayOrder,
          ],
          tx,
        );
        productId = created.id;
      }
      // Lock variants in the same order as checkout to avoid lock inversion.
      const existingVariants = await tx.query(
        "SELECT id FROM product_variants WHERE product_id=$1 ORDER BY id FOR UPDATE",
        [productId],
      );
      insist(
        existingVariants.rows.every((v) => variantIds.includes(v.id)),
        "VARIANT_MISSING",
        "Mantenha as variantes existentes; desative as que não serão mais vendidas.",
      );
      insist(
        existingVariants.rows.length + p.variants.filter((v) => !v.id).length <=
          12,
        "VARIANT_LIMIT",
        "Limite de 12 variantes por produto.",
      );
      for (const v of p.variants) {
        if (v.id) {
          const changed = await tx.query(
            `UPDATE product_variants SET sku=$3,label=$4,price_cents=$5,stock=$6,active=$7 WHERE id=$1 AND product_id=$2 AND reserved<=$6`,
            [v.id, productId, v.sku, v.label, v.priceCents, v.stock, v.active],
          );
          insist(
            changed.rowCount,
            "STOCK_RESERVED",
            "Variante inválida ou estoque menor que a quantidade reservada.",
          );
        } else
          await tx.query(
            "INSERT INTO product_variants(product_id,sku,label,price_cents,stock,active) VALUES($1,$2,$3,$4,$5,$6)",
            [productId, v.sku, v.label, v.priceCents, v.stock, v.active],
          );
      }
      return productId;
    },
  );
}
export async function saveRoast(ctx: Context, input: unknown) {
  const r = roastInput.parse(input);
  return adminMutation(ctx, "ROAST_UPDATE", r.id, async (tx) => {
    await tx.query(
      `UPDATE roast_profiles SET name=$2,subtitle=$3,flavor=$4,acidity=$5,body=$6,sweetness=$7,bitterness=$8,preparation=$9,image_url=$10,origin=$11,description=$12,updated_at=now() WHERE id=$1`,
      [
        r.id,
        r.name,
        r.subtitle,
        r.flavor,
        r.acidity,
        r.body,
        r.sweetness,
        r.bitterness,
        r.preparation,
        r.imageUrl,
        r.origin,
        r.description,
      ],
    );
    return true;
  });
}
export async function archiveProduct(ctx: Context, productId: string) {
  id.parse(productId);
  return adminMutation(ctx, "PRODUCT_ARCHIVE", productId, async (tx) => {
    const result = await tx.query(
      "UPDATE products SET active=false,updated_at=now() WHERE id=$1",
      [productId],
    );
    insist(result.rowCount, "NOT_FOUND", "Produto não encontrado.", 404);
    return true;
  });
}
export async function saveHomepage(ctx: Context, input: unknown) {
  const h = z
    .object({
      featuredRoast: z.enum(["clara", "media", "escura"]),
      monthLabel: z.string().trim().min(1).max(80),
      headline: z.string().trim().min(1).max(160),
    })
    .strict()
    .parse(input);
  return adminMutation(ctx, "HOMEPAGE_UPDATE", undefined, async (tx) => {
    await tx.query(
      "UPDATE homepage SET featured_roast=$1,month_label=$2,headline=$3,updated_at=now()",
      [h.featuredRoast, h.monthLabel, h.headline],
    );
    return true;
  });
}
export async function cart(ctx: Context) {
  return rows(
    `SELECT c.variant_id AS "variantId",c.quantity,p.name,p.slug,p.image_url AS "imageUrl",p.roast_id AS "roastId",v.label,v.price_cents AS "priceCents",v.stock-v.reserved AS available,(p.active AND v.active) AS active FROM cart_items c JOIN product_variants v ON v.id=c.variant_id JOIN products p ON p.id=v.product_id WHERE owner_key=$1 ORDER BY c.variant_id LIMIT 30`,
    [ctx.cartKey],
  );
}
export async function setCartItem(
  ctx: Context,
  variantId: string,
  quantity: number,
) {
  id.parse(variantId);
  z.number().int().min(0).max(20).parse(quantity);
  await transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      ctx.cartKey,
    ]);
    if (!quantity)
      await tx.query(
        "DELETE FROM cart_items WHERE owner_key=$1 AND variant_id=$2",
        [ctx.cartKey, variantId],
      );
    else {
      const [v] = await rows(
        "SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND v.active AND p.active",
        [variantId],
        tx,
      );
      insist(v, "NOT_FOUND", "Produto indisponível.", 404);
      const [{ count }] = await rows(
        "SELECT count(*) FROM cart_items WHERE owner_key=$1",
        [ctx.cartKey],
        tx,
      );
      insist(
        Number(count) < 30 ||
          (
            await rows(
              "SELECT 1 FROM cart_items WHERE owner_key=$1 AND variant_id=$2",
              [ctx.cartKey, variantId],
              tx,
            )
          ).length,
        "CART_LIMIT",
        "Limite de 30 produtos.",
      );
      await tx.query(
        "INSERT INTO cart_items(owner_key,variant_id,quantity) VALUES($1,$2,$3) ON CONFLICT(owner_key,variant_id) DO UPDATE SET quantity=$3,updated_at=now()",
        [ctx.cartKey, variantId, quantity],
      );
    }
  });
  return cart(ctx);
}
export async function addresses(ctx: Context) {
  const user = requireUser(ctx);
  return rows(
    `SELECT id,recipient,postal_code AS "postalCode",street,number,complement,district,city,state FROM addresses WHERE user_id=$1 ORDER BY id LIMIT 20`,
    [user.id],
  );
}
export async function saveAddress(ctx: Context, input: unknown) {
  const user = requireUser(ctx),
    a = addressInput.parse(input);
  return transaction(async (tx) => {
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    if (a.id) {
      const result = await tx.query(
        "UPDATE addresses SET recipient=$3,postal_code=$4,street=$5,number=$6,complement=$7,district=$8,city=$9,state=$10 WHERE id=$1 AND user_id=$2",
        [
          a.id,
          user.id,
          a.recipient,
          a.postalCode,
          a.street,
          a.number,
          a.complement,
          a.district,
          a.city,
          a.state,
        ],
      );
      insist(result.rowCount, "NOT_FOUND", "Endereço não encontrado.", 404);
      return a.id;
    }
    const [{ count }] = await rows(
      "SELECT count(*) FROM addresses WHERE user_id=$1",
      [user.id],
      tx,
    );
    insist(Number(count) < 20, "LIMIT", "Limite de 20 endereços.");
    const [result] = await rows(
      "INSERT INTO addresses(user_id,recipient,postal_code,street,number,complement,district,city,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      [
        user.id,
        a.recipient,
        a.postalCode,
        a.street,
        a.number,
        a.complement,
        a.district,
        a.city,
        a.state,
      ],
      tx,
    );
    return result.id;
  });
}
export async function deleteAddress(ctx: Context, addressId: string) {
  const user = requireUser(ctx);
  id.parse(addressId);
  return transaction(async (tx) => {
    await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
    const result = await tx.query(
      "DELETE FROM addresses WHERE id=$1 AND user_id=$2",
      [addressId, user.id],
    );
    insist(result.rowCount, "NOT_FOUND", "Endereço não encontrado.", 404);
    return true;
  });
}
export async function updateProfile(ctx: Context, name: string) {
  const user = requireUser(ctx);
  await db.query("UPDATE users SET name=$2 WHERE id=$1", [
    user.id,
    z.string().trim().min(2).max(100).parse(name),
  ]);
  return true;
}
export async function auditLog(ctx: Context, page = 1) {
  requireAdmin(ctx);
  z.number().int().min(1).max(10000).parse(page);
  return rows(
    `SELECT id::text,action,target_id AS "targetId",created_at AS "createdAt" FROM audit_logs ORDER BY id DESC LIMIT 30 OFFSET $1`,
    [(page - 1) * 30],
  );
}
export async function history(
  tx: Sql,
  orderId: string,
  status: string,
  note = "",
) {
  await tx.query(
    "INSERT INTO order_history(order_id,status,note) VALUES($1,$2,$3)",
    [orderId, status, note],
  );
}

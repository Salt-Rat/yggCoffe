import { z } from "zod";
export const id = z.string().uuid();
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .max(128);
export const otp = z
  .string()
  .regex(/^\d{6}$/, "Informe os seis dígitos do autenticador.");
const text = (max: number) => z.string().trim().min(1).max(max);
export const mediaUrl = z
  .string()
  .max(1500)
  .refine(
    (v) =>
      /^\/images\/[a-zA-Z0-9/_.-]+$/.test(v) ||
      /^https:\/\/[a-zA-Z0-9]/.test(v),
    "Use uma imagem HTTPS ou /images/arquivo.",
  );
export const addressInput = z
  .object({
    id: id.optional(),
    recipient: text(120),
    postalCode: z.string().regex(/^\d{8}$/),
    street: text(150),
    number: text(20),
    complement: z.string().trim().max(100).default(""),
    district: text(80),
    city: text(80),
    state: z.enum([
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ]),
  })
  .strict();
export const variantInput = z
  .object({
    id: id.optional(),
    sku: text(60).regex(/^[A-Za-z0-9_-]+$/),
    label: text(80),
    priceCents: z.number().int().min(1).max(10000000),
    stock: z.number().int().min(0).max(1000000),
    active: z.boolean().default(true),
  })
  .strict();
export const productInput = z
  .object({
    id: id.optional(),
    itemIndex: text(40).regex(/^[A-Za-z0-9_-]+$/),
    slug: text(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: text(120),
    description: text(3000),
    category: text(60),
    roastId: z.enum(["clara", "media", "escura"]),
    imageUrl: mediaUrl,
    active: z.boolean(),
    displayOrder: z.number().int().min(0).max(100000),
    variants: z.array(variantInput).min(1).max(12),
  })
  .strict();
export const roastInput = z
  .object({
    id: z.enum(["clara", "media", "escura"]),
    name: text(60),
    subtitle: text(100),
    flavor: text(120),
    acidity: text(60),
    body: text(60),
    sweetness: text(60),
    bitterness: text(60),
    preparation: text(140),
    imageUrl: mediaUrl,
    origin: text(120),
    description: text(1000),
  })
  .strict();
export const checkoutInput = z
  .object({
    key: id,
    addressId: id,
    items: z
      .array(
        z
          .object({ variantId: id, quantity: z.number().int().min(1).max(20) })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutInput>;

import { AppError, insist } from "./errors";
export type PaymentIntent = {
  orderId: string;
  amountCents: number;
  currency: "BRL";
  expiresAt: Date;
  idempotencyKey: string;
  description: string;
};
export type VerifiedPaymentEvent = {
  eventId: string;
  orderId: string;
  paymentId: string;
  status: "PAID" | "FAILED";
  amountCents: number;
  currency: string;
};
export interface PaymentProvider {
  name: string;
  /** Must use provider-side idempotency, exact cents, expiry, and the order ID as external reference. */
  createCheckout(
    intent: PaymentIntent,
  ): Promise<{ paymentId: string; url: string }>;
  /** Verify the raw body signature AND retrieve payment from the provider's authenticated API.
   * Never trust redirect/query parameters or a caller-supplied status/amount. */
  verifyWebhook(
    rawBody: string,
    headers: Headers,
  ): Promise<VerifiedPaymentEvent>;
}
// Register vetted Mercado Pago / InfinitePay adapters here when credentials and the
// gateway-specific reconciliation/refund flows are implemented. Never use a fake fallback.
const providers = new Map<string, PaymentProvider>();
export function paymentProvider(
  name = process.env.PAYMENT_PROVIDER || "disabled",
): PaymentProvider {
  const provider = providers.get(name);
  if (!provider)
    throw new AppError(
      "PAYMENT_UNAVAILABLE",
      "Os pagamentos ainda não estão disponíveis. Tente novamente mais tarde.",
      503,
    );
  return provider;
}
export function paymentAvailability() {
  return providers.has(process.env.PAYMENT_PROVIDER || "disabled");
}
export function shippingCents() {
  const value = process.env.DELIVERY_FLAT_RATE_CENTS;
  insist(
    value && /^\d+$/.test(value) && Number(value) <= 100000,
    "SHIPPING_UNAVAILABLE",
    "Entrega ainda não configurada.",
    503,
  );
  return Number(value);
}
export function validateCheckoutUrl(url: string) {
  const parsed = new URL(url);
  const allowed = ["mercadopago.com.br", "mercadopago.com", "infinitepay.io"];
  insist(
    parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      allowed.some(
        (host) =>
          parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
      ),
    "PAYMENT_URL",
    "Endereço de pagamento inválido.",
    502,
  );
  return url;
}

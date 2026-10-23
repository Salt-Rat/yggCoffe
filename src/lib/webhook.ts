import { paymentProvider, type PaymentProvider } from "./payments";
import { processPaymentEvent } from "./orders";
import { ipKey, rateLimit, readBody } from "./security";
import { safeError } from "./graphql";

export async function webhookRequest(
  request: Request,
  name: string,
  providerOverride?: PaymentProvider,
) {
  try {
    await rateLimit(`webhook:${ipKey(request)}`, 180, 60);
    const provider = providerOverride || paymentProvider(name);
    const event = await provider.verifyWebhook(
      await readBody(request, 65536),
      request.headers,
    );
    return Response.json({
      status: await processPaymentEvent(provider.name, event),
    });
  } catch (error) {
    const { status, ...safe } = safeError(error);
    return Response.json(safe, {
      status,
      headers: status === 429 ? { "retry-after": "60" } : {},
    });
  }
}

import { webhookRequest } from "@/lib/webhook";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  return webhookRequest(request, (await params).provider);
}

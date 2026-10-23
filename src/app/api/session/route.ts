import { getSession, cartOwner } from "@/lib/auth";
import { ipKey, rateLimit } from "@/lib/security";
import { safeError } from "@/lib/graphql";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = new Headers({ "cache-control": "no-store" });
  try {
    await rateLimit(`session:${ipKey(request)}`, 120, 60);
    const session = await getSession(request);
    await cartOwner(request, headers, session);
    return Response.json(
      {
        user: session?.user || null,
        csrfToken: session?.csrfToken || "public",
      },
      { headers },
    );
  } catch (error) {
    const { status, ...safe } = safeError(error);
    return Response.json(safe, { status, headers });
  }
}

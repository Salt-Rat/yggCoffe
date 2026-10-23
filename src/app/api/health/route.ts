import { db } from "@/lib/db";
export async function GET() {
  try {
    await db.query("SELECT 1");
    return Response.json(
      { status: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}

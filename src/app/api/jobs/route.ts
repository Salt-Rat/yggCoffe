import { equal } from "@/lib/security";
import { runJobs } from "@/lib/worker";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    !equal(
      request.headers.get("authorization") || "",
      `Bearer ${process.env.CRON_SECRET}`,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runJobs());
  } catch {
    return Response.json({ error: "Job failed" }, { status: 503 });
  }
}

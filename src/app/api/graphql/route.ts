import { graphqlRequest } from "@/lib/graphql";
export const runtime = "nodejs";
export function POST(request: Request) {
  return graphqlRequest(request);
}

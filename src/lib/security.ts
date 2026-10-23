import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { rows, type Sql } from "./db";
import { AppError, insist } from "./errors";
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function encryptionKey() {
  const key = process.env.MFA_ENCRYPTION_KEY;
  insist(
    key && /^[a-fA-F0-9]{64}$/.test(key),
    "CONFIG",
    "Chave de segurança não configurada.",
    503,
  );
  return Buffer.from(key, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, body] = value
    .split(".")
    .map((s) => Buffer.from(s, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8");
}
export function ipKey(request: Request) {
  const candidate =
    process.env.TRUST_PROXY === "true"
      ? request.headers
          .get(process.env.TRUSTED_IP_HEADER || "x-real-ip")
          ?.split(",")[0]
          .trim()
      : undefined;
  return candidate && isIP(candidate) ? hash(candidate) : "untrusted-shared";
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const [r] = await rows(
    `INSERT INTO rate_limits(key,count,reset_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at<=now() THEN 1 ELSE rate_limits.count+1 END,
    reset_at=CASE WHEN rate_limits.reset_at<=now() THEN now()+$2*interval '1 second' ELSE rate_limits.reset_at END RETURNING count`,
    [hash(key), seconds],
  );
  if (r.count > limit)
    throw new AppError(
      "RATE_LIMIT",
      "Muitas tentativas. Aguarde alguns minutos.",
      429,
    );
}
export function checkOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  insist(
    request.headers.get("origin") === origin &&
      request.headers.get("sec-fetch-site") !== "cross-site",
    "CSRF",
    "Origem da requisição não autorizada.",
    403,
  );
  insist(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    "CONTENT_TYPE",
    "Envie JSON.",
    415,
  );
}
export async function readBody(request: Request, max = 32768) {
  const reader = request.body?.getReader();
  insist(reader, "BODY", "Corpo obrigatório.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new AppError("BODY_LIMIT", "Requisição muito grande.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function audit(
  tx: Sql,
  actor: string | null,
  action: string,
  target?: string,
  metadata: object = {},
) {
  await tx.query(
    "INSERT INTO audit_logs(actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4)",
    [actor, action, target, JSON.stringify(metadata)],
  );
}

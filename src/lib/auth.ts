import argon2 from "argon2";
import { TOTP, Secret } from "otpauth";
import { z } from "zod";
import { db, rows, transaction, type Sql } from "./db";
import {
  audit,
  decrypt,
  encrypt,
  equal,
  hash,
  rateLimit,
  token,
} from "./security";
import { insist } from "./errors";
import { email, password, otp } from "./validation";
export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
};
export type Session = {
  tokenHash: string;
  csrfToken: string;
  mfaVerifiedAt: Date | null;
  user: User;
};
export type Context = {
  request: Request;
  headers: Headers;
  session: Session | null;
  cartKey: string;
  ip: string;
};
export const sessionCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-coffee_session"
    : "coffee_session";
const cartCookie =
  process.env.NODE_ENV === "production" ? "__Host-coffee_cart" : "coffee_cart";
export const passwordHash = (value: string) =>
  argon2.hash(value, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
let dummy: Promise<string> | undefined;
export function cookie(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function setCookie(
  headers: Headers,
  name: string,
  value: string,
  maxAge: number,
) {
  headers.append(
    "set-cookie",
    `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}
export async function getSession(request: Request): Promise<Session | null> {
  const raw = cookie(request, sessionCookie);
  if (!raw || !/^[\w-]{43}$/.test(raw)) return null;
  const [s] = await rows(
    `SELECT s.*, u.name,u.email,u.role,u.email_verified_at,u.disabled_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()`,
    [hash(raw)],
  );
  if (!s || s.disabled_at) return null;
  if (
    s.role === "ADMIN" &&
    (!s.mfa_verified_at ||
      Date.now() - s.last_seen_at.getTime() > 900000 ||
      !equal(s.user_agent_hash, hash(request.headers.get("user-agent") || "")))
  )
    return null;
  await db.query(
    "UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1 AND last_seen_at<now()-interval '30 seconds'",
    [s.token_hash],
  );
  return {
    tokenHash: s.token_hash,
    csrfToken: s.csrf_token,
    mfaVerifiedAt: s.mfa_verified_at,
    user: {
      id: s.user_id,
      name: s.name,
      email: s.email,
      role: s.role,
      emailVerified: !!s.email_verified_at,
    },
  };
}
export function requireUser(ctx: Context) {
  insist(
    ctx.session,
    "UNAUTHENTICATED",
    "Entre na sua conta para continuar.",
    401,
  );
  return ctx.session.user;
}
export function requireAdmin(ctx: Context) {
  const user = requireUser(ctx);
  insist(
    user.role === "ADMIN" && ctx.session?.mfaVerifiedAt,
    "FORBIDDEN",
    "Acesso administrativo com 2FA obrigatório.",
    403,
  );
  return user;
}
export function checkCsrf(ctx: Context) {
  const expected = ctx.session?.csrfToken || "public";
  insist(
    equal(ctx.request.headers.get("x-csrf-token") || "", expected),
    "CSRF",
    "Sessão de segurança inválida. Recarregue a página.",
    403,
  );
}
export async function cartOwner(
  request: Request,
  headers: Headers,
  session: Session | null,
) {
  if (session) return `u:${session.user.id}`;
  let raw = cookie(request, cartCookie);
  if (!raw || !/^[\w-]{43}$/.test(raw)) {
    raw = token();
    setCookie(headers, cartCookie, raw, 60 * 60 * 24 * 30);
  }
  return `a:${hash(raw)}`;
}
export async function consumeTotp(tx: Sql, userId: string, code: string) {
  otp.parse(code);
  const [user] = await rows(
    "SELECT mfa_secret,mfa_last_step FROM users WHERE id=$1 FOR UPDATE",
    [userId],
    tx,
  );
  insist(
    user?.mfa_secret,
    "MFA_REQUIRED",
    "Configure o autenticador pelo procedimento administrativo.",
    403,
  );
  const totp = new TOTP({
    secret: Secret.fromBase32(decrypt(user.mfa_secret)),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token: code, window: 1 });
  const step = Math.floor(Date.now() / 30000) + (delta ?? 0);
  insist(
    delta !== null && step > Number(user.mfa_last_step),
    "MFA_INVALID",
    "Código inválido ou já utilizado. Aguarde o próximo código.",
    403,
  );
  await tx.query("UPDATE users SET mfa_last_step=$2 WHERE id=$1", [
    userId,
    step,
  ]);
}
export async function adminMutation<T>(
  ctx: Context,
  action: string,
  target: string | undefined,
  fn: (tx: Sql) => Promise<T>,
) {
  const user = requireAdmin(ctx);
  await rateLimit(`admin-write:${user.id}`, 20, 300);
  insist(
    Date.now() - ctx.session!.mfaVerifiedAt!.getTime() < 600000,
    "REAUTH_REQUIRED",
    "Confirme sua senha e 2FA novamente.",
    403,
  );
  return transaction(async (tx) => {
    // Lock the account before validating the live session so revocation and role
    // changes cannot race a privileged mutation that already loaded its context.
    const [live] = await rows(
      `SELECT u.role,u.disabled_at,s.expires_at,s.mfa_verified_at
      FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND s.token_hash=$2 FOR UPDATE OF u,s`,
      [user.id, ctx.session!.tokenHash],
      tx,
    );
    insist(
      live &&
        live.role === "ADMIN" &&
        !live.disabled_at &&
        live.expires_at > new Date() &&
        live.mfa_verified_at &&
        Date.now() - live.mfa_verified_at.getTime() < 600000,
      "REAUTH_REQUIRED",
      "Confirme sua senha e 2FA novamente.",
      403,
    );
    await consumeTotp(
      tx,
      user.id,
      ctx.request.headers.get("x-admin-totp") || "",
    );
    const result = await fn(tx);
    await audit(tx, user.id, action, target);
    return result;
  });
}
async function issueSession(
  ctx: Context,
  user: { id: string; role: string },
  tx: Sql,
  mfa: boolean,
) {
  const raw = token(),
    csrf = token();
  if (ctx.session)
    await tx.query("DELETE FROM sessions WHERE token_hash=$1", [
      ctx.session.tokenHash,
    ]);
  const ttl = user.role === "ADMIN" ? 3600 : 604800;
  await tx.query(
    `INSERT INTO sessions(token_hash,user_id,csrf_token,user_agent_hash,mfa_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 second')`,
    [
      hash(raw),
      user.id,
      csrf,
      hash(ctx.request.headers.get("user-agent") || ""),
      mfa ? new Date() : null,
      ttl,
    ],
  );
  setCookie(ctx.headers, sessionCookie, raw, ttl);
  // Merge a persisted anonymous basket once, including a per-user transaction lock.
  await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
  const anon = cookie(ctx.request, cartCookie);
  if (anon && /^[\w-]{43}$/.test(anon)) {
    const owner = `u:${user.id}`,
      anonymous = `a:${hash(anon)}`;
    for (const key of [owner, anonymous].sort())
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        key,
      ]);
    const existing = await rows(
      "SELECT variant_id FROM cart_items WHERE owner_key=$1",
      [owner],
      tx,
    );
    const existingIds = new Set(existing.map((i) => i.variant_id));
    const incoming = await rows(
      "SELECT variant_id,quantity FROM cart_items WHERE owner_key=$1 ORDER BY updated_at,variant_id",
      [anonymous],
      tx,
    );
    let remaining = Math.max(0, 30 - existing.length);
    for (const item of incoming) {
      if (!existingIds.has(item.variant_id)) {
        if (!remaining) continue;
        remaining--;
      }
      await tx.query(
        `INSERT INTO cart_items(owner_key,variant_id,quantity) VALUES($1,$2,$3)
      ON CONFLICT(owner_key,variant_id) DO UPDATE SET quantity=LEAST(20,cart_items.quantity+EXCLUDED.quantity),updated_at=now()`,
        [owner, item.variant_id, item.quantity],
      );
      // Only the merged row is consumed; overflow remains in the anonymous basket.
      await tx.query(
        "DELETE FROM cart_items WHERE owner_key=$1 AND variant_id=$2",
        [anonymous, item.variant_id],
      );
    }
    if (
      !(
        await rows(
          "SELECT 1 FROM cart_items WHERE owner_key=$1 LIMIT 1",
          [anonymous],
          tx,
        )
      ).length
    )
      setCookie(ctx.headers, cartCookie, "", 0);
  }
  return csrf;
}
export async function queueMail(
  tx: Sql,
  recipient: string,
  subject: string,
  body: string,
  dedupe: string,
) {
  await tx.query(
    "INSERT INTO email_outbox(recipient,subject,encrypted_text,dedupe_key) VALUES($1,$2,$3,$4) ON CONFLICT(dedupe_key) DO NOTHING",
    [recipient, subject, encrypt(body), dedupe],
  );
}
async function actionToken(
  tx: Sql,
  user: { id: string; email: string },
  kind: "RESET" | "VERIFY",
) {
  const raw = token();
  await tx.query("DELETE FROM action_tokens WHERE user_id=$1 AND kind=$2", [
    user.id,
    kind,
  ]);
  await tx.query(
    `INSERT INTO action_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 minute')`,
    [hash(raw), user.id, kind, kind === "RESET" ? 30 : 1440],
  );
  const link = `${process.env.APP_ORIGIN || "http://localhost:3000"}/conta/${kind === "RESET" ? "redefinir" : "verificar"}#token=${raw}`;
  await queueMail(
    tx,
    user.email,
    kind === "RESET"
      ? "Redefina sua senha — Grão na Porta"
      : "Confirme seu e-mail — Grão na Porta",
    `Acesse ${link}\nSe você não solicitou esta mensagem, ignore-a.`,
    `action:${hash(raw)}`,
  );
}
export async function register(ctx: Context, input: unknown) {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      email,
      password,
      consent: z.literal(true),
    })
    .strict()
    .parse(input);
  await rateLimit(`register:${ctx.ip}`, 5, 3600);
  const hashed = await passwordHash(data.password);
  return transaction(async (tx) => {
    const [user] = await rows(
      `INSERT INTO users(name,email,password_hash,consent_at) VALUES($1,$2,$3,now()) ON CONFLICT(email) DO NOTHING RETURNING id,role,email`,
      [data.name, data.email, hashed],
      tx,
    );
    insist(
      user,
      "REGISTER_FAILED",
      "Não foi possível criar a conta. Tente entrar ou recuperar sua senha.",
    );
    await actionToken(tx, user as { id: string; email: string }, "VERIFY");
    await issueSession(ctx, user as { id: string; role: string }, tx, false);
    await audit(tx, user.id, "REGISTER");
    return true;
  });
}
export async function login(ctx: Context, input: unknown) {
  const data = z
    .object({
      email,
      password: z.string().min(1).max(128),
      code: z.string().max(6).optional(),
    })
    .strict()
    .parse(input);
  await rateLimit(`login-ip:${ctx.ip}`, 20, 900);
  await rateLimit(`login-email:${data.email}`, 8, 900);
  const [user] = await rows("SELECT * FROM users WHERE email=$1", [data.email]);
  dummy ??= passwordHash(token());
  const valid = await argon2.verify(
    user?.password_hash || (await dummy),
    data.password,
  );
  insist(
    user && valid && !user.disabled_at,
    "INVALID_CREDENTIALS",
    "E-mail, senha ou código inválidos.",
    401,
  );
  return transaction(async (tx) => {
    const [current] = await rows(
      "SELECT password_hash,role,disabled_at FROM users WHERE id=$1 FOR UPDATE",
      [user.id],
      tx,
    );
    insist(
      current &&
        !current.disabled_at &&
        current.password_hash === user.password_hash &&
        current.role === user.role,
      "INVALID_CREDENTIALS",
      "As credenciais foram alteradas. Entre novamente.",
      401,
    );
    if (user.role === "ADMIN") await consumeTotp(tx, user.id, data.code || "");
    await issueSession(
      ctx,
      user as { id: string; role: string },
      tx,
      user.role === "ADMIN",
    );
    await audit(tx, user.id, "LOGIN");
    return true;
  });
}
export async function logout(ctx: Context) {
  if (ctx.session)
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      ctx.session.tokenHash,
    ]);
  setCookie(ctx.headers, sessionCookie, "", 0);
  return true;
}
export async function reauthenticate(ctx: Context, input: unknown) {
  const user = requireAdmin(ctx);
  const data = z
    .object({ password: z.string().min(1).max(128), code: otp })
    .strict()
    .parse(input);
  await rateLimit(`reauth:${user.id}`, 5, 900);
  const [stored] = await rows("SELECT password_hash FROM users WHERE id=$1", [
    user.id,
  ]);
  insist(
    await argon2.verify(stored.password_hash, data.password),
    "INVALID_CREDENTIALS",
    "Senha inválida.",
    401,
  );
  return transaction(async (tx) => {
    const [current] = await rows(
      "SELECT password_hash,role,disabled_at FROM users WHERE id=$1 FOR UPDATE",
      [user.id],
      tx,
    );
    insist(
      current &&
        current.role === "ADMIN" &&
        !current.disabled_at &&
        current.password_hash === stored.password_hash,
      "INVALID_CREDENTIALS",
      "As credenciais foram alteradas. Entre novamente.",
      401,
    );
    insist(
      (
        await rows(
          "SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now()",
          [ctx.session!.tokenHash],
          tx,
        )
      ).length,
      "UNAUTHENTICATED",
      "Sessão encerrada. Entre novamente.",
      401,
    );
    await consumeTotp(tx, user.id, data.code);
    await issueSession(ctx, user, tx, true);
    await audit(tx, user.id, "ADMIN_REAUTH");
    return true;
  });
}
export async function requestReset(ctx: Context, value: string) {
  const normalized = email.parse(value);
  await rateLimit(`reset-ip:${ctx.ip}`, 5, 900);
  await rateLimit(`reset-email:${normalized}`, 3, 3600);
  await transaction(async (tx) => {
    const [user] = await rows(
      "SELECT id,email FROM users WHERE email=$1 AND disabled_at IS NULL FOR UPDATE",
      [normalized],
      tx,
    );
    if (user)
      await actionToken(tx, user as { id: string; email: string }, "RESET");
  });
  return true;
}
export async function resendVerification(ctx: Context) {
  const user = requireUser(ctx);
  await rateLimit(`verify:${user.id}`, 3, 3600);
  if (!user.emailVerified)
    await transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [user.id]);
      await actionToken(tx, user, "VERIFY");
    });
  return true;
}
export async function redeemToken(
  raw: string,
  kind: "RESET" | "VERIFY",
  newPassword?: string,
) {
  z.string()
    .regex(/^[\w-]{43}$/)
    .parse(raw);
  if (kind === "RESET") password.parse(newPassword);
  return transaction(async (tx) => {
    const [candidate] = await rows(
      "SELECT user_id FROM action_tokens WHERE token_hash=$1 AND kind=$2 AND expires_at>now()",
      [hash(raw), kind],
      tx,
    );
    insist(
      candidate,
      "TOKEN_INVALID",
      "Link inválido, expirado ou já utilizado.",
    );
    // Same lock order as token issuance: account first, token second.
    const [account] = await rows(
      "SELECT role,disabled_at FROM users WHERE id=$1 FOR UPDATE",
      [candidate.user_id],
      tx,
    );
    insist(
      account && !account.disabled_at,
      "TOKEN_INVALID",
      "Link inválido, expirado ou já utilizado.",
    );
    const [action] = await rows(
      "DELETE FROM action_tokens WHERE token_hash=$1 AND kind=$2 AND expires_at>now() RETURNING user_id",
      [hash(raw), kind],
      tx,
    );
    insist(action, "TOKEN_INVALID", "Link inválido, expirado ou já utilizado.");
    if (kind === "RESET") {
      if (account.role === "ADMIN")
        password
          .min(16, "Administradores precisam de pelo menos 16 caracteres.")
          .parse(newPassword);
      await tx.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
        action.user_id,
        await passwordHash(newPassword!),
      ]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [action.user_id]);
      await tx.query(
        "DELETE FROM action_tokens WHERE user_id=$1 AND kind='RESET'",
        [action.user_id],
      );
    } else
      await tx.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [
        action.user_id,
      ]);
    await audit(
      tx,
      action.user_id,
      kind === "RESET" ? "PASSWORD_RESET" : "EMAIL_VERIFIED",
    );
    return true;
  });
}
export async function deactivateAccount(
  ctx: Context,
  suppliedPassword: string,
) {
  const user = requireUser(ctx);
  insist(
    user.role === "CUSTOMER",
    "FORBIDDEN",
    "Contas administrativas exigem um procedimento de desativação separado.",
    403,
  );
  password.parse(suppliedPassword);
  await rateLimit(`deactivate:${user.id}`, 5, 900);
  const [stored] = await rows("SELECT password_hash FROM users WHERE id=$1", [
    user.id,
  ]);
  insist(
    stored && (await argon2.verify(stored.password_hash, suppliedPassword)),
    "INVALID_CREDENTIALS",
    "Senha inválida.",
    401,
  );
  await transaction(async (tx) => {
    const [current] = await rows(
      "SELECT * FROM users WHERE id=$1 FOR UPDATE",
      [user.id],
      tx,
    );
    insist(
      current &&
        current.role === "CUSTOMER" &&
        !current.disabled_at &&
        current.password_hash === stored.password_hash,
      "UNAUTHENTICATED",
      "Entre novamente.",
      401,
    );
    const session = await tx.query(
      "SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()",
      [ctx.session!.tokenHash, user.id],
    );
    insist(session.rowCount, "UNAUTHENTICATED", "Entre novamente.", 401);
    const open = await tx.query(
      "SELECT 1 FROM orders WHERE user_id=$1 AND status NOT IN ('CANCELLED','EXPIRED','DELIVERED') LIMIT 1",
      [user.id],
    );
    insist(
      !open.rowCount,
      "OPEN_ORDERS",
      "Conclua ou cancele os pedidos em aberto antes de desativar a conta.",
      409,
    );
    await tx.query("UPDATE users SET disabled_at=now() WHERE id=$1", [user.id]);
    await tx.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
    await tx.query("DELETE FROM action_tokens WHERE user_id=$1", [user.id]);
    await tx.query("DELETE FROM addresses WHERE user_id=$1", [user.id]);
    await tx.query("DELETE FROM cart_items WHERE owner_key=$1", [
      `u:${user.id}`,
    ]);
    await audit(tx, user.id, "ACCOUNT_DEACTIVATED");
  });
  setCookie(ctx.headers, sessionCookie, "", 0);
  return true;
}

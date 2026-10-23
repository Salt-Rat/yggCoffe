import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { TOTP, Secret } from "otpauth";
import { db, transaction } from "../src/lib/db";
import { passwordHash } from "../src/lib/auth";
import { encrypt, audit } from "../src/lib/security";
import { email, password, otp } from "../src/lib/validation";
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function hidden(prompt: string) {
  process.stdout.write(prompt);
  muted = true;
  const value = await rl.question("");
  muted = false;
  process.stdout.write("\n");
  return value;
}
try {
  const name = await rl.question("Nome do administrador: ");
  const mail = email.parse(await rl.question("E-mail: "));
  const pass = password
    .min(16)
    .parse(await hidden("Senha (mínimo 16 caracteres, entrada oculta): "));
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "Grão na Porta",
    label: mail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  console.log(
    "Cadastre esta chave no autenticador e guarde-a em local seguro. Ela só é exibida aqui:",
  );
  console.log(secret.base32);
  const code = otp.parse(await hidden("Código atual do autenticador: "));
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null)
    throw new Error("Código inválido. Administrador não criado.");
  const hashed = await passwordHash(pass),
    encrypted = encrypt(secret.base32);
  await transaction(async (tx) => {
    const result = await tx.query(
      `INSERT INTO users(name,email,password_hash,role,email_verified_at,mfa_secret,mfa_last_step) VALUES($1,$2,$3,'ADMIN',now(),$4,$5) RETURNING id`,
      [name, mail, hashed, encrypted, Math.floor(Date.now() / 30000) + delta],
    );
    await audit(tx, result.rows[0].id, "ADMIN_BOOTSTRAP");
  });
  console.log(
    "Administrador criado com 2FA. Aguarde o próximo código para entrar em /conta.",
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message.includes("duplicate")
      ? "Este e-mail já está cadastrado. Nenhuma conta foi alterada."
      : error instanceof Error
        ? error.message
        : "Não foi possível criar o administrador.",
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await db.end();
}

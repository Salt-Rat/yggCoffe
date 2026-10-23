import nodemailer from "nodemailer";
import { db, rows, transaction } from "./db";
import { expireReservations } from "./orders";
import { decrypt } from "./security";
export async function runJobs() {
  const expired = await expireReservations();
  await db.query(
    "DELETE FROM rate_limits WHERE reset_at<now()-interval '1 day'",
  );
  await db.query("DELETE FROM sessions WHERE expires_at<now()");
  await db.query("DELETE FROM action_tokens WHERE expires_at<now()");
  await db.query(
    "DELETE FROM cart_items WHERE updated_at<now()-interval '30 days'",
  );
  let sent = 0;
  if (process.env.SMTP_HOST && process.env.SMTP_FROM) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      requireTLS: process.env.NODE_ENV === "production",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 5000,
      socketTimeout: 8000,
    });
    for (let i = 0; i < 10; i++) {
      // Lease before network IO; a crashed worker is retried after five minutes.
      const message = await transaction(async (tx) => {
        const [m] = await rows(
          "SELECT * FROM email_outbox WHERE sent_at IS NULL AND available_at<=now() AND attempts<10 ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
          [],
          tx,
        );
        if (m)
          await tx.query(
            "UPDATE email_outbox SET attempts=attempts+1,available_at=now()+interval '5 minutes' WHERE id=$1",
            [m.id],
          );
        return m;
      });
      if (!message) break;
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: message.recipient,
          subject: message.subject,
          text: decrypt(message.encrypted_text),
          messageId: `<${message.id}@graonaporta.local>`,
        });
        await db.query(
          "UPDATE email_outbox SET sent_at=now(),encrypted_text='' WHERE id=$1",
          [message.id],
        );
        sent++;
      } catch {
        console.error(
          JSON.stringify({ event: "EMAIL_DELIVERY_FAILED", id: message.id }),
        );
      }
    }
  }
  return { expired, sent };
}

"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useShop } from "./shop-provider";
export function AuthForm() {
  const { api, refresh } = useShop();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "login")
        await api("mutation($input:LoginInput!){login(input:$input)}", {
          input: {
            email: f.get("email"),
            password: f.get("password"),
            ...(f.get("code") ? { code: f.get("code") } : {}),
          },
        });
      else if (mode === "register")
        await api("mutation($input:RegisterInput!){register(input:$input)}", {
          input: {
            name: f.get("name"),
            email: f.get("email"),
            password: f.get("password"),
            consent: f.get("consent") === "on",
          },
        });
      else {
        await api(
          "mutation($email:String!){requestPasswordReset(email:$email)}",
          { email: f.get("email") },
        );
        setMessage(
          "Se houver uma conta para este e-mail, enviaremos as instruções de recuperação.",
        );
        return;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-panel">
      <span className="eyebrow">BOM TER VOCÊ POR AQUI</span>
      <h1>{mode === "forgot" ? "Um novo começo." : "Seu café. Sua conta."}</h1>
      <p>
        {mode === "forgot"
          ? "Enviaremos um link para você redefinir sua senha."
          : "Acompanhe seus pedidos e deixe seu próximo café ainda mais perto."}
      </p>
      <div className="form-tabs">
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
            setMessage("");
          }}
        >
          Entrar
        </button>
        <button
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setError("");
            setMessage("");
          }}
        >
          Criar conta
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === "register" && (
          <label>
            Seu nome
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
        )}
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        {mode !== "forgot" && (
          <label>
            Senha{mode === "register" ? " · pelo menos 12 caracteres" : ""}
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "register" ? 12 : 1}
              maxLength={128}
              required
            />
          </label>
        )}
        {mode === "login" && (
          <details className="mfa-details">
            <summary
              className="subtle"
              style={{ marginBottom: 12, cursor: "pointer" }}
            >
              Acesso administrativo · código 2FA
            </summary>
            <label>
              Código do autenticador
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </label>
          </details>
        )}
        {mode === "register" && (
          <label>
            <input name="consent" type="checkbox" required />
            Li a{" "}
            <Link className="text-link" href="/privacidade">
              política de privacidade
            </Link>{" "}
            e concordo com o uso dos dados para minha conta e pedidos.
          </label>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        <button className="button full" disabled={busy}>
          {busy
            ? "Aguarde…"
            : mode === "login"
              ? "Entrar na minha conta"
              : mode === "register"
                ? "Criar minha conta"
                : "Enviar instruções"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="form-links">
        {mode === "login" && (
          <button className="text-link" onClick={() => setMode("forgot")}>
            Esqueci minha senha
          </button>
        )}
        <span className="subtle">
          <LockKeyhole size={11} /> Sua sessão é protegida.
        </span>
      </div>
    </div>
  );
}

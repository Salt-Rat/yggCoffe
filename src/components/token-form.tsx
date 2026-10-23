"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useShop } from "./shop-provider";
export function TokenForm({ reset }: { reset: boolean }) {
  const { api, refresh } = useShop();
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const raw = params.get("token");
    // The URL fragment is browser-only and must be removed after capturing it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (raw) setToken(raw);
    history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (reset)
        await api(
          "mutation($token:String!,$password:String!){resetPassword(token:$token,password:$password)}",
          { token, password: new FormData(e.currentTarget).get("password") },
        );
      else
        await api("mutation($token:String!){verifyEmail(token:$token)}", {
          token,
        });
      setSuccess(true);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content">
      <div className="form-panel">
        <span className="eyebrow">SUA CONTA, BEM CUIDADA</span>
        <h1>{reset ? "Renove sua senha." : "Confirme seu e-mail."}</h1>
        {success ? (
          <div className="success-message">
            {reset
              ? "Senha atualizada. Entre novamente com sua nova senha."
              : "E-mail confirmado! Sua conta está pronta para comprar."}
            <br />
            <Link className="text-link" href="/conta">
              Ir para minha conta
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="subtle">
              {reset
                ? "Escolha uma senha com pelo menos 12 caracteres."
                : "Clique abaixo para confirmar o endereço de e-mail da sua conta."}
            </p>
            {reset && (
              <label>
                Nova senha
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
            )}
            {!token && (
              <p className="error-message">
                Link incompleto. Abra o link recebido por e-mail.
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button disabled={!token || busy} className="button full">
              {busy
                ? "Aguarde…"
                : reset
                  ? "Salvar nova senha"
                  : "Confirmar e-mail"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShop } from "@/components/shop-provider";
import { AuthForm } from "@/components/auth-form";
import {
  AddressForm,
  ADDRESS_FIELDS,
  type Address,
} from "@/components/address-form";
import { ORDER_FIELDS, type Order } from "@/components/order-card";
import { money } from "@/lib/defaults";
export default function Checkout() {
  const { cart, user, loading, api } = useShop();
  const [addresses, setAddresses] = useState<Address[]>([]),
    [addressId, setAddressId] = useState(""),
    [newAddress, setNewAddress] = useState(false),
    [enabled, setEnabled] = useState(false),
    [shipping, setShipping] = useState<number | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState<Order | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api<{
        addresses: Address[];
        paymentsEnabled: boolean;
        shippingCents: number | null;
      }>(`{addresses{${ADDRESS_FIELDS}} paymentsEnabled shippingCents}`);
      setAddresses(r.addresses);
      setEnabled(r.paymentsEnabled);
      setShipping(r.shippingCents);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user, api]);
  useEffect(() => {
    // This effect loads remote state; setters run only after the fetch completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  if (loading) return <div className="loading">Preparando seu pedido…</div>;
  if (!user)
    return (
      <div className="page-content">
        <div className="page-heading">
          <h1>Uma pausa antes do café.</h1>
          <p>Entre na sua conta para concluir o pedido com segurança.</p>
        </div>
        <AuthForm />
      </div>
    );
  const subtotal = cart.reduce((n, i) => n + i.quantity * i.priceCents, 0);
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const items = cart
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
        .sort((a, b) => a.variantId.localeCompare(b.variantId));
      const fingerprint = JSON.stringify({ items, addressId });
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
        const saved = sessionStorage.getItem("coffee-checkout");
        let existing: null | { fingerprint: string; key: string } = null;
        try {
          existing = saved ? JSON.parse(saved) : null;
        } catch {}
        attempt.current =
          existing?.fingerprint === fingerprint
            ? existing
            : { fingerprint, key: crypto.randomUUID() };
        sessionStorage.setItem(
          "coffee-checkout",
          JSON.stringify(attempt.current),
        );
      }
      const result = await api<{ createOrder: Order }>(
        `mutation($input:CheckoutInput!){createOrder(input:$input){${ORDER_FIELDS}}}`,
        { input: { key: attempt.current.key, addressId, items } },
      );
      setOrder(result.createOrder);
      if (result.createOrder.checkoutUrl)
        window.location.assign(result.createOrder.checkoutUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-content">
      <div className="page-heading">
        <span className="eyebrow">DO NOSSO CAFÉ À SUA PORTA</span>
        <h1>Seu próximo bom dia.</h1>
      </div>
      {!user.emailVerified && (
        <div className="info-banner">
          Confirme seu e-mail antes de comprar.{" "}
          <Link className="text-link" href="/conta">
            Ir para minha conta
          </Link>
        </div>
      )}
      {ready && (!enabled || shipping === null) && (
        <p className="info-banner">
          Estamos preparando as opções de pagamento e entrega. Você já pode
          salvar seu endereço; a finalização da compra estará disponível em
          breve.
        </p>
      )}
      {!cart.length ? (
        <div className="empty-state">
          <p>Sua sacola está vazia.</p>
          <Link className="button" href="/loja">
            Escolher cafés
          </Link>
        </div>
      ) : (
        <div className="split-layout">
          <section className="panel">
            <h2>01. Onde seu café vai chegar?</h2>
            {addresses.map((a) => (
              <label key={a.id} className="panel" style={{ padding: 18 }}>
                <input
                  type="radio"
                  name="address"
                  checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)}
                  style={{ width: "auto", display: "inline", marginRight: 10 }}
                />
                {a.recipient}
                <br />
                {a.street}, {a.number} {a.complement} · {a.district}
                <br />
                {a.city}/{a.state} · CEP {a.postalCode}
              </label>
            ))}
            {newAddress || !addresses.length ? (
              <AddressForm
                onSaved={(id) => {
                  setAddressId(id);
                  setNewAddress(false);
                  load();
                }}
              />
            ) : (
              <button className="text-link" onClick={() => setNewAddress(true)}>
                Usar outro endereço +
              </button>
            )}
          </section>
          <aside className="panel">
            <h2>02. Confira sua escolha</h2>
            {cart.map((i) => (
              <div key={i.variantId} className="summary-line">
                <span>
                  {i.quantity}× {i.name}
                  <br />
                  <small>{i.label}</small>
                </span>
                <strong>{money(i.priceCents * i.quantity)}</strong>
              </div>
            ))}
            <div className="summary-line">
              <span>Entrega</span>
              <span>
                {shipping === null ? "Em configuração" : money(shipping)}
              </span>
            </div>
            <div className="summary-line total">
              <span>Total</span>
              <strong>
                {shipping === null ? "—" : money(subtotal + shipping)}
              </strong>
            </div>
            <p className="subtle">
              O pagamento acontece no ambiente seguro do provedor. Não guardamos
              dados de cartão.
            </p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button
              className="button full"
              disabled={
                !ready ||
                !enabled ||
                shipping === null ||
                !addressId ||
                !user.emailVerified ||
                busy
              }
              onClick={checkout}
            >
              {busy ? "Preparando pagamento…" : "Ir para pagamento →"}
            </button>
            {order && (
              <p className="info-banner">
                Pedido #{order.id.slice(0, 8)} criado.{" "}
                <Link href="/conta">Acompanhar pedido</Link>
              </p>
            )}
            <Link
              href="/carrinho"
              className="text-link"
              style={{ marginTop: 20 }}
            >
              Voltar à sacola
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}

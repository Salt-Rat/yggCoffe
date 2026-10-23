"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { useShop } from "@/components/shop-provider";
import { money } from "@/lib/defaults";
export default function Basket() {
  const { cart, setItem, loading, notify } = useShop();
  const [busy, setBusy] = useState(false);
  const subtotal = cart.reduce(
    (total, i) => total + i.quantity * i.priceCents,
    0,
  );
  const update = async (id: string, q: number) => {
    setBusy(true);
    try {
      await setItem(id, q);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-content">
      <div className="page-heading">
        <span className="eyebrow">FALTA POUCO PARA A SUA PAUSA</span>
        <h1>Sua sacola.</h1>
      </div>
      {loading ? (
        <div className="loading">Preparando sua sacola…</div>
      ) : !cart.length ? (
        <div className="empty-state">
          <h2>Um bom café está esperando por você.</h2>
          <p>
            Sua sacola ainda está vazia. Que tal começar pela sua torra
            favorita?
          </p>
          <Link className="button" href="/loja">
            Explorar os cafés <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="split-layout">
          <div>
            {cart.map((i) => (
              <article className="cart-row" key={i.variantId}>
                <img
                  className={
                    i.imageUrl === "/images/coffee-bean.png"
                      ? `bean-${i.roastId}`
                      : ""
                  }
                  src={i.imageUrl}
                  alt=""
                  width={75}
                  height={90}
                />
                <div>
                  <Link href={`/loja/${i.slug}`}>
                    <h3>{i.name}</h3>
                  </Link>
                  <p>
                    {i.label} · {money(i.priceCents)}
                  </p>
                  {(!i.active || i.available < i.quantity) && (
                    <span className="error-message">
                      {!i.active
                        ? "Produto indisponível"
                        : `Disponíveis: ${i.available}`}
                    </span>
                  )}
                </div>
                <div className="cart-controls">
                  <div className="quantity">
                    <button
                      disabled={busy}
                      aria-label={`Diminuir ${i.name}`}
                      onClick={() => update(i.variantId, i.quantity - 1)}
                    >
                      <Minus size={12} />
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      disabled={
                        busy || i.quantity >= 20 || i.quantity >= i.available
                      }
                      aria-label={`Aumentar ${i.name}`}
                      onClick={() => update(i.variantId, i.quantity + 1)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <strong>{money(i.priceCents * i.quantity)}</strong>
                  <button
                    disabled={busy}
                    className="remove-button"
                    aria-label={`Remover ${i.name}`}
                    onClick={() => update(i.variantId, 0)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
            <Link href="/loja" className="text-link" style={{ marginTop: 25 }}>
              Continuar escolhendo
            </Link>
          </div>
          <aside className="panel">
            <h2>Seu ritual, quase pronto.</h2>
            <div className="summary-line">
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div className="summary-line">
              <span>Entrega</span>
              <span>No próximo passo</span>
            </div>
            <div className="summary-line total">
              <span>Produtos</span>
              <strong>{money(subtotal)}</strong>
            </div>
            {cart.some((i) => !i.active || i.available < i.quantity) ? (
              <p className="error-message">
                Ajuste os itens indisponíveis para continuar.
              </p>
            ) : (
              <Link href="/checkout" className="button full">
                Continuar para entrega <ArrowRight size={17} />
              </Link>
            )}
            <p className="subtle" style={{ marginTop: 20 }}>
              Os preços e a disponibilidade serão conferidos novamente antes do
              pagamento.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { money, type Product } from "@/lib/defaults";
import { useShop } from "./shop-provider";
import { CoffeePack } from "./product-card";
export function ProductDetail({ product }: { product: Product }) {
  const [variantId, setVariant] = useState(product.variants[0]?.id),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false);
  const { cart, setItem, notify } = useShop();
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant)
    return (
      <div className="empty-state">Produto sem variantes disponíveis.</div>
    );
  return (
    <div className="product-detail">
      <div className={`product-art art-${product.roastId}`}>
        <span className="product-index">LOTE / {product.itemIndex}</span>
        {product.imageUrl === "/images/coffee-bean.png" ? (
          <CoffeePack name={product.name} roast={product.roastId} />
        ) : (
          <img
            src={product.imageUrl}
            alt={product.name}
            width={500}
            height={500}
          />
        )}
      </div>
      <div>
        <span className="eyebrow">
          {product.category} · TORRA{" "}
          {product.roastId === "media"
            ? "MÉDIA"
            : product.roastId.toUpperCase()}
        </span>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <fieldset>
          <legend>Escolha o tamanho</legend>
          <div className="variant-options">
            {product.variants.map((v) => (
              <button
                className={v.id === variant.id ? "selected" : ""}
                key={v.id}
                aria-pressed={v.id === variant.id}
                onClick={() => setVariant(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </fieldset>
        <strong className="detail-price">{money(variant.priceCents)}</strong>
        <label>
          Quantidade
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          >
            {Array.from(
              { length: Math.max(1, Math.min(20, variant.available)) },
              (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ),
            )}
          </select>
        </label>
        <button
          className="button full"
          disabled={busy || variant.available < quantity}
          onClick={async () => {
            setBusy(true);
            try {
              await setItem(
                variant.id,
                quantity +
                  (cart.find((i) => i.variantId === variant.id)?.quantity || 0),
              );
              notify("Café adicionado à sua sacola.");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ShoppingBag size={17} />
          {variant.available < 1
            ? "Temporariamente esgotado"
            : busy
              ? "Adicionando…"
              : "Adicionar à sacola"}
          <ArrowRight size={17} />
        </button>
        <p className="subtle" style={{ marginTop: 18 }}>
          SKU {variant.sku} ·{" "}
          {variant.available > 0
            ? `${variant.available} unidades disponíveis`
            : "Aguardando o próximo lote"}
          <br />A reserva de estoque acontece ao iniciar o pagamento.
        </p>
        <Link href="/#torras" className="text-link">
          Conheça os perfis de torra
        </Link>
      </div>
    </div>
  );
}

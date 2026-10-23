"use client";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import { money, type Product } from "@/lib/defaults";
import { useShop } from "./shop-provider";
export function CoffeePack({ roast, name }: { roast: string; name: string }) {
  return (
    <div className={`coffee-pack pack-${roast}`} aria-hidden="true">
      <div className="pack-seam" />
      <span className="pack-brand">
        grão
        <br />
        na porta<span>CAFÉS DE ORIGEM</span>
      </span>
      <div className="pack-label">
        <span>SEU RITUAL, ENTREGUE.</span>
        <strong>{name}</strong>
        <span>TORRA {roast === "media" ? "MÉDIA" : roast.toUpperCase()}</span>
      </div>
      <span className="pack-bottom">CAFÉ EM GRÃOS · BRASIL</span>
    </div>
  );
}
export function ProductCard({ product }: { product: Product }) {
  const { setItem, cart, notify } = useShop();
  const [busy, setBusy] = useState(false);
  const variant = product.variants.find((v) => v.active);
  if (!variant) return null;
  return (
    <article className="product-card">
      <Link
        href={`/loja/${product.slug}`}
        className={`product-art art-${product.roastId}`}
      >
        <span className="product-index">LOTE / {product.itemIndex}</span>
        {product.imageUrl === "/images/coffee-bean.png" ? (
          <CoffeePack roast={product.roastId} name={product.name} />
        ) : (
          <img
            src={product.imageUrl}
            alt={product.name}
            width="400"
            height="400"
            loading="lazy"
          />
        )}
        <span className="product-arrow">
          <ArrowUpRight size={20} />
        </span>
      </Link>
      <div className="product-meta">
        <span>{product.category}</span>
        <span>{variant.label}</span>
      </div>
      <Link href={`/loja/${product.slug}`}>
        <h3>{product.name}</h3>
      </Link>
      <p>{product.description}</p>
      <div className="product-bottom">
        <strong>{money(variant.priceCents)}</strong>
        <button
          className="add-button"
          disabled={busy || variant.available === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await setItem(
                variant.id,
                (cart.find((i) => i.variantId === variant.id)?.quantity || 0) +
                  1,
              );
              notify("Um bom café entrou na sua sacola.");
            } catch (error) {
              notify((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {variant.available === 0
            ? "Esgotado"
            : busy
              ? "Adicionando…"
              : "Adicionar"}
          <Plus size={15} />
        </button>
      </div>
    </article>
  );
}

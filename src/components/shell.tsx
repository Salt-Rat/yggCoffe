"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  ShoppingBag,
  UserRound,
  X,
  ArrowUpRight,
  Coffee,
} from "lucide-react";
import { useState } from "react";
import { useShop } from "./shop-provider";
export function Header() {
  const { cart, user } = useShop(),
    [open, setOpen] = useState(false);
  const path = usePathname();
  return (
    <>
      <div className="announcement">
        CAFÉS DE ORIGEM · TRÊS TORRAS · UM RITUAL SÓ SEU
      </div>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Grão na Porta, início">
          <span className="brand-mark">g.</span>
          <span>
            grão na porta<small>bons dias começam aqui</small>
          </span>
        </Link>
        <nav
          className={open ? "nav open" : "nav"}
          aria-label="Navegação principal"
        >
          <Link
            className={path === "/loja" ? "active" : ""}
            href="/loja"
            onClick={() => setOpen(false)}
          >
            Nossos cafés
          </Link>
          <Link href="/#torras" onClick={() => setOpen(false)}>
            Encontre sua torra
          </Link>
          <Link href="/#origem" onClick={() => setOpen(false)}>
            Nossa essência
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" onClick={() => setOpen(false)}>
              Painel
            </Link>
          )}
        </nav>
        <div className="header-actions">
          <Link href="/conta" className="icon-button" aria-label="Minha conta">
            <UserRound size={19} />
          </Link>
          <Link
            href="/carrinho"
            className="cart-button"
            aria-label={`Sacola com ${cart.reduce((n, i) => n + i.quantity, 0)} itens`}
          >
            <ShoppingBag size={19} />
            <span className="cart-label">Sacola</span>
            <b>{cart.reduce((n, i) => n + i.quantity, 0)}</b>
          </Link>
          <button
            className="menu-toggle icon-button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <Link href="/" className="brand">
            <span className="brand-mark">g.</span>
            <span>
              grão na porta<small>bons dias começam aqui</small>
            </span>
          </Link>
          <p>
            Café bom. Tempo para apreciar.
            <br />
            Um novo motivo para acordar.
          </p>
        </div>
        <div>
          <span className="eyebrow">SEU PRÓXIMO RITUAL</span>
          <Link href="/loja" className="footer-title">
            Vamos passar um café? <ArrowUpRight />
          </Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Grão na Porta</span>
        <nav>
          <Link href="/loja">Nossos cafés</Link>
          <Link href="/conta">Minha conta</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
        <span className="footer-note">
          <Coffee size={14} /> Feito para suas manhãs.
        </span>
      </div>
    </footer>
  );
}

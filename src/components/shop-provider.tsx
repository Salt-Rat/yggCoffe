"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/lib/auth";
export type CartItem = {
  variantId: string;
  quantity: number;
  name: string;
  slug: string;
  imageUrl: string;
  roastId: string;
  label: string;
  priceCents: number;
  available: number;
  active: boolean;
};
type ShopState = {
  user: User | null;
  loading: boolean;
  cart: CartItem[];
  notice: string;
  api: <T>(
    query: string,
    variables?: Record<string, unknown>,
    code?: string,
  ) => Promise<T>;
  refresh: () => Promise<void>;
  setItem: (id: string, quantity: number) => Promise<void>;
  notify: (text: string) => void;
};
const ShopContext = createContext<ShopState | null>(null);
const CART =
  "variantId quantity name slug imageUrl roastId label priceCents available active";
export function ShopProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [csrf, setCsrf] = useState("public"),
    [loading, setLoading] = useState(true),
    [cart, setCart] = useState<CartItem[]>([]),
    [notice, setNotice] = useState("");
  const api = useCallback(
    async <T,>(
      query: string,
      variables: Record<string, unknown> = {},
      code?: string,
    ): Promise<T> => {
      const response = await fetch("/api/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
          ...(code ? { "x-admin-totp": code } : {}),
        },
        body: JSON.stringify({ query, variables }),
      });
      const result = await response.json();
      if (result.errors?.length) throw new Error(result.errors[0].message);
      if (!response.ok) throw new Error("Não foi possível conectar à loja.");
      return result.data;
    },
    [csrf],
  );
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Loja temporariamente indisponível.");
      setUser(result.user);
      setCsrf(result.csrfToken);
      const r = await fetch("/api/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: `{cart{${CART}}}` }),
      });
      const data = await r.json();
      if (data.data?.cart) setCart(data.data.cart);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() =>
      setNotice(
        "A loja está temporariamente indisponível. Tente novamente em instantes.",
      ),
    );
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const setItem = async (id: string, quantity: number) => {
    const result = await api<{ setCartItem: CartItem[] }>(
      `mutation($id:ID!,$quantity:Int!){setCartItem(variantId:$id,quantity:$quantity){${CART}}}`,
      { id, quantity },
    );
    setCart(result.setCartItem);
  };
  return (
    <ShopContext.Provider
      value={{
        user,
        loading,
        cart,
        notice,
        api,
        refresh,
        setItem,
        notify: setNotice,
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
    </ShopContext.Provider>
  );
}
export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("ShopProvider required");
  return value;
}

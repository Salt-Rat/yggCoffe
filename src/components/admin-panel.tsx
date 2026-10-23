"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, ShieldCheck, ArrowLeft } from "lucide-react";
import { useShop } from "./shop-provider";
import { AuthForm } from "./auth-form";
import type { Address } from "./address-form";
import {
  defaultHomepage,
  money,
  type Product,
  type Roast,
  type Homepage,
} from "@/lib/defaults";
import { ORDER_FIELDS, statusLabels, type Order } from "./order-card";
type Audit = {
  id: string;
  action: string;
  targetId: string | null;
  createdAt: string;
};
type Tab = "products" | "roasts" | "orders" | "audit" | "security";
const PRODUCT_FIELDS =
  "id itemIndex slug name description category roastId imageUrl active displayOrder variants{id sku label priceCents stock reserved available active}";
const ROAST_FIELDS =
  "id name subtitle flavor acidity body sweetness bitterness preparation imageUrl origin description";
type ProductDraft = Omit<Product, "id" | "variants"> & {
  id?: string;
  variants: {
    id?: string;
    sku: string;
    label: string;
    priceCents: number;
    stock: number;
    active: boolean;
  }[];
};
const blankProduct: ProductDraft = {
  itemIndex: "",
  slug: "",
  name: "",
  description: "",
  category: "Café em grãos",
  roastId: "media",
  imageUrl: "/images/coffee-bean.png",
  active: true,
  displayOrder: 0,
  variants: [
    { sku: "", label: "250 g", priceCents: 4900, stock: 0, active: true },
  ],
};
const tabNames: Record<Tab, string> = {
  products: "Catálogo",
  roasts: "Torras & landing",
  orders: "Pedidos",
  audit: "Auditoria",
  security: "Segurança",
};
export function AdminPanel() {
  const { user, loading, api, refresh, notify } = useShop();
  const [tab, setTab] = useState<Tab>("products"),
    [products, setProducts] = useState<Product[]>([]),
    [profiles, setProfiles] = useState<Roast[]>([]),
    [home, setHome] = useState<Homepage>(defaultHomepage),
    [orders, setOrders] = useState<Order[]>([]),
    [logs, setLogs] = useState<Audit[]>([]),
    [page, setPage] = useState(1),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<ProductDraft | null>(null),
    [selectedRoast, setSelectedRoast] = useState("media");
  const load = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    try {
      const r = await api<{
        adminProducts: Product[];
        roasts: Roast[];
        homepage: Homepage;
        adminOrders: Order[];
        auditLog: Audit[];
      }>(
        `query($page:Int){adminProducts(page:$page){${PRODUCT_FIELDS}} roasts{${ROAST_FIELDS}} homepage{featuredRoast monthLabel headline} adminOrders(page:$page){${ORDER_FIELDS}} auditLog(page:$page){id action targetId createdAt}}`,
        { page },
      );
      setProducts(r.adminProducts);
      setProfiles(r.roasts);
      setHome(r.homepage);
      setOrders(r.adminOrders);
      setLogs(r.auditLog);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user, api, page]);
  useEffect(() => {
    // Fetching protected records is synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  async function mutate(
    query: string,
    variables: Record<string, unknown>,
    done?: () => void,
  ) {
    setBusy(true);
    setError("");
    try {
      await api(query, variables, code);
      setCode("");
      notify("Alteração salva e registrada na auditoria.");
      done?.();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <div className="loading">Verificando acesso seguro…</div>;
  if (!user)
    return (
      <div className="page-content">
        <div className="page-heading">
          <span className="eyebrow">ACESSO ADMINISTRATIVO</span>
          <h1>Cuidado em cada detalhe.</h1>
          <p>Entre com sua senha e o código do autenticador.</p>
        </div>
        <AuthForm />
      </div>
    );
  if (user.role !== "ADMIN")
    return (
      <div className="page-content">
        <div className="empty-state">
          <h2>Área administrativa</h2>
          <p>Sua conta não tem permissão para acessar este painel.</p>
          <Link className="button" href="/conta">
            Voltar para minha conta
          </Link>
        </div>
      </div>
    );
  const roast = profiles.find((r) => r.id === selectedRoast);
  return (
    <div className="page-content">
      <div className="page-heading">
        <span className="eyebrow">GRÃO NA PORTA · ADMINISTRAÇÃO</span>
        <h1>O cuidado começa aqui.</h1>
        <p>
          Catálogo, torras e pedidos. Cada detalhe da experiência, no seu lugar.
        </p>
      </div>
      <div className="admin-layout">
        <aside>
          <nav className="admin-nav" aria-label="Seções administrativas">
            {(Object.keys(tabNames) as Tab[]).map((t) => (
              <button
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => {
                  setTab(t);
                  setDraft(null);
                  setPage(1);
                  setError("");
                }}
              >
                {tabNames[t]}
              </button>
            ))}
            <p className="subtle">
              <ShieldCheck size={14} /> Sessão com 2FA
              <br />
              Expira após 15 min de inatividade.
            </p>
            <Link className="text-link" href="/">
              Ver a loja ↗
            </Link>
          </nav>
        </aside>
        <section>
          {tab !== "security" && (
            <div className="admin-security">
              <p>
                <strong>Confirmação para alterações</strong>
                <br />
                Cada alteração exige um novo código 2FA. Códigos usados no login
                ou em outra ação não podem ser repetidos. Reconfirme a senha a
                cada 10 minutos em Segurança.
              </p>
              <label>
                Código 2FA atual
                <input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                />
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {tab === "products" &&
            (draft ? (
              <ProductEditor
                draft={draft}
                setDraft={setDraft}
                busy={busy}
                onCancel={() => setDraft(null)}
                onSubmit={() =>
                  mutate(
                    "mutation($input:ProductInput!){saveProduct(input:$input)}",
                    { input: draft },
                    () => setDraft(null),
                  )
                }
              />
            ) : (
              <>
                <div className="inline-toolbar">
                  <h2>Catálogo de cafés</h2>
                  <button
                    className="button small"
                    onClick={() => setDraft(structuredClone(blankProduct))}
                  >
                    <Plus size={15} /> Novo produto
                  </button>
                </div>
                <p className="subtle">
                  O índice é único e definido por você. A ordem de exibição
                  determina a posição na loja. Estoque total inclui unidades
                  reservadas.
                </p>
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Índice</th>
                        <th>Produto</th>
                        <th>Estoque / reservado</th>
                        <th>Status</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td>{p.itemIndex}</td>
                          <td>
                            {p.name}
                            <br />
                            <small>{p.variants.length} variantes</small>
                          </td>
                          <td>
                            {p.variants.reduce((n, v) => n + v.stock, 0)} /{" "}
                            {p.variants.reduce((n, v) => n + v.reserved, 0)}
                          </td>
                          <td>
                            <span className="badge">
                              {p.active ? "Ativo" : "Inativo"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="text-link"
                              onClick={() =>
                                setDraft({
                                  ...p,
                                  variants: p.variants.map(
                                    ({
                                      id,
                                      sku,
                                      label,
                                      priceCents,
                                      stock,
                                      active,
                                    }) => ({
                                      id,
                                      sku,
                                      label,
                                      priceCents,
                                      stock,
                                      active,
                                    }),
                                  ),
                                })
                              }
                            >
                              Editar
                            </button>
                            {p.active && (
                              <button
                                className="text-link"
                                disabled={busy || code.length !== 6}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Arquivar este produto? Ele sairá da loja; pedidos e histórico serão preservados.",
                                    )
                                  )
                                    mutate(
                                      "mutation($id:ID!){archiveProduct(id:$id)}",
                                      { id: p.id },
                                    );
                                }}
                              >
                                Arquivar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
          {tab === "roasts" && (
            <>
              <div className="panel">
                <h2>A torra do mês</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutate(
                      "mutation($input:HomepageInput!){saveHomepage(input:$input)}",
                      { input: home },
                    );
                  }}
                >
                  <div className="form-grid">
                    <label>
                      Torra em destaque
                      <select
                        value={home.featuredRoast}
                        onChange={(e) =>
                          setHome({ ...home, featuredRoast: e.target.value })
                        }
                      >
                        {profiles.map((r) => (
                          <option value={r.id} key={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Nome da seleção
                      <input
                        value={home.monthLabel}
                        onChange={(e) =>
                          setHome({ ...home, monthLabel: e.target.value })
                        }
                        maxLength={80}
                        required
                        placeholder="Torra de outubro"
                      />
                    </label>
                    <label className="wide">
                      Título da seção
                      <input
                        value={home.headline}
                        onChange={(e) =>
                          setHome({ ...home, headline: e.target.value })
                        }
                        maxLength={160}
                        required
                      />
                    </label>
                  </div>
                  <button
                    disabled={busy || code.length !== 6}
                    className="button"
                  >
                    Salvar destaque
                  </button>
                </form>
              </div>
              <div className="panel">
                <h2>Perfis de torra</h2>
                <div className="form-tabs">
                  {profiles.map((r) => (
                    <button
                      key={r.id}
                      className={selectedRoast === r.id ? "active" : ""}
                      onClick={() => setSelectedRoast(r.id)}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
                {roast && (
                  <RoastEditor
                    key={roast.id + roast.description + roast.imageUrl}
                    roast={roast}
                    busy={busy || code.length !== 6}
                    onSubmit={(input) =>
                      mutate(
                        "mutation($input:RoastInput!){saveRoast(input:$input)}",
                        { input },
                      )
                    }
                  />
                )}
              </div>
            </>
          )}
          {tab === "orders" && (
            <>
              <div className="inline-toolbar">
                <h2>Pedidos</h2>
                <button className="text-link" onClick={load}>
                  Atualizar
                </button>
              </div>
              {!orders.length && (
                <div className="empty-state">Nenhum pedido nesta página.</div>
              )}
              {orders.map((o) => (
                <AdminOrder
                  key={o.id}
                  order={o}
                  busy={busy || code.length !== 6}
                  onUpdate={(status, trackingCode) =>
                    mutate(
                      "mutation($id:ID!,$status:String!,$trackingCode:String){updateOrderStatus(id:$id,status:$status,trackingCode:$trackingCode)}",
                      {
                        id: o.id,
                        status,
                        ...(trackingCode ? { trackingCode } : {}),
                      },
                    )
                  }
                />
              ))}
            </>
          )}
          {tab === "audit" && (
            <>
              <h2 style={{ fontSize: 28 }}>Histórico de auditoria</h2>
              <p className="subtle">
                Registros de acesso e alterações são preservados e não podem ser
                editados pelo painel.
              </p>
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Ação</th>
                      <th>Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td>{new Date(l.createdAt).toLocaleString("pt-BR")}</td>
                        <td>{l.action}</td>
                        <td>{l.targetId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "security" && (
            <div className="panel">
              <h2>Reconfirmar acesso</h2>
              <p>
                A confirmação renova sua sessão e libera alterações pelos
                próximos 10 minutos. Para salvar uma alteração, aguarde o
                próximo código do autenticador.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const form = e.currentTarget,
                    f = new FormData(form);
                  try {
                    await api(
                      "mutation($input:ReauthInput!){reauthenticate(input:$input)}",
                      {
                        input: {
                          password: f.get("password"),
                          code: f.get("code"),
                        },
                      },
                    );
                    await refresh();
                    form.reset();
                    setCode("");
                    notify(
                      "Acesso renovado. Aguarde um novo código para a próxima alteração.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Senha
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  Código 2FA
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
                <button className="button" disabled={busy}>
                  Confirmar identidade
                </button>
              </form>
              <hr
                style={{
                  border: 0,
                  borderTop: "1px solid var(--line)",
                  margin: "30px 0",
                }}
              />
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    await api("mutation{logout}");
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Encerrar esta sessão
              </button>
            </div>
          )}
          {["products", "orders", "audit"].includes(tab) && !draft && (
            <div className="pagination">
              <button
                className="button secondary small"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                className="button secondary small"
                disabled={
                  (tab === "products"
                    ? products.length
                    : tab === "orders"
                      ? orders.length
                      : logs.length) < (tab === "orders" ? 20 : 30)
                }
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function ProductEditor({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  busy,
}: {
  draft: ProductDraft;
  setDraft: (d: ProductDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const change = (key: keyof ProductDraft, value: unknown) =>
    setDraft({ ...draft, [key]: value });
  return (
    <div className="panel">
      <button className="text-link" onClick={onCancel}>
        <ArrowLeft size={14} /> Voltar ao catálogo
      </button>
      <h2 style={{ marginTop: 25 }}>
        {draft.id ? "Editar café" : "Novo café"}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="form-grid">
          <label>
            Índice exclusivo do produto
            <input
              value={draft.itemIndex}
              required
              maxLength={40}
              pattern="[A-Za-z0-9_-]+"
              placeholder="CAF-001"
              onChange={(e) => change("itemIndex", e.target.value)}
            />
          </label>
          <label>
            Ordem na loja
            <input
              type="number"
              min={0}
              max={100000}
              value={draft.displayOrder}
              onChange={(e) => change("displayOrder", Number(e.target.value))}
              required
            />
          </label>
          <label>
            Nome
            <input
              value={draft.name}
              required
              maxLength={120}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label>
            Slug da página
            <input
              value={draft.slug}
              required
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="cafe-da-serra"
              onChange={(e) => change("slug", e.target.value)}
            />
          </label>
          <label>
            Categoria
            <input
              value={draft.category}
              required
              maxLength={60}
              onChange={(e) => change("category", e.target.value)}
            />
          </label>
          <label>
            Torra
            <select
              value={draft.roastId}
              onChange={(e) => change("roastId", e.target.value)}
            >
              <option value="clara">Clara</option>
              <option value="media">Média</option>
              <option value="escura">Escura</option>
            </select>
          </label>
          <label className="wide">
            Descrição
            <textarea
              value={draft.description}
              required
              maxLength={3000}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <label className="wide">
            Imagem · URL HTTPS ou /images/arquivo
            <input
              value={draft.imageUrl}
              maxLength={1500}
              required
              onChange={(e) => change("imageUrl", e.target.value)}
            />
          </label>
        </div>
        <label>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => change("active", e.target.checked)}
          />
          Produto ativo na loja
        </label>
        {draft.variants.map((v, i) => (
          <fieldset key={v.id || i}>
            <legend>Variante {i + 1}</legend>
            <div className="form-grid">
              {(
                [
                  { key: "sku", label: "SKU exclusivo", type: "text" },
                  {
                    key: "label",
                    label: "Apresentação (ex.: 250 g)",
                    type: "text",
                  },
                  {
                    key: "priceCents",
                    label: "Preço em centavos (4900 = R$ 49)",
                    type: "number",
                  },
                  { key: "stock", label: "Estoque total", type: "number" },
                ] as const
              ).map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    required
                    type={field.type}
                    min={field.key === "priceCents" ? 1 : 0}
                    max={
                      field.key === "priceCents"
                        ? 10000000
                        : field.key === "stock"
                          ? 1000000
                          : undefined
                    }
                    value={v[field.key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        variants: draft.variants.map((old, n) =>
                          n === i
                            ? {
                                ...old,
                                [field.key]:
                                  field.type === "number"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              }
                            : old,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              <input
                type="checkbox"
                checked={v.active}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    variants: draft.variants.map((old, n) =>
                      n === i ? { ...old, active: e.target.checked } : old,
                    ),
                  })
                }
              />
              Variante disponível no catálogo
            </label>
          </fieldset>
        ))}
        <div className="inline-toolbar">
          <button
            type="button"
            className="text-link"
            disabled={draft.variants.length >= 12}
            onClick={() =>
              change("variants", [
                ...draft.variants,
                {
                  sku: "",
                  label: "500 g",
                  priceCents: 8900,
                  stock: 0,
                  active: true,
                },
              ])
            }
          >
            Adicionar variante +
          </button>
          <button className="button" disabled={busy}>
            Salvar produto
          </button>
        </div>
      </form>
    </div>
  );
}
function RoastEditor({
  roast,
  onSubmit,
  busy,
}: {
  roast: Roast;
  onSubmit: (r: Roast) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(roast);
  const fields: { key: keyof Roast; label: string }[] = [
    { key: "name", label: "Nome da torra" },
    { key: "subtitle", label: "Frase de destaque" },
    { key: "origin", label: "Origem / seleção" },
    { key: "flavor", label: "Sabor principal" },
    { key: "acidity", label: "Acidez" },
    { key: "body", label: "Corpo" },
    { key: "sweetness", label: "Doçura" },
    { key: "bitterness", label: "Amargor" },
    { key: "preparation", label: "Melhor preparo" },
    { key: "imageUrl", label: "Imagem do grão · PNG/WebP transparente" },
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
      }}
    >
      <div className="admin-roast-preview">
        <img
          className={
            draft.imageUrl === "/images/coffee-bean.png"
              ? `bean-${draft.id}`
              : ""
          }
          src={draft.imageUrl}
          alt="Prévia do grão"
          width={100}
          height={100}
        />
        <div>
          <h3>{draft.name}</h3>
          <p className="subtle">{draft.subtitle}</p>
        </div>
      </div>
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.key} className={f.key === "imageUrl" ? "wide" : ""}>
            {f.label}
            <input
              required
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <label className="wide">
          Texto ao lado do grão
          <textarea
            value={draft.description}
            maxLength={1000}
            required
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </label>
      </div>
      <p className="subtle">
        A imagem será usada na animação de rolagem. O fundo transparente
        preserva o acabamento da seção. Os mesmos dados atualizam a comparação
        dos três perfis.
      </p>
      <button className="button" disabled={busy}>
        Salvar perfil de torra
      </button>
    </form>
  );
}
function AdminOrder({
  order,
  busy,
  onUpdate,
}: {
  order: Order;
  busy: boolean;
  onUpdate: (status: string, tracking?: string) => void;
}) {
  const [tracking, setTracking] = useState(order.trackingCode || "");
  const { api, notify } = useShop();
  const [detail, setDetail] = useState<
    | (Order & {
        customerName: string;
        customerEmail: string;
        shippingAddress: Address;
      })
    | null
  >(null);
  const [reading, setReading] = useState(false);
  const next: Record<string, string> = {
    PAID: "PROCESSING",
    PROCESSING: "SHIPPED",
    SHIPPED: "DELIVERED",
  };
  return (
    <article className="order-card">
      <div>
        <h3>#{order.id.slice(0, 8)}</h3>
        <span className="badge">{statusLabels[order.status]}</span>
      </div>
      <p>
        {new Date(order.createdAt).toLocaleString("pt-BR")} ·{" "}
        {money(order.totalCents)}
      </p>
      <button
        className="text-link"
        disabled={reading}
        onClick={async () => {
          if (detail) {
            setDetail(null);
            return;
          }
          setReading(true);
          try {
            const r = await api<{
              adminOrder: Order & {
                customerName: string;
                customerEmail: string;
                shippingAddress: Address;
              };
            }>(
              "query($id:ID!){adminOrder(id:$id){id customerName customerEmail shippingAddress{recipient postalCode street number complement district city state} items{productName sku quantity unitPriceCents}}}",
              { id: order.id },
            );
            setDetail(r.adminOrder);
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setReading(false);
          }
        }}
      >
        {detail ? "Fechar detalhes" : "Ver itens e entrega"}
      </button>
      {detail && (
        <div className="panel" style={{ marginTop: 15 }}>
          <h3>{detail.customerName}</h3>
          <p>{detail.customerEmail}</p>
          <p>
            <strong>{detail.shippingAddress.recipient}</strong>
            <br />
            {detail.shippingAddress.street}, {detail.shippingAddress.number}{" "}
            {detail.shippingAddress.complement}
            <br />
            {detail.shippingAddress.district} · {detail.shippingAddress.city}/
            {detail.shippingAddress.state}
            <br />
            CEP {detail.shippingAddress.postalCode}
          </p>
          {detail.items?.map((i) => (
            <div className="summary-line" key={i.sku}>
              <span>
                {i.quantity}× {i.productName}
                <br />
                {i.sku}
              </span>
              <strong>{money(i.unitPriceCents * i.quantity)}</strong>
            </div>
          ))}
        </div>
      )}
      {order.status === "PAYMENT_REVIEW" && (
        <p className="info-banner">
          Pagamento após encerramento da reserva. A equipe de pagamentos precisa
          conciliar e reembolsar ou atender o cliente; o estoque não foi
          baixado.
        </p>
      )}
      {next[order.status] && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onUpdate(next[order.status], tracking || undefined);
          }}
        >
          {order.status === "PROCESSING" && (
            <label>
              Código de rastreio
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                minLength={3}
                maxLength={100}
                required
              />
            </label>
          )}
          <button className="button secondary small" disabled={busy}>
            Marcar: {statusLabels[next[order.status]]}
          </button>
        </form>
      )}
    </article>
  );
}

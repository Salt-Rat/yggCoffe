"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useShop } from "@/components/shop-provider";
import { AuthForm } from "@/components/auth-form";
import {
  AddressForm,
  ADDRESS_FIELDS,
  type Address,
} from "@/components/address-form";
import { OrderCard, ORDER_FIELDS, type Order } from "@/components/order-card";
export default function Account() {
  const { user, loading, api, refresh, notify } = useShop();
  const [orders, setOrders] = useState<Order[]>([]),
    [addresses, setAddresses] = useState<Address[]>([]),
    [addAddress, setAddAddress] = useState(false),
    [editingAddress, setEditingAddress] = useState<Address>(),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const result = await api<{ myOrders: Order[]; addresses: Address[] }>(
        `query($page:Int){myOrders(page:$page){${ORDER_FIELDS}} addresses{${ADDRESS_FIELDS}}}`,
        { page },
      );
      setOrders(result.myOrders);
      setAddresses(result.addresses);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, user, page]);
  useEffect(() => {
    // Fetching account data is synchronization with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  if (loading) return <div className="loading">Abrindo sua conta…</div>;
  if (!user)
    return (
      <div className="page-content">
        <AuthForm />
      </div>
    );
  return (
    <div className="page-content">
      <div className="page-heading">
        <span className="eyebrow">SEU CANTINHO DO CAFÉ</span>
        <h1>Bom te ver, {user.name.split(" ")[0]}.</h1>
        <p>Seus pedidos, seus endereços e o próximo bom dia.</p>
      </div>
      <div className="account-toolbar">
        <Link className="button secondary small" href="/loja">
          Continuar comprando
        </Link>
        <div className="order-actions">
          {user.role === "ADMIN" && (
            <Link href="/admin" className="button small">
              Abrir painel
            </Link>
          )}
          <button
            className="text-link"
            onClick={async () => {
              try {
                await api("mutation{logout}");
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Sair da conta
          </button>
        </div>
      </div>
      {!user.emailVerified && (
        <div className="info-banner">
          Confirme seu e-mail para fazer compras.{" "}
          <button
            className="text-link"
            onClick={async () => {
              try {
                await api("mutation{resendVerification}");
                notify("Solicitação recebida. Confira seu e-mail.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Reenviar confirmação
          </button>
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="split-layout">
        <section>
          <h2 style={{ fontSize: 30, marginBottom: 25 }}>Meus pedidos</h2>
          {orders.length ? (
            orders.map((order) => (
              <OrderCard key={order.id} order={order} onChange={load} />
            ))
          ) : (
            <div className="empty-state">
              <p>Seu primeiro pedido merece um bom café.</p>
              <Link className="text-link" href="/loja">
                Conhecer a seleção
              </Link>
            </div>
          )}
          <div className="pagination">
            <button
              className="button secondary small"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>{page}</span>
            <button
              className="button secondary small"
              disabled={orders.length < 20}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </section>
        <aside>
          <div className="panel">
            <h2>Meu perfil</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get("name");
                try {
                  await api(
                    "mutation($name:String!){updateProfile(name:$name)}",
                    { name },
                  );
                  await refresh();
                  notify("Perfil atualizado.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <label>
                Nome
                <input
                  name="name"
                  defaultValue={user.name}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <p className="subtle">{user.email}</p>
              <button className="button secondary small">Atualizar nome</button>
            </form>
          </div>
          <div className="panel">
            <h2>Meus endereços</h2>
            {addresses.map((a) => (
              <div className="subtle" key={a.id}>
                <strong>{a.recipient}</strong>
                <br />
                {a.street}, {a.number} {a.complement}
                <br />
                {a.district} · {a.city}/{a.state} · {a.postalCode}
                <div className="order-actions">
                  <button
                    className="text-link"
                    onClick={() => {
                      setEditingAddress(a);
                      setAddAddress(true);
                    }}
                  >
                    Editar endereço
                  </button>
                  <button
                    className="text-link"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Remover este endereço? Os pedidos existentes não serão alterados.",
                        )
                      )
                        return;
                      try {
                        await api("mutation($id:ID!){deleteAddress(id:$id)}", {
                          id: a.id,
                        });
                        await load();
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    Remover endereço
                  </button>
                </div>
              </div>
            ))}
            {addAddress ? (
              <AddressForm
                key={editingAddress?.id || "new"}
                address={editingAddress}
                onSaved={() => {
                  setAddAddress(false);
                  setEditingAddress(undefined);
                  load();
                }}
              />
            ) : (
              <button
                className="text-link"
                onClick={() => {
                  setEditingAddress(undefined);
                  setAddAddress(true);
                }}
              >
                Adicionar endereço +
              </button>
            )}
          </div>
          {user.role === "CUSTOMER" && (
            <div className="panel">
              <h2>Desativar conta</h2>
              <p className="subtle">
                Encerra todas as sessões e remove seus endereços salvos. O
                histórico de pedidos é preservado. Resolva os pedidos em aberto
                antes de continuar.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const password = new FormData(e.currentTarget).get(
                    "password",
                  );
                  if (
                    !window.confirm(
                      "Desativar sua conta e encerrar todos os acessos?",
                    )
                  )
                    return;
                  try {
                    await api(
                      "mutation($password:String!){deactivateAccount(password:$password)}",
                      { password },
                    );
                    await refresh();
                    notify("Conta desativada.");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <label>
                  Confirme sua senha
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
                <button className="button secondary small">
                  Desativar minha conta
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

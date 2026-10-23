"use client";
import { useState } from "react";
import { money } from "@/lib/defaults";
import { useShop } from "./shop-provider";
export type Order = {
  id: string;
  status: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  createdAt: string;
  expiresAt: string;
  checkoutUrl: string | null;
  trackingCode: string | null;
  items?: {
    productName: string;
    sku: string;
    quantity: number;
    unitPriceCents: number;
  }[];
  history?: { status: string; note: string; createdAt: string }[];
};
export const ORDER_FIELDS =
  "id status totalCents subtotalCents shippingCents createdAt expiresAt checkoutUrl trackingCode";
export const statusLabels: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  PAID: "Pagamento confirmado",
  PROCESSING: "Em preparo",
  SHIPPED: "Enviado",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  EXPIRED: "Reserva expirada",
  PAYMENT_REVIEW: "Pagamento em análise",
};
export function OrderCard({
  order,
  onChange,
}: {
  order: Order;
  onChange: () => void;
}) {
  const { api, notify } = useShop();
  const [detail, setDetail] = useState<Order | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <article className="order-card">
      <div>
        <div>
          <h3>Pedido #{order.id.slice(0, 8)}</h3>
          <p>
            {new Date(order.createdAt).toLocaleDateString("pt-BR")} ·{" "}
            {money(order.totalCents)}
          </p>
        </div>
        <span
          className={`badge ${["PENDING", "PAYMENT_REVIEW"].includes(order.status) ? "warning" : ""}`}
        >
          {statusLabels[order.status]}
        </span>
      </div>
      {order.trackingCode && (
        <p>
          Rastreio: <strong>{order.trackingCode}</strong>
        </p>
      )}
      <div className="order-actions">
        <button
          className="text-link"
          disabled={busy}
          onClick={async () => {
            if (detail) {
              setDetail(null);
              return;
            }
            setBusy(true);
            try {
              const r = await api<{ order: Order }>(
                `query($id:ID!){order(id:$id){${ORDER_FIELDS} items{productName sku quantity unitPriceCents} history{status note createdAt}}}`,
                { id: order.id },
              );
              setDetail(r.order);
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {detail ? "Fechar detalhes" : "Ver detalhes"}
        </button>
        {order.status === "PENDING" && (
          <>
            <button
              className="text-link"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("mutation($id:ID!){cancelOrder(id:$id)}", {
                    id: order.id,
                  });
                  setDetail(null);
                  onChange();
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancelar pedido
            </button>
            {order.checkoutUrl && new Date(order.expiresAt) > new Date() && (
              <a className="button small" href={order.checkoutUrl}>
                Ir ao pagamento
              </a>
            )}
          </>
        )}
      </div>
      {detail && (
        <div className="order-items">
          {detail.items?.map((item) => (
            <div className="summary-line" key={item.sku}>
              <span>
                {item.quantity}× {item.productName} <small>({item.sku})</small>
              </span>
              <span>{money(item.unitPriceCents * item.quantity)}</span>
            </div>
          ))}
          <div className="summary-line">
            <span>Entrega</span>
            <span>{money(detail.shippingCents)}</span>
          </div>
          <div className="timeline">
            {detail.history?.map((h, i) => (
              <p key={i}>
                <strong>{statusLabels[h.status]}</strong> ·{" "}
                {new Date(h.createdAt).toLocaleString("pt-BR")}
                <br />
                {h.note}
              </p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

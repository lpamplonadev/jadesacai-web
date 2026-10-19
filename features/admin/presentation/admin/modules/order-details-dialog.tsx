"use client";

import { PrinterIcon, XIcon } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  condimentPositions,
  cupSizes,
  extras,
  flavors,
  fruits,
  sauces,
  toppings,
} from "@/features/storefront/domain/acai-builder-data";
import {
  orderStatuses,
  type AdminOrder,
  type OrderItemPayload,
  type OrderPayload,
} from "@/features/admin/domain/orders";
import {
  formatOrderDate,
  formatOrderNumber,
} from "@/features/admin/application/order-formatting";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import { printOrderReceipt } from "@/features/admin/application/order-receipt";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function asOrderPayload(value: unknown): OrderPayload {
  return typeof value === "object" && value !== null
    ? (value as OrderPayload)
    : {};
}

function choiceName(
  choices: readonly { id: string; name: string }[],
  id?: string,
) {
  if (!id) return "Não selecionado";
  return (
    choices.find((choice) => choice.id === id)?.name ??
    "Item não encontrado no catálogo"
  );
}

function choiceNames(
  choices: readonly { id: string; name: string }[],
  ids: string[] | undefined,
) {
  if (!ids?.length) return "Nenhum";
  return ids.map((id) => choiceName(choices, id)).join(", ");
}

function OrderField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-bold text-[#77776e]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#33332d]">
        {children || "Não informado"}
      </dd>
    </div>
  );
}

export function OrderDetailsDialog({
  order,
  onClose,
  onStatusUpdated,
}: {
  order: AdminOrder;
  onClose: () => void;
  onStatusUpdated: (orderId: string, status: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState(order.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [catalogItems, setCatalogItems] = useState<
    { id: string; name: string }[]
  >([]);
  const [catalogCombos, setCatalogCombos] = useState<
    { id: string; name: string }[]
  >([]);
  const [catalogGourmets, setCatalogGourmets] = useState<
    { id: string; name: string }[]
  >([]);
  const payload = asOrderPayload(order.orderData);
  const delivery = payload.delivery;
  const payment = payload.payment;
  const choiceCatalog = [
    ...catalogItems,
    { id: "bottle-300", name: "300 ml" },
    { id: "bottle-500", name: "500 ml" },
    ...flavors,
    ...cupSizes,
    ...toppings,
    ...sauces,
    ...condimentPositions,
    ...fruits,
    ...extras,
  ];
  const orderItems: OrderItemPayload[] = payload.items?.length
    ? payload.items
    : payload.acai
      ? [
          {
            id: order.id,
            name:
              catalogCombos.find((combo) => combo.id === payload.acai?.comboId)
                ?.name ??
              catalogGourmets.find(
                (gourmet) =>
                  gourmet.id === payload.acai?.gourmetId ||
                  gourmet.id === payload.acai?.comboId,
              )
                ?.name ?? "Produto do cardápio",
            estimatedSubtotalCents: order.estimatedTotalCents,
            acai: payload.acai,
          },
        ]
      : [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const response = await requestAdminApi("/catalog", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const catalog = (await response.json()) as {
          items?: { id: string; name: string }[];
          combos?: { id: string; name: string }[];
          gourmets?: { id: string; name: string }[];
        };
        setCatalogItems(catalog.items ?? []);
        setCatalogCombos(catalog.combos ?? []);
        setCatalogGourmets(catalog.gourmets ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setCatalogItems([]);
          setCatalogGourmets([]);
        }
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, []);

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === order.status) return;

    setSaving(true);
    setError("");
    try {
      const response = await requestAdminApi(
        `/orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) throw new Error("Não foi possível atualizar a etapa.");
      onStatusUpdated(order.id, status);
    } catch {
      setError("Não foi possível salvar a etapa. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const paymentMethod =
    {
      pix: "Pix",
      cash: "Dinheiro",
      card: "Cartão na entrega",
    }[payment?.method ?? ""] ??
    payment?.method ??
    "Não informado";
  const changeFor = payment?.changeForCents;

  function printOrder() {
    const optional = (label: string, value: string) =>
      value === "Nenhum" || value === "Não selecionado" ? [] : [`${label}: ${value}`];
    const address = [
      [delivery?.street, delivery?.number].filter(Boolean).join(", "),
      delivery?.complement,
      delivery?.neighborhood,
      delivery?.postalCode ? `CEP ${delivery.postalCode}` : "",
      delivery?.reference ? `Ref.: ${delivery.reference}` : "",
    ].filter((line): line is string => Boolean(line));
    const deliveryFee = delivery?.deliveryFeeCents;

    printOrderReceipt({
      orderNumber: formatOrderNumber(order.orderNumber),
      dateTime: `${new Date(`${order.orderDate}T12:00:00`).toLocaleDateString("pt-BR")} ${new Date(
        order.createdAt,
      ).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })}`,
      customerName: payload.customer?.name ?? order.customerName,
      customerPhone: payload.customer?.phone ?? order.customerPhone,
      items: orderItems.map((item) => ({
        name: item.name,
        subtotal: currency.format(item.estimatedSubtotalCents / 100),
        details: [
          ...optional("Sabor", choiceName(choiceCatalog, item.acai.flavorId)),
          ...optional("Tam.", choiceName(choiceCatalog, item.acai.sizeId)),
          ...(item.acai.sauceId === "none"
            ? ["Sem calda"]
            : optional("Calda", choiceName(choiceCatalog, item.acai.sauceId))),
          ...optional("Acomp.", choiceNames(choiceCatalog, item.acai.toppingIds)),
          ...optional("Frutas", choiceNames(choiceCatalog, item.acai.fruitIds)),
          ...optional("Extras", choiceNames(choiceCatalog, item.acai.extraIds)),
        ],
      })),
      deliveryFee: deliveryFee ? currency.format(deliveryFee / 100) : undefined,
      total: currency.format(order.estimatedTotalCents / 100),
      payment: paymentMethod,
      change:
        payment?.needsChange && changeFor
          ? `Troco para ${currency.format(changeFor / 100)}`
          : undefined,
      address,
      notes: payload.notes,
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="order-details-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[min(90dvh,900px)] w-[min(900px,calc(100%-2rem))] overflow-y-auto rounded-lg border border-[#deded7] bg-[#fffdfb] p-0 text-[#292923] shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-5 border-b border-[#deded7] px-5 py-5 sm:px-7">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase text-[#8b1a2e]">
            Pedido {formatOrderNumber(order.orderNumber)}
          </p>
          <h2 id="order-details-title" className="mt-1 text-2xl font-black">
            {order.customerName}
          </h2>
          <p className="mt-1 text-sm text-[#77776e]">
            {formatOrderDate(order.orderDate)} ·{" "}
            {new Date(order.createdAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={printOrder}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#8b1a2e] px-3 text-sm font-bold text-[#8b1a2e] transition-colors hover:bg-[#fbf2f3]"
          >
            <PrinterIcon aria-hidden="true" size={18} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhes do pedido"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#68685f] transition-colors hover:bg-[#f3f3ef] hover:text-[#8b1a2e]"
          >
            <XIcon aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <section aria-labelledby="order-customer-title">
            <h3 id="order-customer-title" className="mb-3 text-sm font-black">
              Cliente
            </h3>
            <dl className="grid gap-3">
              <OrderField label="Nome">
                {payload.customer?.name ?? order.customerName}
              </OrderField>
              <OrderField label="WhatsApp">
                <a
                  className="underline decoration-[#c8c8bf] underline-offset-2"
                  href={`tel:${payload.customer?.phone ?? order.customerPhone}`}
                >
                  {payload.customer?.phone ?? order.customerPhone}
                </a>
              </OrderField>
            </dl>
          </section>

          <section aria-labelledby="order-acai-title">
            <h3 id="order-acai-title" className="mb-3 text-sm font-black">
              Itens do pedido · {orderItems.length}
            </h3>
            <div className="space-y-4">
              {orderItems.map((item, index) => (
                <article
                  key={item.id || index}
                  className="border-b border-[#e8e8e2] pb-4 last:border-0"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="text-sm font-extrabold text-[#8b1a2e]">
                      {index + 1}. {item.name}
                    </h4>
                    <span className="shrink-0 text-xs font-bold">
                      {currency.format(item.estimatedSubtotalCents / 100)}
                    </span>
                  </div>
                  {item.description && (
                    <ul className="mb-3 flex flex-wrap gap-1.5">
                      {item.description.split(" · ").map((detail) => (
                        <li
                          key={detail}
                          className="rounded bg-[#f3f3ef] px-2 py-1 text-[11px] font-medium text-[#55554e]"
                        >
                          {detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <OrderField label="Sabor">
                      {choiceName(choiceCatalog, item.acai.flavorId)}
                    </OrderField>
                    <OrderField label="Tamanho">
                      {choiceName(choiceCatalog, item.acai.sizeId)}
                    </OrderField>
                    <OrderField label="Calda">
                      {item.acai.sauceId === "none"
                        ? "Sem calda"
                        : choiceName(choiceCatalog, item.acai.sauceId)}
                    </OrderField>
                    <OrderField label="Posição dos condimentos">
                      {choiceName(choiceCatalog, item.acai.condimentPositionId)}
                    </OrderField>
                    <OrderField label="Acompanhamentos">
                      {choiceNames(choiceCatalog, item.acai.toppingIds)}
                    </OrderField>
                    <OrderField label="Frutas">
                      {choiceNames(choiceCatalog, item.acai.fruitIds)}
                    </OrderField>
                    <OrderField label="Extras">
                      {choiceNames(choiceCatalog, item.acai.extraIds)}
                    </OrderField>
                  </dl>
                </article>
              ))}
              {!orderItems.length && (
                <p className="text-sm text-[#77776e]">
                  Detalhes dos itens indisponíveis.
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="order-delivery-title">
            <h3 id="order-delivery-title" className="mb-3 text-sm font-black">
              Entrega
            </h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              <OrderField label="Endereço">
                {[delivery?.street, delivery?.number]
                  .filter(Boolean)
                  .join(", ")}
              </OrderField>
              <OrderField label="Bairro">{delivery?.neighborhood}</OrderField>
              <OrderField label="CEP">{delivery?.postalCode}</OrderField>
              <OrderField label="Complemento">
                {delivery?.complement}
              </OrderField>
              <OrderField label="Referência">{delivery?.reference}</OrderField>
            </dl>
          </section>

          <section aria-labelledby="order-payment-title">
            <h3 id="order-payment-title" className="mb-3 text-sm font-black">
              Pagamento
            </h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              <OrderField label="Forma">{paymentMethod}</OrderField>
              <OrderField label="Troco">
                {payment?.needsChange && changeFor
                  ? `Para ${currency.format(changeFor / 100)}`
                  : "Não precisa"}
              </OrderField>
              <OrderField label="Total estimado">
                {currency.format(order.estimatedTotalCents / 100)}
              </OrderField>
            </dl>
          </section>
        </div>

        <section
          aria-labelledby="order-notes-title"
          className="border-t border-[#e8e8e2] pt-5"
        >
          <h3 id="order-notes-title" className="mb-2 text-sm font-black">
            Observações
          </h3>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#55554d]">
            {payload.notes || "Nenhuma observação informada."}
          </p>
        </section>

        <form onSubmit={saveStatus} className="border-t border-[#e8e8e2] pt-5">
          <label
            htmlFor="order-next-status"
            className="mb-2 block text-sm font-black"
          >
            Etapa do pedido
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              id="order-next-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={saving}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm outline-none focus:border-[#8b1a2e]"
            >
              {orderStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || status === order.status}
              className="min-h-11 rounded-md bg-[#8b1a2e] px-5 text-sm font-extrabold text-white transition-colors hover:bg-[#6b1222] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar etapa"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}
        </form>
      </div>
    </dialog>
  );
}

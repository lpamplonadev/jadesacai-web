import {
  condimentPositions,
  cupSizes,
  extras,
  flavors,
  fruits,
  sauces,
  toppings,
} from "@/features/storefront/domain/acai-builder-data";
import type {
  AdminOrder,
  OrderItemPayload,
  OrderPayload,
} from "@/features/admin/domain/orders";
import { formatOrderNumber } from "@/features/admin/application/order-formatting";
import type { OrderReceipt } from "@/features/admin/application/order-receipt";

type Named = { id: string; name: string };

export type OrderCatalogNames = {
  items: Named[];
  combos: Named[];
  gourmets: Named[];
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function asOrderPayload(value: unknown): OrderPayload {
  return typeof value === "object" && value !== null
    ? (value as OrderPayload)
    : {};
}

export function choiceName(choices: readonly Named[], id?: string) {
  if (!id) return "Não selecionado";
  return (
    choices.find((choice) => choice.id === id)?.name ??
    "Item não encontrado no catálogo"
  );
}

export function choiceNames(choices: readonly Named[], ids: string[] | undefined) {
  if (!ids?.length) return "Nenhum";
  return ids.map((id) => choiceName(choices, id)).join(", ");
}

export function buildChoiceCatalog(catalogItems: Named[]): Named[] {
  return [
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
}

export function resolveOrderItems(
  order: AdminOrder,
  payload: OrderPayload,
  combos: Named[],
  gourmets: Named[],
): OrderItemPayload[] {
  if (payload.items?.length) return payload.items;
  if (!payload.acai) return [];
  const acai = payload.acai;
  return [
    {
      id: order.id,
      name:
        combos.find((combo) => combo.id === acai.comboId)?.name ??
        gourmets.find(
          (gourmet) =>
            gourmet.id === acai.gourmetId || gourmet.id === acai.comboId,
        )?.name ??
        "Produto do cardápio",
      estimatedSubtotalCents: order.estimatedTotalCents,
      acai,
    },
  ];
}

export function paymentMethodName(method?: string) {
  return (
    { pix: "Pix", cash: "Dinheiro", card: "Cartão na entrega" }[method ?? ""] ??
    method ??
    "Não informado"
  );
}

export function buildOrderReceipt(
  order: AdminOrder,
  catalog: OrderCatalogNames,
): OrderReceipt {
  const payload = asOrderPayload(order.orderData);
  const delivery = payload.delivery;
  const payment = payload.payment;
  const choices = buildChoiceCatalog(catalog.items);
  const orderItems = resolveOrderItems(
    order,
    payload,
    catalog.combos,
    catalog.gourmets,
  );

  const optional = (label: string, value: string) =>
    value === "Nenhum" || value === "Não selecionado" ? [] : [`${label}: ${value}`];
  const list = (label: string, ids: string[] | undefined) =>
    ids?.length
      ? [`${label}:`, ...ids.map((id) => `º ${choiceName(choices, id)}`)]
      : [];
  const address = [
    [delivery?.street, delivery?.number].filter(Boolean).join(", "),
    delivery?.complement,
    delivery?.neighborhood,
    delivery?.postalCode ? `CEP ${delivery.postalCode}` : "",
    delivery?.reference ? `Ref.: ${delivery.reference}` : "",
  ].filter((line): line is string => Boolean(line));
  const deliveryFee = delivery?.deliveryFeeCents;
  const changeFor = payment?.changeForCents;

  return {
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
        ...optional("Sabor", choiceName(choices, item.acai.flavorId)),
        ...optional("Tam.", choiceName(choices, item.acai.sizeId)),
        ...(item.acai.sauceId === "none"
          ? ["Sem calda"]
          : optional("Calda", choiceName(choices, item.acai.sauceId))),
        ...list("Acomp.", item.acai.toppingIds),
        ...list("Frutas", item.acai.fruitIds),
        ...list("Extras", item.acai.extraIds),
      ],
    })),
    deliveryFee: deliveryFee ? currency.format(deliveryFee / 100) : undefined,
    total: currency.format(order.estimatedTotalCents / 100),
    payment: paymentMethodName(payment?.method),
    change:
      payment?.needsChange && changeFor
        ? `Troco para ${currency.format(changeFor / 100)}`
        : undefined,
    address,
    notes: payload.notes,
  };
}

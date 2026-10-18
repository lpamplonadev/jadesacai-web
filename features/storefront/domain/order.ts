export const brazilianAreaCodes = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
] as const;

export const brazilianMobilePhonePattern = `\\((${brazilianAreaCodes.join("|")})\\) 9[0-9]{4}-[0-9]{4}`;

export function formatBrazilianMobilePhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;

  const subscriber = digits.slice(2);
  return `(${digits.slice(0, 2)}) ${subscriber.slice(0, 5)}${
    subscriber.length > 5 ? `-${subscriber.slice(5)}` : ""
  }`;
}

export type OrderAcaiConfiguration = {
  flavorId: string;
  sizeId: string;
  comboId: string;
  gourmetId: string;
  bottleId: string;
  toppingIds: string[];
  sauceId: string;
  condimentPositionId: string;
  fruitIds: string[];
  extraIds: string[];
};

export type CreateOrderLine = {
  id: string;
  name: string;
  description: string;
  acai: OrderAcaiConfiguration;
  estimatedSubtotalCents: number;
};

export type CreateOrderRequest = {
  customer: { name: string; phone: string };
  acai: OrderAcaiConfiguration;
  items: CreateOrderLine[];
  delivery: {
    postalCode: string;
    street: string;
    number: string;
    neighborhood: string;
    complement: string;
    reference: string;
  };
  payment: {
    method: "pix" | "cash" | "card";
    needsChange: boolean;
    changeForCents: number;
  };
  notes: string;
  estimatedTotalCents: number;
};

export type CreateOrderResponse = {
  status: string;
  persisted: boolean;
  orderId: string;
  orderNumber: number;
  orderDate: string;
  deliveryZoneName: string;
  deliveryFeeCents: number;
  estimatedTotalCents: number;
};

export type OrderStatus =
  | "received"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "completed";

export type OrderTracking = {
  orderNumber: number;
  orderDate: string;
  status: OrderStatus;
  createdAt: string;
};

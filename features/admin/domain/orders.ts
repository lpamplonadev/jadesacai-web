export type AdminOrder = {
  id: string;
  orderNumber: number;
  orderDate: string;
  status: string;
  customerName: string;
  customerPhone: string;
  estimatedTotalCents: number;
  orderData: unknown;
  createdAt: string;
};

export type OrderAcaiPayload = {
  flavorId?: string;
  sizeId?: string;
  comboId?: string;
  gourmetId?: string;
  toppingIds?: string[];
  sauceId?: string;
  condimentPositionId?: string;
  fruitIds?: string[];
  extraIds?: string[];
};

export type OrderItemPayload = {
  id: string;
  name: string;
  description?: string;
  estimatedSubtotalCents: number;
  acai: OrderAcaiPayload;
};

export type OrderPayload = {
  customer?: { name?: string; phone?: string };
  acai?: OrderAcaiPayload;
  items?: OrderItemPayload[];
  delivery?: {
    postalCode?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
    reference?: string;
    deliveryFeeCents?: number;
  };
  payment?: {
    method?: string;
    needsChange?: boolean;
    changeForCents?: number;
  };
  notes?: string;
};

export const orderStatuses = [
  { value: "received", label: "Recebido" },
  { value: "preparing", label: "Preparando" },
  { value: "ready", label: "Pronto" },
  { value: "out_for_delivery", label: "Saiu para entrega" },
  { value: "delivered", label: "Entregue" },
  { value: "completed", label: "Concluído" },
] as const;

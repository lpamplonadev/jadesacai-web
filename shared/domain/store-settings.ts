export const storeWeekdays = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

export type StoreWeekday = (typeof storeWeekdays)[number]["key"];

export type OperatingHours = {
  enabled: boolean;
  opensAt: string;
  closesAt: string;
};

export type DeliveryZone = {
  name: string;
  neighborhoods: string[];
  feeCents: number;
  enabled: boolean;
};

export type BottleExtraSetting = {
  key: "leite-condensado" | "doce-de-leite" | "creme-de-avela";
  name: string;
  priceCents: number;
  enabled: boolean;
};

export type BottleProductSetting = {
  id: string;
  name: string;
  enabled: boolean;
  price300Cents: number;
  price500Cents: number;
};

export type BottleCatalogSettings = {
  enabled: boolean;
  price300Cents: number;
  price500Cents: number;
  bottles: BottleProductSetting[];
  extras: BottleExtraSetting[];
};

export type StoreSettings = {
  weeklyHours: Record<StoreWeekday, OperatingHours>;
  story: {
    title: string;
    body: string;
  };
  whatsAppNumber: string;
  manualOverride: boolean | null;
  deliveryOriginAddress: string;
  deliveryZones: DeliveryZone[];
  bottleCatalog: BottleCatalogSettings;
};

export type StoreStatus = {
  isOpen: boolean;
  manualOverride: boolean | null;
  timeZone: string;
  settings: StoreSettings;
};

export const defaultStoreSettings: StoreSettings = {
  weeklyHours: {
    monday: { enabled: false, opensAt: "", closesAt: "" },
    tuesday: { enabled: true, opensAt: "19:00", closesAt: "23:00" },
    wednesday: { enabled: true, opensAt: "19:00", closesAt: "23:00" },
    thursday: { enabled: true, opensAt: "19:00", closesAt: "23:00" },
    friday: { enabled: true, opensAt: "19:00", closesAt: "23:00" },
    saturday: { enabled: true, opensAt: "17:00", closesAt: "23:00" },
    sunday: { enabled: true, opensAt: "17:00", closesAt: "23:00" },
  },
  story: {
    title: "Um intervalo gostoso muda o dia.",
    body: "Açaí de verdade, feito com carinho em cada pedido.",
  },
  whatsAppNumber: "5521990174473",
  manualOverride: null,
  deliveryOriginAddress: "Rua Nepomuceno, 12, Realengo, Rio de Janeiro - RJ",
  deliveryZones: [],
  bottleCatalog: {
    enabled: false,
    price300Cents: 0,
    price500Cents: 0,
    bottles: [],
    extras: [
      {
        key: "leite-condensado",
        name: "Leite condensado",
        priceCents: 0,
        enabled: false,
      },
      {
        key: "doce-de-leite",
        name: "Doce de leite",
        priceCents: 0,
        enabled: false,
      },
      {
        key: "creme-de-avela",
        name: "Creme de avelã",
        priceCents: 0,
        enabled: false,
      },
    ],
  },
};

export function findDeliveryZone(
  deliveryZones: DeliveryZone[],
  neighborhood: string,
) {
  const normalizedNeighborhood = normalizeNeighborhood(neighborhood);
  if (!normalizedNeighborhood) return null;

  return (
    deliveryZones.find(
      (zone) =>
        zone.enabled &&
        zone.neighborhoods.some(
          (candidate) =>
            normalizeNeighborhood(candidate) === normalizedNeighborhood,
        ),
    ) ?? null
  );
}

function normalizeNeighborhood(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

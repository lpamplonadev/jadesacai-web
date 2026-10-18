export type Product = {
  name: string;
  description: string;
  size: string;
  price: string;
  tag: string;
  image: string;
  imageAlt: string;
};

export type MenuComboItem = {
  id: string;
  kind: string;
  name: string;
  quantity: number;
};

export type MenuGourmetSize = {
  sizeId: string;
  size: string;
  priceCents: number;
};

export type MenuCombo = {
  id: string;
  key?: string;
  sizeId?: string;
  name: string;
  size: string;
  price: string;
  priceCents: number;
  includedToppings: number;
  includedFruits: number;
  includedExtras: number;
  tag: string;
  image: string;
  imageAlt: string;
  items?: MenuComboItem[];
};

export type MenuGourmet = {
  id: string;
  key: string;
  name: string;
  description: string;
  tag: string;
  image: string;
  imageAlt: string;
  items: MenuComboItem[];
  sizes: MenuGourmetSize[];
};

export type MenuOrderProduct = {
  type: "custom" | "combo" | "gourmet" | "bottle";
  id: string;
  name: string;
  sizeId: string;
  size: string;
  priceCents: number;
  includedToppings: number;
  includedFruits: number;
  includedExtras: number;
  tag: string;
  image: string;
  imageAlt: string;
  description?: string;
  items: MenuComboItem[];
};

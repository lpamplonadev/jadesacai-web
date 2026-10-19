import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { BuilderCatalogData } from "@/features/storefront/domain/acai-builder-data";
import type { BottleCatalogSettings } from "@/shared/domain/store-settings";
import type {
  MenuCombo,
  MenuGourmet,
  MenuGourmetSize,
  MenuOrderProduct,
  Product,
} from "@/features/storefront/domain/menu-types";

type ProductCatalogProps = {
  catalog: BuilderCatalogData;
  bottleCatalog: BottleCatalogSettings;
  combos: MenuCombo[];
  gourmets: MenuGourmet[];
  products: Product[];
  storeIsOpen: boolean;
  onChooseProduct: (product: MenuOrderProduct) => void;
  apiStatus: "checking" | "online" | "offline";
  catalogError: boolean;
};

type ProductCategory = "all" | "custom" | "combo" | "gourmet" | "bottle";
type SortOrder = "featured" | "price-asc" | "price-desc";

type CatalogProduct = {
  id: string;
  type: "custom" | "combo" | "gourmet" | "bottle";
  name: string;
  description: string;
  details: string;
  highlights: string[];
  price: number;
  pricePrefix?: string;
  gourmetSizes?: MenuGourmetSize[];
  bottleSizes?: MenuGourmetSize[];
  tag: string;
  image: string;
  imageAlt: string;
  rank: number;
  choose: (sizeId?: string) => void;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const filterInputClassName =
  "min-h-10 w-full rounded-md border border-blush bg-white px-3 text-sm text-text outline-none focus:border-crimson";

export function ProductCatalog({
  catalog,
  bottleCatalog,
  combos,
  gourmets,
  products,
  storeIsOpen,
  onChooseProduct,
  apiStatus,
  catalogError,
}: ProductCatalogProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [promotionsOnly, setPromotionsOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("featured");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [selectedGourmetSizeId, setSelectedGourmetSizeId] = useState("");
  const detailsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = detailsDialogRef.current;
    if (!dialog) return;
    if (selectedProduct && !dialog.open) dialog.showModal();
    if (!selectedProduct && dialog.open) dialog.close();
  }, [selectedProduct]);

  const apiStatusText = {
    checking: "Conectando à API",
    online: "Cardápio atualizado",
    offline: "API indisponível",
  }[apiStatus];
  const configuredBottles = bottleCatalog.bottles?.length
    ? bottleCatalog.bottles
    : bottleCatalog.enabled || bottleCatalog.price300Cents || bottleCatalog.price500Cents
      ? [{
          id: "bottle-acai",
          name: "Açaí na Garrafa",
          imageUrl: "",
          imageAlt: "",
          enabled: bottleCatalog.enabled,
          available300: bottleCatalog.price300Cents > 0,
          available500: bottleCatalog.price500Cents > 0,
          price300Cents: bottleCatalog.price300Cents,
          price500Cents: bottleCatalog.price500Cents,
          extras: bottleCatalog.extras,
        }]
      : [];
  const bottleProducts: CatalogProduct[] = configuredBottles.flatMap(
    (bottle, index) => {
      if (!bottle.enabled) return [];
      const bottleExtras = (bottle.extras?.length
        ? bottle.extras
        : bottleCatalog.extras
      ).filter((extra) => extra.enabled);
      const bottleSizes: MenuGourmetSize[] = [
        {
          sizeId: catalog.cupSizes.find((size) => size.name === "300 ml")?.id ?? "",
          size: "300 ml",
          priceCents: bottle.available300 ? bottle.price300Cents : 0,
        },
        {
          sizeId: catalog.cupSizes.find((size) => size.name === "500 ml")?.id ?? "",
          size: "500 ml",
          priceCents: bottle.available500 ? bottle.price500Cents : 0,
        },
      ].filter((size) => size.sizeId && size.priceCents > 0);
      if (!bottleSizes.length) return [];
      return [{
        id: bottle.id,
        type: "bottle" as const,
        name: bottle.name,
        description: "Escolha o sabor e adicione calda ou extras, se quiser.",
        details:
          "Escolha açaí de banana ou morango. Caldas e extras são opcionais; a garrafa não leva acompanhamentos ou frutas adicionais.",
        highlights: [
          "Açaí de banana ou morango",
          "Caldas opcionais",
          ...(bottleExtras.length
            ? [`Extras opcionais: ${bottleExtras.map((extra) => extra.name).join(", ")}`]
            : ["Sem extras disponíveis no momento"]),
        ],
        price: Math.min(...bottleSizes.map((size) => size.priceCents)) / 100,
        pricePrefix: "A partir de",
        bottleSizes,
        tag: "Açaí na Garrafa",
        image: bottle.imageUrl || products[0]?.image || "",
        imageAlt: bottle.imageAlt || bottle.name,
        rank: combos.length + gourmets.length + index,
        choose: (sizeId?: string) => {
          const size = bottleSizes.find((option) => option.sizeId === sizeId);
          if (!size) return;
          onChooseProduct({
            type: "bottle",
            id: bottle.id,
            name: bottle.name,
            sizeId: size.sizeId,
            size: size.size,
            priceCents: size.priceCents,
            includedToppings: 0,
            includedFruits: 0,
            includedExtras: 0,
            tag: "Açaí na Garrafa",
            image: bottle.imageUrl || products[0]?.image || "",
            imageAlt: bottle.imageAlt || bottle.name,
            description: bottle.name,
            items: [
              { id: size.sizeId, kind: "size", name: size.size, quantity: 1 },
            ],
          });
        },
      }];
    },
  );

  const productsToShow: CatalogProduct[] = [
    ...catalog.cupSizes.map((size, index) => {
      const image = products[index % products.length];
      return {
        id: `custom-${size.id}`,
        type: "custom" as const,
        name: `Açaí ${size.name}`,
        description:
          size.description?.trim() ||
          "Escolha o sabor e monte os complementos do seu jeito.",
        details:
          size.description?.trim() ||
          `Monte seu açaí de ${size.name} com o sabor e os complementos que preferir. As opções e preços aparecem antes de adicionar ao pedido.`,
        highlights: [
          `Tamanho ${size.name}`,
          `${catalog.includedToppings} acompanhamentos incluídos`,
          `${catalog.includedFruits} ${catalog.includedFruits === 1 ? "fruta incluída" : "frutas incluídas"}`,
          "Ingredientes escolhidos por você",
        ],
        price: size.price,
        tag: "Monte do seu jeito",
        image: size.image || image?.image || "",
        imageAlt: size.imageAlt || image?.imageAlt || size.name,
        rank: index,
        choose: () =>
          onChooseProduct({
            type: "custom",
            id: `custom-${size.id}`,
            name: `Açaí ${size.name}`,
            sizeId: size.id,
            size: size.name,
            priceCents: Math.round(size.price * 100),
            includedToppings: catalog.includedToppings,
            includedFruits: catalog.includedFruits,
            includedExtras: 0,
            tag: "Monte do seu jeito",
            image: size.image || image?.image || "",
            imageAlt: size.imageAlt || image?.imageAlt || size.name,
            items: [
              { id: size.id, kind: "size", name: size.name, quantity: 1 },
            ],
          }),
      };
    }),
    ...combos.map((combo, index) => ({
      id: `combo-${combo.id}`,
      type: "combo" as const,
      name: combo.name,
      description: [
        (combo.items ?? [])
          .filter((item) => item.kind === "size")
          .map((item) => `${item.quantity} × ${item.name}`)
          .join(" + "),
        `${combo.includedToppings} ${combo.includedToppings === 1 ? "acompanhamento" : "acompanhamentos"}`,
        ...(combo.includedFruits > 0
          ? [`${combo.includedFruits} ${combo.includedFruits === 1 ? "fruta" : "frutas"}`]
          : []),
        ...(combo.includedExtras > 0
          ? [`${combo.includedExtras} ${combo.includedExtras === 1 ? "extra incluído" : "extras incluídos"}`]
          : []),
      ].filter(Boolean).join(" · "),
      details: `${combo.name} reúne uma combinação caprichada de tamanhos e complementos para aproveitar seu açaí com praticidade. Personalize o sabor de cada porção no configurador; as inclusões do combo já aparecem por lá.`,
      highlights: [
        ...(combo.items ?? []).map((item) => `${item.quantity} × ${item.name}`),
        `${combo.includedToppings} ${combo.includedToppings === 1 ? "acompanhamento incluído" : "acompanhamentos incluídos"}`,
        combo.includedFruits > 0
          ? `${combo.includedFruits} ${combo.includedFruits === 1 ? "fruta incluída" : "frutas incluídas"}`
          : "Frutas disponíveis para personalizar",
        combo.includedExtras > 0
          ? `${combo.includedExtras} ${combo.includedExtras === 1 ? "extra incluído" : "extras incluídos"}`
          : "Extras disponíveis para personalizar",
      ],
      price: combo.priceCents / 100,
      tag: combo.tag || "Combo",
      image: combo.image,
      imageAlt: combo.imageAlt,
      rank: index,
      choose: () =>
        onChooseProduct({
          type: "combo",
          id: combo.id,
          name: combo.name,
          sizeId: combo.sizeId ?? "",
          size: combo.size,
          priceCents: combo.priceCents,
          includedToppings: combo.includedToppings,
          includedFruits: combo.includedFruits,
          includedExtras: combo.includedExtras,
          tag: combo.tag,
          image: combo.image,
          imageAlt: combo.imageAlt,
          items: combo.items ?? [],
        }),
    })),
    ...gourmets.map((gourmet, index) => ({
      id: `gourmet-${gourmet.id}`,
      type: "gourmet" as const,
      name: gourmet.name,
      description: gourmet.description,
      details: gourmet.description,
      highlights: gourmet.items.map((item) => `${item.quantity} × ${item.name}`),
      price: gourmet.sizes.length
        ? Math.min(...gourmet.sizes.map((size) => size.priceCents)) / 100
        : 0,
      pricePrefix: "A partir de",
      gourmetSizes: gourmet.sizes,
      tag: gourmet.tag || "Receita da casa",
      image: gourmet.image,
      imageAlt: gourmet.imageAlt,
      rank: combos.length + index,
      choose: (sizeId?: string) => {
        const size = gourmet.sizes.find((option) => option.sizeId === sizeId);
        if (!size) return;
        onChooseProduct({
          type: "gourmet",
          id: gourmet.id,
          name: gourmet.name,
          sizeId: size.sizeId,
          size: size.size,
          priceCents: size.priceCents,
          includedToppings: 0,
          includedFruits: 0,
          includedExtras: 0,
          tag: gourmet.tag,
          image: gourmet.image,
          imageAlt: gourmet.imageAlt,
          description: gourmet.description,
          items: [
            ...gourmet.items,
            { id: size.sizeId, kind: "size", name: size.size, quantity: 1 },
          ],
        });
      },
    })),
    ...bottleProducts,
  ];

  function customizeSelectedProduct() {
    if (!selectedProduct) return;
    const choose = selectedProduct.choose;
    setSelectedProduct(null);
    choose(
      selectedProduct.type === "gourmet" || selectedProduct.type === "bottle"
        ? selectedGourmetSizeId
        : undefined,
    );
  }

  function openProduct(product: CatalogProduct) {
    setSelectedGourmetSizeId(
      product.gourmetSizes?.[0]?.sizeId ?? product.bottleSizes?.[0]?.sizeId ?? "",
    );
    setSelectedProduct(product);
  }

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const lowerPrice = minPrice === "" ? null : Number(minPrice);
  const upperPrice = maxPrice === "" ? null : Number(maxPrice);
  const filteredProducts = productsToShow.filter((product) => {
    if (category !== "all" && product.type !== category) return false;
    if (promotionsOnly && product.type !== "combo") return false;
    if (lowerPrice !== null && product.price < lowerPrice) return false;
    if (upperPrice !== null && product.price > upperPrice) return false;
    return (
      !query ||
      `${product.name} ${product.description} ${product.tag}`
        .toLocaleLowerCase("pt-BR")
        .includes(query)
    );
  });

  const sortedProducts = [...filteredProducts].sort((left, right) => {
    if (sortOrder === "price-asc") return left.price - right.price;
    if (sortOrder === "price-desc") return right.price - left.price;
    return left.rank - right.rank;
  });
  const selectedProductSizes =
    selectedProduct?.type === "gourmet"
      ? selectedProduct.gourmetSizes
      : selectedProduct?.type === "bottle"
        ? selectedProduct.bottleSizes
        : undefined;
  const selectedSize = selectedProductSizes?.find(
    (size) => size.sizeId === selectedGourmetSizeId,
  );
  const selectedProductPrice = selectedSize
    ? selectedSize.priceCents / 100
    : (selectedProduct?.price ?? 0);

  return (
    <section
      id="catalogo"
      className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-blush/80 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-crimson">
            Cardápio Jade
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-crimson sm:text-4xl">
            Escolha o seu açaí
          </h2>
        </div>
        <p
          role="status"
          className={`text-xs font-bold ${apiStatus === "online" ? "text-green-800" : "text-crimson/75"}`}
        >
          {catalogError ? "Cardápio indisponível" : apiStatusText}
        </p>
      </div>

      <div className="grid gap-8 pt-7 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside
          aria-label="Filtros do cardápio"
          className="space-y-7 lg:border-r lg:border-blush/80 lg:pr-7"
        >
          <fieldset>
            <legend className="mb-3 text-sm font-extrabold text-text">
              Categorias
            </legend>
            <div className="space-y-2">
              {(
                [
                  ["all", "Todos os produtos"],
                  ["custom", "Monte o seu"],
                  ["combo", "Combos"],
                  ["gourmet", "Gourmet"],
                  ["bottle", "Açaí na Garrafa"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-text"
                >
                  <input
                    type="radio"
                    name="catalog-category"
                    value={value}
                    checked={category === value}
                    onChange={() => setCategory(value)}
                    className="h-4 w-4 accent-crimson"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-extrabold text-text">
              Faixa de preço
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs font-semibold text-crimson">
                Mínimo
                <input
                  aria-label="Preço mínimo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  placeholder="R$ 0"
                  className={filterInputClassName}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-crimson">
                Máximo
                <input
                  aria-label="Preço máximo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="Sem limite"
                  className={filterInputClassName}
                />
              </label>
            </div>
          </fieldset>

          <label className="flex min-h-10 cursor-pointer items-center gap-2 border-t border-blush/70 pt-4 text-sm font-semibold text-text">
            <input
              type="checkbox"
              checked={promotionsOnly}
              onChange={(event) => setPromotionsOnly(event.target.checked)}
              className="h-4 w-4 accent-crimson"
            />
            Combos em destaque
          </label>
        </aside>

        <div className="min-w-0">
          <label className="relative block">
            <span className="sr-only">Buscar no cardápio</span>
            <MagnifyingGlassIcon
              aria-hidden="true"
              size={19}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-crimson"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por produto ou tamanho"
              className="min-h-12 w-full rounded-md border border-blush bg-white pl-10 pr-4 text-sm text-text outline-none placeholder:text-muted-foreground focus:border-crimson"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 py-5">
            <p aria-live="polite" className="text-sm text-crimson">
              {sortedProducts.length}{" "}
              {sortedProducts.length === 1 ? "produto" : "produtos"}
            </p>
            <label className="flex items-center gap-2 text-xs font-semibold text-crimson">
              Ordenar por
              <select
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(event.target.value as SortOrder)
                }
                className="min-h-10 rounded-md border border-blush bg-white px-3 text-sm text-text outline-none focus:border-crimson"
              >
                <option value="featured">Relevância</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
              </select>
            </label>
          </div>

          {sortedProducts.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {sortedProducts.map((product) => (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-md border border-blush/70 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => openProduct(product)}
                    aria-label={`Ver detalhes de ${product.name}`}
                    className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-crimson"
                  >
                    <div className="relative h-24 overflow-hidden bg-petal sm:h-48">
                      {product.image && (
                        <>
                          <Image
                            src={product.image}
                            alt=""
                            aria-hidden="true"
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="scale-110 object-cover opacity-75 blur-lg"
                          />
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-cream/10"
                          />
                          <Image
                            src={product.image}
                            alt={product.imageAlt}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="z-10 object-contain transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                          />
                        </>
                      )}
                      <span className="absolute left-2 top-2 z-20 hidden rounded-full bg-cream/95 px-3 py-1 text-[11px] font-bold text-crimson sm:left-3 sm:top-3 sm:inline">
                        {product.tag}
                      </span>
                    </div>
                    <div className="p-2 sm:p-4">
                      <p className="hidden text-[11px] font-extrabold uppercase text-crimson sm:block">
                        {product.type === "custom"
                          ? "Monte o seu"
                          : product.type === "gourmet"
                            ? "Gourmet"
                            : product.type === "bottle"
                              ? "Açaí na Garrafa"
                              : "Combo"}
                      </p>
                      <h3 className="line-clamp-2 min-h-8 text-xs font-bold leading-4 text-text sm:mt-1 sm:min-h-12 sm:text-base sm:leading-normal">
                        {product.name}
                      </h3>
                      <p className="line-clamp-2 min-h-8 text-[10px] leading-4 text-crimson/75 sm:min-h-10 sm:text-sm sm:leading-5">
                        {product.description}
                      </p>
                      <div className="mt-2 flex flex-col items-start justify-between gap-2 border-t border-petal pt-2 sm:mt-4 sm:flex-row sm:items-center sm:gap-3 sm:pt-3">
                        <span className="text-sm font-extrabold leading-tight text-crimson sm:text-lg">
                          {product.pricePrefix && (
                            <span className="block text-[8px] font-bold uppercase tracking-wide sm:text-[10px]">
                              {product.pricePrefix}
                            </span>
                          )}
                          {currency.format(product.price)}
                        </span>
                        <span className="inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-md bg-crimson px-1.5 text-[10px] font-bold text-white transition-colors group-hover:bg-dark sm:min-h-10 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs">
                          <span className="sm:hidden">Ver mais</span>
                          <span className="hidden sm:inline">Ver detalhes</span>
                          <ArrowRightIcon aria-hidden="true" size={14} className="hidden sm:inline" />
                        </span>
                      </div>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="border-y border-blush/70 py-16 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado com esses filtros.
            </p>
          )}

          <dialog
            ref={detailsDialogRef}
            aria-labelledby="catalog-product-title"
            onCancel={(event) => {
              event.preventDefault();
              setSelectedProduct(null);
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedProduct(null);
              }
            }}
            className="m-auto max-h-[90dvh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto rounded-md border border-blush bg-cream p-0 text-text shadow-2xl backdrop:bg-text/60"
          >
            {selectedProduct && (
              <div className="grid md:grid-cols-2">
                <div className="relative min-h-64 bg-petal md:min-h-[30rem]">
                  {selectedProduct.image && (
                    <Image
                      src={selectedProduct.image}
                      alt={selectedProduct.imageAlt}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain p-5"
                    />
                  )}
                </div>
                <div className="p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-xs font-extrabold uppercase text-crimson">
                      {selectedProduct.type === "custom"
                        ? "Monte o seu"
                        : selectedProduct.type === "gourmet"
                          ? "Gourmet"
                          : selectedProduct.type === "bottle"
                            ? "Açaí na Garrafa"
                            : selectedProduct.tag || "Combo"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      aria-label="Fechar detalhes do produto"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-blush text-crimson transition-colors hover:bg-petal"
                    >
                      <XIcon aria-hidden="true" size={19} />
                    </button>
                  </div>
                  <h2
                    id="catalog-product-title"
                    className="mt-3 text-2xl font-black text-crimson sm:text-3xl"
                  >
                    {selectedProduct.name}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-text/80">
                    {selectedProduct.details}
                  </p>
                  {selectedProductSizes && (
                      <fieldset className="mt-5 space-y-2">
                        <legend className="text-sm font-extrabold text-crimson">
                          Escolha o tamanho
                        </legend>
                        <div className="flex flex-wrap gap-2" role="group">
                          {selectedProductSizes.map((size) => (
                            <button
                              key={size.sizeId}
                              type="button"
                              aria-pressed={selectedGourmetSizeId === size.sizeId}
                              onClick={() => setSelectedGourmetSizeId(size.sizeId)}
                              className={`min-h-10 rounded-md border px-3 text-xs font-bold ${selectedGourmetSizeId === size.sizeId ? "border-crimson bg-crimson text-white" : "border-blush bg-white text-crimson hover:border-coral"}`}
                            >
                              {size.size} · {currency.format(size.priceCents / 100)}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  <ul className="mt-5 space-y-2 border-y border-blush/80 py-4 text-sm text-crimson">
                    {selectedProduct.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="font-black text-coral"
                        >
                          •
                        </span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-crimson/75">
                        {selectedProductSizes ? "Valor do tamanho" : "Valor"}
                      </p>
                      <p className="text-2xl font-black text-crimson">
                        {currency.format(selectedProductPrice)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={customizeSelectedProduct}
                      disabled={
                        !storeIsOpen ||
                        (selectedProductSizes && !selectedSize)
                      }
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-crimson px-4 text-sm font-extrabold text-white transition-colors hover:bg-dark"
                    >
                      {storeIsOpen ? (
                        <>
                          {selectedProduct.type === "custom"
                            ? "Personalizar"
                            : selectedProduct.type === "gourmet"
                              ? "Ver receita Gourmet"
                              : selectedProduct.type === "bottle"
                                ? "Personalizar garrafa"
                                : "Personalizar combo"}
                          <ArrowRightIcon aria-hidden="true" size={17} />
                        </>
                      ) : (
                        "Loja fechada"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </dialog>
        </div>
      </div>
    </section>
  );
}

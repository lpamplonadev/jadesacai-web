"use client";

import { useEffect, useState } from "react";
import { AcaiBuilder } from "@/features/storefront/presentation/menu/acai-builder";
import {
  currency,
  type BuilderCatalogData,
} from "@/features/storefront/domain/acai-builder-data";
import { BrandFooter } from "@/features/storefront/presentation/menu/brand-footer";
import {
  combos,
  products,
} from "@/features/storefront/presentation/menu/menu-data";
import type {
  MenuCombo,
  MenuGourmet,
  MenuOrderProduct,
} from "@/features/storefront/domain/menu-types";
import { ProductCatalog } from "@/features/storefront/presentation/menu/product-catalog";
import { ProductHero } from "@/features/storefront/presentation/menu/product-hero";
import { SiteHeader } from "@/features/storefront/presentation/menu/site-header";
import { StoreStatusBubble } from "@/features/storefront/presentation/menu/store-status-bubble";
import { toBuilderCatalog } from "@/features/storefront/application/catalog-mapper";
import {
  getApiHealth,
  getPublicCatalog,
  getStoreStatus,
} from "@/features/storefront/infrastructure/api-client";
import {
  defaultStoreSettings,
  type StoreStatus,
} from "@/shared/domain/store-settings";

type ApiStatus = "checking" | "online" | "offline";

export default function Home() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [selectedProduct, setSelectedProduct] =
    useState<MenuOrderProduct | null>(null);
  const [menuCombos, setMenuCombos] = useState<MenuCombo[]>([]);
  const [menuGourmets, setMenuGourmets] = useState<MenuGourmet[]>([]);
  const [builderCatalog, setBuilderCatalog] =
    useState<BuilderCatalogData | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [catalogError, setCatalogError] = useState(false);
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const heroSlideCount = Math.max(1, menuCombos.length + menuGourmets.length);

  useEffect(() => {
    let active = true;

    async function loadApiData() {
      const [healthResult, catalogResult] = await Promise.allSettled([
        getApiHealth(),
        getPublicCatalog(),
      ]);

      if (!active) return;

      setApiStatus(
        healthResult.status === "fulfilled" &&
          healthResult.value.status === "ok"
          ? "online"
          : "offline",
      );

      if (catalogResult.status === "fulfilled") {
        const catalog = catalogResult.value;
        setMenuCombos(
          catalog.combos.map((combo, index) => {
            const visual = combos.find((item) => item.id === combo.key);
            return {
              ...combo,
              price: currency.format(combo.priceCents / 100),
              image:
                combo.image ||
                visual?.image ||
                products[index % products.length].image,
              imageAlt: combo.imageAlt || visual?.imageAlt || combo.name,
            };
          }),
        );
        setMenuGourmets(
          catalog.gourmets.map((gourmet, index) => {
            const visual = products[index % products.length];
            return {
              ...gourmet,
              image: gourmet.image || visual.image,
              imageAlt: gourmet.imageAlt || visual.imageAlt || gourmet.name,
            };
          }),
        );
        setBuilderCatalog(toBuilderCatalog(catalog));
        setCatalogError(false);
      } else {
        setMenuCombos([]);
        setMenuGourmets([]);
        setBuilderCatalog(null);
        setCatalogError(true);
      }
    }

    void loadApiData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshStoreStatus() {
      try {
        const status = await getStoreStatus();
        if (active) setStoreStatus(status);
      } catch {
        if (active) setStoreStatus(null);
      }
    }

    void refreshStoreStatus();
    const refreshTimer = window.setInterval(
      () => void refreshStoreStatus(),
      60_000,
    );
    window.addEventListener("focus", refreshStoreStatus);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshStoreStatus);
    };
  }, []);

  function changeSlide(direction: number) {
    setActiveSlide(
      (current) => (current + direction + heroSlideCount) % heroSlideCount,
    );
  }

  function chooseProduct(product: MenuOrderProduct) {
    setSelectedProduct(product);
    document
      .getElementById("monte-seu-acai")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const storeIsOpen = storeStatus?.isOpen ?? false;

  return (
    <div className="min-h-screen bg-cream text-text">
      <SiteHeader cartCount={cartCount} storeIsOpen={storeIsOpen} />
      <StoreStatusBubble status={storeStatus} />

      <main id="inicio">
        <ProductHero
          activeSlide={activeSlide}
          products={products}
          combos={menuCombos}
          gourmets={menuGourmets}
          storeIsOpen={storeIsOpen}
          onSelectSlide={setActiveSlide}
          onChangeSlide={changeSlide}
        />
        {builderCatalog ? (
          <ProductCatalog
            catalog={builderCatalog}
            bottleCatalog={
              storeStatus?.settings.bottleCatalog ??
              defaultStoreSettings.bottleCatalog
            }
            combos={menuCombos}
            gourmets={menuGourmets}
            products={products}
              storeIsOpen={storeIsOpen}
            onChooseProduct={chooseProduct}
            apiStatus={apiStatus}
            catalogError={catalogError}
          />
        ) : (
          <section
            id="catalogo"
            role="status"
            className="mx-auto max-w-7xl px-5 py-14 text-sm font-semibold text-crimson md:px-8"
          >
            {catalogError
              ? "Não foi possível carregar o cardápio agora."
              : "Carregando cardápio..."}
          </section>
        )}
        {builderCatalog ? (
          <AcaiBuilder
            selectedProduct={selectedProduct}
            onClearProduct={() => setSelectedProduct(null)}
            onCartCountChange={setCartCount}
            catalog={builderCatalog}
            bottleCatalog={
              storeStatus?.settings.bottleCatalog ??
              defaultStoreSettings.bottleCatalog
            }
            deliveryZones={
              storeStatus?.settings.deliveryZones ??
              defaultStoreSettings.deliveryZones
            }
            storeIsOpen={storeIsOpen}
            whatsAppNumber={storeStatus?.settings.whatsAppNumber ?? ""}
            onStoreStatusChange={setStoreStatus}
          />
        ) : (
          <section
            id="monte-seu-acai"
            role="status"
            className="bg-petal px-5 py-14 text-center text-sm font-semibold text-crimson"
          >
            {catalogError
              ? "Não foi possível carregar o cardápio agora. Tente novamente em instantes."
              : "Carregando opções do cardápio..."}
          </section>
        )}
        <BrandFooter
          title={storeStatus?.settings.story.title ?? defaultStoreSettings.story.title}
          body={storeStatus?.settings.story.body ?? defaultStoreSettings.story.body}
        />
      </main>
    </div>
  );
}

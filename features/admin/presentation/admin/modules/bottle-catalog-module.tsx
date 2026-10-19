"use client";

import Image from "next/image";
import {
  ArchiveBoxIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import { BottleEditorDialog } from "@/features/admin/presentation/admin/modules/bottle-editor-dialog";
import {
  defaultStoreSettings,
  type BottleCatalogSettings,
  type BottleProductSetting,
  type StoreSettings,
  type StoreStatus,
} from "@/shared/domain/store-settings";

type BottleProductDraft = Omit<BottleProductSetting, "price300Cents" | "price500Cents"> & {
  price300: string;
  price500: string;
};

async function readError(response: Response) {
  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return result?.error ?? `A API respondeu com erro (${response.status}).`;
}

function formatMoneyInput(priceCents: number) {
  return (priceCents / 100).toFixed(2);
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
}

function normalizeBottleCatalog(catalog: BottleCatalogSettings): BottleCatalogSettings {
  if (catalog.bottles?.length) {
    return {
      ...catalog,
      bottles: catalog.bottles.map((bottle) => ({
        ...bottle,
        available300: bottle.available300 ?? bottle.price300Cents > 0,
        available500: bottle.available500 ?? bottle.price500Cents > 0,
        extras: bottle.extras?.length ? bottle.extras : catalog.extras,
      })),
    };
  }
  if (!catalog.enabled && !catalog.price300Cents && !catalog.price500Cents) {
    return { ...catalog, bottles: [] };
  }
  return {
    ...catalog,
    bottles: [{
      id: "bottle-acai",
      name: "Açaí na Garrafa",
      imageUrl: "",
      imageAlt: "",
      enabled: catalog.enabled,
      available300: catalog.price300Cents > 0,
      available500: catalog.price500Cents > 0,
      price300Cents: catalog.price300Cents,
      price500Cents: catalog.price500Cents,
      extras: catalog.extras,
    }],
  };
}

function toBottleDraft(bottle: BottleProductSetting): BottleProductDraft {
  return {
    ...bottle,
    price300: formatMoneyInput(bottle.price300Cents),
    price500: formatMoneyInput(bottle.price500Cents),
  };
}

function toBottleProduct(bottle: BottleProductDraft): BottleProductSetting {
  return {
    id: bottle.id,
    name: bottle.name,
    imageUrl: bottle.imageUrl,
    imageAlt: bottle.imageAlt,
    enabled: bottle.enabled,
    available300: bottle.available300,
    available500: bottle.available500,
    price300Cents: bottle.available300 ? parseMoneyInput(bottle.price300) ?? 0 : 0,
    price500Cents: bottle.available500 ? parseMoneyInput(bottle.price500) ?? 0 : 0,
    extras: bottle.extras,
  };
}

export function BottleCatalogModule() {
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(
    defaultStoreSettings,
  );
  const [bottleCatalog, setBottleCatalog] = useState<BottleCatalogSettings>(
    defaultStoreSettings.bottleCatalog,
  );
  const [bottles, setBottles] = useState<BottleProductDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [bottleEditor, setBottleEditor] = useState<{
    bottle?: BottleProductSetting;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSettings() {
      setLoading(true);
      try {
        const response = await requestAdminApi("/settings", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readError(response));
        const result = (await response.json()) as StoreStatus;
        const loadedBottle = normalizeBottleCatalog(
          result.settings.bottleCatalog ?? defaultStoreSettings.bottleCatalog,
        );
        setStoreSettings(result.settings);
        setBottleCatalog(loadedBottle);
        setBottles(loadedBottle.bottles.map(toBottleDraft));
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar a configuração da garrafa.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSettings();
    return () => controller.abort();
  }, []);

  async function saveBottleProducts(nextBottles: BottleProductSetting[]) {
    setSaving(true);
    setError("");
    setFeedback("");

    const nextBottleCatalog: BottleCatalogSettings = {
      ...bottleCatalog,
      bottles: nextBottles,
      enabled: nextBottles[0]?.enabled ?? false,
      price300Cents: nextBottles[0]?.price300Cents ?? 0,
      price500Cents: nextBottles[0]?.price500Cents ?? 0,
    };

    try {
      const response = await requestAdminApi("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...storeSettings, bottleCatalog: nextBottleCatalog }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as StoreStatus;
      setStoreSettings(result.settings);
      const savedCatalog = normalizeBottleCatalog(result.settings.bottleCatalog);
      setBottleCatalog(savedCatalog);
      setBottles(savedCatalog.bottles.map(toBottleDraft));
      setFeedback("Catálogo de garrafas salvo.");
    } catch (saveError) {
      throw new Error(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a configuração da garrafa.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveBottle(bottle: BottleProductSetting) {
    const nextBottles = bottles.map((current) => ({
      id: current.id,
      name: current.name,
      imageUrl: current.imageUrl,
      imageAlt: current.imageAlt,
      enabled: current.enabled,
      available300: current.available300,
      available500: current.available500,
      price300Cents: current.available300 ? parseMoneyInput(current.price300) ?? 0 : 0,
      price500Cents: current.available500 ? parseMoneyInput(current.price500) ?? 0 : 0,
      extras: current.extras,
    }));
    const existingIndex = nextBottles.findIndex((current) => current.id === bottle.id);
    if (existingIndex >= 0) nextBottles[existingIndex] = bottle;
    else nextBottles.push(bottle);
    await saveBottleProducts(nextBottles);
    setBottleEditor(null);
  }

  async function toggleBottle(bottle: BottleProductDraft) {
    const nextBottles = bottles.map((current) => ({
      id: current.id,
      name: current.name,
      imageUrl: current.imageUrl,
      imageAlt: current.imageAlt,
      enabled: current.id === bottle.id ? !current.enabled : current.enabled,
      available300: current.available300,
      available500: current.available500,
      price300Cents: current.available300 ? parseMoneyInput(current.price300) ?? 0 : 0,
      price500Cents: current.available500 ? parseMoneyInput(current.price500) ?? 0 : 0,
      extras: current.extras,
    }));
    try {
      await saveBottleProducts(nextBottles);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível atualizar a disponibilidade.",
      );
    }
  }

  async function removeBottle(bottle: BottleProductDraft) {
    if (!window.confirm(`Excluir “${bottle.name}” do catálogo de garrafas?`)) return;
    const nextBottles = bottles
      .filter((current) => current.id !== bottle.id)
      .map((current) => ({
        id: current.id,
        name: current.name,
        imageUrl: current.imageUrl,
        imageAlt: current.imageAlt,
        enabled: current.enabled,
        available300: current.available300,
        available500: current.available500,
        price300Cents: current.available300 ? parseMoneyInput(current.price300) ?? 0 : 0,
        price500Cents: current.available500 ? parseMoneyInput(current.price500) ?? 0 : 0,
        extras: current.extras,
      }));
    try {
      await saveBottleProducts(nextBottles);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível excluir a garrafa.",
      );
    }
  }

  return (
    <section aria-labelledby="bottle-catalog-title" className="scroll-mt-8">
      <div className="mb-5 border-b border-[#deded7] pb-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#8b1a2e]">
          Produtos
        </p>
        <h2 id="bottle-catalog-title" className="mt-1 text-2xl font-black">
          Açaí na Garrafa
        </h2>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm font-semibold text-[#a5233a]">
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="mb-4 text-sm font-semibold text-green-800">
          {feedback}
        </p>
      )}

      {loading ? (
        <p role="status" className="py-8 text-sm text-[#77776e]">
          Carregando configuração...
        </p>
      ) : (
        <div className="divide-y divide-[#deded7]">
          <fieldset className="space-y-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <legend className="text-base font-extrabold">Garrafas</legend>
                <p className="mt-1 text-sm text-[#77776e]">
                  Produtos cadastrados no cardápio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBottleEditor({})}
                disabled={saving || bottles.length >= 50}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#8b1a2e] px-3 text-sm font-bold text-[#8b1a2e] hover:bg-[#fbf2f3] disabled:opacity-50"
              >
                <PlusIcon aria-hidden="true" size={17} />
                Criar garrafa
              </button>
            </div>

            {bottles.length === 0 ? (
              <p className="border border-dashed border-[#d6d6ce] px-4 py-6 text-sm text-[#77776e]">
                Nenhuma garrafa cadastrada.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto border border-[#deded7] bg-white">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-extrabold">Garrafa</th>
                      <th scope="col" className="px-4 py-3 font-extrabold">300 ml</th>
                      <th scope="col" className="px-4 py-3 font-extrabold">500 ml</th>
                      <th scope="col" className="px-4 py-3 font-extrabold">Disponibilidade</th>
                      <th scope="col" className="px-4 py-3 font-extrabold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e2]">
                    {bottles.map((bottle) => (
                      <tr key={bottle.id} className="align-middle hover:bg-[#fcfcfa]">
                        <td className="px-4 py-3">
                          <div className="flex min-w-48 items-center gap-3">
                            <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-[#deded7] bg-[#f3f3ef]">
                              {bottle.imageUrl ? (
                                <Image
                                  src={bottle.imageUrl}
                                  alt={bottle.imageAlt || bottle.name}
                                  fill
                                  unoptimized
                                  sizes="48px"
                                  className="object-cover"
                                />
                              ) : (
                                <span className="flex size-full items-center justify-center text-[10px] text-[#77776e]">
                                  Sem imagem
                                </span>
                              )}
                            </div>
                            <span className="font-semibold">{bottle.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-bold">
                          {bottle.available300 ? `R$ ${formatMoneyInput(parseMoneyInput(bottle.price300) ?? 0).replace(".", ",")}` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-bold">
                          {bottle.available500 ? `R$ ${formatMoneyInput(parseMoneyInput(bottle.price500) ?? 0).replace(".", ",")}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${bottle.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {bottle.enabled ? "Ativo" : "Pausado"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setBottleEditor({ bottle: toBottleProduct(bottle) })}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#8b1a2e] hover:underline disabled:opacity-50"
                            >
                              <PencilSimpleIcon aria-hidden="true" size={15} /> Editar
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void toggleBottle(bottle)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#55554e] hover:underline disabled:opacity-50"
                            >
                              {bottle.enabled ? (
                                <PauseIcon aria-hidden="true" size={15} />
                              ) : (
                                <PlayIcon aria-hidden="true" size={15} />
                              )}
                              {bottle.enabled ? "Pausar" : "Reativar"}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void removeBottle(bottle)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-red-800 hover:underline disabled:opacity-50"
                            >
                              <ArchiveBoxIcon aria-hidden="true" size={15} /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </fieldset>

          {bottleEditor && (
            <BottleEditorDialog
              key={bottleEditor.bottle?.id ?? "new-bottle"}
              bottle={bottleEditor.bottle}
              defaultExtras={bottleCatalog.extras}
              onClose={() => setBottleEditor(null)}
              onSave={saveBottle}
            />
          )}
        </div>
      )}
    </section>
  );
}
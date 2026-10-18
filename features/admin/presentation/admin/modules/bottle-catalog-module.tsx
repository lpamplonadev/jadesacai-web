"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import {
  defaultStoreSettings,
  type BottleCatalogSettings,
  type BottleExtraSetting,
  type BottleProductSetting,
  type StoreSettings,
  type StoreStatus,
} from "@/shared/domain/store-settings";

type BottleProductDraft = Omit<BottleProductSetting, "price300Cents" | "price500Cents"> & {
  price300: string;
  price500: string;
};

const inputClassName =
  "min-h-11 w-full rounded-md border border-[#d6d6ce] bg-white px-3 text-sm text-[#33332d] outline-none focus:border-[#8b1a2e]";

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
  if (catalog.bottles?.length) return catalog;
  if (!catalog.enabled && !catalog.price300Cents && !catalog.price500Cents) {
    return { ...catalog, bottles: [] };
  }
  return {
    ...catalog,
    bottles: [{
      id: "bottle-acai",
      name: "Açaí na Garrafa",
      enabled: catalog.enabled,
      price300Cents: catalog.price300Cents,
      price500Cents: catalog.price500Cents,
    }],
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
  const [extraPriceDrafts, setExtraPriceDrafts] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

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
        setBottles(loadedBottle.bottles.map((bottle) => ({
          id: bottle.id,
          name: bottle.name,
          enabled: bottle.enabled,
          price300: formatMoneyInput(bottle.price300Cents),
          price500: formatMoneyInput(bottle.price500Cents),
        })));
        setExtraPriceDrafts(
          Object.fromEntries(
            loadedBottle.extras.map((extra) => [
              extra.key,
              formatMoneyInput(extra.priceCents),
            ]),
          ),
        );
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

  function updateExtra(key: string, patch: Partial<BottleExtraSetting>) {
    setBottleCatalog((current) => ({
      ...current,
      extras: current.extras.map((extra) =>
        extra.key === key ? { ...extra, ...patch } : extra,
      ),
    }));
  }

  function updateBottle(id: string, patch: Partial<BottleProductDraft>) {
    setBottles((current) =>
      current.map((bottle) =>
        bottle.id === id ? { ...bottle, ...patch } : bottle,
      ),
    );
  }

  function addBottle() {
    setBottles((current) => [
      ...current,
      {
        id: `bottle-${crypto.randomUUID()}`,
        name: "",
        enabled: false,
        price300: "0,00",
        price500: "0,00",
      },
    ]);
  }

  async function saveBottleCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFeedback("");

    const parsedBottles = bottles.map((bottle) => {
      const price300Cents = parseMoneyInput(bottle.price300);
      const price500Cents = parseMoneyInput(bottle.price500);
      if (!bottle.name.trim() || price300Cents === null || price500Cents === null) {
        return null;
      }
      return {
        id: bottle.id,
        name: bottle.name.trim(),
        enabled: bottle.enabled,
        price300Cents,
        price500Cents,
      };
    });
    if (parsedBottles.some((bottle) => bottle === null)) {
      setError("Informe o nome e preços válidos para cada garrafa.");
      setSaving(false);
      return;
    }
    const nextBottles = parsedBottles as BottleProductSetting[];
    if (nextBottles.some((bottle) => bottle.enabled && (!bottle.price300Cents || !bottle.price500Cents))) {
      setError("Informe os preços de 300 ml e 500 ml antes de disponibilizar cada garrafa.");
      setSaving(false);
      return;
    }

    const extras = bottleCatalog.extras.map((extra) => {
      const priceCents = parseMoneyInput(extraPriceDrafts[extra.key] ?? "");
      return priceCents === null ? null : { ...extra, priceCents };
    });
    if (extras.some((extra) => extra === null)) {
      setError("Informe um preço válido para cada extra.");
      setSaving(false);
      return;
    }

    const nextBottleCatalog: BottleCatalogSettings = {
      ...bottleCatalog,
      bottles: nextBottles,
      enabled: nextBottles[0]?.enabled ?? false,
      price300Cents: nextBottles[0]?.price300Cents ?? 0,
      price500Cents: nextBottles[0]?.price500Cents ?? 0,
      extras: extras as BottleExtraSetting[],
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
      setBottleCatalog(normalizeBottleCatalog(result.settings.bottleCatalog));
      setFeedback("Garrafas salvas.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a configuração da garrafa.",
      );
    } finally {
      setSaving(false);
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
        <form onSubmit={saveBottleCatalog} className="divide-y divide-[#deded7]">
          <fieldset className="space-y-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <legend className="text-base font-extrabold">Garrafas</legend>
                <p className="mt-1 text-sm text-[#77776e]">
                  Configure o nome, os tamanhos e a disponibilidade de cada produto.
                </p>
              </div>
              <button
                type="button"
                onClick={addBottle}
                disabled={saving || bottles.length >= 50}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#8b1a2e] px-3 text-sm font-bold text-[#8b1a2e] hover:bg-[#fbf2f3] disabled:opacity-50"
              >
                <PlusIcon aria-hidden="true" size={17} />
                Adicionar garrafa
              </button>
            </div>

            {bottles.length === 0 ? (
              <p className="border border-dashed border-[#d6d6ce] px-4 py-6 text-sm text-[#77776e]">
                Nenhuma garrafa cadastrada.
              </p>
            ) : (
              <div className="divide-y divide-[#ecece6] border-y border-[#ecece6]">
                {bottles.map((bottle, index) => (
                  <div key={bottle.id} className="space-y-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-extrabold">
                        {bottle.name.trim() || `Nova garrafa ${index + 1}`}
                      </p>
                      <button
                        type="button"
                        aria-label={`Remover ${bottle.name || `garrafa ${index + 1}`}`}
                        onClick={() =>
                          setBottles((current) =>
                            current.filter((item) => item.id !== bottle.id),
                          )
                        }
                        disabled={saving}
                        className="flex size-9 items-center justify-center rounded-md text-[#77776e] hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                      >
                        <TrashIcon aria-hidden="true" size={17} />
                      </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label className="space-y-1.5 text-sm font-semibold">
                        Nome do produto
                        <input
                          type="text"
                          required
                          maxLength={80}
                          value={bottle.name}
                          onChange={(event) =>
                            updateBottle(bottle.id, { name: event.target.value })
                          }
                          placeholder="Ex.: Açaí na Garrafa"
                          className={inputClassName}
                        />
                      </label>
                      <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={bottle.enabled}
                          disabled={
                            saving ||
                            !(parseMoneyInput(bottle.price300) ?? 0) ||
                            !(parseMoneyInput(bottle.price500) ?? 0)
                          }
                          onChange={(event) =>
                            updateBottle(bottle.id, { enabled: event.target.checked })
                          }
                          className="size-4 accent-[#8b1a2e]"
                        />
                        Disponível no cardápio
                      </label>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {([
                        ["price300", "300 ml"],
                        ["price500", "500 ml"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="space-y-1.5 text-sm font-semibold">
                          {label} · preço (R$)
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            value={bottle[key]}
                            onChange={(event) =>
                              updateBottle(bottle.id, { [key]: event.target.value })
                            }
                            placeholder="0,00"
                            className={inputClassName}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3 py-5">
            <legend className="text-base font-extrabold">
              Extras opcionais
            </legend>
            <div className="divide-y divide-[#ecece6] border-y border-[#ecece6]">
              {bottleCatalog.extras.map((extra) => (
                <div
                  key={extra.key}
                  className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                >
                  <label className="flex min-h-10 items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={extra.enabled}
                      onChange={(event) =>
                        updateExtra(extra.key, { enabled: event.target.checked })
                      }
                      className="size-4 accent-[#8b1a2e]"
                    />
                    {extra.name}
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-[#77776e]">
                    Preço adicional (R$)
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={extraPriceDrafts[extra.key] ?? ""}
                      onChange={(event) =>
                        setExtraPriceDrafts((current) => ({
                          ...current,
                          [extra.key]: event.target.value,
                        }))
                      }
                      placeholder="0,00"
                      className={inputClassName}
                    />
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#77776e]">
              Uma garrafa precisa dos dois preços para ficar disponível no cardápio.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-md bg-[#8b1a2e] px-5 text-sm font-extrabold text-white transition-colors hover:bg-[#6b1222] disabled:cursor-wait disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar garrafas e extras"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
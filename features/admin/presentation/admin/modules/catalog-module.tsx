"use client";

import {
  ArrowClockwiseIcon,
  ArchiveBoxIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import {
  CatalogEditorDialog,
  catalogKindLabels,
} from "@/features/admin/presentation/admin/modules/catalog-editor-dialog";
import { GourmetEditorDialog } from "@/features/admin/presentation/admin/modules/gourmet-editor-dialog";
import { BottleEditorDialog } from "@/features/admin/presentation/admin/modules/bottle-editor-dialog";
import type {
  CatalogCombo,
  CatalogEditor,
  CatalogGourmet,
  CatalogItem,
  CatalogItemKind,
} from "@/features/admin/domain/catalog";
import {
  defaultStoreSettings,
  type BottleCatalogSettings,
  type BottleProductSetting,
  type StoreSettings,
  type StoreStatus,
} from "@/shared/domain/store-settings";

type CatalogData = {
  items: CatalogItem[];
  combos: CatalogCombo[];
  gourmets: CatalogGourmet[];
  rules: { key: string; value: unknown }[];
};

type CatalogTab = "items" | "combos" | "gourmet" | "bottle";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

async function readAPIError(response: Response) {
  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return result?.error ?? `A API respondeu com erro (${response.status}).`;
}

function normalizeBottleCatalog(catalog: BottleCatalogSettings): BottleCatalogSettings {
  const bottles = catalog.bottles?.length
    ? catalog.bottles
    : catalog.enabled || catalog.price300Cents || catalog.price500Cents
      ? [{
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
        }]
      : [];
  return {
    ...catalog,
    bottles: bottles.map((bottle) => ({
      ...bottle,
      available300: bottle.available300 ?? bottle.price300Cents > 0,
      available500: bottle.available500 ?? bottle.price500Cents > 0,
      extras: bottle.extras?.length ? bottle.extras : catalog.extras,
    })),
  };
}

export function CatalogModule() {
  const [catalog, setCatalog] = useState<CatalogData>({
    items: [],
    combos: [],
    gourmets: [],
    rules: [],
  });
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [bottleCatalog, setBottleCatalog] = useState<BottleCatalogSettings>(
    defaultStoreSettings.bottleCatalog,
  );
  const [tab, setTab] = useState<CatalogTab>("items");
  const [kindFilter, setKindFilter] = useState<"all" | CatalogItemKind>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState<CatalogEditor | null>(null);
  const [bottleEditor, setBottleEditor] = useState<{
    bottle?: BottleProductSetting;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      setLoading(true);
      setError("");
      try {
        const [catalogResponse, settingsResponse] = await Promise.all([
          requestAdminApi("/catalog", {
            cache: "no-store",
            signal: controller.signal,
          }),
          requestAdminApi("/settings", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (!catalogResponse.ok) throw new Error(await readAPIError(catalogResponse));
        if (!settingsResponse.ok) throw new Error(await readAPIError(settingsResponse));
        const [catalogResult, status] = await Promise.all([
          catalogResponse.json() as Promise<CatalogData>,
          settingsResponse.json() as Promise<StoreStatus>,
        ]);
        setCatalog(catalogResult);
        setStoreSettings(status.settings);
        setBottleCatalog(
          normalizeBottleCatalog(
            status.settings.bottleCatalog ?? defaultStoreSettings.bottleCatalog,
          ),
        );
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar o catálogo.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, [reloadKey]);

  async function mutate(key: string, path: string, init: RequestInit) {
    setMutating(key);
    setError("");
    try {
      const response = await requestAdminApi(path, init);
      if (!response.ok) throw new Error(await readAPIError(response));
      setReloadKey((value) => value + 1);
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Não foi possível salvar a alteração.",
      );
      return false;
    } finally {
      setMutating("");
    }
  }

  async function toggleItem(item: CatalogItem) {
    await mutate(`item-${item.id}`, `/catalog/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !item.available }),
    });
  }

  async function archiveItem(item: CatalogItem) {
    if (
      !window.confirm(
        `Excluir “${item.name}” do catálogo? O registro será arquivado para preservar combos e histórico.`,
      )
    )
      return;
    await mutate(`item-${item.id}`, `/catalog/items/${item.id}`, {
      method: "DELETE",
    });
  }

  async function toggleCombo(combo: CatalogCombo) {
    await mutate(`combo-${combo.id}`, `/catalog/combos/${combo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !combo.available }),
    });
  }

  async function archiveCombo(combo: CatalogCombo) {
    if (
      !window.confirm(
        `Excluir “${combo.name}” do catálogo? O registro será arquivado para preservar o histórico.`,
      )
    )
      return;
    await mutate(`combo-${combo.id}`, `/catalog/combos/${combo.id}`, {
      method: "DELETE",
    });
  }

  async function toggleGourmet(gourmet: CatalogGourmet) {
    await mutate(`gourmet-${gourmet.id}`, `/catalog/gourmets/${gourmet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !gourmet.available }),
    });
  }

  async function archiveGourmet(gourmet: CatalogGourmet) {
    if (
      !window.confirm(
        `Excluir “${gourmet.name}” do catálogo? O produto será arquivado para preservar o histórico.`,
      )
    )
      return;
    await mutate(`gourmet-${gourmet.id}`, `/catalog/gourmets/${gourmet.id}`, {
      method: "DELETE",
    });
  }

  async function saveBottleProducts(bottles: BottleProductSetting[]) {
    if (!storeSettings) return false;
    const bottleCatalog: BottleCatalogSettings = {
      ...normalizeBottleCatalog(storeSettings.bottleCatalog),
      bottles,
      enabled: bottles[0]?.enabled ?? false,
      price300Cents: bottles[0]?.price300Cents ?? 0,
      price500Cents: bottles[0]?.price500Cents ?? 0,
    };
    setMutating("bottle");
    setError("");
    try {
      const response = await requestAdminApi("/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...storeSettings, bottleCatalog }),
      });
      if (!response.ok) throw new Error(await readAPIError(response));
      const status = (await response.json()) as StoreStatus;
      setStoreSettings(status.settings);
      setBottleCatalog(normalizeBottleCatalog(status.settings.bottleCatalog));
      setReloadKey((value) => value + 1);
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar as garrafas.",
      );
      return false;
    } finally {
      setMutating("");
    }
  }

  async function saveBottle(bottle: BottleProductSetting) {
    const bottles = [...bottleCatalog.bottles];
    const existingIndex = bottles.findIndex((item) => item.id === bottle.id);
    if (existingIndex >= 0) bottles[existingIndex] = bottle;
    else bottles.push(bottle);
    if (await saveBottleProducts(bottles)) setBottleEditor(null);
  }

  async function toggleBottle(bottle: BottleProductSetting) {
    await saveBottleProducts(
      bottleCatalog.bottles.map((item) =>
        item.id === bottle.id ? { ...item, enabled: !item.enabled } : item,
      ),
    );
  }

  async function archiveBottle(bottle: BottleProductSetting) {
    if (!window.confirm(`Excluir “${bottle.name}” do catálogo?`)) return;
    await saveBottleProducts(
      bottleCatalog.bottles.filter((item) => item.id !== bottle.id),
    );
  }

  function openItemEditor(item?: CatalogItem) {
    setEditor({ type: "item", item });
  }

  function openComboEditor(combo?: CatalogCombo) {
    setEditor({ type: "combo", combo });
  }

  function openGourmetEditor(gourmet?: CatalogGourmet) {
    setEditor({ type: "gourmet", gourmet });
  }

  const visibleItems = catalog.items.filter(
    (item) => kindFilter === "all" || item.kind === kindFilter,
  );
  const visibleCombos = catalog.combos;
  const visibleGourmets = catalog.gourmets;
  const visibleBottles = bottleCatalog.bottles;
  const totalForTab =
    tab === "items"
      ? visibleItems.length
      : tab === "combos"
        ? visibleCombos.length
        : tab === "gourmet"
          ? visibleGourmets.length
          : visibleBottles.length;
  const pageCount = Math.max(1, Math.ceil(totalForTab / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const firstVisibleEntry = totalForTab === 0 ? 0 : pageStart + 1;
  const lastVisibleEntry = Math.min(pageStart + pageSize, totalForTab);
  const paginatedItems = visibleItems.slice(pageStart, pageStart + pageSize);
  const paginatedCombos = visibleCombos.slice(pageStart, pageStart + pageSize);
  const paginatedGourmets = visibleGourmets.slice(pageStart, pageStart + pageSize);
  const paginatedBottles = visibleBottles.slice(pageStart, pageStart + pageSize);
  const activeItemCount = catalog.items.filter(
    (item) => item.available && !item.deletedAt,
  ).length;
  const activeComboCount = catalog.combos.filter(
    (combo) => combo.available && !combo.deletedAt,
  ).length;
  const activeGourmetCount = catalog.gourmets.filter(
    (gourmet) => gourmet.available && !gourmet.deletedAt,
  ).length;
  const activeBottleCount = visibleBottles.filter((bottle) => bottle.enabled).length;

  return (
    <section
      id="catalogo"
      aria-labelledby="catalog-title"
      className="scroll-mt-8"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="catalog-title" className="text-xl font-black">
            Catálogo
          </h2>
          <p className="mt-1 text-sm text-[#77776e]">
            Gerencie itens, combos, preços e disponibilidade da loja.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={loading || Boolean(mutating)}
          aria-label="Atualizar catálogo"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d6d6ce] bg-white text-[#48483f] hover:border-[#8b1a2e] hover:text-[#8b1a2e] disabled:opacity-50"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#deded7] py-3">
        <div
          className="inline-flex rounded-md border border-[#deded7] bg-white p-1"
          aria-label="Tipo de catálogo"
        >
          {(
            [
              ["items", `Itens (${activeItemCount})`],
              ["combos", `Combos (${activeComboCount})`],
              ["gourmet", `Gourmets (${activeGourmetCount})`],
              ["bottle", `Açaí na Garrafa (${activeBottleCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => {
                setPage(1);
                setTab(value);
              }}
              className={`min-h-9 rounded px-3 text-sm font-bold ${tab === value ? "bg-[#8b1a2e] text-white" : "text-[#55554e] hover:bg-[#f3f3ef]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "items" && (
            <label>
              <span className="sr-only">Filtrar itens por tipo</span>
              <select
                value={kindFilter}
                onChange={(event) => {
                  setPage(1);
                  setKindFilter(event.target.value as "all" | CatalogItemKind);
                }}
                className="min-h-10 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm"
              >
                <option value="all">Todos os tipos</option>
                {Object.entries(catalogKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm text-[#68685f]">
            <span>Por página</span>
            <select
              aria-label="Itens do catálogo por página"
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
              className="bg-transparent text-sm text-[#33332d] outline-none"
            >
              {[5, 10, 25, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              if (tab === "items") openItemEditor();
              else if (tab === "combos") openComboEditor();
              else if (tab === "gourmet") openGourmetEditor();
              else setBottleEditor({});
            }}
            disabled={loading || Boolean(mutating)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#8b1a2e] px-4 text-sm font-extrabold text-white hover:bg-[#6b1222] disabled:opacity-50"
          >
            <PlusIcon aria-hidden="true" size={17} />
            {tab === "items"
              ? "Adicionar item"
              : tab === "gourmet"
                ? "Criar Gourmet"
                : tab === "bottle"
                  ? "Criar garrafa"
                  : "Criar combo"}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="py-12 text-center text-sm text-[#77776e]">
          Carregando catálogo...
        </p>
      ) : tab === "items" ? (
        visibleItems.length ? (
          <div className="mt-4 overflow-x-auto border border-[#deded7] bg-white">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Item
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Tipo
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Preço/adicional
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Disponibilidade
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e2]">
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#fcfcfa]">
                    <td className="px-4 py-3 font-semibold">{item.name}</td>
                    <td className="px-4 py-3 text-xs text-[#68685f]">
                      {catalogKindLabels[item.kind]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-bold">
                      {currency.format(item.priceCents / 100)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.deletedAt ? "bg-slate-100 text-slate-700" : item.available ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                      >
                        {item.deletedAt
                          ? "Arquivado"
                          : item.available
                            ? "Ativo"
                            : "Pausado"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!item.deletedAt && (
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={Boolean(mutating)}
                            onClick={() => openItemEditor(item)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#8b1a2e] hover:underline disabled:opacity-50"
                          >
                            <PencilSimpleIcon aria-hidden="true" size={15} />{" "}
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(mutating)}
                            onClick={() => void toggleItem(item)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#55554e] hover:underline disabled:opacity-50"
                          >
                            {item.available ? (
                              <PauseIcon aria-hidden="true" size={15} />
                            ) : (
                              <PlayIcon aria-hidden="true" size={15} />
                            )}
                            {item.available ? "Pausar" : "Reativar"}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(mutating)}
                            onClick={() => void archiveItem(item)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-red-800 hover:underline disabled:opacity-50"
                          >
                            <ArchiveBoxIcon aria-hidden="true" size={15} />{" "}
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 border border-dashed border-[#d6d6ce] bg-white px-5 py-12 text-center text-sm text-[#77776e]">
            Nenhum item neste tipo.
          </p>
        )
      ) : tab === "combos" ? (
        visibleCombos.length ? (
        <div className="mt-4 overflow-x-auto border border-[#deded7] bg-white">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
              <tr>
                <th scope="col" className="px-4 py-3 font-extrabold">
                  Combo
                </th>
                <th scope="col" className="px-4 py-3 font-extrabold">
                  Tamanho
                </th>
                <th scope="col" className="px-4 py-3 font-extrabold">
                  Preço
                </th>
                <th scope="col" className="px-4 py-3 font-extrabold">
                  Itens vinculados
                </th>
                <th scope="col" className="px-4 py-3 font-extrabold">
                  Disponibilidade
                </th>
                <th scope="col" className="px-4 py-3 font-extrabold">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e2]">
              {paginatedCombos.map((combo) => (
                <tr key={combo.id} className="align-top hover:bg-[#fcfcfa]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{combo.name}</p>
                    {combo.tag && (
                      <p className="mt-1 text-xs text-[#77776e]">{combo.tag}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{combo.sizeName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-bold">
                    {currency.format(combo.priceCents / 100)}
                  </td>
                  <td className="max-w-sm px-4 py-3 text-xs text-[#55554e]">
                    {combo.items.length
                      ? combo.items
                          .map((item) => `${item.quantity}× ${item.name}`)
                          .join(", ")
                      : "Sem itens vinculados"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${combo.deletedAt ? "bg-slate-100 text-slate-700" : combo.available ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      {combo.deletedAt
                        ? "Arquivado"
                        : combo.available
                          ? "Ativo"
                          : "Pausado"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!combo.deletedAt && (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={Boolean(mutating)}
                          onClick={() => openComboEditor(combo)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#8b1a2e] hover:underline disabled:opacity-50"
                        >
                          <PencilSimpleIcon aria-hidden="true" size={15} />{" "}
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(mutating)}
                          onClick={() => void toggleCombo(combo)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#55554e] hover:underline disabled:opacity-50"
                        >
                          {combo.available ? (
                            <PauseIcon aria-hidden="true" size={15} />
                          ) : (
                            <PlayIcon aria-hidden="true" size={15} />
                          )}
                          {combo.available ? "Pausar" : "Reativar"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(mutating)}
                          onClick={() => void archiveCombo(combo)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-red-800 hover:underline disabled:opacity-50"
                        >
                          <ArchiveBoxIcon aria-hidden="true" size={15} />{" "}
                          Excluir
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
        <p className="mt-4 border border-dashed border-[#d6d6ce] bg-white px-5 py-12 text-center text-sm text-[#77776e]">
          Nenhum combo cadastrado.
        </p>
        )
      ) : tab === "gourmet" ? (
        <GourmetCatalogTable
          gourmets={paginatedGourmets}
          mutating={mutating}
          onEdit={openGourmetEditor}
          onToggle={toggleGourmet}
          onArchive={archiveGourmet}
        />
      ) : (
        <BottleCatalogTable
          bottles={paginatedBottles}
          mutating={mutating}
          onEdit={(bottle) => setBottleEditor({ bottle })}
          onToggle={toggleBottle}
          onArchive={archiveBottle}
        />
      )}

      {!loading && totalForTab > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-[#68685f]">
          <p>
            Mostrando {firstVisibleEntry}–{lastVisibleEntry} de {totalForTab}{" "}
            {tab === "items"
              ? "itens"
              : tab === "combos"
                ? "combos"
                : tab === "bottle"
                  ? "garrafas"
                  : "Gourmets"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="min-h-9 rounded-md border border-[#d6d6ce] bg-white px-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pageCount}
              className="min-h-9 rounded-md border border-[#d6d6ce] bg-white px-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {editor?.type === "gourmet" ? (
        <GourmetEditorDialog
          key={`gourmet-${editor.gourmet?.id ?? "new"}`}
          gourmet={editor.gourmet}
          items={catalog.items}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : editor ? (
        <CatalogEditorDialog
          key={
            editor.type === "item"
              ? `item-${editor.item?.id ?? "new"}`
              : `combo-${editor.combo?.id ?? "new"}`
          }
          editor={editor}
          items={catalog.items}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setReloadKey((value) => value + 1);
          }}
        />
      ) : null}
      {bottleEditor && (
        <BottleEditorDialog
          key={bottleEditor.bottle?.id ?? "new-bottle"}
          bottle={bottleEditor.bottle}
          defaultExtras={bottleCatalog.extras}
          onClose={() => setBottleEditor(null)}
          onSave={saveBottle}
        />
      )}
    </section>
  );
}

function GourmetCatalogTable({
  gourmets,
  mutating,
  onEdit,
  onToggle,
  onArchive,
}: {
  gourmets: CatalogGourmet[];
  mutating: string;
  onEdit: (gourmet: CatalogGourmet) => void;
  onToggle: (gourmet: CatalogGourmet) => void;
  onArchive: (gourmet: CatalogGourmet) => void;
}) {
  if (!gourmets.length) {
    return (
      <p className="mt-4 border border-dashed border-[#d6d6ce] bg-white px-5 py-12 text-center text-sm text-[#77776e]">
        Nenhum Gourmet cadastrado.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto border border-[#deded7] bg-white">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
          <tr>
            <th scope="col" className="px-4 py-3 font-extrabold">Gourmet</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Tamanhos e preços</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Receita</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Disponibilidade</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e8e8e2]">
          {gourmets.map((gourmet) => (
            <tr key={gourmet.id} className="align-top hover:bg-[#fcfcfa]">
              <td className="px-4 py-3">
                <p className="font-semibold">{gourmet.name}</p>
                {gourmet.tag && <p className="mt-1 text-xs text-[#77776e]">{gourmet.tag}</p>}
                <p className="mt-1 max-w-md text-xs leading-5 text-[#77776e]">{gourmet.description}</p>
              </td>
              <td className="px-4 py-3 text-xs">
                {gourmet.sizes.map((size) => (
                  <p key={size.sizeItemId} className="mb-1 last:mb-0">
                    {size.sizeName}: {currency.format(size.priceCents / 100)}
                    {!size.available && " · inativo"}
                  </p>
                ))}
              </td>
              <td className="max-w-sm px-4 py-3 text-xs text-[#55554e]">
                {gourmet.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${gourmet.deletedAt ? "bg-slate-100 text-slate-700" : gourmet.available ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {gourmet.deletedAt ? "Arquivado" : gourmet.available ? "Ativo" : "Pausado"}
                </span>
              </td>
              <td className="px-4 py-3">
                {!gourmet.deletedAt && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" disabled={Boolean(mutating)} onClick={() => onEdit(gourmet)} className="inline-flex items-center gap-1 text-xs font-bold text-[#8b1a2e] hover:underline disabled:opacity-50">
                      <PencilSimpleIcon aria-hidden="true" size={15} /> Editar
                    </button>
                    <button type="button" disabled={Boolean(mutating)} onClick={() => void onToggle(gourmet)} className="inline-flex items-center gap-1 text-xs font-bold text-[#55554e] hover:underline disabled:opacity-50">
                      {gourmet.available ? <PauseIcon aria-hidden="true" size={15} /> : <PlayIcon aria-hidden="true" size={15} />}
                      {gourmet.available ? "Pausar" : "Reativar"}
                    </button>
                    <button type="button" disabled={Boolean(mutating)} onClick={() => void onArchive(gourmet)} className="inline-flex items-center gap-1 text-xs font-bold text-red-800 hover:underline disabled:opacity-50">
                      <ArchiveBoxIcon aria-hidden="true" size={15} /> Excluir
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BottleCatalogTable({
  bottles,
  mutating,
  onEdit,
  onToggle,
  onArchive,
}: {
  bottles: BottleProductSetting[];
  mutating: string;
  onEdit: (bottle: BottleProductSetting) => void;
  onToggle: (bottle: BottleProductSetting) => void;
  onArchive: (bottle: BottleProductSetting) => void;
}) {
  if (!bottles.length) {
    return (
      <p className="mt-4 border border-dashed border-[#d6d6ce] bg-white px-5 py-12 text-center text-sm text-[#77776e]">
        Nenhuma garrafa cadastrada.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto border border-[#deded7] bg-white">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
          <tr>
            <th scope="col" className="px-4 py-3 font-extrabold">Garrafa</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Tamanhos e preços</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Extras</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Disponibilidade</th>
            <th scope="col" className="px-4 py-3 font-extrabold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e8e8e2]">
          {bottles.map((bottle) => (
            <tr key={bottle.id} className="align-top hover:bg-[#fcfcfa]">
              <td className="px-4 py-3">
                <p className="font-semibold">{bottle.name}</p>
              </td>
              <td className="px-4 py-3 text-xs">
                {bottle.available300 && (
                  <p className="mb-1 last:mb-0">
                    300 ml: {currency.format(bottle.price300Cents / 100)}
                  </p>
                )}
                {bottle.available500 && (
                  <p className="mb-1 last:mb-0">
                    500 ml: {currency.format(bottle.price500Cents / 100)}
                  </p>
                )}
              </td>
              <td className="max-w-sm px-4 py-3 text-xs text-[#55554e]">
                {bottle.extras.filter((extra) => extra.enabled).map((extra) => extra.name).join(", ") || "Sem extras"}
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
                    disabled={Boolean(mutating)}
                    onClick={() => onEdit(bottle)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#8b1a2e] hover:underline disabled:opacity-50"
                  >
                    <PencilSimpleIcon aria-hidden="true" size={15} /> Editar
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(mutating)}
                    onClick={() => void onToggle(bottle)}
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
                    disabled={Boolean(mutating)}
                    onClick={() => void onArchive(bottle)}
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
  );
}

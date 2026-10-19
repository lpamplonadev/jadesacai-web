"use client";

import {
  ArrowClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import {
  formatOrderDate,
  formatOrderNumber,
} from "@/features/admin/application/order-formatting";
import { orderStatuses } from "@/features/admin/domain/orders";

type DashboardResponse = {
  date: string;
  ordersToday: number;
  waitingPreparation: number;
  inProduction: number;
  completedToday: number;
  statusCounts: { status: string; count: number }[];
  recentOrders: {
    id: string;
    orderNumber: number;
    orderDate: string;
    status: string;
    customerName: string;
    estimatedTotalCents: number;
    createdAt: string;
  }[];
};

type NewOrderAlert = {
  order: DashboardResponse["recentOrders"][number];
  count: number;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dashboardRefreshIntervalMs = 15000;

const statusChartColors: Record<string, string> = {
  received: "#8b1a2e",
  preparing: "#d97706",
  ready: "#059669",
  out_for_delivery: "#0284c7",
  delivered: "#0d9488",
  completed: "#64748b",
};

function playNewOrderSound(audioContext: AudioContext) {
  if (audioContext.state !== "running") return;

  const ringBell = (startTime: number, strength: number) => {
    const masterVolume = audioContext.createGain();
    masterVolume.gain.setValueAtTime(strength, startTime);
    masterVolume.connect(audioContext.destination);

    const partials = [
      { frequency: 1320, volume: 0.46 },
      { frequency: 1980, volume: 0.24 },
      { frequency: 2860, volume: 0.14 },
      { frequency: 4120, volume: 0.08 },
    ];

    for (const partial of partials) {
      const oscillator = audioContext.createOscillator();
      const resonance = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(partial.frequency, startTime);
      resonance.gain.setValueAtTime(partial.volume, startTime);
      resonance.gain.exponentialRampToValueAtTime(0.001, startTime + 1.15);
      oscillator.connect(resonance);
      resonance.connect(masterVolume);
      oscillator.start(startTime);
      oscillator.stop(startTime + 1.2);
    }
  };

  const now = audioContext.currentTime;
  ringBell(now, 0.68);
  ringBell(now + 0.17, 0.42);
}

function formatStatus(status: string) {
  return orderStatuses.find((item) => item.value === status)?.label ?? status;
}

export function DashboardModule() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [date, setDate] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [newOrderAlert, setNewOrderAlert] = useState<NewOrderAlert | null>(
    null,
  );
  const hasLoadedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const orderSnapshotRef = useRef<{
    date: string;
    count: number;
    latestOrderId: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: number | undefined;

    async function loadDashboard() {
      if (hasLoadedRef.current) setRefreshing(true);
      else setLoading(true);
      setError("");
      const query = date ? `?date=${encodeURIComponent(date)}` : "";

      try {
        const response = await requestAdminApi(`/dashboard${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Não foi possível carregar o dashboard.");
        setDashboard((await response.json()) as DashboardResponse);
      } catch {
        if (!controller.signal.aborted) {
          setError(
            "Não foi possível carregar os indicadores. Verifique a API e tente novamente.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          hasLoadedRef.current = true;
          setLoading(false);
          setRefreshing(false);
          refreshTimer = window.setTimeout(
            () => setRefreshKey((value) => value + 1),
            dashboardRefreshIntervalMs,
          );
        }
      }
    }

    void loadDashboard();
    return () => {
      controller.abort();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [date, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let pollTimer: number | undefined;

    async function pollForNewOrders() {
      try {
        const response = await requestAdminApi("/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("dashboard poll failed");

        const latestDashboard = (await response.json()) as DashboardResponse;
        const latestOrder = latestDashboard.recentOrders[0] ?? null;
        const snapshot = orderSnapshotRef.current;

        if (!snapshot || snapshot.date !== latestDashboard.date) {
          orderSnapshotRef.current = {
            date: latestDashboard.date,
            count: latestDashboard.ordersToday,
            latestOrderId: latestOrder?.id ?? null,
          };
        } else {
          const newOrdersCount = Math.max(
            0,
            latestDashboard.ordersToday - snapshot.count,
          );
          const hasNewLatestOrder =
            latestOrder !== null && latestOrder.id !== snapshot.latestOrderId;

          if ((newOrdersCount > 0 || hasNewLatestOrder) && latestOrder) {
            setNewOrderAlert({
              order: latestOrder,
              count: Math.max(newOrdersCount, 1),
            });
            setRefreshKey((value) => value + 1);
            if (soundEnabled && audioContextRef.current) {
              playNewOrderSound(audioContextRef.current);
            }
          }

          orderSnapshotRef.current = {
            date: latestDashboard.date,
            count: latestDashboard.ordersToday,
            latestOrderId: latestOrder?.id ?? null,
          };
        }
      } catch {
        // The regular dashboard request already reports connection errors.
      } finally {
        if (!stopped) {
          pollTimer = window.setTimeout(
            () => void pollForNewOrders(),
            dashboardRefreshIntervalMs,
          );
        }
      }
    }

    void pollForNewOrders();
    return () => {
      stopped = true;
      controller.abort();
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    };
  }, [soundEnabled]);

  useEffect(
    () => () => {
      void audioContextRef.current?.close();
    },
    [],
  );

  async function toggleSoundAlerts() {
    setSoundError("");
    if (soundEnabled) {
      setSoundEnabled(false);
      await audioContextRef.current?.suspend();
      return;
    }

    try {
      const audioContext = audioContextRef.current ?? new AudioContext();
      await audioContext.resume();
      audioContextRef.current = audioContext;
      setSoundEnabled(true);
      playNewOrderSound(audioContext);
    } catch {
      setSoundError("Não foi possível ativar o áudio neste navegador.");
    }
  }

  const counts = new Map(
    (dashboard?.statusCounts ?? []).map((item) => [item.status, item.count]),
  );
  const chartSegments = orderStatuses
    .map((status) => ({
      ...status,
      count: counts.get(status.value) ?? 0,
      color: statusChartColors[status.value],
    }))
    .filter((segment) => segment.count > 0);
  const totalStatuses = chartSegments.reduce(
    (total, segment) => total + segment.count,
    0,
  );
  let chartOffset = 0;
  const chartGradient = chartSegments
    .map((segment) => {
      const start =
        totalStatuses === 0 ? 0 : (chartOffset / totalStatuses) * 100;
      chartOffset += segment.count;
      const end = (chartOffset / totalStatuses) * 100;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(", ");

  const metrics = [
    { label: "Pedidos no dia", value: dashboard?.ordersToday },
    { label: "Aguardando preparo", value: dashboard?.waitingPreparation },
    { label: "Em produção", value: dashboard?.inProduction },
    { label: "Concluídos no dia", value: dashboard?.completedToday },
  ];

  return (
    <section
      id="dashboard"
      aria-labelledby="dashboard-title"
      className="scroll-mt-8"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="dashboard-title" className="text-base font-extrabold">
            {dashboard ? formatOrderDate(dashboard.date) : "Dashboard"}
          </h2>
          <p className="mt-1 text-xs text-[#77776e]">
            Indicadores e distribuição dos pedidos por etapa.
          </p>
          {refreshing && (
            <p role="status" className="mt-1 text-xs text-[#77776e]">
              Atualizando...
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="dashboard-date">
            Filtrar indicadores por dia
          </label>
          <input
            id="dashboard-date"
            type="date"
            value={date}
            onChange={(event) => {
              setLoading(true);
              setDate(event.target.value);
            }}
            className="min-h-10 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm outline-none focus:border-[#8b1a2e]"
          />
          {date && (
            <button
              type="button"
              onClick={() => setDate("")}
              className="min-h-10 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm font-bold text-[#55554e] hover:border-[#8b1a2e] hover:text-[#8b1a2e]"
            >
              Hoje
            </button>
          )}
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading || refreshing}
            aria-label="Atualizar dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#d6d6ce] bg-white text-[#48483f] hover:border-[#8b1a2e] hover:text-[#8b1a2e] disabled:opacity-50"
          >
            <ArrowClockwiseIcon aria-hidden="true" size={17} />
          </button>
          <button
            type="button"
            onClick={() => void toggleSoundAlerts()}
            aria-pressed={soundEnabled}
            aria-label={
              soundEnabled ? "Desativar alerta sonoro" : "Ativar alerta sonoro"
            }
            title={
              soundEnabled ? "Desativar alerta sonoro" : "Ativar alerta sonoro"
            }
            className={`flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition-colors ${soundEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[#d6d6ce] bg-white text-[#48483f] hover:border-[#8b1a2e] hover:text-[#8b1a2e]"}`}
          >
            {soundEnabled ? (
              <SpeakerHighIcon aria-hidden="true" size={18} />
            ) : (
              <SpeakerSlashIcon aria-hidden="true" size={18} />
            )}
            <span>{soundEnabled ? "Som ligado" : "Ativar som"}</span>
          </button>
        </div>
      </div>

      {soundError && (
        <p role="alert" className="mb-3 text-sm font-semibold text-red-800">
          {soundError}
        </p>
      )}

      {newOrderAlert && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        >
          <p>
            <strong>
              {newOrderAlert.count === 1
                ? "Novo pedido"
                : `${newOrderAlert.count} novos pedidos`}
            </strong>
            {newOrderAlert.count === 1 && (
              <>
                {" "}
                {formatOrderNumber(newOrderAlert.order.orderNumber)} ·{" "}
                {newOrderAlert.order.customerName}
              </>
            )}
          </p>
          <div className="flex items-center gap-3">
            <a
              href="#pedidos"
              className="font-extrabold underline underline-offset-2"
            >
              Ver pedidos
            </a>
            <button
              type="button"
              onClick={() => setNewOrderAlert(null)}
              aria-label="Dispensar alerta de novo pedido"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-emerald-100"
            >
              <XIcon aria-hidden="true" size={17} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <article
            key={metric.label}
            className="border border-[#e2e2dc] bg-white p-4"
          >
            <p className="text-xs font-bold text-[#73736a]">{metric.label}</p>
            <p
              className={`mt-3 text-3xl font-black ${index === 1 ? "text-[#a34b29]" : "text-[#292923]"}`}
            >
              {loading || !dashboard ? "—" : (metric.value ?? 0)}
            </p>
            <p className="mt-2 text-[11px] leading-4 text-[#898980]">
              {dashboard
                ? formatOrderDate(dashboard.date)
                : "Dados do banco de pedidos"}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border border-[#e2e2dc] bg-white">
          <div className="border-b border-[#e8e8e2] px-4 py-4 sm:px-5">
            <h3 className="font-extrabold">Pedidos recentes</h3>
            <p className="mt-1 text-xs text-[#77776e]">
              Últimos pedidos do dia selecionado
            </p>
          </div>
          {loading ? (
            <p
              role="status"
              className="px-5 py-10 text-center text-sm text-[#77776e]"
            >
              Carregando pedidos...
            </p>
          ) : dashboard?.recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-extrabold">
                      Pedido
                    </th>
                    <th scope="col" className="px-4 py-3 font-extrabold">
                      Cliente
                    </th>
                    <th scope="col" className="px-4 py-3 font-extrabold">
                      Etapa
                    </th>
                    <th scope="col" className="px-4 py-3 font-extrabold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e2]">
                  {dashboard.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#8b1a2e]">
                        {formatOrderNumber(order.orderNumber)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {order.customerName}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {formatStatus(order.status)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-bold">
                        {currency.format(order.estimatedTotalCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-[#77776e]">
              {error
                ? "Os pedidos recentes estão indisponíveis."
                : "Nenhum pedido neste dia."}
            </p>
          )}
        </section>

        <section className="border border-[#e2e2dc] bg-white">
          <div className="border-b border-[#e8e8e2] px-4 py-4">
            <h3 className="font-extrabold">Distribuição por etapa</h3>
            <p className="mt-1 text-xs text-[#77776e]">
              Pedidos do dia selecionado
            </p>
          </div>
          {loading ? (
            <p
              role="status"
              className="px-4 py-10 text-center text-sm text-[#77776e]"
            >
              Calculando distribuição...
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 px-4 py-5 sm:flex-row xl:flex-col 2xl:flex-row">
              <div
                role="img"
                aria-label={`Distribuição de ${totalStatuses} pedidos por etapa`}
                className="relative h-40 w-40 shrink-0 rounded-full"
                style={{
                  background:
                    totalStatuses > 0
                      ? `conic-gradient(${chartGradient})`
                      : "conic-gradient(#e5e7eb 0% 100%)",
                }}
              >
                <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center">
                  <span className="text-2xl font-black text-[#292923]">
                    {totalStatuses}
                  </span>
                  <span className="text-[10px] font-bold text-[#77776e]">
                    PEDIDOS
                  </span>
                </div>
              </div>
              <ul className="w-full space-y-2">
                {orderStatuses.map((status) => {
                  const count = counts.get(status.value) ?? 0;
                  return (
                    <li
                      key={status.value}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-[#55554e]">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: statusChartColors[status.value],
                          }}
                        />
                        <span className="truncate">{status.label}</span>
                      </span>
                      <span className="font-bold tabular-nums text-[#292923]">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

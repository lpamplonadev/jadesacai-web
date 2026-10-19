"use client";

import { ArrowClockwiseIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent } from "react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import {
  formatOrderDate,
  formatOrderNumber,
} from "@/features/admin/application/order-formatting";
import { orderStatuses, type AdminOrder } from "@/features/admin/domain/orders";
import { OrderDetailsDialog } from "@/features/admin/presentation/admin/modules/order-details-dialog";
import { AutoPrintToggle } from "@/features/admin/presentation/admin/modules/auto-print-toggle";

type OrdersResponse = {
  orders: AdminOrder[];
  page: number;
  limit: number;
  total: number;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const orderStatusBadgeStyles: Record<string, string> = {
  received: "bg-[#f8eeee] text-[#731a2a]",
  preparing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  out_for_delivery: "bg-sky-100 text-sky-800",
  delivered: "bg-teal-100 text-teal-800",
  completed: "bg-slate-100 text-slate-700",
};

export function OrdersModule() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  useEffect(() => {
    const controller = new AbortController();

    async function loadOrders() {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (status) query.set("status", status);
      if (search) query.set("search", search);
      if (orderDate) query.set("date", orderDate);

      try {
        const response = await requestAdminApi(`/orders?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Não foi possível carregar os pedidos.");

        const result = (await response.json()) as OrdersResponse;
        setOrders(result.orders);
        setTotal(result.total);
      } catch {
        if (!controller.signal.aborted) {
          setOrders([]);
          setTotal(0);
          setError(
            "Não foi possível carregar os pedidos. Verifique a API e tente novamente.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadOrders();
    return () => controller.abort();
  }, [page, pageSize, status, search, orderDate, refreshKey]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function handleStatusUpdated(orderId: string, updatedStatus: string) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status: updatedStatus } : order,
      ),
    );
    setSelectedOrder((current) =>
      current?.id === orderId ? { ...current, status: updatedStatus } : current,
    );
    setRefreshKey((value) => value + 1);
  }

  const firstOrder = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOrder = Math.min(page * pageSize, total);
  const ordersByDay = orders.reduce<Record<string, AdminOrder[]>>(
    (groups, order) => {
      (groups[order.orderDate] ??= []).push(order);
      return groups;
    },
    {},
  );

  return (
    <section
      id="pedidos"
      aria-labelledby="orders-title"
      className="scroll-mt-8"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="orders-title" className="text-xl font-black">
            Pedidos
          </h2>
          <p className="mt-1 text-sm text-[#77776e]">
            Consulte pedidos recebidos e acompanhe cada etapa da operação.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <AutoPrintToggle />
          <button
          type="button"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm font-bold text-[#48483f] transition-colors hover:border-[#8b1a2e] hover:text-[#8b1a2e] disabled:cursor-wait disabled:opacity-60"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={17} />
          Atualizar
        </button>
        </div>
      </div>

      <form
        onSubmit={submitSearch}
        className="mb-4 flex flex-col gap-3 border-y border-[#deded7] py-3 sm:flex-row"
      >
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar por cliente ou telefone</span>
          <MagnifyingGlassIcon
            aria-hidden="true"
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#77776e]"
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Nome ou telefone"
            className="min-h-10 w-full rounded-md border border-[#d6d6ce] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#8b1a2e]"
          />
        </label>
        <label className="sr-only" htmlFor="orders-status-filter">
          Filtrar pedidos por status
        </label>
        <select
          id="orders-status-filter"
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
          className="min-h-10 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm outline-none focus:border-[#8b1a2e]"
        >
          <option value="">Todos os status</option>
          {orderStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm text-[#68685f]">
          <span className="sr-only">Filtrar pedidos por dia</span>
          <input
            type="date"
            value={orderDate}
            onChange={(event) => {
              setPage(1);
              setOrderDate(event.target.value);
            }}
            className="min-w-0 bg-transparent text-sm text-[#33332d] outline-none"
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm text-[#68685f]">
          <span>Por página</span>
          <select
            aria-label="Pedidos por página"
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
          type="submit"
          className="min-h-10 rounded-md bg-[#8b1a2e] px-4 text-sm font-bold text-white transition-colors hover:bg-[#6b1222]"
        >
          Buscar
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="py-10 text-center text-sm text-[#77776e]">
          Carregando pedidos...
        </p>
      )}
      {!loading && !error && orders.length === 0 && (
        <p className="border border-dashed border-[#d6d6ce] bg-white px-5 py-12 text-center text-sm text-[#77776e]">
          Nenhum pedido encontrado.
        </p>
      )}

      {!loading && orders.length > 0 && (
        <>
          <div className="overflow-x-auto border border-[#deded7] bg-white">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="bg-[#f3f3ef] text-xs uppercase text-[#68685f]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Pedido
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Cliente
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Data
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Total estimado
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-extrabold">
                    Dados
                  </th>
                </tr>
              </thead>
              {Object.entries(ordersByDay).map(([day, dayOrders]) => (
                <tbody key={day} className="divide-y divide-[#e8e8e2]">
                  <tr className="bg-[#f8eeee]">
                    <th
                      scope="rowgroup"
                      colSpan={6}
                      className="px-4 py-3 text-left text-xs font-extrabold uppercase text-[#731a2a]"
                    >
                      {formatOrderDate(day)} · {dayOrders.length}{" "}
                      {dayOrders.length === 1 ? "pedido" : "pedidos"}
                    </th>
                  </tr>
                  {dayOrders.map((order) => (
                    <tr key={order.id} className="align-top hover:bg-[#fcfcfa]">
                      <td className="px-4 py-4 font-mono text-xs font-bold text-[#8b1a2e]">
                        {formatOrderNumber(order.orderNumber)}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold text-[#33332d]">
                          {order.customerName}
                        </p>
                        <p className="mt-1 text-xs text-[#77776e]">
                          {order.customerPhone}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-[#68685f]">
                        {new Date(order.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Sao_Paulo",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-bold text-[#33332d]">
                        {currency.format(order.estimatedTotalCents / 100)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${orderStatusBadgeStyles[order.status] ?? "bg-slate-100 text-slate-700"}`}
                        >
                          {orderStatuses.find(
                            (item) => item.value === order.status,
                          )?.label ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="font-bold text-[#8b1a2e] underline decoration-[#c8c8bf] underline-offset-2 hover:text-[#6b1222]"
                        >
                          Ver pedido
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-[#68685f]">
            <p>
              Mostrando {firstOrder}–{lastOrder} de {total} pedidos
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page === 1 || loading}
                className="min-h-9 rounded-md border border-[#d6d6ce] bg-white px-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={page * pageSize >= total || loading}
                className="min-h-9 rounded-md border border-[#d6d6ce] bg-white px-3 font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
      {selectedOrder && (
        <OrderDetailsDialog
          key={selectedOrder.id}
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusUpdated={handleStatusUpdated}
        />
      )}
    </section>
  );
}

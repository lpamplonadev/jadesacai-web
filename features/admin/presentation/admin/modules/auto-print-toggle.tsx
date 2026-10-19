"use client";

import { PrinterIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import type { AdminOrder } from "@/features/admin/domain/orders";
import { printOrderReceipt } from "@/features/admin/application/order-receipt";
import {
  buildOrderReceipt,
  type OrderCatalogNames,
} from "@/features/admin/application/order-receipt-data";

const enabledKey = "jade-auto-print-enabled";
const printedKey = "jade-auto-print-printed";
const pollIntervalMs = 15000;
const gapBetweenPrintsMs = 2000;
const maxOrderAgeMs = 6 * 60 * 60 * 1000;
const maxRememberedOrders = 300;

const enabledListeners = new Set<() => void>();

function subscribeEnabled(listener: () => void) {
  enabledListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    enabledListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readEnabled() {
  return localStorage.getItem(enabledKey) === "true";
}

function writeEnabled(value: boolean) {
  localStorage.setItem(enabledKey, String(value));
  enabledListeners.forEach((listener) => listener());
}

function readPrinted() {
  try {
    const stored = JSON.parse(localStorage.getItem(printedKey) ?? "[]");
    return new Set<string>(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set<string>();
  }
}

function savePrinted(ids: Set<string>) {
  localStorage.setItem(
    printedKey,
    JSON.stringify([...ids].slice(-maxRememberedOrders)),
  );
}

async function fetchRecentOrders() {
  const response = await requestAdminApi("/orders?page=1&limit=30", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Falha ao consultar pedidos.");
  return ((await response.json()) as { orders: AdminOrder[] }).orders;
}

async function fetchCatalogNames(): Promise<OrderCatalogNames> {
  try {
    const response = await requestAdminApi("/catalog", { cache: "no-store" });
    if (!response.ok) return { items: [], combos: [], gourmets: [] };
    const catalog = (await response.json()) as Partial<OrderCatalogNames>;
    return {
      items: catalog.items ?? [],
      combos: catalog.combos ?? [],
      gourmets: catalog.gourmets ?? [],
    };
  } catch {
    return { items: [], combos: [], gourmets: [] };
  }
}

export function AutoPrintToggle() {
  const enabled = useSyncExternalStore(subscribeEnabled, readEnabled, () => false);
  const [message, setMessage] = useState("");
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const orders = await fetchRecentOrders();
      const printed = readPrinted();
      const now = Date.now();
      const pending = orders
        .filter((order) => !printed.has(order.id))
        .reverse();
      const fresh = pending.filter(
        (order) => now - new Date(order.createdAt).getTime() <= maxOrderAgeMs,
      );
      for (const order of pending) {
        if (!fresh.includes(order)) printed.add(order.id);
      }

      if (fresh.length) {
        const catalog = await fetchCatalogNames();
        for (const order of fresh) {
          printed.add(order.id);
          savePrinted(printed);
          setMessage(`Imprimindo pedido #${order.orderNumber}...`);
          await printOrderReceipt(buildOrderReceipt(order, catalog));
          await new Promise((resolve) => setTimeout(resolve, gapBetweenPrintsMs));
        }
      }
      savePrinted(printed);
      setMessage(
        `Última verificação: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
      );
    } catch {
      setMessage("Não foi possível verificar novos pedidos.");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(() => void check(), pollIntervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [enabled, check]);

  async function toggle(next: boolean) {
    if (next) {
      // Pedidos já existentes não devem ser impressos ao ligar.
      try {
        const printed = readPrinted();
        for (const order of await fetchRecentOrders()) printed.add(order.id);
        savePrinted(printed);
      } catch {
        setMessage("Não foi possível ativar. Tente novamente.");
        return;
      }
    } else {
      setMessage("");
    }
    writeEnabled(next);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label
        title="Para imprimir sem diálogo, abra o navegador com --kiosk-printing."
        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[#d6d6ce] bg-white px-3 text-sm font-bold text-[#48483f]"
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => void toggle(event.target.checked)}
          className="h-4 w-4 accent-[#8b1a2e]"
        />
        <PrinterIcon aria-hidden="true" size={17} />
        Impressão automática
      </label>
      {enabled && message && (
        <p role="status" className="text-xs text-[#77776e]">
          {message}
        </p>
      )}
    </div>
  );
}

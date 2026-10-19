export type OrderReceipt = {
  orderNumber: string;
  dateTime: string;
  customerName: string;
  customerPhone: string;
  items: { name: string; subtotal: string; details: string[] }[];
  deliveryFee?: string;
  total: string;
  payment: string;
  change?: string;
  address: string[];
  notes?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Papel 58 mm com área útil de 48 mm; altura contínua.
const receiptStyles = `
  @page { size: 58mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    width: 48mm;
    padding: 2mm 0 6mm;
    color: #000;
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    line-height: 1.3;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  h1 { margin: 0; font-size: 15px; text-align: center; }
  .center { text-align: center; }
  .strong { font-weight: 700; }
  .sep { margin: 5px 0; border-top: 1px dashed #000; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row .value { flex-shrink: 0; text-align: right; }
  .detail { padding-left: 8px; }
  .detail.item { padding-left: 16px; }
  .total { font-size: 14px; font-weight: 700; }
  p { margin: 0; }
`;

export function buildOrderReceiptHtml(receipt: OrderReceipt) {
  const e = escapeHtml;
  const items = receipt.items
    .map(
      (item, index) => `
        <div class="row strong"><span>${index + 1}. ${e(item.name)}</span><span class="value">${e(item.subtotal)}</span></div>
        ${item.details.map((detail) => `<p class="detail${detail.startsWith("º ") ? " item" : ""}">${e(detail)}</p>`).join("")}`,
    )
    .join('<div class="sep"></div>');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${e(receipt.orderNumber)}</title>
<style>${receiptStyles}</style></head>
<body>
  <h1>Jade's Açaí</h1>
  <p class="center strong">Pedido ${e(receipt.orderNumber)}</p>
  <p class="center">${e(receipt.dateTime)}</p>
  <div class="sep"></div>
  <p class="strong">${e(receipt.customerName)}</p>
  <p>${e(receipt.customerPhone)}</p>
  <div class="sep"></div>
  ${items || "<p>Itens indisponíveis.</p>"}
  <div class="sep"></div>
  ${receipt.deliveryFee ? `<div class="row"><span>Entrega</span><span class="value">${e(receipt.deliveryFee)}</span></div>` : ""}
  <div class="row total"><span>TOTAL</span><span class="value">${e(receipt.total)}</span></div>
  <div class="sep"></div>
  <p class="strong">Pagamento</p>
  <p>${e(receipt.payment)}</p>
  ${receipt.change ? `<p>${e(receipt.change)}</p>` : ""}
  <div class="sep"></div>
  <p class="strong">Entrega</p>
  ${receipt.address.map((line) => `<p>${e(line)}</p>`).join("")}
  ${receipt.notes ? `<div class="sep"></div><p class="strong">Obs.</p><p>${e(receipt.notes)}</p>` : ""}
</body></html>`;
}

export function printOrderReceipt(receipt: OrderReceipt) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = buildOrderReceiptHtml(receipt);
  frame.onload = () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) return;
    printWindow.onafterprint = () => frame.remove();
    printWindow.focus();
    printWindow.print();
  };
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 120_000);
}

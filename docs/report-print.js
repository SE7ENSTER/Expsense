// Printing uses the saved receipt images; it never recompresses or edits stored data.
export const REVIEW_PRINT_CSS = `
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:10pt}
.review-head{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;margin-bottom:5mm}
.review-head h2{font-size:18pt;margin:0 0 2mm}.review-head p{margin:0 0 3mm}
.review-actions,button{display:none!important}
.review-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3mm;margin:5mm 0}
.review-field{border:1px solid #ddd;border-radius:3mm;padding:3mm;overflow-wrap:anywhere}
.review-field b{display:block;color:#64748b;font-size:9pt;margin-bottom:2mm}
.table-wrap{overflow:visible}.admin-table{width:100%;border-collapse:collapse;table-layout:fixed}
.admin-table th,.admin-table td{padding:2.5mm;border-bottom:1px solid #ddd;text-align:left;overflow-wrap:anywhere}
thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
.workflow-timeline{margin:4mm 0}.workflow-timeline h3{font-size:11pt}
.workflow-milestones{display:flex;flex-wrap:wrap;gap:3mm 7mm;font-size:9pt}
.workflow-milestones div{min-width:40mm}.workflow-milestones dt{color:#64748b}.workflow-milestones dd{margin:1mm 0}
.receipt-print-page{break-before:page;page-break-before:always;break-inside:avoid;page-break-inside:avoid}
.receipt-print-heading{font-size:11pt;margin:0 0 4mm;overflow-wrap:anywhere}
.receipt-print-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6mm;height:152mm;min-width:0}
.receipt-print-slot{margin:0;border:1px solid #ddd;border-radius:3mm;padding:3mm;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.receipt-print-slot p{font-size:9pt;margin:0 0 3mm;overflow-wrap:anywhere;flex:0 0 auto}
.receipt-print-image{flex:1;min-height:0;min-width:0}
.receipt-print-image img{display:block;width:100%;height:100%;object-fit:scale-down;object-position:center}
.receipt-print-empty{border-style:dashed}.receipt-only .receipt-print-page:first-child{break-before:auto;page-break-before:auto}
#print-status{color:#64748b;font-size:10pt}
@media print{#print-status{display:none!important}}
`;
export function prepareReviewPrint(modal) {
  const box = modal.querySelector(".review-box").cloneNode(true);
  box.querySelectorAll("button").forEach((button) => button.remove());
  const grid = box.querySelector(".receipt-grid");
  const receiptItems = grid ? [...grid.querySelectorAll(".receipt-item")] : [];
  const receiptsOnly =
    box.querySelector(".review-head h2")?.textContent.trim() ===
    "Receipt Attachments";
  if (receiptItems.length) {
    const previous = grid.previousElementSibling;
    if (
      previous?.tagName === "H3" &&
      previous.textContent.trim() === "Receipts"
    )
      previous.remove();
    const pages = box.ownerDocument.createDocumentFragment();
    const reportNo =
      box.querySelector(".report-no")?.textContent || "Expense report";
    for (let index = 0; index < receiptItems.length; index += 2) {
      const page = box.ownerDocument.createElement("section");
      page.className = "receipt-print-page";
      const heading = box.ownerDocument.createElement("h3");
      heading.className = "receipt-print-heading";
      heading.textContent =
        reportNo +
        " · Receipts " +
        (index + 1) +
        "-" +
        Math.min(index + 2, receiptItems.length) +
        " of " +
        receiptItems.length;
      const pair = box.ownerDocument.createElement("div");
      pair.className = "receipt-print-pair";
      for (let slot = 0; slot < 2; slot++) {
        const item = receiptItems[index + slot];
        if (item) {
          item.classList.add("receipt-print-slot");
          const image = item.querySelector("img");
          const frame = box.ownerDocument.createElement("div");
          frame.className = "receipt-print-image";
          frame.appendChild(image);
          item.appendChild(frame);
          pair.appendChild(item);
        } else {
          const empty = box.ownerDocument.createElement("div");
          empty.className = "receipt-print-slot receipt-print-empty";
          empty.setAttribute("aria-hidden", "true");
          pair.appendChild(empty);
        }
      }
      page.appendChild(heading);
      page.appendChild(pair);
      pages.appendChild(page);
    }
    grid.replaceWith(pages);
    if (receiptsOnly)
      [...box.children].forEach((child) => {
        if (!child.classList.contains("receipt-print-page")) child.remove();
      });
  }
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>EXPENSiO | Expense Report Review</title><style>' +
    REVIEW_PRINT_CSS +
    '</style></head><body class="' +
    (receiptsOnly ? "receipt-only" : "") +
    '"><p id="print-status" role="status">Preparing receipt images…</p>' +
    box.innerHTML +
    "</body></html>"
  );
}
export async function waitForPrintImages(printDocument, timeoutMs = 12000) {
  const images = [...(printDocument.querySelectorAll?.("img") || [])];
  const waits = images.map((image) =>
    new Promise((resolve, reject) => {
      if (image.complete) {
        if (image.naturalWidth > 0) resolve();
        else
          reject(
            Error(
              "A receipt image could not be loaded. Close this window and try again.",
            ),
          );
        return;
      }
      const loaded = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(
          Error(
            "A receipt image could not be loaded. Close this window and try again.",
          ),
        );
      };
      const cleanup = () => {
        image.removeEventListener("load", loaded);
        image.removeEventListener("error", failed);
      };
      image.addEventListener("load", loaded, { once: true });
      image.addEventListener("error", failed, { once: true });
    }).then(async () => {
      if (typeof image.decode === "function") await image.decode();
    }),
  );
  let timeout;
  try {
    await Promise.race([
      Promise.all(waits),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              Error(
                "Receipt images are still loading. Close this window and try again.",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
    if (printDocument.fonts?.ready) await printDocument.fonts.ready;
  } finally {
    clearTimeout(timeout);
  }
}
export async function printReviewModal(modal) {
  const html = prepareReviewPrint(modal);
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    alert("Please allow pop-ups to print this report.");
    return false;
  }
  try {
    popup.document.write(html);
    popup.document.close();
    await waitForPrintImages(popup.document);
    if (popup.closed) return false;
    const status = popup.document.getElementById?.("print-status");
    if (status) status.remove();
    popup.focus?.();
    popup.print?.();
    return true;
  } catch (error) {
    const status = popup.document.getElementById?.("print-status");
    if (status) status.textContent = error.message;
    alert("Cannot print report: " + error.message);
    return false;
  }
}

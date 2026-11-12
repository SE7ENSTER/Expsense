// The dashboard has one compact view. Pagination never changes report order.
const REPORT_PAGE_SIZE = 10;
let activeReportPage = 0;
let lastTableSignature = "";
const compactStatus = (status) =>
  ({
    "Manager Approved": "Approved",
    "Finance Processing": "In progress",
    "Reimbursement Processing": "In progress",
    "Revision Requested": "Revision",
    Reimbursed: "Paid",
  })[status] || status;
function parseCard(card) {
  const tripNode = card.querySelector("p.muted:not(.small)")?.cloneNode(true);
  tripNode?.querySelector(".report-no")?.remove();
  return {
    id: card.dataset.reportId || "",
    number: card.dataset.reportNumber || "Not assigned",
    status: card.dataset.status || "Draft",
    purpose: card.querySelector("h3")?.textContent?.trim() || "Untitled report",
    trip: tripNode?.textContent?.replace(/^\s*·\s*/, "").trim() || "",
    amount:
      card.querySelector(".row strong")?.textContent?.trim() || "HKD 0.00",
  };
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function buildTable() {
  const list = document.getElementById("reportList");
  if (!list) return;
  let wrap = document.getElementById("reportTableWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "reportTableWrap";
    list.after(wrap);
  }
  const reports = [...list.querySelectorAll(".report-card")]
    .filter((card) => !card.classList.contains("history-hidden"))
    .map(parseCard);
  if (!reports.length) activeReportPage = 0;
  activeReportPage = Math.min(
    Math.max(0, activeReportPage),
    Math.max(0, Math.ceil(reports.length / REPORT_PAGE_SIZE) - 1),
  );
  const start = activeReportPage * REPORT_PAGE_SIZE;
  const rows = reports.slice(start, start + REPORT_PAGE_SIZE);
  const empty =
    list.getAttribute("aria-busy") === "true"
      ? "Loading reports…"
      : "No active reports.";
  const signature = JSON.stringify([activeReportPage, reports, empty]);
  if (signature === lastTableSignature && wrap.dataset.signature === signature)
    return;
  lastTableSignature = signature;
  wrap.dataset.signature = signature;
  if (!rows.length) {
    wrap.innerHTML = `<div class="report-grid-empty">${empty}</div>`;
    return;
  }
  wrap.innerHTML = `<div class="report-table-scroll"><table class="report-grid compact-report-table" aria-label="Current reports"><thead><tr><th scope="col">Report No.</th><th scope="col">Purpose / Trip</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead><tbody>${rows.map((r, index) => `<tr data-report-row="${index}" data-report-id="${escapeHtml(r.id)}"><td data-label="Report No." class="cell-report-no"><button type="button" class="report-open" data-report-open="${escapeHtml(r.id)}" title="${escapeHtml(r.number)}">${escapeHtml(r.number)}</button></td><td data-label="Purpose / Trip" class="cell-purpose" title="${escapeHtml(r.purpose + " · " + r.trip)}">${escapeHtml(r.purpose)}</td><td data-label="Total" class="cell-total" title="${escapeHtml(r.amount)}">${escapeHtml(r.amount)}</td><td data-label="Status"><span class="pill ${r.status === "Submitted" ? "submitted" : ""}" title="${escapeHtml(r.status)}">${escapeHtml(compactStatus(r.status))}</span></td></tr>`).join("")}</tbody></table></div><div class="report-pagination"><span class="report-page-count" role="status" aria-live="polite">${start + 1}–${start + rows.length} of ${reports.length} reports</span><div>${start ? '<button type="button" class="secondary" id="currentReportsPrevious">Previous</button>' : ""}${start + rows.length < reports.length ? '<button type="button" class="secondary" id="currentReportsMore">More <span aria-hidden="true">→</span></button>' : ""}</div></div>`;
  wrap.querySelectorAll("[data-report-row]").forEach((row) =>
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      window.openReport?.(row.dataset.reportId);
    }),
  );
  wrap.querySelectorAll("[data-report-open]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      window.openReport?.(button.dataset.reportOpen);
    }),
  );
  const movePage = (delta) => {
    activeReportPage += delta;
    buildTable();
    wrap.querySelector("[data-report-open]")?.focus?.();
  };
  document
    .getElementById("currentReportsMore")
    ?.addEventListener("click", () => movePage(1));
  document
    .getElementById("currentReportsPrevious")
    ?.addEventListener("click", () => movePage(-1));
}
function init() {
  document.body.classList.add("report-table-mode");
  document.body.classList.remove("report-card-mode");
  document.getElementById("reportViewToggle")?.remove();
  const toolbar = document.querySelector("#dashboard > .toolbar");
  toolbar?.querySelector("div")?.classList.add("report-title-wrap");
  const list = document.getElementById("reportList");
  if (list && !list.__reportViewObserved) {
    list.__reportViewObserved = true;
    new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === "childList" && m.target === list))
        buildTable();
    }).observe(list, { childList: true });
  }
  buildTable();
}
init();

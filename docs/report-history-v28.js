import { on } from "./app-events.js";
import { compareReports } from "./report-dashboard.js";
let me = null,
  historyReports = [];
let lastHistorySignature = "";
let historyPage = 0;
const HISTORY_PAGE_SIZE = 10;
const compactStatus = (status) =>
  ({
    "Manager Approved": "Approved",
    "Finance Processing": "In progress",
    "Reimbursement Processing": "In progress",
    "Revision Requested": "Revision",
    Reimbursed: "Paid",
  })[status] || status;
const DONE = ["Reimbursed", "Closed"];
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v || "").replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[c],
  );
const money = (n) =>
  "HKD " +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function isDone(status) {
  return DONE.includes(String(status || "").trim());
}
function total(r) {
  return +(
    r.totalHkd ||
    (r.items || []).reduce((s, i) => s + (+i.amount || 0) * (+i.fx || 0), 0)
  );
}
function period(r) {
  const m = r.meta || {};
  return `${m.destination || "No destination"} · ${m.fromDate || "-"} to ${m.toDate || "-"}`;
}
function reportNo(r) {
  return r.reportNo || r.runNumber || r.id || "-";
}
function ensureSection() {
  const dashboard = $("dashboard"),
    list = $("reportList");
  if (!dashboard || !list) return null;
  let section = $("reportHistorySection");
  if (!section) {
    section = document.createElement("section");
    section.id = "reportHistorySection";
    section.className = "history-section";
    (document.getElementById("reportTableWrap") || list).after(section);
  }
  return section;
}
function reviewHistory(id) {
  if (!id) return;
  if (typeof window.reviewReport === "function") window.reviewReport(id);
  else if (typeof window.openReport === "function") window.openReport(id);
}
function renderHistory() {
  const section = ensureSection();
  if (!section) return;
  historyPage = Math.min(
    Math.max(0, historyPage),
    Math.max(0, Math.ceil(historyReports.length / HISTORY_PAGE_SIZE) - 1),
  );
  const start = historyPage * HISTORY_PAGE_SIZE;
  const visible = historyReports.slice(start, start + HISTORY_PAGE_SIZE);
  const sig = JSON.stringify([
    historyPage,
    historyReports.map((r) => [
      r.id,
      reportNo(r),
      r.status,
      r.meta?.purpose,
      period(r),
      total(r),
    ]),
  ]);
  if (sig === lastHistorySignature && section.innerHTML) return;
  lastHistorySignature = sig;
  if (!historyReports.length) {
    section.innerHTML = "";
    section.classList.add("hide");
    return;
  }
  section.classList.remove("hide");
  section.innerHTML = `<div class="history-card"><div class="history-head"><div><h2>History</h2><p>Completed expense reports, sorted by report number.</p></div><span class="history-badge">${historyReports.length} completed</span></div><div class="history-table-wrap"><table class="history-table compact-report-table" aria-label="Report history"><thead><tr><th scope="col">Report No.</th><th scope="col">Purpose / Trip</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead><tbody>${visible.map((r) => `<tr data-history-open="${esc(r.id)}"><td data-label="Report No."><button type="button" class="report-open" data-history-review="${esc(r.id)}" title="${esc(reportNo(r))}">${esc(reportNo(r))}</button></td><td data-label="Purpose / Trip" class="history-purpose" title="${esc((r.meta?.purpose || "Untitled report") + " · " + period(r))}">${esc(r.meta?.purpose || "Untitled report")}</td><td data-label="Total" class="history-total" title="${esc(money(total(r)))}">${money(total(r))}</td><td data-label="Status"><span class="pill" title="${esc(r.status)}">${esc(compactStatus(r.status || "Reimbursed"))}</span></td></tr>`).join("")}</tbody></table></div><div class="report-pagination"><span class="report-page-count" role="status" aria-live="polite">${start + 1}–${start + visible.length} of ${historyReports.length} reports</span><div>${start ? '<button type="button" class="secondary" id="historyReportsPrevious">Previous</button>' : ""}${start + visible.length < historyReports.length ? '<button type="button" class="secondary" id="historyReportsMore">More <span aria-hidden="true">→</span></button>' : ""}</div></div></div>`;
  section.querySelectorAll("[data-history-open]").forEach((row) =>
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      reviewHistory(row.dataset.historyOpen);
    }),
  );
  section.querySelectorAll("[data-history-review]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      reviewHistory(button.dataset.historyReview);
    }),
  );
  const movePage = (delta) => {
    historyPage += delta;
    renderHistory();
    section.querySelector("[data-history-review]")?.focus?.();
  };
  $("historyReportsMore")?.addEventListener("click", () => movePage(1));
  $("historyReportsPrevious")?.addEventListener("click", () => movePage(-1));
}
on("session", (data) => {
  me = data.user;
  historyReports = [];
  historyPage = 0;
  lastHistorySignature = "";
  $("reportHistorySection")?.remove();
});
on("reports-loaded", async (data) => {
  historyReports = data.reports
    .filter((r) => r.userId === me?.uid && isDone(r.status))
    .sort(compareReports);
  renderHistory();
});

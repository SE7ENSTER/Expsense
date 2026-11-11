import { db } from "./firebase-client.js";
import { on } from "./app-events.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
let me = null,
  profile = { role: "user" },
  historyReports = [];
let lastHistorySignature = "";
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
function receipts(r) {
  return (r.items || []).filter(
    (i) => i.receiptData || i.receiptFileData || i.receiptName,
  ).length;
}
function period(r) {
  const m = r.meta || {};
  return `${m.destination || "No destination"} · ${m.fromDate || "-"} to ${m.toDate || "-"}`;
}
function reportNo(r) {
  return r.reportNo || r.runNumber || r.id || "-";
}
function doneDate(r) {
  const ts = r.paymentAt || r.reimbursedAt || r.updatedAt || r.createdAt;
  return ts?.seconds ? new Date(ts.seconds * 1000).toLocaleDateString() : "-";
}
async function loadHistory() {
  if (!me) return;
  const uid = me.uid;
  try {
    let rq;
    if (profile.role === "admin") rq = collection(db, "expenseReports");
    else if (profile.role === "finance")
      rq = query(collection(db, "expenseReports"), where("status", "in", DONE));
    else
      rq = query(
        collection(db, "expenseReports"),
        where("userId", "==", me.uid),
      );
    const snap = await getDocs(rq);
    if (me?.uid !== uid) return;
    historyReports = snap.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .filter((r) => isDone(r.status))
      .sort(
        (a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0),
      );
    renderHistory();
  } catch (e) {
    console.warn("History load failed", e.message);
  }
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
  const sig = JSON.stringify(
    historyReports.map((r) => [
      r.id,
      r.status,
      r.updatedAt?.seconds || 0,
      r.paymentReference || "",
    ]),
  );
  if (sig === lastHistorySignature && section.innerHTML) return;
  lastHistorySignature = sig;
  if (!historyReports.length) {
    section.innerHTML = "";
    section.classList.add("hide");
    return;
  }
  section.classList.remove("hide");
  section.innerHTML = `<div class="history-card"><div class="history-head"><div><h2>History / Reimbursed Reports</h2><p>Completed reports moved from the active dashboard for easier tracking.</p></div><span class="history-badge">${historyReports.length} completed</span></div><div class="history-table-wrap"><table class="history-table"><thead><tr><th>Report No.</th><th>Status</th><th>Purpose / Trip</th><th>User</th><th>Total</th><th>Receipts</th><th>Completed</th><th>Action</th></tr></thead><tbody>${historyReports.map((r) => `<tr data-history-open="${esc(r.id)}"><td data-label="Report No.">${esc(reportNo(r))}</td><td data-label="Status"><span class="pill">${esc(r.status || "Reimbursed")}</span></td><td data-label="Purpose / Trip" class="history-purpose"><strong>${esc(r.meta?.purpose || "Untitled report")}</strong><span>${esc(period(r))}</span></td><td data-label="User">${esc(r.userEmail || "")}</td><td data-label="Total" class="history-total">${money(total(r))}</td><td data-label="Receipts">${receipts(r)}</td><td data-label="Completed">${doneDate(r)}</td><td data-label="Action"><button type="button" class="secondary review-btn" data-history-review="${esc(r.id)}">Review</button></td></tr>`).join("")}</tbody></table></div></div>`;
  section.querySelectorAll("[data-history-open]").forEach((row) =>
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      if (window.openReport) window.openReport(row.dataset.historyOpen);
    }),
  );
  section.querySelectorAll("[data-history-review]").forEach((btn) =>
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      reviewHistory(btn.dataset.historyReview);
    }),
  );
}
on("session", (data) => {
  me = data.user;
  profile = data.profile || { role: "user" };
  historyReports = [];
  lastHistorySignature = "";
  $("reportHistorySection")?.remove();
});
on("reports-loaded", async (data) => {
  if (profile.role === "manager") {
    await loadHistory();
    return;
  }
  historyReports = data.reports
    .filter((r) => isDone(r.status))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  renderHistory();
});

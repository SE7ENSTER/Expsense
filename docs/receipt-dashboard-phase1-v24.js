import { on, emit } from "./app-events.js";
let reports = [];
const $ = (id) => document.getElementById(id);
const money = (n) =>
  "HKD " +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function fiscal(d) {
  const x = d ? new Date(d) : new Date();
  return "FY" + (x.getMonth() >= 10 ? x.getFullYear() + 1 : x.getFullYear());
}
function reportFy(r) {
  return r.fiscalYear || fiscal(r.meta?.fromDate);
}
function rawTotal(r) {
  return +(
    r.totalHkd ||
    (r.items || []).reduce((s, i) => s + (+i.amount || 0) * (+i.fx || 0), 0)
  );
}
function hasReceipt(i) {
  return !!(i.receiptData || i.receiptFileData || i.receiptName);
}
function nextStep(status) {
  return (
    {
      Draft: "Please complete and submit this report.",
      Submitted: "Waiting for Manager review.",
      "Manager Approved": "Waiting for Finance processing.",
      "Finance Processing": "Finance is processing reimbursement.",
      "Reimbursement Processing": "Finance is processing reimbursement.",
      Reimbursed: "Completed / reimbursed.",
      Closed: "Completed / closed.",
      Rejected: "Rejected. Please review manager comment.",
      "Revision Requested": "Revision required. Please revise and resubmit.",
    }[status || "Draft"] || "Waiting for next action."
  );
}
function currentFyList() {
  const n = +fiscal().replace("FY", "");
  return ["FY" + (n - 1), "FY" + n, "FY" + (n + 1)];
}
function renderSummary() {
  const anchor = $("budgetSummary") || $("reportList");
  if (!anchor) return;
  let box = $("phase1ReportSummary");
  if (!box) {
    box = document.createElement("section");
    box.id = "phase1ReportSummary";
    anchor.after(box);
  }
  let fySel = $("phase1FyFilter")?.value || fiscal();
  const fyOptions = currentFyList()
    .map((x) => `<option ${x === fySel ? "selected" : ""}>${x}</option>`)
    .join("");
  const data = reports.filter((r) => reportFy(r) === fySel);
  const submitted = data.filter((r) => r.status === "Submitted");
  const approved = data.filter((r) => r.status === "Manager Approved");
  const processing = data.filter((r) =>
    ["Finance Processing", "Reimbursement Processing"].includes(r.status),
  );
  const reimbursed = data.filter((r) =>
    ["Reimbursed", "Closed"].includes(r.status),
  );
  const total = data.reduce((s, r) => s + rawTotal(r), 0);
  const pending = submitted.reduce((s, r) => s + rawTotal(r), 0);
  const receiptCount = data.reduce(
    (s, r) => s + (r.items || []).filter(hasReceipt).length,
    0,
  );
  box.innerHTML = `<div class="summary-title-row"><div><h2>Expense Report Summary</h2><p class="muted">Summary of your personal expense reports only.</p></div><label>Fiscal Year<select id="phase1FyFilter">${fyOptions}</select></label></div><div class="dash-summary"><div class="card"><div class="muted">Total Reports</div><strong>${data.length}</strong></div><div class="card"><div class="muted">Pending Manager</div><strong>${submitted.length}</strong><p class="muted">${money(pending)}</p></div><div class="card"><div class="muted">Manager Approved</div><strong>${approved.length}</strong></div><div class="card"><div class="muted">Processing</div><strong>${processing.length}</strong></div><div class="card"><div class="muted">Reimbursed</div><strong>${reimbursed.length}</strong></div><div class="card"><div class="muted">Total Claimed</div><strong>${money(total)}</strong><p class="muted">${receiptCount} receipt(s)</p></div></div>`;
  $("phase1FyFilter").onchange = renderSummary;
  emit("summary-rendered");
}

on("reports-loaded", (data) => {
  reports = data.reports.filter((report) => report.userId === data.user?.uid);
  renderSummary();
});
on("session", (data) => {
  if (!data.user) {
    reports = [];
    $("phase1ReportSummary")?.remove();
  }
});

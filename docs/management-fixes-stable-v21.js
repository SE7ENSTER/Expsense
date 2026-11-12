import { on } from "./app-events.js";
let me = null,
  profile = { role: "user" };
const $ = (id) => document.getElementById(id);
const canApprove = () => ["admin", "manager"].includes(profile.role);
function updateWording() {
  document.querySelectorAll("*").forEach((el) => {
    if (el.children.length === 0 && el.textContent) {
      let t = el.textContent;
      if (t.trim() === "Remaining") t = "Budget Remaining";
      t = t
        .replace(/\bRemain\s+HKD/g, "Budget Remaining HKD")
        .replace(/Finance Processing/g, "Reimbursement Processing")
        .replace(/Financial Processing/g, "Reimbursement Processing");
      if (t !== el.textContent) el.textContent = t;
    }
  });
}
function styleActionButtons() {
  document.querySelectorAll("button").forEach((btn) => {
    const t = btn.textContent.trim().toLowerCase();
    btn.classList.toggle("btn-approve", t === "approve");
    btn.classList.toggle("btn-reject", t === "reject");
    btn.classList.toggle(
      "btn-revision",
      t === "revision" || t.includes("revision"),
    );
    btn.classList.toggle("btn-review", t === "review" || t === "review report");
    btn.classList.toggle("btn-receipt", t === "receipt" || t === "receipts");
    btn.classList.toggle(
      "btn-process",
      t === "process" || t.includes("reimbursement") || t === "reimbursed",
    );
  });
}
function getReportIdFromRow(row) {
  const btn = [...row.querySelectorAll("button")].find(
    (b) =>
      (b.getAttribute("onclick") || "").includes("managerAction") ||
      (b.getAttribute("onclick") || "").includes("managerApprove"),
  );
  const m = (btn?.getAttribute("onclick") || "").match(/['\"]([^'\"]+)['\"]/);
  return m ? m[1] : "";
}
function addBatchApprove() {
  const note = document
    .querySelector("#reviewReports")
    ?.closest(".table-card")
    ?.querySelector(".admin-note");
  if (note && canApprove() && !$("batchApproveBtn")) {
    const wrap = document.createElement("div");
    wrap.className = "batch-toolbar";
    wrap.innerHTML =
      '<button id="batchApproveBtn" class="btn-approve" onclick="batchApproveSelected()">Batch Approve Selected</button><span class="muted small">Select submitted reports below, then approve together.</span>';
    note.appendChild(wrap);
  }
  document.querySelectorAll("#reviewReports tr").forEach((row) => {
    if (
      row.classList.contains("category-row") ||
      row.querySelector(".batch-select")
    )
      return;
    const id = getReportIdFromRow(row);
    if (!id) return;
    row.cells[0]?.insertAdjacentHTML(
      "afterbegin",
      `<input type="checkbox" class="batch-select" data-report-id="${id}"> `,
    );
  });
}
window.batchApproveSelected = async () => {
  if (!canApprove()) return alert("Admin or Manager only.");
  const selected = [...document.querySelectorAll(".batch-select:checked")]
    .map((x) => x.dataset.reportId)
    .filter(Boolean);
  if (!selected.length)
    return alert("Please select at least one submitted report.");
  const comment = prompt("Batch approval comment:");
  if (comment === null) return;
  let approved = 0;
  for (const id of selected) {
    if (await window.managerAction(id, "Manager Approved", comment)) approved++;
  }
  alert(approved + " report(s) approved.");
};

function addPrintButtons() {
  document.querySelectorAll(".review-modal").forEach((modal) => {
    const head = modal.querySelector(".review-head");
    if (!head || head.querySelector(".btn-print")) return;
    const btn = document.createElement("button");
    btn.className = "btn-print";
    btn.textContent = "Print / Save PDF";
    btn.onclick = () => printReviewModal(modal);
    head.appendChild(btn);
  });
}
function printReviewModal(modal) {
  const box = modal.querySelector(".review-box").cloneNode(true);
  box.querySelectorAll("button").forEach(button => button.remove());
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return alert("Please allow pop-ups to print this report.");
  w.document.write(
    `<html><head><title>EXPENSiO | Expense Report Review</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:24px}.review-head{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;margin-bottom:18px}.ghost,.btn-print{display:none}.review-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.review-field{border:1px solid #ddd;border-radius:10px;padding:10px}.review-field b{display:block;color:#64748b;font-size:12px;margin-bottom:6px}.admin-table{width:100%;border-collapse:collapse}.admin-table th,.admin-table td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.receipt-grid{display:grid;grid-template-columns:1fr;gap:18px}.receipt-item{page-break-inside:avoid;border:1px solid #ddd;border-radius:12px;padding:12px}.receipt-item img{max-width:100%;height:auto}@media print{body{margin:12mm}}</style></head><body>${box.innerHTML}</body></html>`,
  );
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 500);
}
function applyFixes() {
  updateWording();
  styleActionButtons();
  addBatchApprove();
  addPrintButtons();
}
on("session", (data) => {
  me = data.user;
  profile = data.profile || { role: "user" };
});
on("management-rendered", applyFixes);
on("review-opened", addPrintButtons);

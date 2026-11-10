import { db } from "./firebase-client.js";
import { on, emit } from "./app-events.js";
import { reportNumber } from "./report-dashboard.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let me = null,
  profile = { role: "user" },
  reports = [],
  users = [],
  budgets = [],
  activeReportId = "";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v || "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
const money = (n) =>
  "HKD " +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const isAdmin = () => profile.role === "admin",
  isManager = () => profile.role === "manager",
  isFinance = () => profile.role === "finance",
  canManage = () => isAdmin() || isManager() || isFinance();
const rawTotal = (r) =>
  +(
    r.totalHkd ||
    (r.items || []).reduce((s, i) => s + (+i.amount || 0) * (+i.fx || 0), 0)
  );
const fiscal = (d) => {
  const x = d ? new Date(d) : new Date();
  return "FY" + (x.getMonth() >= 10 ? x.getFullYear() + 1 : x.getFullYear());
};
const reportFy = (r) => r.fiscalYear || fiscal(r.meta?.fromDate);
const reportLabel = (r) => reportNumber(r) || r.id || "Not assigned";
const dispStatus = (s) =>
  s === "Finance Processing" || s === "Financial Processing"
    ? "Reimbursement Processing"
    : s || "Draft";
const statusCls = (s) => {
  s = dispStatus(s);
  if (s === "Manager Approved") return "ok";
  if (s === "Submitted") return "warn";
  if (s === "Reimbursement Processing") return "process";
  if (s === "Reimbursed") return "paid";
  if (s === "Rejected") return "red";
  return "gray";
};
const css =
  ".mgmt-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.mgmt-filter{display:grid;grid-template-columns:150px 180px minmax(180px,1fr) auto auto;gap:12px;align-items:end;padding:18px;margin-top:20px}.mgmt-actions{display:flex;gap:8px;flex-wrap:wrap}.mgmt-chip{display:inline-flex;border-radius:999px;padding:7px 11px;font-weight:900;font-size:12px}.mgmt-chip.ok{background:#ecfdf3;color:#027a48}.mgmt-chip.warn{background:#fff8e6;color:#b7791f}.mgmt-chip.process{background:#eef4ff;color:#3538cd}.mgmt-chip.paid{background:#f0fdf4;color:#15803d}.mgmt-chip.red{background:#fff1f3;color:#b42336}.mgmt-chip.gray{background:#f2f4f7;color:#475467}.report-no{font-size:12px;font-weight:950;color:#0b6bff}.category-row td{background:#eef6ff!important;color:#164b8b;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.review-btn,.receipt-btn{border-radius:14px!important;padding:9px 12px!important;font-size:12px!important;box-shadow:none!important}.review-btn{background:#eef6ff!important;color:#0b6bff!important;border:1px solid #cfe0ff!important}.receipt-btn{background:#f3f6fb!important;color:#344054!important}.review-modal{position:fixed;inset:0;background:#10233ab3;z-index:1200;display:grid;place-items:center;padding:22px}.review-box{background:white;border-radius:28px;max-width:1180px;width:96vw;max-height:92vh;overflow:auto;padding:24px;box-shadow:0 30px 90px #0005}.review-head{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #d9e4f2;padding-bottom:16px}.review-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.review-field{background:#f8fbff;border:1px solid #e4ebf5;border-radius:16px;padding:13px}.review-field b{display:block;font-size:12px;color:#667085;margin-bottom:4px}.receipt-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.receipt-item{border:1px solid #d9e4f2;border-radius:18px;padding:14px;background:#fbfdff}.receipt-item img{width:100%;max-height:none;height:auto;object-fit:contain;border-radius:14px;background:#f2f4f7}.inline-actions{gap:8px;flex-wrap:wrap}.budget-save-all{margin-left:12px}@media(max-width:900px){.mgmt-filter,.mgmt-summary,.review-grid,.receipt-grid{grid-template-columns:1fr}}";
const st = document.createElement("style");
st.textContent = css;
document.head.appendChild(st);

async function loadData(refreshReports = true) {
  if (!me || !canManage()) return;
  const uid = me.uid;
  let nextUsers = [],
    nextBudgets = [];
  try {
    nextUsers = (await getDocs(collection(db, "users"))).docs.map((d) => ({
      ...d.data(),
      id: d.id,
    }));
  } catch (error) {}
  try {
    nextBudgets = (await getDocs(collection(db, "budgets"))).docs.map((d) => ({
      ...d.data(),
      id: d.id,
    }));
  } catch (error) {}
  if (me?.uid !== uid) return;
  users = nextUsers;
  budgets = nextBudgets;
  if (refreshReports) {
    const refreshed = await window.refreshDashboardReports?.();
    if (refreshed) reports = refreshed;
  }
  if (me?.uid === uid) renderAll();
}

function bFor(uid, fy) {
  const b = budgets.find((x) => x.userId === uid && x.fiscalYear === fy),
    amount = +(b?.budgetAmount || 0),
    mine = reports.filter((r) => r.userId === uid && reportFy(r) === fy),
    used = mine
      .filter((r) =>
        [
          "Manager Approved",
          "Finance Processing",
          "Reimbursed",
          "Closed",
        ].includes(r.status),
      )
      .reduce((s, r) => s + rawTotal(r), 0),
    pending = mine
      .filter((r) => r.status === "Submitted")
      .reduce((s, r) => s + rawTotal(r), 0);
  return { amount, used, pending, available: amount - used - pending };
}
function fyList() {
  const n = +fiscal().replace("FY", "");
  return ["FY" + (n - 1), "FY" + n, "FY" + (n + 1)];
}
function filter() {
  return {
    fy: $("mgmtFyFilter")?.value || "All",
    st: $("mgmtStatusFilter")?.value || "All",
    q: ($("mgmtEmployeeFilter")?.value || "").toLowerCase().trim(),
  };
}
function rows() {
  const f = filter();
  return reports.filter((r) => {
    const m = r.meta || {},
      txt = (m.employee + " " + r.userEmail + " " + m.purpose).toLowerCase();
    return (
      (f.fy === "All" || reportFy(r) === f.fy) &&
      (f.st === "All" || r.status === f.st) &&
      (!f.q || txt.includes(f.q))
    );
  });
}
function renderAll() {
  if (canManage()) {
    injectFilter();
    renderCompanyBudget();
    renderBudget();
    renderQueue();
    renderVisible();
    if ($("adminSubmittedCount"))
      $("adminSubmittedCount").textContent = reports.filter(
        (r) => r.status === "Submitted",
      ).length;
    if ($("adminUserCount")) $("adminUserCount").textContent = users.length;
    emit("management-rendered");
  }
}

function injectFilter() {
  if ($("mgmtFilterBox")) return;
  const grid = document.querySelector("#admin .admin-grid");
  if (!grid) return;
  const box = document.createElement("div");
  box.id = "mgmtFilterBox";
  box.className = "card mgmt-filter";
  box.innerHTML = `<label>Fiscal Year<select id="mgmtFyFilter"><option>All</option>${fyList()
    .map((x) => `<option>${x}</option>`)
    .join(
      "",
    )}</select></label><label>Status<select id="mgmtStatusFilter"><option>All</option><option>Submitted</option><option>Manager Approved</option><option>Finance Processing</option><option>Reimbursed</option><option>Rejected</option><option>Revision Requested</option><option>Closed</option></select></label><label>Employee / Email<input id="mgmtEmployeeFilter" placeholder="Search"></label><div class="mgmt-actions"><button class="secondary" id="mgmtApply">Apply</button><button class="secondary" id="mgmtClear">Clear</button></div><button id="exportCsvBtn">Export CSV</button>`;
  grid.after(box);
  $("mgmtApply").onclick = renderAll;
  $("mgmtClear").onclick = () => {
    $("mgmtFyFilter").value = "All";
    $("mgmtStatusFilter").value = "All";
    $("mgmtEmployeeFilter").value = "";
    renderAll();
  };
  $("exportCsvBtn").onclick = exportCsv;
}
function renderCompanyBudget() {
  let box = $("companyBudget");
  if (!box) {
    box = document.createElement("div");
    box.id = "companyBudget";
    box.className = "mgmt-summary";
    $("mgmtFilterBox")?.after(box);
  }
  const fy = $("budgetFySelect")?.value || fiscal(),
    totalBudget = budgets
      .filter((b) => b.fiscalYear === fy)
      .reduce((s, b) => s + (+b.budgetAmount || 0), 0),
    used = reports
      .filter(
        (r) =>
          reportFy(r) === fy &&
          [
            "Manager Approved",
            "Finance Processing",
            "Reimbursed",
            "Closed",
          ].includes(r.status),
      )
      .reduce((s, r) => s + rawTotal(r), 0),
    pending = reports
      .filter((r) => reportFy(r) === fy && r.status === "Submitted")
      .reduce((s, r) => s + rawTotal(r), 0);
  box.innerHTML = `<div class="card"><div class="muted">Company Budget ${fy}</div><strong>${money(totalBudget)}</strong></div><div class="card"><div class="muted">Approved / Used</div><strong>${money(used)}</strong></div><div class="card"><div class="muted">Pending Claims</div><strong>${money(pending)}</strong></div><div class="card"><div class="muted">Remaining</div><strong>${money(totalBudget - used - pending)}</strong></div>`;
}
function renderBudget() {
  const sel = $("budgetFySelect"),
    body = $("budgetRows");
  if (!sel || !body) return;
  if (!sel.options.length) {
    fyList().forEach((x) => sel.add(new Option(x, x)));
    sel.value = fiscal();
  }
  sel.onchange = renderAll;
  const fy = sel.value,
    people = users.length
      ? users
      : reports
          .map((r) => ({ id: r.userId, email: r.userEmail, role: "user" }))
          .filter((v, i, a) => v.id && a.findIndex((x) => x.id === v.id) === i);
  body.innerHTML =
    people
      .map((u) => {
        const b = bFor(u.id, fy);
        return `<tr><td>${esc(u.email || u.id)}</td><td><span class="pill ${u.role || "user"}">${u.role || "user"}</span></td><td><input id="budget-${u.id}" class="budget-input" type="number" value="${b.amount || ""}" ${isAdmin() ? "" : "disabled"}></td><td>${money(b.used)}</td><td>${money(b.pending)}</td><td>${money(b.available)}</td><td>${isAdmin() ? `<button class="secondary" onclick="saveBudget('${u.id}')">Save</button>` : "View only"}</td></tr>`;
      })
      .join("") || '<tr><td colspan="7">No user available.</td></tr>';
  const note = document.querySelector("#budgetAdminCard .admin-note");
  if (note && !$("saveAllBudgetBtn") && isAdmin()) {
    const b = document.createElement("button");
    b.id = "saveAllBudgetBtn";
    b.className = "secondary budget-save-all";
    b.textContent = "Save All";
    b.onclick = saveAllBudgets;
    note.appendChild(b);
  }
}
window.saveBudget = async (uid) => {
  if (!isAdmin()) return alert("Admin only");
  const fy = $("budgetFySelect").value,
    u = users.find((x) => x.id === uid) || {},
    v = +($("budget-" + uid).value || 0);
  try {
    await setDoc(
      doc(db, "budgets", uid + "_" + fy),
      {
        userId: uid,
        userEmail: u.email || "",
        fiscalYear: fy,
        currency: "HKD",
        budgetAmount: v,
        updatedAt: serverTimestamp(),
        updatedBy: me.uid,
      },
      { merge: true },
    );
    await loadData();
    alert("Budget saved and recalculated.");
  } catch (e) {
    alert("Cannot save budget: " + e.message);
  }
};
async function saveAllBudgets() {
  for (const i of document.querySelectorAll(".budget-input"))
    await window.saveBudget(i.id.replace("budget-", ""));
}
function rowHtml(r) {
  const m = r.meta || {},
    b = bFor(r.userId, reportFy(r)),
    after = b.available - rawTotal(r),
    actions = [];
  if ((isAdmin() || isManager()) && r.status === "Submitted")
    actions.push(
      `<button class="secondary" onclick="managerAction('${r.id}','Manager Approved')">Approve</button><button class="danger" onclick="managerAction('${r.id}','Rejected')">Reject</button><button class="ghost" onclick="managerAction('${r.id}','Revision Requested')">Revision</button>`,
    );
  if ((isAdmin() || isFinance()) && r.status === "Manager Approved")
    actions.push(
      `<button class="secondary" onclick="financeAction('${r.id}','Finance Processing')">Process</button>`,
    );
  if ((isAdmin() || isFinance()) && r.status === "Finance Processing")
    actions.push(
      `<button class="secondary" onclick="financeAction('${r.id}','Reimbursed')">Reimbursed</button>`,
    );
  return `<tr><td><span class="report-no">${esc(reportLabel(r))}</span></td><td>${esc(m.employee || r.userEmail || "-")}</td><td>${esc(m.purpose || "-")}</td><td>${reportFy(r)}</td><td>${money(rawTotal(r))}</td><td>${after < 0 ? "Over " + money(Math.abs(after)) : "Remain " + money(after)}</td><td><span class="mgmt-chip ${statusCls(r.status)}">${esc(dispStatus(r.status))}</span></td><td><button class="review-btn" onclick="reviewReport('${r.id}')">Review</button><button class="receipt-btn" onclick="reviewReport('${r.id}',true)">Receipt</button></td><td><div class="inline-actions">${actions.join("") || "-"}</div></td></tr>`;
}
function renderQueue() {
  const tb = $("reviewReports");
  if (!tb) return;
  const table = tb.closest("table");
  table.querySelector("thead").innerHTML =
    "<tr><th>Report No.</th><th>Employee</th><th>Purpose</th><th>FY</th><th>Total</th><th>Budget</th><th>Status</th><th>Review</th><th>Approval / Finance</th></tr>";
  let base = rows().filter((r) =>
    isAdmin() || isManager()
      ? [
          "Submitted",
          "Manager Approved",
          "Finance Processing",
          "Rejected",
          "Revision Requested",
        ].includes(r.status)
      : isFinance()
        ? ["Manager Approved", "Finance Processing", "Reimbursed"].includes(
            r.status,
          )
        : false,
  );
  const groups = [
    ["Pending Review", base.filter((r) => r.status === "Submitted")],
    [
      "Approved - Ready for Reimbursement",
      base.filter((r) => r.status === "Manager Approved"),
    ],
    [
      "Reimbursement Processing",
      base.filter((r) => r.status === "Finance Processing"),
    ],
    [
      "Reviewed / Closed",
      base.filter((r) =>
        ["Rejected", "Revision Requested", "Reimbursed", "Closed"].includes(
          r.status,
        ),
      ),
    ],
  ];
  tb.innerHTML =
    groups
      .map((g) =>
        g[1].length
          ? `<tr class="category-row"><td colspan="9">${g[0]} (${g[1].length})</td></tr>` +
            g[1].map(rowHtml).join("")
          : "",
      )
      .join("") || '<tr><td colspan="9">No report found.</td></tr>';
}
function renderVisible() {
  const tb = $("adminReports");
  if (!tb) return;
  tb.closest("table").querySelector("thead").innerHTML =
    "<tr><th>Report No.</th><th>Employee</th><th>Purpose</th><th>FY</th><th>Status</th><th>User</th><th>Total</th><th>Action</th></tr>";
  tb.innerHTML =
    rows()
      .map((r) => {
        const m = r.meta || {};
        return `<tr><td><span class="report-no">${esc(reportLabel(r))}</span></td><td>${esc(m.employee || "-")}</td><td>${esc(m.purpose || "-")}</td><td>${reportFy(r)}</td><td><span class="mgmt-chip ${statusCls(r.status)}">${esc(dispStatus(r.status))}</span></td><td>${esc(r.userEmail || "-")}</td><td>${money(rawTotal(r))}</td><td><button class="review-btn" onclick="reviewReport('${r.id}')">Review</button></td></tr>`;
      })
      .join("") || '<tr><td colspan="8">No reports found.</td></tr>';
}
window.reviewReport = async (id, receiptsOnly = false) => {
  let r = reports.find((x) => x.id === id);
  if (!r) {
    try {
      r = await window.getReportById(id);
    } catch (error) {
      alert("Cannot open report: " + error.message);
      return false;
    }
  }
  if (!r) return false;
  const m = r.meta || {},
    items = r.items || [],
    b = bFor(r.userId, reportFy(r));
  const modal = document.createElement("div");
  modal.className = "review-modal";
  modal.innerHTML = `<div class="review-box"><div class="review-head"><div><h2>${receiptsOnly ? "Receipt Review" : "Expense Report Review"}</h2><p class="muted"><span class="report-no">${esc(reportLabel(r))}</span> · ${esc(dispStatus(r.status))}</p></div><button class="ghost" onclick="this.closest('.review-modal').remove()">Close</button></div>${receiptsOnly ? "" : `<div class="review-grid"><div class="review-field"><b>Employee</b>${esc(m.employee || r.userEmail || "-")}</div><div class="review-field"><b>Purpose</b>${esc(m.purpose || "-")}</div><div class="review-field"><b>Total</b>${money(rawTotal(r))}</div><div class="review-field"><b>Available after claim</b>${money(b.available - rawTotal(r))}</div></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Home Currency</th><th>Amount</th><th>HKD Amount</th><th>Ref</th></tr></thead><tbody>${items.map((it, i) => `<tr><td>${it.date || "-"}</td><td>${esc(it.desc || "-")}</td><td>${esc(it.category || "-")}</td><td>${esc(it.currency || "-")}</td><td>${Number(it.amount || 0).toFixed(2)}</td><td>${money((+it.amount || 0) * (+it.fx || 0))}</td><td>R${String(i + 1).padStart(2, "0")}</td></tr>`).join("")}</tbody></table></div>`}<h3>Receipts</h3><div class="receipt-grid">${
    items
      .filter((x) => x.receiptData)
      .map(
        (it, i) =>
          `<div class="receipt-item"><p><b>R${String(i + 1).padStart(2, "0")}</b> ${esc(it.desc || "Expense item")}</p><img src="${it.receiptData}"></div>`,
      )
      .join("") || '<p class="muted">No receipt attached.</p>'
  }</div></div>`;
  document.body.appendChild(modal);
  emit("review-opened", { modal, report: r });
  return true;
};
window.managerAction = async (id, status, batchComment) => {
  if (!isAdmin() && !isManager()) {
    alert("Manager or Admin access required.");
    return false;
  }
  const r = reports.find((x) => x.id === id);
  if (
    !r ||
    r.status !== "Submitted" ||
    !["Manager Approved", "Rejected", "Revision Requested"].includes(status)
  )
    return false;
  const b = bFor(r.userId, reportFy(r)),
    over = rawTotal(r) > b.available;
  let c =
    batchComment === undefined
      ? prompt(
          status === "Manager Approved"
            ? over
              ? "Over budget. Comment required:"
              : "Approval comment:"
            : "Comment required:",
        )
      : batchComment;
  if (c === null) return false;
  c = c.trim();
  if ((status !== "Manager Approved" || over) && !c)
    return alert("Comment is required.");
  const batch = writeBatch(db);
  batch.set(
    doc(db, "expenseReports", id),
    {
      status,
      managerStatus: status === "Manager Approved" ? "Approved" : status,
      managerId: me.uid,
      managerEmail: me.email,
      managerComment: c || "",
      managerActionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(doc(collection(db, "approvalLogs")), {
    reportId: id,
    reportNo: reportLabel(r),
    action: status,
    actionBy: me.uid,
    actionByEmail: me.email,
    comment: c || "",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  emit("manager-action", { id, status, user: me });
  await loadData();
  return true;
};
window.managerApprove = (id) => window.managerAction(id, "Manager Approved");
window.financeAction = async (id, status) => {
  if (!isAdmin() && !isFinance()) {
    alert("Finance or Admin access required.");
    return false;
  }
  const r = reports.find((x) => x.id === id);
  const processing = (value) =>
    ["Finance Processing", "Reimbursement Processing"].includes(value);
  if (
    !r ||
    !(
      (r.status === "Manager Approved" && processing(status)) ||
      (processing(r.status) &&
        (processing(status) || ["Reimbursed", "Closed"].includes(status)))
    )
  )
    return false;
  const paid = ["Reimbursed", "Closed"].includes(status);
  let ref = prompt(paid ? "Payment reference required:" : "Finance remark:");
  if (ref === null) return false;
  ref = ref.trim();
  if (paid && !ref) return alert("Payment reference is required.");
  const batch = writeBatch(db);
  batch.set(
    doc(db, "expenseReports", id),
    {
      status,
      financeStatus: status,
      financeBy: me.uid,
      financeEmail: me.email,
      paymentReference: paid ? ref : r.paymentReference || "",
      financeRemark: ref || "",
      financeActionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(doc(collection(db, "paymentLogs")), {
    reportId: id,
    reportNo: reportLabel(r),
    action: status,
    actionBy: me.uid,
    actionByEmail: me.email,
    reference: ref || "",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  emit("finance-action", { id, status, user: me });
  await loadData();
  return true;
};
function readForm() {
  return [...document.querySelectorAll(".item")].map((it, i) => {
    const inp = it.querySelectorAll("input"),
      sel = it.querySelectorAll("select"),
      img = it.querySelector(".preview img");
    return {
      ref: "R" + String(i + 1).padStart(2, "0"),
      date: inp[0]?.value || "",
      desc: inp[1]?.value || "Expense item",
      cat: sel[0]?.value || "",
      cur: sel[1]?.value || "",
      amt: +(inp[2]?.value || 0),
      fx: +(inp[3]?.value || 1),
      src: img?.src || "",
    };
  });
}
function imgSize(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res([im.width, im.height]);
    im.onerror = () => res([1, 1]);
    im.src = src;
  });
}
window.exportPdf = async () => {
  const { jsPDF } = window.jspdf,
    rep = reports.find((r) => r.id === activeReportId) || {},
    no = reportNumber(rep) || "ER-" + fiscal($("fromDate")?.value) + "-DRAFT",
    items = readForm(),
    pdf = new jsPDF("p", "mm", "a4");
  let y = 14;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Expense Report", 14, y);
  pdf.setFontSize(9);
  pdf.text("Report No: " + no, 14, y + 8);
  pdf.setFont("helvetica", "normal");
  pdf.text("Employee: " + ($("employee")?.value || "-"), 14, y + 18);
  pdf.text("Purpose: " + ($("purpose")?.value || "-"), 14, y + 26);
  pdf.text("Destination: " + ($("destination")?.value || "-"), 14, y + 34);
  pdf.text(
    "Period: " +
      ($("fromDate")?.value || "-") +
      " to " +
      ($("toDate")?.value || "-"),
    14,
    y + 42,
  );
  y = 64;
  pdf.setFont("helvetica", "bold");
  [
    ["Date", 14],
    ["Description", 39],
    ["Category", 82],
    ["Home Cur", 113],
    ["Amount", 137],
    ["HKD Amount", 160],
    ["Ref", 190],
  ].forEach((a) => pdf.text(a[0], a[1], y));
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  y += 8;
  items.forEach((x) => {
    if (y > 275) {
      pdf.addPage();
      y = 18;
    }
    pdf.text(x.date || "-", 14, y);
    pdf.text(String(x.desc).slice(0, 26), 39, y);
    pdf.text(String(x.cat).slice(0, 16), 82, y);
    pdf.text(x.cur, 113, y);
    pdf.text(x.amt.toFixed(2), 137, y);
    pdf.text((x.amt * x.fx).toFixed(2), 160, y);
    pdf.text(x.ref, 190, y);
    y += 7;
  });
  pdf.addPage();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Receipt Attachments", 14, 16);
  pdf.setFontSize(9);
  pdf.text("Report No: " + no, 14, 24);
  y = 36;
  for (const x of items.filter((i) => i.src)) {
    if (y > 40) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(x.ref + "  " + String(x.desc).slice(0, 80), 14, y);
    y += 6;
    const [iw, ih] = await imgSize(x.src),
      mw = 182,
      mh = 238,
      scale = Math.min(mw / iw, mh / ih),
      w = iw * scale,
      h = ih * scale;
    try {
      pdf.addImage(x.src, "JPEG", 14, y, w, h);
    } catch (e) {
      pdf.text("Receipt image could not be embedded.", 14, y);
    }
    y += h + 12;
  }
  pdf.save("expense-report-" + no + ".pdf");
};
function exportCsv() {
  const h = [
      "Report No",
      "FY",
      "Status",
      "Employee",
      "User Email",
      "Purpose",
      "Total HKD",
      "Payment Ref",
    ],
    lines = [h.join(",")].concat(
      rows().map((r) => {
        const m = r.meta || {};
        return [
          reportLabel(r),
          reportFy(r),
          dispStatus(r.status),
          m.employee || "",
          r.userEmail || "",
          m.purpose || "",
          rawTotal(r),
          r.paymentReference || "",
        ]
          .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
          .join(",");
      }),
    );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "expense-reimbursement-summary.csv";
  a.click();
  URL.revokeObjectURL(url);
}
on("report-new", () => {
  activeReportId = "";
});
on("report-opened", ({ report }) => {
  activeReportId = report.id;
});
on("reports-loaded", (data) => {
  reports = data.reports;
  renderAll();
});
on("session", async (data) => {
  me = data.user;
  profile = data.profile || { role: "user" };
  reports = [];
  users = [];
  budgets = [];
  activeReportId = "";
  if (me && canManage()) await loadData(false);
});
on("view-changed", ({ view }) => {
  if (view === "admin") renderAll();
});
window.refreshAdmin = loadData;

import {
  REPORT_EVENTS,
  REPORT_TIME_LABEL,
  reportEventTime,
  formatReportTimestamp,
  timestampMonth,
} from "./report-timeline.js";
import { formatReportDate } from "./report-dates.js";
import { db } from "./firebase-client.js";
import { on, emit } from "./app-events.js";
import { reportNumber } from "./report-dashboard.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  runTransaction,
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

function bFor(uid, fy, excludeId = "") {
  const b = budgets.find((x) => x.userId === uid && x.fiscalYear === fy),
    amount = +(b?.budgetAmount || 0),
    mine = reports.filter(
      (r) => r.userId === uid && reportFy(r) === fy && r.id !== excludeId,
    ),
    used = mine
      .filter((r) =>
        [
          "Manager Approved",
          "Finance Processing",
          "Reimbursement Processing",
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
function filter(scope = "mgmt") {
  return {
    fy: $(scope + "FyFilter")?.value || "All",
    st: $(scope + "StatusFilter")?.value || "All",
    q: ($(scope + "EmployeeFilter")?.value || "").toLowerCase().trim(),
    month: $(scope + "MonthFilter")?.value || "",
    event: $(scope + "EventFilter")?.value || "submittedAt",
  };
}
function rows(scope = "mgmt") {
  const f = filter(scope);
  return reports.filter((r) => {
    const m = r.meta || {},
      txt = (m.employee + " " + r.userEmail + " " + m.purpose).toLowerCase();
    return (
      (f.fy === "All" || reportFy(r) === f.fy) &&
      (f.st === "All" || r.status === f.st) &&
      (!f.q || txt.includes(f.q)) &&
      (!f.month || timestampMonth(reportEventTime(r, f.event)) === f.month)
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
  for (const [prefix, hostId] of [
    ["mgmt", "managementReviewFilters"],
    ["allReports", "managementReportFilters"],
  ]) {
    if ($(prefix + "FilterBox")) continue;
    const host = $(hostId);
    if (!host) continue;
    const box = document.createElement("div");
    box.id = prefix + "FilterBox";
    box.className = "card mgmt-filter";
    box.innerHTML = `<label>Fiscal Year<select id="${prefix}FyFilter"><option>All</option>${fyList()
      .map((value) => `<option>${value}</option>`)
      .join(
        "",
      )}</select></label><label>Status<select id="${prefix}StatusFilter">${["All", "Draft", "Submitted", "Manager Approved", "Finance Processing", "Reimbursement Processing", "Reimbursed", "Rejected", "Revision Requested", "Closed"].map((value) => `<option>${value}</option>`).join("")}</select></label><label>Employee / Email<input id="${prefix}EmployeeFilter" placeholder="Search"></label><label>Event date<select id="${prefix}EventFilter">${REPORT_EVENTS.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label><label>Month<input type="month" id="${prefix}MonthFilter"><small>${REPORT_TIME_LABEL} · Blank = all months</small></label><div class="mgmt-actions"><button class="secondary" id="${prefix}Apply">Apply</button><button class="secondary" id="${prefix}Clear">Clear</button></div>${prefix === "allReports" ? '<button id="exportCsvBtn">Export CSV</button>' : ""}`;
    host.appendChild(box);
    $(prefix + "Apply").onclick = renderAll;
    $(prefix + "Clear").onclick = () => {
      $(prefix + "FyFilter").value = "All";
      $(prefix + "StatusFilter").value = "All";
      $(prefix + "EmployeeFilter").value = "";
      $(prefix + "MonthFilter").value = "";
      $(prefix + "EventFilter").value = "submittedAt";
      renderAll();
    };
  }
  if ($("exportCsvBtn")) $("exportCsvBtn").onclick = exportCsv;
}
function renderCompanyBudget() {
  let box = $("companyBudget");
  if (!box) {
    box = document.createElement("div");
    box.id = "companyBudget";
    box.className = "mgmt-summary";
    $("managementBudgetSummary")?.appendChild(box);
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
            "Reimbursement Processing",
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
  if (!me || !isAdmin()) return false;
  const actor = me.uid,
    fy = $("budgetFySelect").value;
  const values = [...document.querySelectorAll(".budget-input")].map(
    (input) => ({
      uid: input.id.replace("budget-", ""),
      amount: Number(input.value || 0),
    }),
  );
  if (
    values.some((value) => !Number.isFinite(value.amount) || value.amount < 0)
  ) {
    alert("Budget amounts must be zero or greater.");
    return false;
  }
  try {
    for (let start = 0; start < values.length; start += 400) {
      if (me?.uid !== actor || !isAdmin()) return false;
      const batch = writeBatch(db);
      for (const value of values.slice(start, start + 400)) {
        const user = users.find((entry) => entry.id === value.uid);
        batch.set(
          doc(db, "budgets", value.uid + "_" + fy),
          {
            userId: value.uid,
            userEmail: user?.email || "",
            fiscalYear: fy,
            currency: "HKD",
            budgetAmount: value.amount,
            updatedAt: serverTimestamp(),
            updatedBy: actor,
          },
          { merge: true },
        );
      }
      await batch.commit();
    }
    if (me?.uid === actor) await loadData();
    alert("Budgets saved and recalculated.");
    return true;
  } catch (error) {
    alert(
      "Cannot save all budgets: " +
        error.message +
        ". Refresh to check saved balances.",
    );
    return false;
  }
}
function rowHtml(r) {
  const m = r.meta || {},
    b = bFor(r.userId, reportFy(r), r.id),
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
  if (
    (isAdmin() || isFinance()) &&
    ["Finance Processing", "Reimbursement Processing"].includes(r.status)
  )
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
          "Reimbursement Processing",
          "Rejected",
          "Revision Requested",
          "Reimbursed",
          "Closed",
        ].includes(r.status)
      : isFinance()
        ? [
            "Manager Approved",
            "Finance Processing",
            "Reimbursement Processing",
            "Reimbursed",
            "Closed",
          ].includes(r.status)
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
      base.filter((r) =>
        ["Finance Processing", "Reimbursement Processing"].includes(r.status),
      ),
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
    rows("allReports")
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
    b = bFor(r.userId, reportFy(r), r.id);
  const modal = document.createElement("div");
  modal.className = "review-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Expense report details");
  modal.innerHTML = `<div class="review-box"><div class="review-head"><div><h2>${receiptsOnly ? "Receipt Review" : "Expense Report Review"}</h2><p class="muted"><span class="report-no">${esc(reportLabel(r))}</span> · ${esc(dispStatus(r.status))}</p></div><div class="review-actions"><button type="button" class="review-close" data-review-close aria-label="Close report">✕ Close</button></div></div>${receiptsOnly ? "" : `<div class="review-grid"><div class="review-field"><b>Employee</b>${esc(m.employee || r.userEmail || "-")}</div><div class="review-field"><b>Purpose</b>${esc(m.purpose || "-")}</div><div class="review-field"><b>Total</b>${money(rawTotal(r))}</div>${canManage() ? `<div class="review-field"><b>Available after claim</b>${money(b.available - rawTotal(r))}</div>` : ""}</div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Home Currency</th><th>Amount</th><th>HKD Amount</th><th>Ref</th></tr></thead><tbody>${items.map((it, i) => `<tr><td>${esc(formatReportDate(it.date))}</td><td>${esc(it.desc || "-")}</td><td>${esc(it.category || "-")}</td><td>${esc(it.currency || "-")}</td><td>${Number(it.amount || 0).toFixed(2)}</td><td>${money((+it.amount || 0) * (+it.fx || 0))}</td><td>R${String(i + 1).padStart(2, "0")}</td></tr>`).join("")}</tbody></table></div>`}${[
    ["Manager comment", r.managerComment],
    ["Finance remark", r.financeRemark],
    ["Payment reference", r.paymentReference],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<p><b>${label}:</b> ${esc(value)}</p>`)
    .join("")}<h3>Receipts</h3><div class="receipt-grid">${
    items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => it.receiptData)
      .map(
        ({ it, index: i }) =>
          `<div class="receipt-item"><p><b>R${String(i + 1).padStart(2, "0")}</b> ${esc(it.desc || "Expense item")}</p><img src="${esc(it.receiptData)}"></div>`,
      )
      .join("") || '<p class="muted">No receipt attached.</p>'
  }</div></div>`;
  const timeline = document.createElement("section");
  timeline.className = "workflow-timeline";
  timeline.innerHTML = `<h3>Workflow timeline <small>${REPORT_TIME_LABEL}</small></h3><dl class="workflow-milestones">${REPORT_EVENTS.filter(
    ([event]) =>
      event !== "closedAt" ||
      r.status === "Closed" ||
      reportEventTime(r, event),
  )
    .map(
      ([event, label]) =>
        `<div><dt>${esc(label)}</dt><dd>${esc(formatReportTimestamp(reportEventTime(r, event)))}</dd></div>`,
    )
    .join(
      "",
    )}</dl><p class="small muted">Submission time reflects the latest successful submission. Missing historical times are not inferred from edits.</p>`;
  modal.querySelector(".review-head").after(timeline);
  modal.querySelector("[data-review-close]").onclick = () => modal.remove();
  if (
    !receiptsOnly &&
    ["Draft", "Revision Requested"].includes(r.status) &&
    (r.userId === me?.uid || isAdmin())
  ) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.dataset.reviewEdit = r.id;
    edit.textContent = "Edit report";
    edit.onclick = async () => {
      edit.disabled = true;
      try {
        if (await window.openReport(r.id)) modal.remove();
      } finally {
        edit.disabled = false;
      }
    };
    modal.querySelector(".review-actions").appendChild(edit);
  }
  document.body.appendChild(modal);
  emit("review-opened", { modal, report: r });
  return true;
};
const actionLocks = new Set();
async function commitAction(report, kind, payload, detail) {
  if (actionLocks.has(report.id)) return false;
  actionLocks.add(report.id);
  const actor = me,
    reportRef = doc(db, "expenseReports", report.id),
    logRef = doc(
      collection(db, kind === "manager" ? "approvalLogs" : "paymentLogs"),
    );
  try {
    await runTransaction(db, async (transaction) => {
      const actorProfile = await transaction.get(doc(db, "users", actor.uid));
      const role = actorProfile.data()?.role;
      if (!actorProfile.exists() || actorProfile.data().active === false || !(kind === "manager" ? ["admin", "manager"] : ["admin", "finance"]).includes(role))
        throw new Error("Your access changed. Sign out and sign in again before reviewing reports.");
      const snapshot = await transaction.get(reportRef);
      if (!snapshot.exists() || snapshot.data().status !== report.status)
        throw new Error(
          "This report has changed. Refresh and review its current status.",
        );
      transaction.set(reportRef, payload, { merge: true });
      transaction.set(logRef, {
        reportId: report.id,
        reportNo: reportLabel(report),
        action: payload.status,
        actionBy: actor.uid,
        actionByEmail: actor.email,
        ...detail,
        createdAt: serverTimestamp(),
      });
    });
    if (me?.uid === actor.uid) {
      emit(kind + "-action", {
        id: report.id,
        status: payload.status,
        user: actor,
      });
      await loadData();
    }
    return true;
  } catch (error) {
    alert("Action was not completed: " + error.message);
    await loadData();
    return false;
  } finally {
    actionLocks.delete(report.id);
  }
}
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
  const b = bFor(r.userId, reportFy(r), r.id),
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
  if ((status !== "Manager Approved" || over) && !c) {
    alert("Comment is required.");
    return false;
  }
  return commitAction(
    r,
    "manager",
    {
      status,
      managerStatus: status === "Manager Approved" ? "Approved" : status,
      managerId: me.uid,
      managerEmail: me.email,
      managerComment: c || "",
      managerActionAt: serverTimestamp(),
      ...(status === "Manager Approved"
        ? { managerApprovedAt: serverTimestamp() }
        : {}),
      updatedAt: serverTimestamp(),
    },
    { comment: c || "" },
  );
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
  if (paid && !ref) {
    alert("Payment reference is required.");
    return false;
  }
  return commitAction(
    r,
    "finance",
    {
      status,
      financeStatus: status,
      financeBy: me.uid,
      financeEmail: me.email,
      paymentReference: paid ? ref : r.paymentReference || "",
      financeRemark: ref || "",
      financeActionAt: serverTimestamp(),
      ...(r.status === "Manager Approved" && processing(status)
        ? { financeApprovedAt: serverTimestamp() }
        : {}),
      ...(status === "Reimbursed" ? { reimbursedAt: serverTimestamp() } : {}),
      ...(status === "Closed" ? { closedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { reference: ref || "" },
  );
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
  pdf.text("EXPENSiO | Expense Report", 14, y);
  pdf.setFontSize(9);
  pdf.text("Report No: " + no, 14, y + 8);
  pdf.setFont("helvetica", "normal");
  pdf.text("Employee: " + ($("employee")?.value || "-"), 14, y + 18);
  pdf.text("Purpose: " + ($("purpose")?.value || "-"), 14, y + 26);
  pdf.text("Destination: " + ($("destination")?.value || "-"), 14, y + 34);
  pdf.text(
    "Period: " +
      formatReportDate($("fromDate")?.value) +
      " to " +
      formatReportDate($("toDate")?.value),
    14,
    y + 42,
  );
  y = 64;
  pdf.setFontSize(8);
  pdf.text("Workflow timeline - " + REPORT_TIME_LABEL, 14, y);
  y += 6;
  for (const [event, label] of REPORT_EVENTS.filter(
    ([event]) => event !== "closedAt" || rep.closedAt,
  )) {
    pdf.text(
      label + ": " + formatReportTimestamp(reportEventTime(rep, event)),
      14,
      y,
    );
    y += 5;
  }
  y += 4;
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
    pdf.text(formatReportDate(x.date), 14, y);
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
  pdf.save("EXPENSiO-Report-" + no + ".pdf");
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
      ...REPORT_EVENTS.map(([, label]) => label + " at - " + REPORT_TIME_LABEL),
    ],
    lines = [h.join(",")].concat(
      rows("allReports").map((r) => {
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
          ...REPORT_EVENTS.map(([event]) =>
            reportEventTime(r, event)
              ? formatReportTimestamp(reportEventTime(r, event))
              : "",
          ),
        ]
          .map((x) => '"' + String(x).replaceAll('"', '""') + '"')
          .join(",");
      }),
    );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "EXPENSiO-Reimbursement-Summary.csv";
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

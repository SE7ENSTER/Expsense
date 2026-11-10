import { waitForUserProfile } from "./user-registration.js";
import { auth, db } from "./firebase-client.js";
import { emit } from "./app-events.js";
import { prepareReceipt } from "./receipt-files.js";
import { renderDashboardReports } from "./report-dashboard.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CURRENCIES = [
  "AUD",
  "BDT",
  "BND",
  "CNY",
  "HKD",
  "IDR",
  "INR",
  "JPY",
  "KHR",
  "KRW",
  "LAK",
  "LKR",
  "MMK",
  "MOP",
  "MYR",
  "NPR",
  "NZD",
  "PHP",
  "PKR",
  "SGD",
  "THB",
  "TWD",
  "VND",
  "USD",
  "EUR",
];
const FX = {
  HKD: 1,
  USD: 7.85,
  EUR: 8.5,
  VND: 0.0031,
  THB: 0.25,
  SGD: 5.8,
  MYR: 1.68,
  IDR: 0.0005,
  PHP: 0.134,
  CNY: 1.08,
  JPY: 0.053,
  KRW: 0.0057,
  AUD: 5.15,
  NZD: 4.75,
  TWD: 0.25,
  MOP: 0.97,
  INR: 0.094,
  KHR: 0.0019,
  LAK: 0.00036,
  MMK: 0.0037,
  LKR: 0.026,
  BND: 5.8,
  BDT: 0.071,
  NPR: 0.059,
  PKR: 0.028,
};
const CATEGORIES = [
  "Accommodation",
  "Meal",
  "Entertainment",
  "Transportation",
  "Misc.",
];
let user = null,
  profile = { role: "user" },
  reports = [],
  current = null,
  rows = [],
  saving = false,
  currentSaved = false,
  sessionVersion = 0,
  reportLoadVersion = 0;
const pendingReceipts = new Map();
const q = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID();
function money(n, c = "HKD") {
  return `${c} ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function safe(v = "") {
  return String(v).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}
function isAdmin() {
  return profile.role === "admin";
}
function isManager() {
  return profile.role === "manager";
}
function canSeeAdmin() {
  return ["admin", "manager", "finance"].includes(profile.role);
}
function blankRow() {
  return {
    id: uid(),
    date: "",
    category: "Transportation",
    desc: "",
    currency: "HKD",
    amount: "",
    fx: 1,
    rateSource: "XE manual",
    note: "",
    receiptData: null,
    receiptName: "",
  };
}
function blankReport() {
  return {
    id: uid(),
    status: "Draft",
    meta: {
      employee: "",
      company: "",
      purpose: "",
      reportCurrency: "HKD",
      fromDate: "",
      toDate: "",
      destination: "",
      costCenter: "",
    },
    items: [blankRow()],
  };
}
function readMeta() {
  return {
    employee: q("employee").value,
    company: q("company").value,
    purpose: q("purpose").value,
    reportCurrency: q("reportCurrency").value,
    fromDate: q("fromDate").value,
    toDate: q("toDate").value,
    destination: q("destination").value,
    costCenter: q("costCenter").value,
  };
}
function fillMeta(m = {}) {
  [
    "employee",
    "company",
    "purpose",
    "fromDate",
    "toDate",
    "destination",
    "costCenter",
  ].forEach((id) => (q(id).value = m[id] || ""));
  q("reportCurrency").value = m.reportCurrency || "HKD";
}
async function ensureProfile(u) {
  const ref = doc(db, "users", u.uid),
    snap = await getDoc(ref);
  if (snap.exists()) return { ...snap.data(), id: snap.id };
  const data = {
    email: u.email,
    role: "user",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return data;
}
function showProfile() {
  q("userLine").textContent = `${user.email} · ${profile.role}`;
  q("myRoleText").textContent = profile.role;
  q("tab-admin").classList.toggle("hide", !canSeeAdmin());
  q("adminUsersCard").classList.toggle("hide", !isAdmin());
}

async function loadReports() {
  if (!user) return;
  try {
    let qry;
    if (isAdmin()) qry = collection(db, "expenseReports");
    else if (isManager())
      qry = query(
        collection(db, "expenseReports"),
        where("status", "in", [
          "Submitted",
          "Manager Approved",
          "Rejected",
          "Revision Requested",
        ]),
      );
    else if (profile.role === "finance")
      qry = query(
        collection(db, "expenseReports"),
        where("status", "in", [
          "Manager Approved",
          "Finance Processing",
          "Reimbursement Processing",
          "Reimbursed",
          "Closed",
        ]),
      );
    else
      qry = query(
        collection(db, "expenseReports"),
        where("userId", "==", user.uid),
      );
    const version = sessionVersion,
      request = ++reportLoadVersion;
    const snap = await getDocs(qry);
    if (version !== sessionVersion || request !== reportLoadVersion)
      return reports;
    reports = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    dash();
    emit("reports-loaded", { reports, user, profile });
    return reports;
  } catch (e) {
    alert("Firestore load error: " + e.message);
  }
}
window.signIn = async () => {
  q("authMsg").textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(
      auth,
      q("email").value,
      q("password").value,
    );
  } catch (e) {
    q("authMsg").textContent = e.message;
  }
};
window.signUp = () => emit("registration-requested");
window.logout = async () => signOut(auth);
onAuthStateChanged(auth, async (u) => {
  const version = ++sessionVersion;
  user = u;
  profile = { role: "user" };
  reports = [];
  current = null;
  rows = [];
  currentSaved = false;
  renderDashboardReports(q("reportList"), reports);
  emit("session", { user: null, profile: { role: "user" } });
  q("appView").classList.add("hide");
  if (!u) {
    q("appView").classList.add("hide");
    q("authView").classList.remove("hide");
    return;
  }
  try {
    await waitForUserProfile();
    const loadedProfile = await ensureProfile(u);
    if (version !== sessionVersion) return;
    profile = loadedProfile;
    showProfile();
    if (profile.active === false || profile.role === "disabled") {
      await signOut(auth);
      return;
    }
    emit("session", { user: u, profile });
    q("authView").classList.add("hide");
    q("appView").classList.remove("hide");
    q("authStatus").textContent = `Signed in as ${u.email}`;
    initReportIfNeeded();
    await loadReports();
    if (version === sessionVersion) window.showView("dashboard");
  } catch (error) {
    if (version === sessionVersion) await signOut(auth);
    q("authMsg").textContent = error.message;
  }
});
window.showView = (view) => {
  ["dashboard", "editor", "firebase", "admin"].forEach((id) => {
    q(id).classList.toggle("hide", id !== view);
    q("tab-" + id).classList.toggle("active", id === view);
  });
  if (view === "dashboard") dash();
  if (view === "editor") initReportIfNeeded();
  emit("view-changed", { view });
};
function initReportIfNeeded() {
  if (!current) window.newReport(false);
}
window.newReport = (open = true) => {
  current = blankReport();
  currentSaved = false;
  rows = current.items;
  fillMeta(current.meta);
  render();
  emit("report-new");
  if (open) window.showView("editor");
};
window.clearForm = () => {
  if (confirm("Clear this form and start blank?")) window.newReport(true);
};
window.addItem = () => {
  rows.push(blankRow());
  render();
};
window.removeItem = (id) => {
  if (rows.length > 1) rows = rows.filter((r) => r.id !== id);
  render();
};
window.setVal = (id, k, v) => {
  const r = rows.find((x) => x.id === id);
  r[k] = v;
  if (k === "currency") {
    r.fx = FX[v] || 1;
    document.querySelectorAll("[data-fx-input]").forEach((input) => {
      if (input.dataset.fxInput === id) input.value = r.fx;
    });
  }
  window.calc();
};
async function resizeImage(file, max = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Cannot read the receipt file."));
    reader.onload = (event) => {
      const image = new Image();
      image.onerror = () =>
        reject(new Error("Cannot open this receipt image."));
      image.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(image.width, image.height)),
            canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas
            .getContext("2d")
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (error) {
          reject(error);
        }
      };
      image.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}
window.setFile = async (id, file) => {
  if (!file) return;
  const reportId = current?.id,
    item = rows.find((row) => row.id === id);
  if (!item) return;
  const key = reportId + ":" + id,
    token = {};
  pendingReceipts.set(key, token);
  try {
    const prepared = await prepareReceipt(file);
    const image = await resizeImage(prepared.file);
    if (
      current?.id !== reportId ||
      !rows.includes(item) ||
      pendingReceipts.get(key) !== token
    )
      return;
    Object.assign(item, prepared.metadata, { receiptData: image });
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    if (pendingReceipts.get(key) === token) pendingReceipts.delete(key);
  }
};
function render() {
  const el = q("items");
  el.innerHTML = "";
  rows.forEach((r, i) => {
    const div = document.createElement("article");
    div.className = "card item";
    div.innerHTML = `<div class="seq">#${i + 1}</div><div class="form"><label>Date<input type="date" value="${safe(r.date)}" onchange="setVal('${r.id}','date',this.value)"></label><label>Description<input placeholder="Expense description" value="${safe(r.desc)}" onchange="setVal('${r.id}','desc',this.value)"></label><label>Category<select onchange="setVal('${r.id}','category',this.value)">${CATEGORIES.map((x) => `<option ${x === r.category ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Currency<select onchange="setVal('${r.id}','currency',this.value)">${CURRENCIES.map((x) => `<option ${x === r.currency ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Amount<input type="number" value="${safe(r.amount)}" oninput="setVal('${r.id}','amount',this.value)"></label><label>FX to HKD<input type="number" step="0.0001" data-fx-input="${safe(r.id)}" value="${safe(r.fx)}" oninput="setVal('${r.id}','fx',this.value)"></label><output class="fx-preview wide" data-fx-preview="${safe(r.id)}" aria-live="polite"></output><label>Rate Source<select onchange="setVal('${r.id}','rateSource',this.value)"><option ${r.rateSource === "XE manual" ? "selected" : ""}>XE manual</option><option ${r.rateSource === "Company monthly rate" ? "selected" : ""}>Company monthly rate</option><option ${r.rateSource === "Card statement rate" ? "selected" : ""}>Card statement rate</option></select></label><label class="wide">Notes / Remark<textarea onchange="setVal('${r.id}','note',this.value)" placeholder="Business purpose / remark">${safe(r.note)}</textarea></label></div><div><label class="upload">Upload receipt / supporting document<input type="file" accept="image/*,application/pdf,.pdf" onchange="setFile('${r.id}',this.files[0])"></label><div class="preview">${r.receiptData ? `<img src="${r.receiptData}">` : "No receipt"}</div><div class="phase1-note">Images and PDF files supported. PDF max 500 KB.</div><button class="danger full" onclick="removeItem('${r.id}')">Remove</button></div>`;
    el.appendChild(div);
  });
  window.calc();
}
function updateFxPreviews() {
  document.querySelectorAll("[data-fx-preview]").forEach((output) => {
    const item = rows.find((row) => row.id === output.dataset.fxPreview);
    if (!item) return;
    const rate = Number(item.fx),
      amount = Number(item.amount);
    if (item.fx === "" || !Number.isFinite(rate) || rate <= 0) {
      output.textContent = "Enter a valid exchange rate to see the conversion.";
      return;
    }
    const rateText = rate.toLocaleString("en-US", {
      maximumFractionDigits: 12,
    });
    const rateLabel = `1 ${item.currency} = ${rateText} HKD`;
    const converted = amount * rate;
    output.textContent =
      item.amount === "" ||
      !Number.isFinite(amount) ||
      !Number.isFinite(converted)
        ? rateLabel
        : `${rateLabel} · ${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${item.currency} = ${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HKD`;
  });
}
window.calc = function () {
  updateFxPreviews();
  const rc = q("reportCurrency").value || "HKD";
  const total = rows.reduce((s, r) => s + (+r.amount || 0) * (+r.fx || 0), 0);
  const attached = rows.filter((r) => r.receiptData).length;
  const used = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  q("totalHero").textContent = money(total, rc);
  q("sideTotal").textContent = money(total, rc);
  q("receiptHero").textContent = `${attached} receipt attached`;
  q("itemTotal").textContent = `Items: ${rows.length}`;
  q("receiptText").textContent = `${attached} of ${rows.length} attached`;
  q("receiptBar").style.width =
    (rows.length ? (attached / rows.length) * 100 : 0) + "%";
  q("currencyUsed").innerHTML = used
    .map((c) => `<span class="pill">${c}</span>`)
    .join("");
};
window.saveReport = async (status = "Draft") => {
  if (saving) return false;
  if (
    [...pendingReceipts.keys()].some((key) => key.startsWith(current?.id + ":"))
  ) {
    alert("Please wait for the receipt upload to finish.");
    return false;
  }
  if (!user) {
    alert("Please sign in first.");
    return false;
  }
  if (current?.userId && current.userId !== user.uid && !isAdmin()) {
    alert("Only Admin can update another user report.");
    return false;
  }
  if (
    !isAdmin() &&
    currentSaved &&
    !["Draft", "Revision Requested"].includes(current?.status)
  ) {
    alert("Only Draft or Revision Requested reports can be edited.");
    return false;
  }
  if (!["Draft", "Submitted"].includes(status)) return false;
  if (
    rows.some(
      (item) =>
        !Number.isFinite(Number(item.amount)) ||
        Number(item.amount) < 0 ||
        !Number.isFinite(Number(item.fx)) ||
        Number(item.fx) <= 0,
    )
  ) {
    alert("Enter a valid amount and a positive exchange rate for each item.");
    return false;
  }
  const total = rows.reduce(
    (sum, item) => sum + Number(item.amount) * Number(item.fx),
    0,
  );
  if (
    !Number.isFinite(total) ||
    (status === "Submitted" && (!rows.length || total <= 0))
  ) {
    alert("A submitted report must contain expenses with a positive total.");
    return false;
  }
  saving = true;
  const version = sessionVersion,
    report = current || blankReport(),
    wasSaved = currentSaved;
  try {
    const meta = readMeta();
    const date = meta.fromDate ? new Date(meta.fromDate) : new Date();
    const fiscalYear =
      "FY" +
      (date.getMonth() >= 10 ? date.getFullYear() + 1 : date.getFullYear());
    const data = {
      ...report,
      meta,
      fiscalYear,
      items: structuredClone(rows),
      totalHkd: rows.reduce(
        (sum, item) =>
          sum + (Number(item.amount) || 0) * (Number(item.fx) || 0),
        0,
      ),
      status,
      userId: report.userId || user.uid,
      userEmail: report.userEmail || user.email,
      updatedAt: serverTimestamp(),
    };
    if (wasSaved) delete data.createdAt;
    else data.createdAt = serverTimestamp();
    await setDoc(doc(db, "expenseReports", report.id), data, { merge: true });
    if (version !== sessionVersion) return true;
    if (current === report || !current) {
      current = { ...report, ...data };
      currentSaved = true;
    }
    await loadReports();
    const saved = reports.find((item) => item.id === report.id) || {
      ...report,
      ...data,
    };
    if (current?.id === report.id) current = saved;
    emit("report-saved", { report: saved, status, user });
    alert(status === "Submitted" ? "Report submitted." : "Draft saved.");
    return true;
  } catch (error) {
    alert("Save error: " + error.message);
    return false;
  } finally {
    saving = false;
  }
};
window.getReportById = async (id) => {
  const cached = reports.find((report) => report.id === id);
  if (cached) return cached;
  const snapshot = await getDoc(doc(db, "expenseReports", id));
  return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
};
window.openReport = async (id) => {
  const version = sessionVersion;
  try {
    const found = await window.getReportById(id);
    if (version !== sessionVersion) return false;
    if (!found) {
      alert("Report not found. Please refresh and try again.");
      return false;
    }
    current = structuredClone(found);
    currentSaved = true;
    rows = current.items || [blankRow()];
    fillMeta(current.meta || {});
    render();
    window.showView("editor");
    emit("report-opened", { report: current });
    return true;
  } catch (error) {
    alert("Cannot open report: " + error.message);
    return false;
  }
};
function dash() {
  q("kReports").textContent = reports.length;
  q("kDraft").textContent = reports.filter((r) => r.status === "Draft").length;
  q("kSubmitted").textContent = reports.filter(
    (r) => r.status === "Submitted",
  ).length;
  q("kReceipts").textContent = reports.reduce(
    (sum, r) => sum + (r.items || []).filter((i) => i.receiptData).length,
    0,
  );
  q("reportTitle").textContent = isAdmin()
    ? "Current Reports"
    : isManager()
      ? "Submitted Reports"
      : "My Active Reports";
  q("reportSubtitle").textContent = "Sorted by report number (ascending).";
  renderDashboardReports(q("reportList"), reports);
}
window.refreshDashboardReports = loadReports;

function init() {
  CURRENCIES.forEach((c) => q("reportCurrency").add(new Option(c, c)));
  window.newReport(false);
}
init();

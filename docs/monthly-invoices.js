import { auth, db } from "./firebase-client.js";
import { on } from "./app-events.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  blankInvoice,
  validateInvoice,
  invoiceNumber,
  dueDate,
  amountWords,
  CURRENCIES,
  TERMS,
  DECLARATION,
  BILL_TO,
  esc,
  money,
  minorUnits,
} from "./monthly-invoice-model.js";
import { signaturePad } from "./invoice-signature.js";
import { formatReportDate } from "./report-dates.js";
import { formatReportTimestamp } from "./report-timeline.js";
const root = document.getElementById("monthly-invoices"),
  reviewRoot = document.getElementById("management-invoice-content");
let user = null,
  profile = {},
  epoch = 0,
  loadVersion = 0,
  loading = false,
  current = null,
  pad = null,
  dirty = false,
  busy = false,
  attachment = null,
  records = [],
  reviewRecords = [],
  reviewPage = 0,
  reviewLoadVersion = 0,
  page = 0;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const canReview = () => ["admin", "finance"].includes(profile.role);
const field = (name, label, value = "", type = "text", required = false) =>
  `<label>${label}${required ? " *" : ""}<input name="${name}" type="${type}" value="${esc(value)}" maxlength="500" ${required ? "required" : ""}></label>`;
const message = (text) => {
  const element = root.querySelector("[data-invoice-message]");
  if (element) element.textContent = text;
};
function shell() {
  root.innerHTML = `<div class="invoice-toolbar"><div><h2>Monthly Invoice</h2><p>Complete your monthly invoice, sign and submit to Finance.</p></div><label>Service month<input type="month" id="invoice-month" value="${today().slice(0, 7)}"></label><button type="button" id="invoice-open">Open month</button></div><p data-invoice-message role="status" aria-live="polite"></p><div id="invoice-editor"></div><section class="invoice-list"><div class="invoice-toolbar"><h3>My invoices</h3><label>Filter by service month<input type="month" id="invoice-list-month"></label><button type="button" id="invoice-refresh">Refresh</button></div><div id="invoice-records"></div></section>`;
  root.querySelector("#invoice-open").onclick = () =>
    openMonth(root.querySelector("#invoice-month").value);
  root.querySelector("#invoice-refresh").onclick = () => loadList();
  root.querySelector("#invoice-list-month").onchange = () => {
    page = 0;
    renderList();
  };
}
function renderEditor() {
  const host = root.querySelector("#invoice-editor");
  if (!current) {
    host.innerHTML = "";
    return;
  }
  if (current.status === "Submitted") {
    host.innerHTML =
      '<div class="invoice-card"><h3>This month’s invoice has been submitted</h3><p>The submitted invoice and signature are read-only.</p><button type="button" id="invoice-view-current">View signed invoice</button></div>';
    host.querySelector("button").onclick = () => showInvoice(current);
    return;
  }
  host.innerHTML = `<form id="monthly-invoice-form" novalidate><div class="invoice-columns"><section class="invoice-card"><h3>From</h3><div class="invoice-fields">${field("from.fullName", "Full name", current.from.fullName, "text", true)}${field("from.address1", "Address line 1", current.from.address1, "text", true)}${field("from.address2", "Address line 2", current.from.address2)}${field("from.country", "Country", current.from.country, "text", true)}${field("from.phone", "Phone", current.from.phone, "tel")}${field("from.email", "Email", current.from.email, "email", true)}</div></section><section class="invoice-card"><h3>Invoice details</h3><div class="invoice-fields"><label>Invoice no.<output id="invoice-number"></output></label>${field("invoiceDate", "Invoice date", current.invoiceDate, "date", true)}<label>Service month<output>${esc(current.serviceMonth)}</output></label><label>Currency *<select name="currency">${Object.keys(
    CURRENCIES,
  )
    .map(
      (code) =>
        `<option ${current.currency === code ? "selected" : ""}>${code}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Payment terms *<select name="paymentTerms">${Object.keys(
    TERMS,
  )
    .map(
      (term) =>
        `<option ${current.paymentTerms === term ? "selected" : ""}>${term}</option>`,
    )
    .join(
      "",
    )}</select></label><label>Due date<output id="invoice-due"></output></label></div><h3>Bill to</h3>${BILL_TO.map((text) => `<p>${esc(text)}</p>`).join("")}</section></div><section class="invoice-card"><h3>Invoice items</h3><p class="muted">Up to 10 lines. Amounts are in the selected currency.</p><div class="invoice-line-head"><span>No.</span><span>Description *</span><span>Period / Reference</span><span>Amount</span></div>${current.items.map((item, i) => `<div class="invoice-line"><span class="invoice-line-no">${i + 1}</span>${field("description-" + i, "Description", item.description)}${field("reference-" + i, "Period / Reference", item.reference)}<label>Amount<input name="amount-${i}" type="text" inputmode="decimal" value="${item.amountMinor ? String(item.amountMinor / 100) : ""}" maxlength="16" placeholder="0.00"></label></div>`).join("")}<div class="invoice-total"><strong id="invoice-total"></strong><p id="invoice-words"></p></div></section><section class="invoice-card"><h3>Payment details</h3><div class="invoice-fields">${field("payment.accountName", "Account name", current.payment.accountName, "text", true)}${field("payment.bankName", "Bank name", current.payment.bankName, "text", true)}${field("payment.accountNumber", "Account no. / IBAN", current.payment.accountNumber, "text", true)}${field("payment.swift", "SWIFT / BIC code", current.payment.swift, "text", true)}${field("payment.bankCode", "Bank code / Branch code", current.payment.bankCode)}${field("payment.bankAddress", "Bank address", current.payment.bankAddress)}</div><h4>Supporting expense form / receipts</h4><p class="muted">Attach one PDF, PNG or JPEG, up to 400 KB. Required when invoicing reimbursement. Combine receipts into one PDF if needed.</p><input type="file" id="invoice-file" accept="application/pdf,image/png,image/jpeg"><p id="invoice-file-name"></p><button type="button" class="secondary" id="invoice-remove-file">Remove attachment</button></section><section class="invoice-card"><h3>Declaration & signature</h3><label class="invoice-consent"><input type="checkbox" name="consent">${DECLARATION}</label>${field("signatureName", "Name of signer", current.signatureName || current.from.fullName, "text", true)}<p>Draw your signature below using your mouse, finger or pen. A signature is required to Submit.</p><canvas id="invoice-signature" width="800" height="240" aria-label="Draw your signature" role="img"></canvas><button type="button" class="secondary" id="invoice-clear-signature">Clear signature</button><p class="muted">Changing invoice details clears the signature. The submission time is recorded with the signed invoice.</p></section><div class="invoice-save-actions"><button type="button" id="invoice-save">Save draft</button><button type="submit" id="invoice-submit">Sign & Submit invoice</button></div></form>`;
  const form = host.querySelector("form");
  pad = signaturePad(form.querySelector("canvas"), () => {
    dirty = true;
  });
  attachment = current.supportingDocument || null;
  showAttachment();
  form.addEventListener("input", (event) => {
    dirty = true;
    if (!["consent"].includes(event.target.name)) pad.clear();
    updateTotals();
  });
  form.addEventListener("change", (event) => {
    dirty = true;
    if (
      event.target.id !== "invoice-file" &&
      !["consent"].includes(event.target.name)
    )
      pad.clear();
    updateTotals();
  });
  form.querySelector("#invoice-clear-signature").onclick = () => pad.clear();
  form.querySelector("#invoice-save").onclick = () => saveInvoice(false);
  form.onsubmit = (event) => {
    event.preventDefault();
    return saveInvoice(true);
  };
  form.querySelector("#invoice-file").onchange = async (event) => {
    const file = event.target.files?.[0],
      version = epoch;
    if (!file) return;
    if (
      file.size > 400 * 1024 ||
      !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
    ) {
      message("Choose a PDF, PNG or JPEG no larger than 400 KB.");
      event.target.value = "";
      return;
    }
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(Error("Cannot read attachment."));
        reader.readAsDataURL(file);
      });
      if (epoch !== version || !form.isConnected) return;
      attachment = { name: file.name.slice(0, 200), type: file.type, data };
      dirty = true;
      pad.clear();
      showAttachment();
    } catch (error) {
      message(error.message);
    }
  };
  form.querySelector("#invoice-remove-file").onclick = () => {
    attachment = null;
    dirty = true;
    pad.clear();
    form.querySelector("#invoice-file").value = "";
    showAttachment();
  };
  updateTotals();
}
function showAttachment() {
  const element = root.querySelector("#invoice-file-name");
  if (element) element.textContent = attachment?.name || "No attachment";
}
function collect() {
  const form = root.querySelector("form"),
    data = structuredClone(current);
  for (const input of form.querySelectorAll("input[name],select[name]")) {
    if (input.name === "consent") data.consent = input.checked;
    else if (input.name.includes(".")) {
      const [section, key] = input.name.split(".");
      data[section][key] = input.value.trim();
    } else if (
      ["invoiceDate", "currency", "paymentTerms", "signatureName"].includes(
        input.name,
      )
    )
      data[input.name] = input.value.trim();
  }
  data.items = Array.from({ length: 10 }, (_, i) => ({
    description: form.querySelector(`[name="description-${i}"]`).value.trim(),
    reference: form.querySelector(`[name="reference-${i}"]`).value.trim(),
    amountMinor: minorUnits(form.querySelector(`[name="amount-${i}"]`).value),
  }));
  data.totalMinor = data.items.reduce((sum, item) => sum + item.amountMinor, 0);
  data.supportingDocument = attachment;
  return data;
}
function updateTotals() {
  try {
    const data = collect();
    root.querySelector("#invoice-number").textContent = invoiceNumber(data);
    root.querySelector("#invoice-due").textContent = formatReportDate(
      dueDate(data.invoiceDate, data.paymentTerms),
    );
    root.querySelector("#invoice-total").textContent =
      "Total amount due · " + data.currency + " " + money(data.totalMinor);
    root.querySelector("#invoice-words").textContent = amountWords(
      data.totalMinor,
      data.currency,
    );
  } catch (error) {
    root.querySelector("#invoice-total").textContent = error.message;
  }
}
async function openMonth(month, force = false) {
  if (!user || busy) return false;
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    message("Choose a valid service month.");
    return false;
  }
  if (
    dirty &&
    !force &&
    !confirm("Discard unsaved invoice changes and open this month?")
  ) {
    root.querySelector("#invoice-month").value = current.serviceMonth;
    return false;
  }
  const version = epoch,
    request = ++loadVersion;
  loading = true;
  message("Loading invoice…");
  try {
    const snapshot = await getDoc(
      doc(db, "monthlyInvoices", user.uid + "_" + month),
    );
    if (version !== epoch || request !== loadVersion) return false;
    current = snapshot.exists()
      ? snapshot.data()
      : blankInvoice(user, profile, month, today());
    dirty = false;
    pad = null;
    root.querySelector("#invoice-month").value = month;
    renderEditor();
    message("");
    return true;
  } catch (error) {
    if (version === epoch) message("Cannot load invoice: " + error.message);
    return false;
  } finally {
    if (version === epoch && request === loadVersion) loading = false;
  }
}
async function saveInvoice(submit) {
  if (!user || busy || loading || !current || current.status === "Submitted")
    return false;
  let data;
  try {
    data = collect();
    data.signature = submit ? pad.png() : "";
    data.status = submit ? "Submitted" : "Draft";
    if (!submit) data.consent = false;
    validateInvoice(data, submit);
  } catch (error) {
    message(error.message);
    return false;
  }
  if (
    submit &&
    !confirm(
      "Submit this signed invoice for " +
        data.serviceMonth +
        "? It cannot be edited after submission.",
    )
  )
    return false;
  const actor = user,
    version = epoch,
    baseRevision = current.revision || 0;
  let saved = false;
  busy = true;
  const form = root.querySelector("form");
  form.inert = true;
  form
    .querySelectorAll("button,input,select")
    .forEach((e) => (e.disabled = true));
  message(submit ? "Submitting signed invoice…" : "Saving draft…");
  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(
          db,
          "monthlyInvoices",
          actor.uid + "_" + data.serviceMonth,
        ),
        snapshot = await transaction.get(ref),
        existing = snapshot.exists() ? snapshot.data() : null;
      if (
        existing?.status === "Submitted" ||
        (existing?.revision || 0) !== baseRevision
      )
        throw Error(
          "This invoice changed in another session. Open the month again before saving.",
        );
      const payload = {
        ...data,
        revision: (existing?.revision || 0) + 1,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (submit) {
        payload.submittedAt = serverTimestamp();
        payload.signedAt = serverTimestamp();
      }
      transaction.set(ref, payload);
    });
    if (epoch !== version) return false;
    saved = true;
    dirty = false;
    return true;
  } catch (error) {
    if (version === epoch) message("Invoice was not saved: " + error.message);
    return false;
  } finally {
    if (epoch === version) {
      busy = false;
      form.inert = false;
      if (form.isConnected)
        form
          .querySelectorAll("button,input,select")
          .forEach((e) => (e.disabled = false));
      if (saved) {
        await openMonth(data.serviceMonth, true);
        message(
          submit
            ? "Signed invoice submitted to Finance."
            : "Draft saved. Please sign before submitting.",
        );
        await loadList();
      }
    }
  }
}
async function loadList() {
  if (!user) return;
  const version = epoch;
  try {
    const filters = [where("userId", "==", user.uid)];
    const result = await getDocs(
      query(collection(db, "monthlyInvoices"), ...filters),
    );
    if (epoch !== version) return;
    records = result.docs
      .map((snapshot) => snapshot.data())
      .sort(
        (a, b) =>
          b.serviceMonth.localeCompare(a.serviceMonth) ||
          a.userId.localeCompare(b.userId),
      );
    renderList();
  } catch (error) {
    if (epoch === version)
      root.querySelector("#invoice-records").textContent =
        "Cannot load invoices: " + error.message;
  }
}
function renderList(review = false) {
  const area = review ? reviewRoot : root;
  const month = area.querySelector(
      review ? "#management-invoice-month" : "#invoice-list-month",
    ).value,
    filtered = (review ? reviewRecords : records).filter(
      (record) => !month || record.serviceMonth === month,
    );
  const selectedPage = Math.max(
    0,
    Math.min(review ? reviewPage : page, Math.ceil(filtered.length / 10) - 1),
  );
  if (review) reviewPage = selectedPage;
  else page = selectedPage;
  const shown = filtered.slice(selectedPage * 10, selectedPage * 10 + 10),
    host = area.querySelector(
      review ? "#management-invoice-records" : "#invoice-records",
    );
  host.innerHTML =
    shown
      .map(
        (r, i) =>
          `<button type="button" class="invoice-list-row" data-invoice-row="${i}"><span>${esc(invoiceNumber(r))}<small>${esc(r.serviceMonth)} · ${esc(r.from.fullName)}</small>${review ? `<small>Submitted ${esc(formatReportTimestamp(r.submittedAt))} (UTC+7)</small>` : ""}</span><span>${esc(r.currency)} ${money(r.totalMinor)}</span><span>${esc(r.status)}</span><span>View</span></button>`,
      )
      .join("") || "<p>No invoices for this selection.</p>";
  host.querySelectorAll("[data-invoice-row]").forEach(
    (button) =>
      (button.onclick = () => {
        const data = shown[Number(button.dataset.invoiceRow)];
        if (!review && data.userId === user.uid && data.status === "Draft")
          return openMonth(data.serviceMonth);
        showInvoice(data);
      }),
  );
  const footer = document.createElement("div");
  footer.className = "invoice-toolbar";
  footer.innerHTML = `<span>${filtered.length} invoice(s) · 10 per page</span><button type="button" data-invoice-prev ${selectedPage === 0 ? "disabled" : ""}>Previous</button><button type="button" data-invoice-next ${(selectedPage + 1) * 10 >= filtered.length ? "disabled" : ""}>More</button>`;
  footer.querySelector("[data-invoice-prev]").onclick = () => {
    if (review) reviewPage--;
    else page--;
    renderList(review);
  };
  footer.querySelector("[data-invoice-next]").onclick = () => {
    if (review) reviewPage++;
    else page++;
    renderList(review);
  };
  host.appendChild(footer);
}
function reviewShell() {
  if (!reviewRoot) return;
  reviewRoot.innerHTML =
    user && canReview()
      ? `<div class="invoice-toolbar"><label>Filter by service month<input type="month" id="management-invoice-month"></label><button type="button" id="management-invoice-refresh">Refresh invoices</button></div><p class="muted">Submitted invoices only. Open an invoice to view its signature, bank details and supporting document, or print / save PDF.</p><div id="management-invoice-records"></div>`
      : "";
  if (!user || !canReview()) return;
  reviewRoot.querySelector("#management-invoice-month").onchange = () => {
    reviewPage = 0;
    renderList(true);
  };
  reviewRoot.querySelector("#management-invoice-refresh").onclick = () =>
    loadReviewInvoices();
}
async function loadReviewInvoices() {
  if (!user || !canReview() || !reviewRoot) return;
  const version = epoch,
    request = ++reviewLoadVersion;
  const host = reviewRoot.querySelector("#management-invoice-records");
  host.textContent = "Loading submitted invoices…";
  try {
    const result = await getDocs(
      query(
        collection(db, "monthlyInvoices"),
        where("status", "==", "Submitted"),
      ),
    );
    if (epoch !== version || request !== reviewLoadVersion || !canReview())
      return;
    reviewRecords = result.docs
      .map((snapshot) => snapshot.data())
      .sort(
        (a, b) =>
          b.serviceMonth.localeCompare(a.serviceMonth) ||
          a.userId.localeCompare(b.userId),
      );
    renderList(true);
  } catch (error) {
    if (epoch === version && request === reviewLoadVersion)
      host.textContent = "Cannot load invoices: " + error.message;
  }
}
function showInvoice(data) {
  document.querySelector(".invoice-viewer")?.remove();
  const modal = document.createElement("div");
  modal.className = "review-modal invoice-viewer";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Monthly invoice");
  const signature = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(
    data.signature || "",
  )
    ? data.signature
    : "";
  modal.innerHTML = `<article class="review-box invoice-paper"><div class="invoice-view-actions"><button type="button" data-invoice-print>Print / Save PDF</button><button type="button" class="review-close" data-invoice-close>✕ Close invoice</button></div><div class="invoice-toolbar"><img src="./assets/expensio-wordmark-dollar-green.png" alt="EXPENSiO" width="180"><h2>INVOICE</h2></div><div class="invoice-columns"><div><h3>From</h3>${Object.values(
    data.from,
  )
    .filter(Boolean)
    .map((v) => `<p>${esc(v)}</p>`)
    .join(
      "",
    )}</div><div><h3>${esc(invoiceNumber(data))}</h3><p>Invoice date: ${formatReportDate(data.invoiceDate)}</p><p>Service month: ${esc(data.serviceMonth)}</p><p>Payment terms: ${esc(data.paymentTerms)}</p><p>Due date: ${formatReportDate(dueDate(data.invoiceDate, data.paymentTerms))}</p><p>Status: ${esc(data.status)}</p></div></div><h3>Bill to</h3>${BILL_TO.map((v) => `<p>${esc(v)}</p>`).join("")}<table class="invoice-print-table"><thead><tr><th>No.</th><th>Description</th><th>Period / Reference</th><th>Amount (${esc(data.currency)})</th></tr></thead><tbody>${data.items.map((item, i) => (item.description || item.amountMinor ? `<tr><td>${i + 1}</td><td>${esc(item.description)}</td><td>${esc(item.reference)}</td><td>${money(item.amountMinor)}</td></tr>` : "")).join("")}</tbody></table><h3>Total amount due: ${esc(data.currency)} ${money(data.totalMinor)}</h3><p>${esc(amountWords(data.totalMinor, data.currency))}</p><h3>Payment details</h3>${Object.entries(
    {
      accountName: "Account name",
      bankName: "Bank name",
      accountNumber: "Account no. / IBAN",
      swift: "SWIFT / BIC",
      bankCode: "Bank / Branch code",
      bankAddress: "Bank address",
    },
  )
    .filter(([k]) => data.payment[k])
    .map(
      ([k, label]) =>
        `<p><strong>${label}:</strong> ${esc(data.payment[k])}</p>`,
    )
    .join(
      "",
    )}<p>${esc(data.declaration || DECLARATION)}</p>${signature ? `<img class="invoice-signed-image" alt="Signature of ${esc(data.signatureName)}" src="${signature}"><p>Signed by: ${esc(data.signatureName)}</p>` : "<p>Unsigned draft</p>"}<p>Signed / submitted: ${formatReportTimestamp(data.signedAt)} (UTC+7)</p>${data.supportingDocument ? '<button type="button" data-invoice-document>Download supporting document</button>' : ""}</article>`;
  modal.querySelector("[data-invoice-close]").onclick = () => modal.remove();
  modal.querySelector("[data-invoice-print]").onclick = () => window.print();
  const button = modal.querySelector("[data-invoice-document]");
  if (button)
    button.onclick = () => {
      const file = data.supportingDocument;
      if (
        !/^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/=]+$/.test(
          file.data,
        )
      )
        return;
      const anchor = document.createElement("a");
      anchor.href = file.data;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    };
  document.body.appendChild(modal);
  modal.querySelector("[data-invoice-close]").focus?.();
}
on("session", (data) => {
  epoch++;
  loadVersion++;
  user = data.user;
  profile = data.profile || {};
  current = null;
  records = [];
  dirty = false;
  busy = false;
  loading = false;
  attachment = null;
  pad = null;
  reviewRecords = [];
  reviewPage = 0;
  reviewLoadVersion++;
  page = 0;
  document.querySelector(".invoice-viewer")?.remove();
  root.innerHTML = "";
  reviewShell();
  if (user) shell();
});
on("view-changed", ({ view, managementPage }) => {
  if (view === "admin" && managementPage === "invoices") loadReviewInvoices();
  if (view === "monthly-invoices" && user) {
    if (!current) openMonth(root.querySelector("#invoice-month").value);
    loadList();
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRuntime } = require("./runtime-harness.cjs");
async function model() {
  const mod = new vm.SourceTextModule(
    fs.readFileSync("docs/monthly-invoice-model.js", "utf8"),
  );
  await mod.link(() => {});
  await mod.evaluate();
  return mod.namespace;
}
async function runtime(role = "user") {
  const r = await createRuntime({ role });
  await r.login();
  r.window.showView("monthly-invoices");
  await r.settle();
  return r;
}
function fill(r) {
  const f = r.document.getElementById("monthly-invoice-form");
  for (const [name, value] of Object.entries({
    "from.fullName": "Test Person",
    "from.address1": "Test Address",
    "from.country": "Thailand",
    "from.email": "test@example.test",
    "payment.accountName": "Test Person",
    "payment.bankName": "Test Bank",
    "payment.accountNumber": "1234567890",
    "payment.swift": "TESTTHBK",
    signatureName: "Test Person",
    "amount-0": "100.01",
    "amount-2": "0.02",
    "description-2": "Service fee",
  }))
    f.querySelector('[name="' + name + '"]').value = value;
  f.querySelector("[name=consent]").checked = true;
  return f;
}
function sign(r) {
  const canvas = r.document.getElementById("invoice-signature");
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 240,
  });
  for (const [type, x, y] of [
    ["pointerdown", 30, 30],
    ["pointermove", 60, 50],
    ["pointermove", 120, 35],
    ["pointerup", 120, 35],
  ]) {
    const event = new r.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0 });
    canvas.dispatchEvent(event);
  }
}
test("Invoice calculation follows template number, due date, currency words and exact cents", async () => {
  const m = await model(),
    d = m.blankInvoice(
      { uid: "u", email: "u@example.test" },
      { firstName: "John", lastName: "Doe" },
      "2026-10",
      "2026-11-25",
    );
  assert.equal(m.invoiceNumber(d), "JOHN-202611");
  assert.equal(m.dueDate(d.invoiceDate, "14 days"), "2026-12-09");
  assert.equal(m.minorUnits("100.01") + m.minorUnits("0.02"), 10003);
  assert.equal(
    m.amountWords(10003, "HKD"),
    "Hong Kong Dollars One Hundred and Three Cents Only",
  );
  assert.throws(() => m.minorUnits("-1"));
  assert.throws(() => m.minorUnits("1.001"));
  assert.equal(m.validDate("2026-02-30"), false);
});
test("Monthly menu shows responsive invoice fields and requires actual signature before submission", async () => {
  const r = await runtime(),
    form = fill(r);
  assert.ok(
    r.document
      .querySelector('.side-nav [data-view="monthly-invoices"]')
      .classList.contains("active"),
  );
  assert.equal(form.querySelectorAll(".invoice-line").length, 10);
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
  assert.match(
    r.document.querySelector("[data-invoice-message]").textContent,
    /sign before submitting/,
  );
  assert.equal(r.writes.length, 0);
  sign(r);
  assert.equal(await form.onsubmit({ preventDefault() {} }), true);
  const saved = [...r.data.entries()].find(([key]) =>
    key.startsWith("monthlyInvoices/"),
  )[1];
  assert.equal(saved.status, "Submitted");
  assert.equal(saved.totalMinor, 10003);
  assert.match(saved.signature, /^data:image\/png/);
  assert.equal(saved.consent, true);
  assert.ok(saved.signedAt);
  assert.ok(saved.submittedAt);
  assert.equal(saved.signatureName, "Test Person");
  assert.match(
    r.document.getElementById("invoice-editor").textContent,
    /read-only/,
  );
});
test("Changing invoice details after signing invalidates the signature", async () => {
  const r = await runtime(),
    form = fill(r);
  sign(r);
  const input = form.querySelector('[name="payment.accountNumber"]');
  input.value = "changed";
  input.dispatchEvent(new r.window.Event("input", { bubbles: true }));
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
  assert.match(
    r.document.querySelector("[data-invoice-message]").textContent,
    /sign before submitting/,
  );
});
test("Clear signature blocks submission and changing signer also requires signing again", async () => {
  const r = await runtime(),
    form = fill(r);
  sign(r);
  form.querySelector("#invoice-clear-signature").click();
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
  sign(r);
  const name = form.querySelector("[name=signatureName]");
  name.value = "Different";
  name.dispatchEvent(new r.window.Event("input", { bubbles: true }));
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
});
test("Draft saves incomplete details without signature and reopens same monthly document", async () => {
  const r = await runtime();
  assert.equal(await r.document.getElementById("invoice-save").onclick(), true);
  const entries = [...r.data.entries()].filter(([key]) =>
    key.startsWith("monthlyInvoices/"),
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].signature, "");
  assert.equal(entries[0][1].consent, false);
  assert.equal(entries[0][1].revision, 1);
  assert.equal(await r.document.getElementById("invoice-save").onclick(), true);
  assert.equal(r.data.get(entries[0][0]).revision, 2);
});
test("Reimbursement requires a supporting document and does not save on cancellation/failure", async () => {
  const r = await runtime(),
    form = fill(r);
  form.querySelector("[name=amount-1]").value = "20";
  sign(r);
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
  assert.match(
    r.document.querySelector("[data-invoice-message]").textContent,
    /supporting expense/,
  );
  form.querySelector("[name=amount-1]").value = "";
  r.context.confirm = () => false;
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
  assert.equal(r.writes.length, 0);
  r.context.confirm = () => true;
  r.failWrite();
  assert.equal(await form.onsubmit({ preventDefault() {} }), false);
  assert.match(
    r.document.querySelector("[data-invoice-message]").textContent,
    /not saved/,
  );
  assert.equal(r.writes.length, 0);
});
test("Signed viewer includes bank details, declaration, signature and print control; logout removes it", async () => {
  const r = await runtime(),
    form = fill(r);
  sign(r);
  await form.onsubmit({ preventDefault() {} });
  r.document.getElementById("invoice-view-current").click();
  const modal = r.document.querySelector(".invoice-viewer");
  assert.ok(modal.querySelector(".invoice-signed-image"));
  assert.match(modal.textContent, /1234567890/);
  assert.match(modal.textContent, /have not been invoiced before/);
  assert.ok(modal.querySelector("[data-invoice-print]"));
  await r.logout();
  assert.equal(r.document.querySelector(".invoice-viewer"), null);
  assert.equal(r.document.getElementById("monthly-invoices").textContent, "");
});
test("Only Admin and Finance have the all-submissions scope", async () => {
  for (const role of ["user", "manager", "admin", "finance"]) {
    const r = await runtime(role);
    assert.equal(
      !!r.document.getElementById("invoice-scope"),
      ["admin", "finance"].includes(role),
    );
    assert.deepEqual(r.errors, []);
  }
});

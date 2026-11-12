const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { initializeTestEnvironment } = require("@firebase/rules-unit-testing"),
  sdk = require("firebase/firestore"),
  { createRuntime } = require("./runtime-harness.cjs");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8180");
sdk.setLogLevel("silent");
const plain = (value) =>
  Array.isArray(value)
    ? Array.from(value, plain)
    : value && value.constructor?.name === "Object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
      : value;
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  throw Error("Invoice UI did not refresh");
}
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-expensio-invoice-app",
    firestore: {
      host: "127.0.0.1",
      port: 8180,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      for (const [uid, role] of [
        ["owner", "user"],
        ["finance", "finance"],
      ])
        await sdk.setDoc(sdk.doc(context.firestore(), "users", uid), {
          role,
          active: true,
        });
    });
    async function actor(uid, role) {
      const db = env
        .authenticatedContext(uid, { email: uid + "@example.com" })
        .firestore();
      const r = await createRuntime({
        uid,
        role,
        firestoreApi: {
          ...sdk,
          getFirestore: () => db,
          where: (f, o, v) => sdk.where(f, o, plain(v)),
          setDoc: (ref, v, o) => sdk.setDoc(ref, plain(v), plain(o)),
          addDoc: (ref, v) => sdk.addDoc(ref, plain(v)),
          runTransaction: (db, handler) =>
            sdk.runTransaction(db, (tx) =>
              handler({
                get: (ref) => tx.get(ref),
                set: (ref, value, options) =>
                  tx.set(ref, plain(value), plain(options)),
              }),
            ),
        },
      });
      await r.login();
      r.window.showView("monthly-invoices");
      await waitFor(() => r.document.getElementById("monthly-invoice-form"));
      return { r, db };
    }
    const { r, db } = await actor("owner", "user");
    const stale = await actor("owner", "user");
    let form = r.document.getElementById("monthly-invoice-form");
    for (const [name, value] of Object.entries({
      "from.fullName": "Test Person",
      "from.address1": "Test Address",
      "from.country": "Thailand",
      "from.email": "owner@example.com",
      "payment.accountName": "Test Person",
      "payment.bankName": "Test Bank",
      "payment.accountNumber": "123456",
      "payment.swift": "TESTTHBK",
      signatureName: "Test Person",
      "amount-0": "150.25",
    }))
      form.querySelector('[name="' + name + '"]').value = value;
    assert.equal(await form.querySelector("#invoice-save").onclick(), true);
    console.log(
      "PASS real app saves monthly Draft through deployed-rule candidate",
    );
    assert.equal(
      await stale.r.document.getElementById("invoice-save").onclick(),
      false,
    );
    assert.match(
      stale.r.document.querySelector("[data-invoice-message]").textContent,
      /changed in another session/,
    );
    console.log(
      "PASS stale tab cannot create a duplicate or overwrite a newer Draft",
    );
    form = r.document.getElementById("monthly-invoice-form");
    form.querySelector("[name=consent]").checked = true;
    const canvas = form.querySelector("canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 240,
    });
    for (const [type, x, y] of [
      ["pointerdown", 20, 20],
      ["pointermove", 80, 45],
      ["pointermove", 140, 20],
      ["pointerup", 140, 20],
    ]) {
      const event = new r.window.Event(type, {
        bubbles: true,
        cancelable: true,
      });
      Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0 });
      canvas.dispatchEvent(event);
    }
    assert.equal(await form.onsubmit({ preventDefault() {} }), true);
    const list = await sdk.getDocs(
      sdk.query(
        sdk.collection(db, "monthlyInvoices"),
        sdk.where("userId", "==", "owner"),
      ),
    );
    assert.equal(list.size, 1);
    const data = list.docs[0].data();
    assert.equal(data.status, "Submitted");
    assert.equal(data.totalMinor, 15025);
    assert.equal(data.revision, 2);
    assert.equal(data.signedAt.toMillis(), data.submittedAt.toMillis());
    assert.ok(data.signature.startsWith("data:image/png"));
    console.log(
      "PASS signature, server timestamps and exact total persist atomically",
    );
    const finance = await actor("finance", "finance");
    assert.equal(finance.r.document.getElementById("invoice-scope"), null);
    finance.r.window.showView("admin-invoices");
    await waitFor(() =>
      finance.r.document
        .getElementById("management-invoice-records")
        .textContent.includes("Test Person"),
    );
    finance.r.document
      .querySelector("#management-invoice-records [data-invoice-row]")
      .click();
    assert.ok(finance.r.document.querySelector(".invoice-signed-image"));
    assert.match(
      finance.r.document.querySelector(".invoice-viewer").textContent,
      /123456/,
    );
    assert.deepEqual(r.errors, []);
    assert.deepEqual(finance.r.errors, []);
    console.log(
      "PASS Finance finds the submitted month and opens signed invoice",
    );
    console.log("MONTHLY_INVOICE_APP_SCENARIOS=4");
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const fs = require("node:fs"),
  assert = require("node:assert/strict");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  collection,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  setLogLevel,
} = require("firebase/firestore");
setLogLevel("silent");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8180");
let count = 0;
const declaration =
  "I confirm that the amounts invoiced above are accurate, relate to services or expenses for Suisseland Group, and have not been invoiced before. Supporting receipts for any reimbursement are attached.";
function invoice(status = "Draft") {
  const data = {
    schemaVersion: 1,
    declaration,
    userId: "owner",
    userEmail: "owner@example.test",
    serviceMonth: "2026-11",
    invoiceDate: "2026-11-12",
    currency: "HKD",
    paymentTerms: "14 days",
    from: {
      fullName: "Test Person",
      address1: "Test Address",
      address2: "",
      country: "Thailand",
      phone: "",
      email: "owner@example.test",
    },
    payment: {
      accountName: "Test Person",
      bankName: "Test Bank",
      accountNumber: "123456",
      swift: "TESTTHBK",
      bankCode: "",
      bankAddress: "",
    },
    items: Array.from({ length: 10 }, (_, i) => ({
      description: i === 0 ? "Consultancy fee" : "",
      reference: "",
      amountMinor: i === 0 ? 10003 : 0,
    })),
    totalMinor: 10003,
    status,
    signature:
      status === "Submitted" ? "data:image/png;base64,iVBORw0KGgo=" : "",
    signatureName: "Test Person",
    consent: status === "Submitted",
    supportingDocument: null,
    revision: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (status === "Submitted") {
    data.signedAt = serverTimestamp();
    data.submittedAt = serverTimestamp();
  }
  return data;
}
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-expensio-invoice-rules",
    firestore: {
      host: "127.0.0.1",
      port: 8180,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  const actors = {};
  for (const uid of [
    "owner",
    "other",
    "manager",
    "finance",
    "admin",
    "disabled",
  ])
    actors[uid] = env
      .authenticatedContext(uid, { email: uid + "@example.test" })
      .firestore();
  actors.anonymous = env.unauthenticatedContext().firestore();
  const ref = (who, id = "owner_2026-11") =>
    doc(actors[who], "monthlyInvoices", id);
  async function seed(data) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [uid, role] of [
        ["owner", "user"],
        ["other", "user"],
        ["manager", "manager"],
        ["finance", "finance"],
        ["admin", "admin"],
        ["disabled", "user"],
      ])
        await setDoc(doc(db, "users", uid), {
          role,
          active: uid !== "disabled",
        });
      if (data)
        await setDoc(doc(db, "monthlyInvoices", "owner_2026-11"), {
          ...data,
          createdAt: Timestamp.fromMillis(1000),
          updatedAt: Timestamp.fromMillis(1000),
          ...(data.status === "Submitted"
            ? {
                signedAt: Timestamp.fromMillis(1000),
                submittedAt: Timestamp.fromMillis(1000),
              }
            : {}),
        });
    });
  }
  async function check(name, allow, action, data = null) {
    await seed(data);
    let allowed = true;
    try {
      await action();
    } catch (error) {
      if (error.code !== "permission-denied") throw error;
      allowed = false;
    }
    assert.equal(allowed, allow, name);
    count++;
    console.log("PASS " + name);
  }
  try {
    await check("Owner can check nonexistent own month", true, () =>
      getDoc(ref("owner")),
    );
    await check("Other user cannot probe nonexistent owner month", false, () =>
      getDoc(ref("other")),
    );
    await check("Anonymous cannot create invoice", false, () =>
      setDoc(ref("anonymous"), invoice()),
    );
    await check("Owner creates monthly Draft", true, () =>
      setDoc(ref("owner"), invoice()),
    );
    await check("Owner submits signed invoice", true, () =>
      setDoc(ref("owner"), invoice("Submitted")),
    );
    await check(
      "All ten signed lines and attachment stay within Rules evaluation limit",
      true,
      () => {
        const d = invoice("Submitted");
        d.items = d.items.map(() => ({
          description: "Reimbursement fee",
          reference: "Full month",
          amountMinor: 100,
        }));
        d.totalMinor = 1000;
        d.supportingDocument = {
          name: "support.pdf",
          type: "application/pdf",
          data: "data:application/pdf;base64,JVBERi0=",
        };
        return setDoc(ref("owner"), d);
      },
    );
    await check(
      "Non-string contact cannot bypass schema validation",
      false,
      () => {
        const d = invoice();
        d.from.phone = { hidden: "bad" };
        return setDoc(ref("owner"), d);
      },
    );
    await check("Submit without signature denied", false, () =>
      setDoc(ref("owner"), { ...invoice("Submitted"), signature: "" }),
    );
    await check("Submit without consent denied", false, () =>
      setDoc(ref("owner"), { ...invoice("Submitted"), consent: false }),
    );
    await check("Submit without bank details denied", false, () => {
      const d = invoice("Submitted");
      d.payment.swift = "";
      return setDoc(ref("owner"), d);
    });
    await check("Total tampering denied", false, () =>
      setDoc(ref("owner"), { ...invoice("Submitted"), totalMinor: 1 }),
    );
    await check("Negative line denied", false, () => {
      const d = invoice("Submitted");
      d.items[1].amountMinor = -1;
      return setDoc(ref("owner"), d);
    });
    await check("Amount without description denied", false, () => {
      const d = invoice("Submitted");
      d.items[0].description = "";
      return setDoc(ref("owner"), d);
    });
    await check("Reimbursement with PDF support accepted", true, () => {
      const d = invoice("Submitted");
      d.items[0].description = "Reimbursement";
      d.supportingDocument = {
        name: "support.pdf",
        type: "application/pdf",
        data: "data:application/pdf;base64,JVBERi0=",
      };
      return setDoc(ref("owner"), d);
    });
    await check("Backdated signature time denied", false, () =>
      setDoc(ref("owner"), {
        ...invoice("Submitted"),
        signedAt: Timestamp.fromMillis(1000),
      }),
    );
    await check("Mismatched month document denied", false, () =>
      setDoc(ref("owner", "owner_2026-10"), invoice()),
    );
    await check("Cross-user creation denied", false, () =>
      setDoc(ref("other"), invoice()),
    );
    await check(
      "Owner reads own signed invoice",
      true,
      () => getDoc(ref("owner")),
      invoice("Submitted"),
    );
    await check(
      "Manager cannot read another user bank/signature",
      false,
      () => getDoc(ref("manager")),
      invoice("Submitted"),
    );
    await check(
      "Other user cannot read signed invoice",
      false,
      () => getDoc(ref("other")),
      invoice("Submitted"),
    );
    for (const role of ["admin", "finance"]) {
      await check(
        role + " reads submitted invoice",
        true,
        () => getDoc(ref(role)),
        invoice("Submitted"),
      );
      await check(
        role + " cannot read private Draft",
        false,
        () => getDoc(ref(role)),
        invoice(),
      );
      await check(
        role + " can query submitted invoices",
        true,
        () =>
          getDocs(
            query(
              collection(actors[role], "monthlyInvoices"),
              where("status", "==", "Submitted"),
            ),
          ),
        invoice("Submitted"),
      );
    }
    for (const role of ['manager','other']) {
      await check(role + ' cannot query submitted invoices belonging to others', false,
        () => getDocs(query(collection(actors[role], 'monthlyInvoices'), where('status','==','Submitted'))), invoice('Submitted'));
    }
    await check('Admin cannot query all monthly drafts without a submission constraint', false,
      () => getDocs(collection(actors.admin, 'monthlyInvoices')), invoice());
    await check(
      "Owner query constrained to own invoices succeeds",
      true,
      () =>
        getDocs(
          query(
            collection(actors.owner, "monthlyInvoices"),
            where("userId", "==", "owner"),
          ),
        ),
      invoice(),
    );
    await check(
      "Unfiltered user query denied",
      false,
      () => getDocs(collection(actors.owner, "monthlyInvoices")),
      invoice(),
    );
    await check(
      "Signed invoice is immutable even for owner",
      false,
      () => updateDoc(ref("owner"), { totalMinor: 1 }),
      invoice("Submitted"),
    );
    await check(
      "Admin cannot overwrite signed invoice",
      false,
      () => updateDoc(ref("admin"), { signatureName: "Other" }),
      invoice("Submitted"),
    );
    await check(
      "Admin cannot delete signed invoice",
      false,
      () => deleteDoc(ref("admin")),
      invoice("Submitted"),
    );
    await check(
      "Draft update preserves identity and advances revision",
      true,
      () =>
        updateDoc(ref("owner"), {
          revision: 2,
          updatedAt: serverTimestamp(),
          "from.phone": "12345",
        }),
      invoice(),
    );
    await check(
      "Stale Draft revision denied",
      false,
      () =>
        updateDoc(ref("owner"), { revision: 1, updatedAt: serverTimestamp() }),
      invoice(),
    );
    await check(
      "Pending temporary password cannot read invoices",
      false,
      async () => {
        await env.withSecurityRulesDisabled((context) =>
          setDoc(doc(context.firestore(), "accountSecurity", "owner"), {
            mustChangePassword: true,
            requiredVersion: "v1",
          }),
        );
        return getDoc(ref("owner"));
      },
      invoice("Submitted"),
    );
    await check(
      "Password-ready session submits ten lines within Rules evaluation limit",
      true,
      async () => {
        await env.withSecurityRulesDisabled((context) =>
          setDoc(doc(context.firestore(), "accountSecurity", "owner"), {
            mustChangePassword: false,
            requiredVersion: "v1",
          }),
        );
        const ready = env
          .authenticatedContext("owner", {
            email: "owner@example.test",
            passwordVersion: "v1",
          })
          .firestore();
        const d = invoice("Submitted");
        d.items = d.items.map(() => ({
          description: "Consultancy fee",
          reference: "Month",
          amountMinor: 100,
        }));
        d.totalMinor = 1000;
      d.supportingDocument = { name: 'support.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0=' };
        return setDoc(doc(ready, "monthlyInvoices", "owner_2026-11"), d);
      },
    );
    await check("Signature cannot be stored on a Draft", false, () =>
      setDoc(ref("owner"), {
        ...invoice(),
        signature: "data:image/png;base64,iVBORw0KGgo=",
      }),
    );
    console.log("MONTHLY_INVOICE_RULE_CHECKS=" + count);
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

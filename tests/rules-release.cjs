const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
  setLogLevel,
  writeBatch,
} = require("firebase/firestore");
setLogLevel("silent");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^127\.0\.0\.1:8180$/.test(host))
  throw Error(
    "Rules audit requires the isolated local Firestore emulator on 127.0.0.1:8180",
  );
const output = [];
const roles = {
  owner: "user",
  other: "user",
  manager: "manager",
  finance: "finance",
  admin: "admin",
  disabled: "disabled",
  inactiveAdmin: "admin",
};
const base = (status) => ({
  userId: "owner",
  userEmail: "owner@example.test",
  reportNo: "ER-FY2027-000001",
  runNumber: "ER-FY2027-000001",
  createdAt: Timestamp.fromMillis(1000),
  status,
  fiscalYear: "FY2027",
  totalHkd: 50,
  meta: { purpose: "Synthetic rules test" },
  items: [{ amount: 200, fx: 0.25 }],
});
function newReport(status) {
  const data = {
    ...base(status),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  delete data.reportNo;
  delete data.runNumber;
  return data;
}
async function audit(file, label) {
  const projectId = "demo-slg-rules-" + label;
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8180,
      rules: fs.readFileSync(file, "utf8"),
    },
  });
  const actors = Object.fromEntries(
    Object.keys(roles).map((uid) => [
      uid,
      env.authenticatedContext(uid).firestore(),
    ]),
  );
  actors.new = env.authenticatedContext("new-user").firestore();
  actors.anonymous = env.unauthenticatedContext().firestore();
  const ref = (actor, collection = "expenseReports", id = "target") =>
    doc(actors[actor], collection, id);
  async function reset(status = "Submitted", owner = "owner") {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [uid, role] of Object.entries(roles))
        await setDoc(doc(db, "users", uid), {
          role,
          active: !["disabled", "inactiveAdmin"].includes(uid),
          email: uid + "@example.test",
        });
      await setDoc(doc(db, "expenseReports", "target"), {
        ...base(status),
        userId: owner,
      });
      await setDoc(doc(db, "notifications", "notice"), {
        createdBy: "manager",
        recipientUserId: "owner",
        recipientRole: "user",
        status: "unread",
      });
    });
  }
  async function check(
    name,
    expectedAllowed,
    operation,
    { status = "Submitted", owner = "owner", category = "security" } = {},
  ) {
    await reset(status, owner);
    let allowed = false,
      error = null;
    try {
      await operation();
      allowed = true;
    } catch (e) {
      if (e.code !== "permission-denied") throw e;
      error = e.code;
    }
    const row = {
      rules: file,
      name,
      category,
      expectedAllowed,
      actualAllowed: allowed,
      matchesExpectation: expectedAllowed === allowed,
    };
    output.push(row);
    console.log(
      (row.matchesExpectation ? "OK" : "FINDING") +
        " | " +
        label +
        " | " +
        name +
        " | " +
        (allowed ? "ALLOWED" : "DENIED"),
    );
  }
  try {
    await check("Unauthenticated report read is denied", false, () =>
      getDoc(ref("anonymous")),
    );
    await check("Owner can read own report", true, () => getDoc(ref("owner")));
    await check("Other user cannot read owner report", false, () =>
      getDoc(ref("other")),
    );
    await check(
      "Manager cannot read unrelated Draft",
      false,
      () => getDoc(ref("manager")),
      { status: "Draft" },
    );
    await check("Manager can read Submitted", true, () =>
      getDoc(ref("manager")),
    );
    await check(
      "Finance can read canonical Processing",
      true,
      () => getDoc(ref("finance")),
      { status: "Reimbursement Processing" },
    );
    await check(
      "Disabled owner cannot read reports",
      false,
      () => getDoc(ref("disabled")),
      { owner: "disabled" },
    );
    await check("User may create own Draft", true, () =>
      setDoc(ref("owner", "expenseReports", "new"), newReport("Draft")),
    );
    await check("User cannot create another owner report", false, () =>
      setDoc(ref("other", "expenseReports", "new"), newReport("Draft")),
    );
    await check("User cannot create already reimbursed report", false, () =>
      setDoc(ref("owner", "expenseReports", "new"), newReport("Reimbursed")),
    );
    await check("Inactive Admin cannot read other reports", false, () =>
      getDoc(ref("inactiveAdmin")),
    );
    await check(
      "Owner cannot set negative claim totals",
      false,
      () => updateDoc(ref("owner"), { totalHkd: -100 }),
      { status: "Draft" },
    );
    await check(
      "Owner may edit Draft expense",
      true,
      () =>
        updateDoc(ref("owner"), {
          items: [{ amount: 400, fx: 0.25 }],
          totalHkd: 100,
        }),
      { status: "Draft" },
    );
    await check("Owner cannot edit Submitted expense", false, () =>
      updateDoc(ref("owner"), {
        items: [{ amount: 400, fx: 0.25 }],
        totalHkd: 100,
      }),
    );
    await check(
      "Owner cannot edit Approved expense",
      false,
      () =>
        updateDoc(ref("owner"), {
          items: [{ amount: 400, fx: 0.25 }],
          totalHkd: 100,
        }),
      { status: "Manager Approved" },
    );
    await check("Owner cannot self-approve", false, () =>
      updateDoc(ref("owner"), { status: "Manager Approved" }),
    );
    await check(
      "Owner cannot transfer ownership",
      false,
      () => updateDoc(ref("owner"), { userId: "other" }),
      { status: "Draft" },
    );
    await check(
      "Owner cannot change report number",
      false,
      () => updateDoc(ref("owner"), { reportNo: "ER-FY2027-999999" }),
      { status: "Draft" },
    );
    await check(
      "Owner cannot change creation time",
      false,
      () => updateDoc(ref("owner"), { createdAt: Timestamp.fromMillis(9999) }),
      { status: "Draft" },
    );
    await check(
      "Owner cannot forge approval/payment metadata",
      false,
      () =>
        updateDoc(ref("owner"), {
          managerId: "manager",
          managerStatus: "Approved",
          paymentReference: "fake",
        }),
      { status: "Draft" },
    );
    await check("Manager cannot edit amounts while approving", false, () =>
      updateDoc(ref("manager"), {
        status: "Manager Approved",
        items: [{ amount: 1, fx: 1 }],
        totalHkd: 1,
      }),
    );
    await check(
      "Finance cannot edit amounts while processing",
      false,
      () =>
        updateDoc(ref("finance"), {
          status: "Reimbursement Processing",
          items: [{ amount: 1, fx: 1 }],
          totalHkd: 1,
        }),
      { status: "Manager Approved" },
    );
    await check("Manager may approve Submitted", true, () =>
      updateDoc(ref("manager"), {
        status: "Manager Approved",
        managerStatus: "Approved",
        managerId: "manager",
        managerEmail: "manager@example.test",
        managerComment: "Approved",
        managerActionAt: Timestamp.fromMillis(2000),
        updatedAt: Timestamp.fromMillis(2000),
        fiscalYear: "FY2027",
        totalHkd: 50,
      }),
    );
    await check("Manager must supply rejection comment", false, () =>
      updateDoc(ref("manager"), { status: "Rejected", managerComment: "" }),
    );
    await check("Manager cannot edit expense items", false, () =>
      updateDoc(ref("manager"), { items: [{ amount: 400, fx: 0.25 }] }),
    );
    await check("Manager cannot skip to Reimbursed", false, () =>
      updateDoc(ref("manager"), { status: "Reimbursed" }),
    );
    await check(
      "Finance may start canonical Processing",
      true,
      () =>
        updateDoc(ref("finance"), {
          status: "Reimbursement Processing",
          financeStatus: "Reimbursement Processing",
          financeBy: "finance",
          financeEmail: "finance@example.test",
          financeRemark: "Processing",
          updatedAt: Timestamp.fromMillis(2000),
          financeActionAt: Timestamp.fromMillis(2000),
        }),
      { status: "Manager Approved" },
    );
    await check(
      "Current UI legacy Finance Processing write remains compatible",
      true,
      () =>
        updateDoc(ref("finance"), {
          status: "Finance Processing",
          financeStatus: "Finance Processing",
          financeBy: "finance",
          financeEmail: "finance@example.test",
          financeRemark: "Processing",
          updatedAt: Timestamp.fromMillis(2000),
          financeActionAt: Timestamp.fromMillis(2000),
        }),
      { status: "Manager Approved", category: "app-compatibility" },
    );
    await check(
      "Finance cannot edit approved expense amounts",
      false,
      () => updateDoc(ref("finance"), { items: [{ amount: 1, fx: 1 }] }),
      { status: "Manager Approved" },
    );
    await check(
      "Finance must supply payment reference before Reimbursed",
      false,
      () =>
        updateDoc(ref("finance"), {
          status: "Reimbursed",
          paymentReference: "",
        }),
      { status: "Reimbursement Processing" },
    );
    await check(
      "Finance cannot send Processing report backwards to Approved",
      false,
      () => updateDoc(ref("finance"), { status: "Manager Approved" }),
      { status: "Reimbursement Processing" },
    );
    await check("User cannot grant own admin role", false, () =>
      updateDoc(ref("owner", "users", "owner"), { role: "admin" }),
    );
    await check(
      "Admin may provision another user profile",
      true,
      () =>
        setDoc(ref("admin", "users", "new-user"), {
          email: "new@example.test",
          role: "user",
          active: true,
        }),
      { category: "app-compatibility" },
    );
    await check("User cannot create privileged own profile", false, () =>
      setDoc(ref("new", "users", "new-user"), { role: "admin", active: true }),
    );
    await check("New user may create ordinary own profile", true, () =>
      setDoc(ref("new", "users", "new-user"), { role: "user", active: true }),
    );
    await check("User cannot spoof manager-approved notification", false, () =>
      setDoc(ref("owner", "notifications", "spoof"), {
        createdBy: "owner",
        recipientRole: "finance",
        reportId: "target",
        type: "manager_approved",
        status: "unread",
      }),
    );
    await check(
      "Notification recipient cannot reroute it to another user",
      false,
      () =>
        updateDoc(ref("owner", "notifications", "notice"), {
          recipientUserId: "other",
        }),
    );
    await check("User cannot create approval audit log", false, () =>
      setDoc(ref("owner", "approvalLogs", "new"), {
        reportId: "target",
        action: "Manager Approved",
      }),
    );
    await check(
      "Finance may create payment audit log",
      true,
      () =>
        setDoc(ref("finance", "paymentLogs", "new"), {
          reportId: "target",
          action: "Reimbursed",
          actionBy: "finance",
        }),
      { status: "Reimbursed" },
    );
    await check(
      "Owner may notify Manager of exact submitted report",
      true,
      () =>
        setDoc(ref("owner", "notifications", "valid-submit"), {
          createdBy: "owner",
          recipientRole: "manager",
          reportId: "target",
          type: "report_submitted",
          status: "unread",
        }),
    );
    await check(
      "Manager may notify Finance after own approval",
      true,
      async () => {
        await env.withSecurityRulesDisabled((c) =>
          updateDoc(doc(c.firestore(), "expenseReports", "target"), {
            managerId: "manager",
          }),
        );
        return setDoc(ref("manager", "notifications", "valid-approval"), {
          createdBy: "manager",
          recipientRole: "finance",
          reportId: "target",
          type: "manager_approved",
          status: "unread",
        });
      },
      { status: "Manager Approved" },
    );
    await check(
      "Finance may notify owner after own reimbursement",
      true,
      async () => {
        await env.withSecurityRulesDisabled((c) =>
          updateDoc(doc(c.firestore(), "expenseReports", "target"), {
            financeBy: "finance",
          }),
        );
        return setDoc(ref("finance", "notifications", "valid-payment"), {
          createdBy: "finance",
          recipientUserId: "owner",
          reportId: "target",
          type: "reimbursed",
          status: "unread",
        });
      },
      { status: "Reimbursed" },
    );
    await check("Recipient may mark notification read", true, () =>
      updateDoc(ref("owner", "notifications", "notice"), {
        status: "read",
        readAt: serverTimestamp(),
      }),
    );
    await check(
      "Legacy profile without active flag remains readable",
      true,
      async () => {
        await env.withSecurityRulesDisabled((c) =>
          setDoc(doc(c.firestore(), "users", "owner"), { role: "user" }),
        );
        return getDoc(ref("owner"));
      },
    );
    await check(
      "Owner may normalize old client id to Firestore id",
      true,
      () => updateDoc(ref("owner"), { id: "target" }),
      { status: "Draft" },
    );
    await check(
      "Owner cannot normalize id to unrelated document",
      false,
      () => updateDoc(ref("owner"), { id: "other-document" }),
      { status: "Draft" },
    );
    await check("Whitespace rejection comment is denied", false, () =>
      updateDoc(ref("manager"), {
        status: "Rejected",
        managerId: "manager",
        managerComment: "  \t ",
      }),
    );
    await check(
      "Whitespace payment reference is denied",
      false,
      () =>
        updateDoc(ref("finance"), {
          status: "Reimbursed",
          financeBy: "finance",
          paymentReference: "  \t ",
        }),
      { status: "Reimbursement Processing" },
    );
    await check(
      "Atomic manager action and audit log succeed together",
      true,
      async () => {
        const db = actors.manager,
          batch = writeBatch(db);
        batch.update(ref("manager"), {
          status: "Manager Approved",
          managerId: "manager",
          managerActionAt: serverTimestamp(),
        });
        batch.set(ref("manager", "approvalLogs", "atomic"), {
          reportId: "target",
          action: "Manager Approved",
          actionBy: "manager",
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      },
    );
    await check(
      "Atomic finance action and payment log succeed together",
      true,
      async () => {
        const db = actors.finance,
          batch = writeBatch(db);
        batch.update(ref("finance"), {
          status: "Reimbursed",
          financeBy: "finance",
          paymentReference: "BANK-123",
        });
        batch.set(ref("finance", "paymentLogs", "atomic"), {
          reportId: "target",
          action: "Reimbursed",
          actionBy: "finance",
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      },
      { status: "Reimbursement Processing" },
    );
    await check(
      "Invalid audit actor rolls back the whole approval batch",
      false,
      async () => {
        const batch = writeBatch(actors.manager);
        batch.update(ref("manager"), {
          status: "Manager Approved",
          managerId: "manager",
        });
        batch.set(ref("manager", "approvalLogs", "invalid"), {
          reportId: "target",
          action: "Manager Approved",
          actionBy: "admin",
        });
        try {
          await batch.commit();
        } catch (error) {
          const snap = await getDoc(ref("admin"));
          if (snap.data().status !== "Submitted")
            throw Error("Partial approval persisted");
          throw error;
        }
      },
    );
    await check(
      "Legacy timestamp map can be approved without expense edits",
      true,
      async () => {
        await env.withSecurityRulesDisabled((c) =>
          updateDoc(doc(c.firestore(), "expenseReports", "target"), {
            createdAt: { seconds: 1000, nanoseconds: 0 },
          }),
        );
        return updateDoc(ref("manager"), {
          status: "Manager Approved",
          managerId: "manager",
        });
      },
    );
    await check(
      "Owner cannot change legacy timestamp map",
      false,
      async () => {
        await env.withSecurityRulesDisabled((c) =>
          updateDoc(doc(c.firestore(), "expenseReports", "target"), {
            createdAt: { seconds: 1000, nanoseconds: 0 },
          }),
        );
        return updateDoc(ref("owner"), {
          createdAt: { seconds: 2000, nanoseconds: 0 },
        });
      },
      { status: "Draft" },
    );
    await check("New report cannot spoof legacy timestamp map", false, () =>
      setDoc(ref("owner", "expenseReports", "new"), {
        ...newReport("Draft"),
        createdAt: { seconds: 1000, nanoseconds: 0 },
      }),
    );
    await check(
      "Owner can add missing total when saving a legacy Draft",
      true,
      async () => {
        await env.withSecurityRulesDisabled(async (c) => {
          const data = base("Draft");
          delete data.totalHkd;
          await setDoc(doc(c.firestore(), "expenseReports", "target"), data);
        });
        return updateDoc(ref("owner"), {
          totalHkd: 50,
          fiscalYear: "FY2027",
          status: "Submitted",
        });
      },
      { status: "Draft" },
    );
    await check("Owner cannot delete reports", false, () =>
      deleteDoc(ref("owner")),
    );
    await check("Admin may delete reports", true, () =>
      deleteDoc(ref("admin")),
    );
    await check("Disabled user cannot create a report", false, () =>
      setDoc(ref("disabled", "expenseReports", "new"), {
        ...newReport("Draft"),
        userId: "disabled",
      }),
    );
  } finally {
    await env.cleanup();
  }
}
(async () => {
  const supplied = process.argv[2];
  const files = supplied
    ? [[supplied, "provided"]]
    : [
        ["firestore.rules", "repository"],
        ["firestore-v282.rules", "candidate"],
      ];
  for (const [file, label] of files) await audit(file, label);
  const summary = Object.fromEntries(
    [...new Set(output.map((x) => x.rules))].map((file) => {
      const rows = output.filter((x) => x.rules === file);
      return [
        file,
        {
          checks: rows.length,
          expectedResults: rows.filter((x) => x.matchesExpectation).length,
          findings: rows.filter((x) => !x.matchesExpectation).length,
        },
      ];
    }),
  );
  fs.writeFileSync(
    supplied ? "RULES_RELEASE_TEST_RESULTS.json" : "RULES_AUDIT_RESULTS.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        scope: supplied
          ? "Release candidate evaluated in isolated emulator; live data and deployed rules not independently verified"
          : "Repository rule files in isolated emulator; not deployed production rules",
        summary,
        results: output,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(summary));
  if (Object.values(summary).some((x) => x.findings)) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

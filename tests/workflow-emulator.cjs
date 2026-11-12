// Runs production application modules against real Firestore SDK and isolated rules.
// Authentication is provided by the rules test environment, not production accounts.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const sdk = require("firebase/firestore");
const { createRuntime } = require("./runtime-harness.cjs");
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180")
  throw Error("Isolated emulator required");
sdk.setLogLevel("silent");
const results = [];
// Cross the VM boundary without changing Firestore Timestamp/FieldValue sentinels.
function plain(value) {
  if (Array.isArray(value)) return Array.from(value, plain);
  if (value && value.constructor?.name === "Object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, plain(v)]),
    );
  return value;
}
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error("Timed out waiting for UI refresh");
}
(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-expensio-workflow",
    firestore: {
      host: "127.0.0.1",
      port: 8180,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  const actors = {};
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      for (const [uid, role] of [
        ["owner", "user"],
        ["manager", "manager"],
        ["manager2", "manager"],
        ["finance", "finance"],
        ["other", "user"],
      ])
        await sdk.setDoc(sdk.doc(context.firestore(), "users", uid), {
          role,
          active: true,
          email: uid + "@example.com",
        });
      await sdk.setDoc(
        sdk.doc(context.firestore(), "budgets", "owner-FY2027"),
        { userId: "owner", fiscalYear: "FY2027", budgetAmount: 1000 },
      );
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
          where: (field, operator, value) =>
            sdk.where(field, operator, plain(value)),
          setDoc: (ref, value, options) =>
            sdk.setDoc(ref, plain(value), plain(options)),
          addDoc: (ref, value) => sdk.addDoc(ref, plain(value)),
          runTransaction: (database, handler) =>
            sdk.runTransaction(database, (tx) =>
              handler({
                get: (ref) => tx.get(ref),
                set: (ref, value, options) =>
                  tx.set(ref, plain(value), plain(options)),
              }),
            ),
        },
      });
      await r.login();
      actors[uid] = { r, db };
      return r;
    }
    async function read(uid, id) {
      return (
        await sdk.getDoc(sdk.doc(actors[uid].db, "expenseReports", id))
      ).data();
    }
    async function refresh(r) {
      await r.window.refreshAdmin();
      await waitFor(() =>
        r.document
          .getElementById("reviewReports")
          ?.textContent.includes("Workflow emulator"),
      ).catch((e) => {
        console.error({
          alerts: r.alerts,
          errors: r.errors,
          role: r.document.getElementById("myRoleText")?.textContent,
          queue: r.document.getElementById("reviewReports")?.textContent,
        });
        throw e;
      });
    }
    async function check(name, fn) {
      await fn();
      results.push({ name, passed: true });
      console.log("PASS | " + name);
    }
    const owner = await actor("owner", "user");
    owner.window.newReport();
    for (const [id, value] of Object.entries({
      employee: "Workflow Test",
      purpose: "Workflow emulator",
      destination: "Bangkok",
      fromDate: "2026-11-02",
      toDate: "2026-11-04",
    }))
      owner.document.getElementById(id).value = value;
    const item =
      owner.document.querySelector("[data-fx-input]").dataset.fxInput;
    for (const [key, value] of Object.entries({
      date: "2026-11-02",
      desc: "Taxi",
      currency: "THB",
      amount: 200,
      fx: 0.25,
    }))
      owner.window.setVal(item, key, value);
    await check(
      "User creates Draft with THB conversion and receipt",
      async () => {
        await owner.window.setFile(item, {
          name: "taxi.png",
          type: "image/png",
          size: 12,
        });
        assert.equal(
          await owner.window.saveReport("Draft"),
          true,
          owner.alerts.join("\n"),
        );
      },
    );
    const draft = (
        await sdk.getDocs(
          sdk.query(
            sdk.collection(actors.owner.db, "expenseReports"),
            sdk.where("userId", "==", "owner"),
          ),
        )
      ).docs[0],
      id = draft.id;
    assert.equal(draft.data().totalHkd, 50);
    assert.equal(draft.data().reportNo, "EXP-FY2027-000001");
    assert.ok(draft.data().items[0].receiptData);
    await check(
      "User submits same document and cannot edit Submitted",
      async () => {
        assert.equal(
          await owner.window.saveReport("Submitted"),
          true,
          owner.alerts.join("\n"),
        );
        assert.equal(await owner.window.saveReport("Draft"), false);
        assert.equal((await read("owner", id)).status, "Submitted");
      },
    );
    const manager = await actor("manager", "manager");
    await refresh(manager);
    await check("Manager requests revision with required comment", async () => {
      manager.context.prompt = () => "Correct the purpose";
      assert.equal(
        await manager.window.managerAction(id, "Revision Requested"),
        true,
        manager.alerts.join("\n"),
      );
      assert.equal((await read("owner", id)).status, "Revision Requested");
    });
    await check("Owner revises and resubmits through rules", async () => {
      await owner.window.refreshDashboardReports();
      assert.equal(await owner.window.openReport(id), true);
      owner.document.getElementById("purpose").value =
        "Workflow emulator corrected";
      assert.equal(
        await owner.window.saveReport("Submitted"),
        true,
        owner.alerts.join("\n"),
      );
    });
    await refresh(manager);
    const manager2 = await actor("manager2", "manager");
    await refresh(manager2);
    await check(
      "Two managers competing approve exactly once with one approval audit",
      async () => {
        manager.context.prompt = () => "Approved";
        manager2.context.prompt = () => "Approved";
        const outcome = await Promise.all([
          manager.window.managerAction(id, "Manager Approved"),
          manager2.window.managerAction(id, "Manager Approved"),
        ]);
        assert.equal(outcome.filter(Boolean).length, 1);
        const logs = await sdk.getDocs(
          sdk.collection(actors.manager.db, "approvalLogs"),
        );
        assert.equal(
          logs.docs.filter((d) => d.data().action === "Manager Approved")
            .length,
          1,
        );
        assert.equal((await read("owner", id)).status, "Manager Approved");
      },
    );
    const finance = await actor("finance", "finance");
    let processingMilestone;
    await refresh(finance);
    await check(
      "Finance cannot skip Processing, then starts canonical Processing",
      async () => {
        assert.equal(
          await finance.window.financeAction(id, "Reimbursed"),
          false,
        );
        finance.context.prompt = () => "Queued for payment";
        assert.equal(
          await finance.window.financeAction(id, "Reimbursement Processing"),
          true,
          finance.alerts.join("\n"),
        );
        assert.equal(
          (await read("owner", id)).status,
          "Reimbursement Processing",
        );
        assert.match(
          finance.document.getElementById("reviewReports").textContent,
          /Workflow emulator/,
        );
        const saved = await read("owner", id);
        processingMilestone = saved.financeApprovedAt;
        assert.equal(
          processingMilestone.toMillis(),
          saved.financeActionAt.toMillis(),
        );
      },
    );
    await check(
      "Finance blank payment reference blocked; valid reimbursement is atomic",
      async () => {
        finance.context.prompt = () => "  ";
        assert.equal(
          await finance.window.financeAction(id, "Reimbursed"),
          false,
        );
        finance.context.prompt = () => "BANK-TEST-001";
        assert.equal(
          await finance.window.financeAction(id, "Reimbursed"),
          true,
          finance.alerts.join("\n"),
        );
        const final = await read("owner", id);
        assert.equal(final.status, "Reimbursed");
        assert.equal(final.totalHkd, 50);
        assert.equal(final.paymentReference, "BANK-TEST-001");
        assert.equal(
          final.managerApprovedAt.toMillis(),
          final.managerActionAt.toMillis(),
        );
        assert.equal(
          final.financeApprovedAt.toMillis(),
          processingMilestone.toMillis(),
        );
        assert.equal(
          final.reimbursedAt.toMillis(),
          final.financeActionAt.toMillis(),
        );
        assert.ok(final.createdAt.toMillis() <= final.submittedAt.toMillis());
        assert.ok(
          final.submittedAt.toMillis() <= final.managerApprovedAt.toMillis(),
        );
        assert.ok(
          final.managerApprovedAt.toMillis() <=
            final.financeApprovedAt.toMillis(),
        );
        assert.ok(
          final.financeApprovedAt.toMillis() <= final.reimbursedAt.toMillis(),
        );
        const logs = await sdk.getDocs(
          sdk.collection(actors.finance.db, "paymentLogs"),
        );
        assert.equal(logs.size, 2);
      },
    );
    await check(
      "Server timestamps drive the Finance monthly filter and report timeline",
      async () => {
        const final = await read("owner", id),
          local = new Date(final.reimbursedAt.toMillis() + 7 * 3600000);
        const month =
          local.getUTCFullYear() +
          "-" +
          String(local.getUTCMonth() + 1).padStart(2, "0");
        finance.window.showView("admin-reports");
        finance.document.getElementById("allReportsEventFilter").value =
          "reimbursedAt";
        finance.document.getElementById("allReportsMonthFilter").value = month;
        finance.document.getElementById("allReportsApply").onclick();
        assert.match(
          finance.document.getElementById("adminReports").textContent,
          /Workflow emulator/,
        );
        finance.document.getElementById("allReportsMonthFilter").value =
          "1999-01";
        finance.document.getElementById("allReportsApply").onclick();
        assert.doesNotMatch(
          finance.document.getElementById("adminReports").textContent,
          /Workflow emulator/,
        );
        finance.document.getElementById("allReportsClear").onclick();
        await finance.window.reviewReport(id);
        assert.match(
          finance.document.querySelector(".workflow-timeline").textContent,
          /Bangkok \(UTC\+7\)/,
        );
        assert.doesNotMatch(
          finance.document.querySelector(".workflow-timeline").textContent,
          /Not recorded/,
        );
        finance.document.querySelector("[data-review-close]").click();
      },
    );
    await check(
      "Owner sees reimbursed report in History and all stage notifications",
      async () => {
        await owner.window.refreshDashboardReports();
        await owner.settle();
        assert.ok(owner.document.querySelector("[data-history-open]"));
        assert.equal(owner.document.querySelector("[data-report-row]"), null);
        await waitFor(async () => {
          const n = await sdk.getDocs(
            sdk.query(
              sdk.collection(actors.owner.db, "notifications"),
              sdk.where("recipientUserId", "==", "owner"),
            ),
          );
          return n.docs.some((d) => d.data().type === "reimbursed");
        });
        const n = await sdk.getDocs(
          sdk.query(
            sdk.collection(actors.owner.db, "notifications"),
            sdk.where("recipientUserId", "==", "owner"),
          ),
        );
        const types = n.docs.map((d) => d.data().type);
        for (const t of [
          "revision_requested",
          "reimbursement_processing",
          "reimbursed",
        ])
          assert.ok(types.includes(t), t);
      },
    );
    await check(
      "Legacy Submitted report can receive a number without changing financial data",
      async () => {
        await env.withSecurityRulesDisabled((context) =>
          sdk.setDoc(sdk.doc(context.firestore(), "expenseReports", "legacy"), {
            userId: "owner",
            userEmail: "owner@example.com",
            status: "Submitted",
            createdAt: sdk.Timestamp.fromMillis(1000),
            meta: { purpose: "Legacy report", fromDate: "2026-11-02" },
            items: [{ amount: 10, fx: 1 }],
            totalHkd: 10,
            fiscalYear: "FY2027",
          }),
        );
        await owner.window.refreshDashboardReports();
        assert.equal(
          await owner.window.assignMissingReportNumbers(),
          true,
          owner.alerts.join("\n"),
        );
        const legacy = await read("owner", "legacy");
        assert.equal(legacy.reportNo, "EXP-FY2027-000002");
        assert.equal(legacy.status, "Submitted");
        assert.equal(legacy.totalHkd, 10);
        assert.equal(legacy.createdAt.toMillis(), 1000);
      },
    );
    await check(
      "Counter cannot be advanced alone or an existing number replaced",
      async () => {
        await assert.rejects(
          sdk.setDoc(sdk.doc(actors.owner.db, "reportCounters", "FY2027"), {
            lastNumber: 100,
            lastReportId: "legacy",
            updatedAt: sdk.serverTimestamp(),
          }),
          (e) => e.code === "permission-denied",
        );
        await assert.rejects(
          sdk.updateDoc(sdk.doc(actors.owner.db, "expenseReports", "legacy"), {
            reportNo: "EXP-FY2027-000100",
            runNumber: "EXP-FY2027-000100",
          }),
          (e) => e.code === "permission-denied",
        );
      },
    );
    await check(
      "Concurrent new reports receive distinct consecutive numbers",
      async () => {
        const other = await actor("other", "user");
        owner.window.newReport();
        other.window.newReport();
        for (const runtime of [owner, other]) {
          runtime.document.getElementById("fromDate").value = "2026-11-02";
        }
        assert.deepEqual(
          await Promise.all([
            owner.window.saveReport("Draft"),
            other.window.saveReport("Draft"),
          ]),
          [true, true],
          JSON.stringify({ owner: owner.alerts, other: other.alerts }),
        );
        const counter = await sdk.getDoc(
          sdk.doc(actors.owner.db, "reportCounters", "FY2027"),
        );
        assert.equal(counter.data().lastNumber, 4);
        const own = await sdk.getDocs(
          sdk.query(
            sdk.collection(actors.owner.db, "expenseReports"),
            sdk.where("userId", "==", "owner"),
          ),
        );
        const theirs = await sdk.getDocs(
          sdk.query(
            sdk.collection(actors.other.db, "expenseReports"),
            sdk.where("userId", "==", "other"),
          ),
        );
        const numbers = [...own.docs, ...theirs.docs].map(
          (d) => d.data().reportNo,
        );
        assert.equal(new Set(numbers).size, 4);
      },
    );
    await check(
      "User can Submit a new report directly with server submission time",
      async () => {
        owner.window.newReport();
        for (const [field, value] of Object.entries({
          employee: "Workflow Test",
          purpose: "Direct submission",
          destination: "Bangkok",
          fromDate: "2026-11-02",
          toDate: "2026-11-04",
        }))
          owner.document.getElementById(field).value = value;
        const itemId =
          owner.document.querySelector("[data-fx-input]").dataset.fxInput;
        for (const [field, value] of Object.entries({
          date: "2026-11-02",
          desc: "Taxi",
          currency: "THB",
          amount: 40,
          fx: 0.25,
        }))
          owner.window.setVal(itemId, field, value);
        assert.equal(
          await owner.window.saveReport("Submitted"),
          true,
          owner.alerts.join("\n"),
        );
        const own = await sdk.getDocs(
          sdk.query(
            sdk.collection(actors.owner.db, "expenseReports"),
            sdk.where("userId", "==", "owner"),
          ),
        );
        const direct = own.docs.find(
          (document) => document.data().meta.purpose === "Direct submission",
        );
        assert.ok(direct);
        assert.equal(direct.data().status, "Submitted");
        assert.equal(
          direct.data().createdAt.toMillis(),
          direct.data().submittedAt.toMillis(),
        );
        await waitFor(async () => {
          const notices = await sdk.getDocs(
            sdk.query(
              sdk.collection(actors.manager.db, "notifications"),
              sdk.where("recipientRole", "==", "manager"),
            ),
          );
          return notices.docs.some(
            (document) => document.data().reportId === direct.id,
          );
        });
      },
    );
    await check("Unrelated user cannot read or change the report", async () => {
      const db = env.authenticatedContext("other").firestore(),
        ref = sdk.doc(db, "expenseReports", id);
      await assert.rejects(
        sdk.getDoc(ref),
        (e) => e.code === "permission-denied",
      );
      await assert.rejects(
        sdk.updateDoc(ref, { status: "Draft" }),
        (e) => e.code === "permission-denied",
      );
    });
    await check(
      "No unhandled application event errors across all actors",
      async () => {
        for (const { r } of Object.values(actors)) {
          await r.settle();
          assert.deepEqual(r.errors, []);
        }
      },
    );
  } finally {
    fs.writeFileSync(
      "WORKFLOW_EMULATOR_RESULTS.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          scope:
            "Production modules with real Firestore SDK, synthetic auth and isolated emulator; not live browser or production Firebase",
          results,
        },
        null,
        2,
      ),
    );
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

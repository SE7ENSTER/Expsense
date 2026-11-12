const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRuntime } = require("./runtime-harness.cjs");
test("Current Reports opens the readable review with receipts and Print, without editing a submitted report", async () => {
  const data = report("Submitted");
  data.items[0].receiptData = "data:image/png;base64,dGVzdA==";
  const r = await actor("user", [data]);
  r.document.querySelector("[data-report-open]").click();
  await r.settle();
  const modal = r.document.querySelector(".review-modal");
  assert.ok(modal);
  assert.match(modal.textContent, /Expense Report Review/);
  assert.match(modal.textContent, /Bangkok meeting/);
  assert.equal(modal.querySelectorAll(".receipt-item").length, 1);
  assert.ok(modal.querySelector(".btn-print"));
  assert.equal(modal.querySelector("[data-review-edit]"), null);
  assert.doesNotMatch(modal.textContent, /Available after claim/);
  assert.equal(r.writes.length, 0);
  modal.querySelector("[data-review-close]").click();
  assert.equal(r.document.querySelector(".review-modal"), null);
});
for (const status of ["Draft", "Revision Requested"])
  test(
    status + " is viewed first and Edit report opens the existing document",
    async () => {
      const r = await actor("user", [report(status)]);
      assert.equal(await r.window.reviewReport("workflow-report"), true);
      const edit = r.document.querySelector("[data-review-edit]");
      assert.ok(edit);
      await edit.onclick();
      await r.settle();
      assert.equal(r.document.querySelector(".review-modal"), null);
      assert.equal(
        r.document.getElementById("purpose").value,
        "Bangkok meeting",
      );
      assert.equal(r.writes.length, 0);
      assert.equal(await r.window.saveReport("Draft"), true);
      assert.equal(
        [...r.data.keys()].filter((key) => key.startsWith("expenseReports/"))
          .length,
        1,
      );
    },
  );
const report = (status = "Draft") => ({
  id: "workflow-report",
  userId: "owner",
  userEmail: "owner@example.test",
  status,
  meta: {
    employee: "Workflow Test",
    purpose: "Bangkok meeting",
    destination: "Bangkok",
    fromDate: "2026-11-02",
    toDate: "2026-11-04",
    reportCurrency: "HKD",
  },
  items: [
    {
      id: "taxi",
      date: "2026-11-02",
      desc: "Taxi",
      category: "Transportation",
      currency: "THB",
      amount: 200,
      fx: 0.25,
    },
  ],
  totalHkd: 50,
  fiscalYear: "FY2027",
  createdAt: { seconds: 1 },
  reportNo: "ER-FY2027-001",
});
async function actor(
  role,
  reports = [report()],
  uid = role === "user" ? "owner" : role,
) {
  const r = await createRuntime({ role, uid, reports });
  await r.login();
  return r;
}
test("complete owner Draft → Submitted → manager approval → finance processing → reimbursement → owner History", async () => {
  const owner = await actor("user");
  await owner.window.openReport("workflow-report");
  assert.equal(await owner.window.saveReport("Submitted"), true);
  await owner.settle();
  const manager = await actor("manager", [
    owner.data.get("expenseReports/workflow-report"),
  ]);
  assert.match(
    manager.document.getElementById("reviewReports").textContent,
    /Bangkok meeting/,
  );
  assert.equal(
    await manager.window.managerAction("workflow-report", "Manager Approved"),
    true,
  );
  await manager.settle();
  assert.equal(
    [...manager.data.keys()].filter((k) => k.startsWith("approvalLogs/"))
      .length,
    1,
  );
  const finance = await actor("finance", [
    manager.data.get("expenseReports/workflow-report"),
  ]);
  assert.equal(
    await finance.window.financeAction("workflow-report", "Reimbursed"),
    false,
  );
  assert.equal(
    await finance.window.financeAction("workflow-report", "Finance Processing"),
    true,
  );
  finance.context.prompt = () => "BANK-TEST-001";
  assert.equal(
    await finance.window.financeAction("workflow-report", "Reimbursed"),
    true,
  );
  await finance.settle();
  assert.equal(
    [...finance.data.keys()].filter((k) => k.startsWith("paymentLogs/")).length,
    2,
  );
  const final = finance.data.get("expenseReports/workflow-report");
  assert.equal(final.totalHkd, 50);
  assert.equal(final.reportNo, "ER-FY2027-001");
  assert.equal(final.paymentReference, "BANK-TEST-001");
  const returning = await actor("user", [final]);
  assert.equal(returning.document.querySelector("[data-report-row]"), null);
  assert.equal(
    returning.document.querySelector("[data-history-open]").dataset.historyOpen,
    "workflow-report",
  );
  for (const r of [owner, manager, finance, returning])
    assert.deepEqual(r.errors, []);
});
test("manager Revision → owner edit and resubmit → manager approval", async () => {
  const manager = await actor("manager", [report("Submitted")]);
  manager.context.prompt = () => "Please correct the trip purpose";
  assert.equal(
    await manager.window.managerAction("workflow-report", "Revision Requested"),
    true,
  );
  const owner = await actor("user", [
    manager.data.get("expenseReports/workflow-report"),
  ]);
  await owner.window.openReport("workflow-report");
  owner.document.getElementById("purpose").value = "Corrected meeting";
  assert.match(
    owner.document.getElementById("workflowFeedback").textContent,
    /Please correct the trip purpose/,
  );
  assert.equal(await owner.window.saveReport("Submitted"), true);
  const again = await actor("manager", [
    owner.data.get("expenseReports/workflow-report"),
  ]);
  assert.equal(
    await again.window.managerAction("workflow-report", "Manager Approved"),
    true,
  );
  assert.equal(
    again.data.get("expenseReports/workflow-report").meta.purpose,
    "Corrected meeting",
  );
});
for (const [name, change] of [
  [
    "missing employee",
    (r) => (r.document.getElementById("employee").value = ""),
  ],
  [
    "missing purpose",
    (r) => (r.document.getElementById("purpose").value = "  "),
  ],
  [
    "missing destination",
    (r) => (r.document.getElementById("destination").value = ""),
  ],
  [
    "reversed trip dates",
    (r) => (r.document.getElementById("toDate").value = "2026-11-01"),
  ],
  ["missing item description", (r) => r.window.setVal("taxi", "desc", "")],
  [
    "item date outside trip",
    (r) => r.window.setVal("taxi", "date", "2026-11-09"),
  ],
  [
    "one zero-value line",
    (r) => {
      r.window.addItem();
      const id = r.document
        .querySelectorAll(".item")[1]
        .querySelector("[data-fx-input]").dataset.fxInput;
      r.window.setVal(id, "amount", 0);
    },
  ],
])
  test("submission rejects " + name, async () => {
    const r = await actor("user");
    await r.window.openReport("workflow-report");
    change(r);
    assert.equal(await r.window.saveReport("Submitted"), false);
    assert.equal(r.data.get("expenseReports/workflow-report").status, "Draft");
    assert.equal(r.writes.length, 0);
  });
test("double manager approval produces one action and one audit log", async () => {
  const r = await actor("manager", [report("Submitted")]);
  const release = r.holdWrites();
  const a = r.window.managerAction("workflow-report", "Manager Approved");
  const b = r.window.managerAction("workflow-report", "Manager Approved");
  release();
  const result = await Promise.all([a, b]);
  assert.equal(result.filter(Boolean).length, 1);
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("approvalLogs/")).length,
    1,
  );
});
test("canonical Reimbursement Processing appears in Finance queue with payment action", async () => {
  const r = await actor("finance", [report("Reimbursement Processing")]);
  const body = r.document.getElementById("reviewReports");
  assert.match(body.textContent, /Bangkok meeting/);
  assert.match(
    body.innerHTML,
    /financeAction\('workflow-report','Reimbursed'\)/,
  );
});
test("manager retains approved reports after Finance starts processing", async () => {
  const r = await actor("manager", [report("Reimbursement Processing")]);
  assert.match(
    r.document.getElementById("reviewReports").textContent,
    /Bangkok meeting/,
  );
});
test("budget remaining counts submitted report once and over-budget comment excludes current pending claim", async () => {
  const r = await createRuntime({
    role: "manager",
    uid: "manager",
    reports: [report("Submitted")],
  });
  r.data.set("budgets/owner-FY2027", {
    userId: "owner",
    fiscalYear: "FY2027",
    budgetAmount: 75,
  });
  await r.login();
  r.context.prompt = () => "";
  assert.equal(
    await r.window.managerAction("workflow-report", "Manager Approved"),
    true,
  );
});
test("receipt references retain item numbers when an earlier line has no receipt", async () => {
  const data = report("Submitted");
  data.items.push({
    ...data.items[0],
    id: "meal",
    desc: "Meal",
    receiptData: "data:image/png;base64,dGVzdA==",
  });
  const r = await actor("manager", [data]);
  await r.window.reviewReport(data.id);
  assert.equal(r.document.querySelector(".receipt-item b").textContent, "R02");
});
test("manager rejection needs a nonblank reason and rejected reports stay read-only", async () => {
  const r = await actor("manager", [report("Submitted")]);
  r.context.prompt = () => " ";
  assert.equal(
    await r.window.managerAction("workflow-report", "Rejected"),
    false,
  );
  assert.equal(r.writes.length, 0);
  r.context.prompt = () => "Not a business expense";
  assert.equal(
    await r.window.managerAction("workflow-report", "Rejected"),
    true,
  );
  const owner = await actor("user", [
    r.data.get("expenseReports/workflow-report"),
  ]);
  await owner.window.openReport("workflow-report");
  assert.match(
    owner.document.getElementById("workflowFeedback").textContent,
    /Not a business expense/,
  );
  assert.equal(await owner.window.saveReport("Submitted"), false);
});
test("failed Finance action reports an error, writes no log, and can be retried", async () => {
  const r = await actor("finance", [report("Finance Processing")]);
  r.failWrite();
  assert.equal(
    await r.window.financeAction("workflow-report", "Reimbursed"),
    false,
  );
  assert.equal(
    r.data.get("expenseReports/workflow-report").status,
    "Finance Processing",
  );
  assert.equal(r.writes.length, 0);
  assert.match(r.alerts.at(-1), /Action was not completed/);
  assert.equal(
    await r.window.financeAction("workflow-report", "Reimbursed"),
    true,
  );
});
test("double Finance payment produces one audit action", async () => {
  const r = await actor("finance", [report("Finance Processing")]),
    release = r.holdWrites();
  const a = r.window.financeAction("workflow-report", "Reimbursed"),
    b = r.window.financeAction("workflow-report", "Reimbursed");
  release();
  assert.equal((await Promise.all([a, b])).filter(Boolean).length, 1);
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("paymentLogs/")).length,
    1,
  );
});
test("stale manager screen cannot approve a report that another actor already changed", async () => {
  const r = await actor("manager", [report("Submitted")]);
  r.data.set("expenseReports/workflow-report", report("Rejected"));
  assert.equal(
    await r.window.managerAction("workflow-report", "Manager Approved"),
    false,
  );
  assert.equal(r.writes.length, 0);
  assert.equal(r.data.get("expenseReports/workflow-report").status, "Rejected");
});
test("all converted totals and the report currency remain HKD", async () => {
  const r = await actor("user");
  await r.window.openReport("workflow-report");
  assert.deepEqual(
    [...r.document.getElementById("reportCurrency").options].map(
      (o) => o.value,
    ),
    ["HKD"],
  );
  r.window.calc();
  assert.match(r.document.getElementById("totalHero").textContent, /HKD 50.00/);
});
test("first save assigns a number, resaving keeps it and the counter unchanged", async () => {
  const r = await actor("user", []);
  r.window.newReport();
  assert.equal(await r.window.saveReport("Draft"), true);
  const saved = [...r.data.entries()].find(([key]) =>
    key.startsWith("expenseReports/"),
  )[1];
  assert.match(saved.reportNo, /^EXP-FY\d{4}-000001$/);
  const before = saved.reportNo;
  assert.equal(await r.window.saveReport("Draft"), true);
  assert.equal(r.data.get("expenseReports/" + saved.id).reportNo, before);
  assert.equal(
    r.data.get("reportCounters/" + saved.numberingYear).lastNumber,
    1,
  );
});
test("legacy submitted report can receive a number without changing status or amounts", async () => {
  const legacy = report("Submitted");
  delete legacy.reportNo;
  const r = await actor("user", [legacy]);
  assert.ok(r.document.getElementById("assignMissingNumbers"));
  assert.equal(await r.window.assignMissingReportNumbers(), true);
  const saved = r.data.get("expenseReports/workflow-report");
  assert.equal(saved.reportNo, "EXP-FY2027-000001");
  assert.equal(saved.status, "Submitted");
  assert.equal(saved.totalHkd, 50);
  assert.equal(saved.createdAt.seconds, 1);
});
test("report review and PDF format dates as 12 May 2026 without changing stored ISO dates", async () => {
  const data = report("Submitted");
  data.items[0].date = "2026-05-12";
  data.meta.fromDate = "2026-05-12";
  data.meta.toDate = "2026-05-14";
  const r = await actor("manager", [data]);
  await r.window.reviewReport(data.id);
  assert.match(
    r.document.querySelector(".review-modal").textContent,
    /12 May 2026/,
  );
  await r.window.openReport(data.id);
  const texts = [];
  r.window.jspdf = {
    jsPDF: class {
      setFont() {}
      setFontSize() {}
      text(value) {
        texts.push(value);
      }
      setFillColor() {}
      rect() {}
      addPage() {}
      save() {}
    },
  };
  await r.window.exportPdf();
  assert.ok(texts.some((value) => String(value).includes("12 May 2026")));
  assert.equal(
    r.data.get("expenseReports/workflow-report").items[0].date,
    "2026-05-12",
  );
});

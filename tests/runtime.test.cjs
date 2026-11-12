const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRuntime } = require("./runtime-harness.cjs");
const report = (id, status = "Draft", owner = "user-1") => ({
  id,
  reportNo: "ER-FY2027-" + id,
  status,
  userId: owner,
  userEmail: owner + "@example.com",
  meta: {
    employee: "Test User",
    purpose: "Business trip",
    destination: "Bangkok",
    fromDate: "2026-11-02",
    toDate: "2026-11-04",
    reportCurrency: "HKD",
  },
  items: [
    {
      id: "item-" + id,
      date: "2026-11-02",
      desc: "Taxi",
      currency: "THB",
      category: "Transportation",
      amount: 200,
      fx: 0.25,
      rateSource: "XE manual",
      note: "",
    },
  ],
  createdAt: { seconds: 1 },
});
test("all production modules boot with one auth owner and no hidden event-handler errors", async () => {
  const r = await createRuntime({ reports: [report("2"), report("1")] });
  await r.login();
  assert.deepEqual(r.errors, []);
  assert.equal(r.document.querySelectorAll(".app-shell").length, 1);
  assert.deepEqual(
    [...r.document.querySelectorAll("[data-report-row]")].map(
      (x) => x.dataset.reportId,
    ),
    ["1", "2"],
  );
  assert.equal(r.document.querySelectorAll("#exportSummaryPdfBtn").length, 1);
  assert.equal(r.intervals.size, 1); // Notification data poll only; no form re-render timers.
});
test("save edits updates the same document and preserves its creation time and number", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  r.document.getElementById("purpose").value = "Updated trip";
  assert.equal(await r.window.saveReport("Draft"), true);
  await r.settle();
  const stored = r.data.get("expenseReports/1");
  assert.equal(stored.meta.purpose, "Updated trip");
  assert.equal(stored.createdAt.seconds, 1);
  assert.equal(stored.reportNo, "ER-FY2027-1");
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("expenseReports/")).length,
    1,
  );
  assert.deepEqual(r.errors, []);
});
test("concurrent save clicks are ignored and a new report uses a single stable document ID", async () => {
  const r = await createRuntime();
  await r.login();
  const release = r.holdWrites();
  const first = r.window.saveReport("Draft");
  assert.equal(await r.window.saveReport("Draft"), false);
  release();
  assert.equal(await first, true);
  const ids = [...r.data.keys()].filter((k) => k.startsWith("expenseReports/"));
  assert.equal(ids.length, 1);
  assert.equal(await r.window.saveReport("Draft"), true);
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("expenseReports/")).length,
    1,
  );
  assert.deepEqual(r.errors, []);
});
test("a failed submit neither emits report-saved nor creates notifications", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  const events = [];
  r.eventModule().on("report-saved", (e) => events.push(e));
  r.failWrite();
  assert.equal(await r.window.saveReport("Submitted"), false);
  await r.settle();
  assert.equal(events.length, 0);
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("notifications/")).length,
    0,
  );
  assert.equal(r.data.get("expenseReports/1").status, "Draft");
});
test("successful submit notifies about the exact saved report and summary/history update once", async () => {
  const r = await createRuntime({
    reports: [report("1"), report("2", "Submitted")],
  });
  await r.login();
  await r.window.openReport("1");
  assert.equal(await r.window.saveReport("Submitted"), true);
  await r.settle();
  const notices = [...r.data.entries()]
    .filter(([k]) => k.startsWith("notifications/"))
    .map(([, v]) => v);
  assert.equal(notices.length, 2);
  assert.ok(notices.every((n) => n.reportId === "1"));
  assert.deepEqual(r.errors, []);
});
test("manager approval updates shared UI and logs before emitting notifications", async () => {
  const r = await createRuntime({
    role: "manager",
    uid: "manager-1",
    reports: [report("1", "Submitted")],
  });
  await r.login();
  assert.equal(await r.window.managerAction("1", "Manager Approved"), true);
  await r.settle();
  assert.equal(r.data.get("expenseReports/1").status, "Manager Approved");
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("approvalLogs/")).length,
    1,
  );
  assert.equal(
    r.document.querySelector("[data-report-row] .pill").getAttribute("title"),
    "Manager Approved",
  );
  assert.deepEqual(r.errors, []);
});
test("cancelled manager action emits no success event or notification", async () => {
  const r = await createRuntime({
    role: "manager",
    uid: "manager-1",
    reports: [report("1", "Submitted")],
  });
  await r.login();
  r.context.prompt = () => null;
  await r.window.managerAction("1", "Rejected");
  await r.settle();
  assert.equal(r.data.get("expenseReports/1").status, "Submitted");
  assert.equal(r.writes.length, 0);
  assert.deepEqual(r.errors, []);
});
test("finance reimbursement moves the report from active list to History without dashboard rewriting", async () => {
  const r = await createRuntime({
    role: "finance",
    uid: "finance-1",
    reports: [report("1", "Finance Processing")],
  });
  await r.login();
  assert.equal(await r.window.financeAction("1", "Reimbursed"), true);
  await r.settle();
  assert.equal(r.document.querySelector("[data-report-row]"), null);
  assert.equal(
    r.document.querySelector("[data-history-open]").dataset.historyOpen,
    "1",
  );
  assert.equal(
    [...r.data.keys()].filter((k) => k.startsWith("paymentLogs/")).length,
    1,
  );
  assert.deepEqual(r.errors, []);
});
test("admin input is retained when notification polling or dashboard navigation runs", async () => {
  const r = await createRuntime({
    role: "admin",
    uid: "admin-1",
    reports: [report("1")],
  });
  await r.login();
  const input = r.document.getElementById("adminNewEmail");
  input.value = "new@example.com";
  for (const fn of r.intervals.values()) await fn();
  r.window.showView("dashboard");
  r.window.showView("admin");
  await r.settle();
  assert.equal(r.document.getElementById("adminNewEmail"), input);
  assert.equal(input.value, "new@example.com");
  assert.deepEqual(r.errors, []);
});
test("logout clears poll timers, report data, history, summary, and profile controls", async () => {
  const r = await createRuntime({
    reports: [report("1"), report("2", "Reimbursed")],
  });
  await r.login();
  await r.logout();
  assert.equal(r.intervals.size, 0);
  assert.equal(r.document.querySelector("[data-report-row]"), null);
  assert.equal(r.document.getElementById("reportHistorySection"), null);
  assert.equal(r.document.getElementById("phase1ReportSummary"), null);
  assert.equal(r.document.getElementById("profileBtn"), null);
  assert.deepEqual(r.errors, []);
});
test("receipt validation rejects unsupported/oversize files before any write", async () => {
  const r = await createRuntime();
  const files = await r.receiptModule();
  await assert.rejects(
    files.prepareReceipt({ name: "x.txt", type: "text/plain", size: 1 }),
    /image or PDF/,
  );
  await assert.rejects(
    files.prepareReceipt({
      name: "x.pdf",
      type: "application/pdf",
      size: 600 * 1024,
    }),
    /500 KB/,
  );
  assert.equal(r.writes.length, 0);
});
test("production entry has unique action/auth owners and no global timer interception", () => {
  const files = [
    ...fs
      .readFileSync("docs/index.html", "utf8")
      .matchAll(/<script[^>]+src="\.\/([^"?]+)/g),
  ].map((m) => m[1]);
  const sources = files
    .map((f) => fs.readFileSync("docs/" + f, "utf8"))
    .join("\n");
  for (const name of [
    "showView",
    "saveReport",
    "refreshAdmin",
    "openReport",
    "exportPdf",
    "signUp",
  ])
    assert.equal(
      (sources.match(new RegExp("window\\." + name + "\\s*=(?!=)", "g")) || [])
        .length,
      1,
      name,
    );
  assert.equal((sources.match(/onAuthStateChanged\(auth/g) || []).length, 1);
  assert.doesNotMatch(
    sources,
    /oldShow|oldSave|oldRefresh|window\.setInterval\s*=/,
  );
});
test("old report reads cannot overwrite a later save or restore a previous session", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  const release = r.holdNextReportRead(),
    oldRead = r.window.refreshDashboardReports();
  r.document.getElementById("purpose").value = "Newest trip";
  await r.window.saveReport("Draft");
  release();
  await oldRead;
  await r.settle();
  assert.equal(
    r.document.querySelector(".report-card h3").textContent,
    "Newest trip",
  );
  const releaseLogout = r.holdNextReportRead(),
    pending = r.window.refreshDashboardReports();
  await r.logout();
  releaseLogout();
  await pending;
  await r.settle();
  assert.equal(r.document.querySelector("[data-report-row]"), null);
  assert.deepEqual(r.errors, []);
});
test("switching accounts replaces cached data and leaves a single notification poll", async () => {
  const r = await createRuntime({
    reports: [report("1"), report("2", "Draft", "user-2")],
  });
  await r.login();
  await r.changeUser({ uid: "user-2", email: "two@example.com" });
  assert.deepEqual(
    [...r.document.querySelectorAll("[data-report-row]")].map(
      (row) => row.dataset.reportId,
    ),
    ["2"],
  );
  assert.equal(r.intervals.size, 1);
  assert.deepEqual(r.errors, []);
});
test("late session listeners replay current state but old save events are never replayed", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  await r.window.saveReport("Draft");
  const sessions = [],
    saves = [];
  r.eventModule().on("session", (e) => sessions.push(e));
  r.eventModule().on("report-saved", (e) => saves.push(e));
  await r.settle();
  assert.equal(sessions.length, 1);
  assert.equal(saves.length, 0);
});
test("failed approval does not generate success notifications or logs", async () => {
  const r = await createRuntime({
    role: "manager",
    uid: "manager-1",
    reports: [report("1", "Submitted")],
  });
  await r.login();
  r.failWrite();
  await assert.rejects(
    r.window.managerAction("1", "Manager Approved"),
    /write failure/,
  );
  await r.settle();
  assert.equal(r.writes.length, 0);
  assert.equal(r.data.get("expenseReports/1").status, "Submitted");
  assert.deepEqual(r.errors, []);
});
test("PDF original and its preview are persisted together in one report write", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  await r.window.setFile("item-1", {
    name: "receipt.pdf",
    type: "application/pdf",
    size: 12,
    data: "data:application/pdf;base64,cGRm",
  });
  await r.window.saveReport("Draft");
  await r.settle();
  const item = r.data.get("expenseReports/1").items[0];
  assert.equal(item.receiptFileData, "data:application/pdf;base64,cGRm");
  assert.equal(item.receiptName, "receipt.pdf");
  assert.match(item.receiptData, /^data:image/);
  assert.equal(r.writes.filter((w) => w.key === "expenseReports/1").length, 1);
  assert.deepEqual(r.errors, []);
});
test("corrupt image read reports an error without hanging or modifying the report", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  await r.window.setFile("item-1", {
    name: "bad.png",
    type: "image/png",
    size: 12,
    failRead: true,
  });
  assert.match(r.alerts.at(-1), /Cannot read/);
  assert.equal(r.writes.length, 0);
});
test("starting a new report clears the prior PDF report number", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  r.window.newReport();
  const texts = [];
  r.window.jspdf = {
    jsPDF: class {
      setFont() {}
      setFontSize() {}
      text(t) {
        texts.push(t);
      }
      setFillColor() {}
      rect() {}
      addPage() {}
      save() {}
    },
  };
  await r.window.exportPdf();
  assert.ok(texts.some((t) => /^Report No: .*DRAFT$/.test(t)));
  assert.ok(!texts.some((t) => t === "Report No: ER-FY2027-1"));
  assert.deepEqual(r.errors, []);
});
test("registration modal opens once and profile provisioning completes before auth UI initialization", async () => {
  const r = await createRuntime();
  r.window.signUp();
  r.window.signUp();
  assert.equal(r.document.querySelectorAll("#registerModal").length, 1);
  for (const [id, value] of Object.entries({
    regEmail: "new@example.com",
    regPassword: "test-password",
    regFirstName: "New",
    regLastName: "User",
    regEmployeeId: "123",
    regOfficeLocation: "Bangkok",
    regDepartment: "IT",
  }))
    r.document.getElementById(id).value = value;
  await r.window.submitRegisterUser();
  await r.settle();
  assert.equal(r.data.get("users/registered-user").firstName, "New");
  assert.equal(
    r.writes.filter((w) => w.key === "users/registered-user").length,
    1,
  );
  assert.deepEqual(r.errors, []);
});
test("disabled profile is signed out without starting a poll or showing report data", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  r.data.get("users/user-1").active = false;
  await r.login();
  assert.equal(r.intervals.size, 0);
  assert.ok(r.document.getElementById("appView").classList.contains("hide"));
  assert.equal(r.document.querySelector("[data-report-row]"), null);
  assert.deepEqual(r.errors, []);
});
test("save waits for an in-flight receipt instead of persisting an incomplete attachment", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  let finish;
  r.context.FileReader = class {
    readAsDataURL() {
      finish = () =>
        this.onload({
          target: { result: "data:image/jpeg;base64,cHJldmlldw==" },
        });
    }
  };
  const upload = r.window.setFile("item-1", {
    name: "pending.png",
    type: "image/png",
    size: 1,
  });
  await r.settle();
  assert.equal(await r.window.saveReport("Draft"), false);
  assert.equal(r.writes.length, 0);
  finish();
  await upload;
  assert.equal(await r.window.saveReport("Draft"), true);
  assert.deepEqual(r.errors, []);
});
test("user role cannot call manager/finance mutations directly or save another owner report", async () => {
  const r = await createRuntime({
    reports: [report("1"), report("2", "Draft", "someone-else")],
  });
  await r.login();
  assert.equal(await r.window.managerAction("1", "Manager Approved"), false);
  assert.equal(await r.window.financeAction("1", "Reimbursed"), false);
  await r.window.openReport("2");
  assert.equal(await r.window.saveReport("Draft"), false);
  assert.equal(r.writes.length, 0);
  assert.deepEqual(r.errors, []);
});
test("repeated navigation never replaces action implementations or duplicates controls", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  const actions = [
    "showView",
    "saveReport",
    "openReport",
    "refreshAdmin",
    "exportPdf",
  ].map((name) => [name, r.window[name]]);
  for (let i = 0; i < 10; i++) {
    r.window.showView("dashboard");
    await r.window.openReport("1");
    r.window.showView("dashboard");
  }
  await r.settle();
  for (const [name, fn] of actions) assert.equal(r.window[name], fn, name);
  assert.equal(r.document.querySelectorAll("#reportViewToggle").length, 0);
  assert.equal(r.document.querySelectorAll("#notifWrap").length, 1);
  assert.equal(r.intervals.size, 1);
  assert.deepEqual(r.errors, []);
});

test("owner save persists fiscal year and total before manager review", async () => {
  const r = await createRuntime({ reports: [report("1")] });
  await r.login();
  await r.window.openReport("1");
  assert.equal(await r.window.saveReport("Submitted"), true);
  const saved = r.data.get("expenseReports/1");
  assert.equal(saved.fiscalYear, "FY2027");
  assert.equal(saved.totalHkd, 50);
});
test("manager payload contains no expense or identity updates", async () => {
  const r = await createRuntime({
    role: "manager",
    uid: "manager-1",
    reports: [report("1", "Submitted")],
  });
  await r.login();
  await r.window.managerAction("1", "Manager Approved");
  const write = r.writes.find((x) => x.key === "expenseReports/1");
  for (const field of [
    "items",
    "meta",
    "totalHkd",
    "fiscalYear",
    "reportNo",
    "runNumber",
    "userId",
    "createdAt",
  ])
    assert.equal(Object.hasOwn(write.value, field), false, field);
});
test("finance cannot skip Processing or use a blank payment reference", async () => {
  const r = await createRuntime({
    role: "finance",
    uid: "finance-1",
    reports: [report("1", "Manager Approved")],
  });
  await r.login();
  assert.equal(await r.window.financeAction("1", "Reimbursed"), false);
  assert.equal(r.writes.length, 0);
  await r.window.financeAction("1", "Finance Processing");
  r.context.prompt = () => "  ";
  await r.window.financeAction("1", "Reimbursed");
  assert.equal(r.data.get("expenseReports/1").status, "Finance Processing");
});
test("owner cannot save over a submitted report", async () => {
  const r = await createRuntime({ reports: [report("1", "Submitted")] });
  await r.login();
  await r.window.openReport("1");
  assert.equal(await r.window.saveReport("Draft"), false);
  assert.equal(r.writes.length, 0);
});

test("workspace navigation retains icons and current-page state, and history follows active reports", async () => {
  const r = await createRuntime({
    reports: [report("1"), report("2", "Reimbursed")],
  });
  await r.login();
  const nav = r.document.querySelector('.side-nav [data-view="dashboard"]');
  assert.equal(nav.getAttribute("aria-current"), "page");
  assert.ok(nav.querySelector("svg"));
  r.window.showView("editor");
  assert.equal(
    r.document.getElementById("workspaceTitle").textContent,
    "Expense report",
  );
  assert.equal(nav.hasAttribute("aria-current"), false);
  assert.equal(
    r.document
      .querySelector('.side-nav [data-view="editor"]')
      .getAttribute("aria-current"),
    "page",
  );
  assert.ok(r.document.querySelector('.side-nav [data-view="editor"] svg'));
  assert.equal(
    r.document.querySelector(".workspace-create").classList.contains("hide"),
    true,
  );
  r.window.showView("dashboard");
  const sections = [...r.document.getElementById("dashboard").children].map(
    (node) => node.id,
  );
  assert.ok(
    sections.indexOf("reportHistorySection") >
      sections.indexOf("reportTableWrap"),
  );
  assert.deepEqual(r.errors, []);
});

test("responsive report and management rows retain field labels and action controls after refresh", async () => {
  const r = await createRuntime({
    role: "admin",
    reports: [report("1"), report("2", "Reimbursed"), report("3", "Submitted")],
  });
  await r.login();
  const assertLabels = () => {
    for (const table of r.document.querySelectorAll(
      ".report-grid,.history-table,.admin-table",
    )) {
      const headers = [...table.querySelectorAll("thead th")].map((th) =>
        th.textContent.trim(),
      );
      for (const row of table.querySelectorAll("tbody tr")) {
        [...row.children].forEach((cell, index) => {
          if (Number(cell.getAttribute("colspan") || 1) > 1) return;
          assert.equal(cell.dataset.label, headers[index]);
        });
      }
    }
  };
  assertLabels();
  const select = r.document.getElementById("adminRole-user-1");
  select.value = "finance";
  r.eventModule().emit("management-rendered");
  assert.equal(r.document.getElementById("adminRole-user-1"), select);
  assert.equal(select.value, "finance");
  await r.window.refreshAdmin();
  await r.settle();
  assertLabels();
  r.document.querySelector('[data-report-open="1"]').click();
  await r.settle();
  assert.equal(
    r.document.getElementById("editor").classList.contains("hide"),
    false,
  );
  assert.deepEqual(r.errors, []);
});

test("Current and History paginate independently, keep every report accessible, and reset on account changes", async () => {
  const active = Array.from({ length: 23 }, (_, i) => report(String(i + 1)));
  const completed = Array.from({ length: 22 }, (_, i) =>
    report(String(i + 101), "Reimbursed"),
  );
  const r = await createRuntime({
    reports: [...active, ...completed].reverse(),
  });
  await r.login();
  const currentIds = () =>
    [...r.document.querySelectorAll("[data-report-row]")].map(
      (row) => row.dataset.reportId,
    );
  const historyIds = () =>
    [...r.document.querySelectorAll("[data-history-open]")].map(
      (row) => row.dataset.historyOpen,
    );
  assert.equal(currentIds().length, 10);
  assert.equal(historyIds().length, 10);
  assert.equal(currentIds()[0], "1");
  assert.equal(historyIds()[0], "101");
  r.document.getElementById("currentReportsMore").click();
  assert.equal(currentIds()[0], "11");
  assert.equal(historyIds()[0], "101");
  r.document.getElementById("historyReportsMore").click();
  assert.equal(currentIds()[0], "11");
  assert.equal(historyIds()[0], "111");
  await r.window.refreshDashboardReports();
  await r.settle();
  assert.equal(currentIds()[0], "11");
  assert.equal(historyIds()[0], "111");
  r.document.getElementById("historyReportsMore").click();
  assert.deepEqual(historyIds(), ["121", "122"]);
  assert.equal(r.document.getElementById("historyReportsMore"), null);
  r.document.querySelector('[data-history-review="122"]').click();
  await r.settle();
  assert.ok(
    r.document
      .querySelector(".review-modal")
      .textContent.includes("ER-FY2027-122"),
  );
  r.document.getElementById("historyReportsPrevious").click();
  assert.equal(historyIds()[0], "111");
  assert.equal(r.document.getElementById("kReports").textContent, "45");
  await r.logout();
  assert.equal(r.document.querySelector("[data-report-row]"), null);
  await r.login();
  assert.equal(currentIds()[0], "1");
  assert.equal(historyIds()[0], "101");
  assert.deepEqual(r.errors, []);
});

test("History edits update compact fields and a shrinking final page returns to a valid page", async () => {
  const r = await createRuntime({
    reports: Array.from({ length: 11 }, (_, i) =>
      report(String(i + 1), "Reimbursed"),
    ),
  });
  await r.login();
  r.document.getElementById("historyReportsMore").click();
  assert.equal(
    r.document.querySelector("[data-history-open]").dataset.historyOpen,
    "11",
  );
  const saved = r.data.get("expenseReports/11");
  saved.meta.purpose = "Updated trip";
  saved.items[0].amount = 400;
  await r.window.refreshDashboardReports();
  await r.settle();
  assert.ok(
    r.document
      .querySelector("[data-history-open]")
      .textContent.includes("Updated trip"),
  );
  assert.ok(
    r.document
      .querySelector("[data-history-open]")
      .textContent.includes("HKD 100.00"),
  );
  r.data.delete("expenseReports/11");
  await r.window.refreshDashboardReports();
  await r.settle();
  assert.equal(
    r.document.querySelector("[data-history-open]").dataset.historyOpen,
    "1",
  );
  assert.equal(r.document.querySelectorAll("[data-history-open]").length, 10);
  assert.equal(r.document.getElementById("historyReportsPrevious"), null);
  assert.deepEqual(r.errors, []);
});

test("user and admin navigation omit System Status and retired links return to Overview", async () => {
  for (const role of ["user", "admin"]) {
    const r = await createRuntime({ role });
    await r.login();
    assert.equal(r.document.querySelector('[data-view="firebase"]'), null);
    assert.equal(r.document.getElementById("tab-firebase"), null);
    assert.equal(r.document.getElementById("firebase"), null);
    assert.equal(r.document.getElementById("authStatus"), null);
    assert.equal(
      r.document.getElementById("side-admin").classList.contains("hide"),
      role === "user",
    );
    r.window.showView("firebase");
    assert.equal(
      r.document.getElementById("dashboard").classList.contains("hide"),
      false,
    );
    assert.equal(
      r.document.getElementById("workspaceTitle").textContent,
      "Overview",
    );
    assert.deepEqual(r.errors, []);
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRuntime } = require("./runtime-harness.cjs");
const dateUrl =
  "data:text/javascript;base64," +
  Buffer.from(fs.readFileSync("docs/report-dates.js")).toString("base64");
const helper = import(
  "data:text/javascript;base64," +
    Buffer.from(
      fs
        .readFileSync("docs/report-timeline.js", "utf8")
        .replace("./report-dates.js", dateUrl),
    ).toString("base64")
);
const stamp = (value) => ({
  seconds: Date.parse(value) / 1000,
  nanoseconds: 0,
});
const report = (id, status = "Submitted") => ({
  id,
  status,
  userId: "owner",
  userEmail: "owner@example.test",
  reportNo: "EXP-FY2027-" + id,
  totalHkd: 50,
  fiscalYear: "FY2027",
  createdAt: { seconds: 1 },
  meta: {
    employee: "Test",
    purpose: "Trip " + id,
    destination: "Bangkok",
    fromDate: "2026-11-02",
    toDate: "2026-11-03",
  },
  items: [
    {
      id: "taxi",
      date: "2026-11-02",
      desc: "Taxi",
      amount: 200,
      currency: "THB",
      fx: 0.25,
    },
  ],
});
const timelineReport = () => ({
  ...report("a", "Reimbursed"),
  submittedAt: stamp("2026-10-31T17:00:00Z"),
  managerApprovedAt: stamp("2026-11-30T17:00:00Z"),
  financeApprovedAt: stamp("2026-12-31T17:00:00Z"),
  reimbursedAt: stamp("2027-01-31T17:00:00Z"),
  updatedAt: stamp("2027-03-01T00:00:00Z"),
});
async function admin() {
  const r = await createRuntime({
    uid: "admin",
    role: "admin",
    reports: [
      timelineReport(),
      { ...report("b"), submittedAt: stamp("2026-11-30T16:59:59Z") },
      { ...report("unknown"), updatedAt: stamp("2026-11-10T00:00:00Z") },
    ],
  });
  await r.login();
  return r;
}
test("month boundaries and year rollover use Bangkok rather than UTC or the browser timezone", async () => {
  const h = await helper;
  assert.equal(h.timestampMonth(stamp("2026-10-31T16:59:59Z")), "2026-10");
  assert.equal(h.timestampMonth(stamp("2026-10-31T17:00:00Z")), "2026-11");
  assert.equal(
    h.formatReportTimestamp(stamp("2026-12-31T17:00:00Z")),
    "01 Jan 2027, 00:00",
  );
  assert.equal(
    h.formatReportTimestamp(stamp("2026-05-12T07:35:00Z")),
    "12 May 2026, 14:35",
  );
});
test("missing or invalid timestamps remain unknown and never fall back to updatedAt", async () => {
  const h = await helper;
  for (const value of [null, undefined, "2026-11-02", "not a date", {}])
    assert.equal(h.formatReportTimestamp(value), "Not recorded");
  assert.equal(
    h.reportEventTime(
      { ...report("a"), updatedAt: stamp("2026-11-01T00:00:00Z") },
      "submittedAt",
    ),
    null,
  );
  assert.equal(
    h.timestampMonth({ toMillis: () => Date.parse("2026-11-02T00:00:00Z") }),
    "2026-11",
  );
});
test("legacy timestamps are recovered only from matching recorded actions", async () => {
  const h = await helper,
    time = stamp("2026-11-02T00:00:00Z");
  assert.equal(
    h.reportEventTime(
      { managerStatus: "Revision Requested", managerActionAt: time },
      "managerApprovedAt",
    ),
    null,
  );
  assert.deepEqual(
    h.reportEventTime(
      { managerStatus: "Approved", managerActionAt: time },
      "managerApprovedAt",
    ),
    time,
  );
  assert.equal(
    h.reportEventTime(
      { financeStatus: "Reimbursed", financeActionAt: time },
      "financeApprovedAt",
    ),
    null,
  );
  assert.equal(
    h.reportEventTime(
      { financeStatus: "Finance Processing", financeActionAt: time },
      "financeApprovedAt",
    ),
    null,
  );
  assert.deepEqual(
    h.reportEventTime(
      { financeStatus: "Reimbursed", financeActionAt: time },
      "reimbursedAt",
    ),
    time,
  );
});
test("All Reports filters each event month independently of expense dates and last edits", async () => {
  const r = await admin();
  r.window.showView("admin-reports");
  for (const [event, month, expected] of [
    ["submittedAt", "2026-11", ["Trip a", "Trip b"]],
    ["managerApprovedAt", "2026-12", ["Trip a"]],
    ["financeApprovedAt", "2027-01", ["Trip a"]],
    ["reimbursedAt", "2027-02", ["Trip a"]],
  ]) {
    r.document.getElementById("allReportsEventFilter").value = event;
    r.document.getElementById("allReportsMonthFilter").value = month;
    r.document.getElementById("allReportsApply").onclick();
    const text = r.document.getElementById("adminReports").textContent;
    for (const value of expected) assert.ok(text.includes(value));
    assert.equal(text.includes("Trip b"), expected.includes("Trip b"));
    assert.equal(text.includes("Trip unknown"), false);
  }
  r.document.getElementById("allReportsClear").onclick();
  assert.match(
    r.document.getElementById("adminReports").textContent,
    /Trip unknown/,
  );
  assert.equal(r.document.getElementById("allReportsMonthFilter").value, "");
});
test("Review keeps its own event and month across page navigation", async () => {
  const r = await admin();
  r.window.showView("admin-review");
  r.document.getElementById("mgmtMonthFilter").value = "2026-11";
  r.document.getElementById("mgmtApply").onclick();
  assert.match(
    r.document.getElementById("reviewReports").textContent,
    /Trip b/,
  );
  assert.doesNotMatch(
    r.document.getElementById("reviewReports").textContent,
    /Trip unknown/,
  );
  r.window.showView("admin-reports");
  assert.equal(r.document.getElementById("allReportsMonthFilter").value, "");
  r.window.showView("admin-review");
  assert.equal(r.document.getElementById("mgmtMonthFilter").value, "2026-11");
});
test("viewer and PDF contain separate milestone timestamps with timezone", async () => {
  const r = await admin();
  await r.window.reviewReport("a");
  const timeline = r.document.querySelector(".workflow-timeline");
  assert.match(timeline.textContent, /Bangkok \(UTC\+7\)/);
  assert.match(timeline.textContent, /01 Nov 2026, 00:00/);
  assert.match(timeline.textContent, /01 Feb 2027, 00:00/);
  await r.window.openReport("a");
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
  assert.ok(
    texts.some((value) =>
      String(value).includes("Manager approved: 01 Dec 2026, 00:00"),
    ),
  );
});
test("CSV export respects event month and includes milestone columns", async () => {
  const r = await admin();
  r.document.getElementById("allReportsEventFilter").value = "reimbursedAt";
  r.document.getElementById("allReportsMonthFilter").value = "2027-02";
  let csv;
  r.context.URL = {
    createObjectURL: (blob) => {
      csv = blob;
      return "blob:test";
    },
    revokeObjectURL() {},
  };
  r.document.getElementById("exportCsvBtn").onclick();
  const text = await csv.text();
  assert.match(text, /Manager approved at - Bangkok/);
  assert.match(text, /EXP-FY2027-a/);
  assert.doesNotMatch(text, /EXP-FY2027-b/);
  assert.match(text, /01 Feb 2027, 00:00/);
});
test("Draft edits preserve submission time while successful resubmission replaces it", async () => {
  const data = {
      ...report("a", "Revision Requested"),
      submittedAt: { seconds: 1 },
    },
    r = await createRuntime({ uid: "owner", reports: [data] });
  await r.login();
  await r.window.openReport("a");
  assert.equal(await r.window.saveReport("Draft"), true);
  assert.equal(r.data.get("expenseReports/a").submittedAt.seconds, 1);
  r.failWrite();
  assert.equal(await r.window.saveReport("Submitted"), false);
  assert.equal(r.data.get("expenseReports/a").submittedAt.seconds, 1);
  assert.equal(await r.window.saveReport("Submitted"), true);
  assert.ok(r.data.get("expenseReports/a").submittedAt.seconds > 1);
});
test("Finance processing remarks and reimbursement never overwrite finance approval time", async () => {
  const data = {
      ...report("a", "Manager Approved"),
      submittedAt: { seconds: 1 },
      managerApprovedAt: { seconds: 2 },
    },
    r = await createRuntime({
      uid: "finance",
      role: "finance",
      reports: [data],
    });
  await r.login();
  assert.equal(await r.window.financeAction("a", "Finance Processing"), true);
  const first = structuredClone(
    r.data.get("expenseReports/a").financeApprovedAt,
  );
  assert.ok(first);
  assert.equal(await r.window.financeAction("a", "Finance Processing"), true);
  assert.deepEqual(r.data.get("expenseReports/a").financeApprovedAt, first);
  assert.equal(await r.window.financeAction("a", "Reimbursed"), true);
  const final = r.data.get("expenseReports/a");
  assert.deepEqual(final.financeApprovedAt, first);
  assert.ok(final.reimbursedAt);
  assert.equal(final.submittedAt.seconds, 1);
  assert.equal(final.managerApprovedAt.seconds, 2);
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");
const source = fs.readFileSync("docs/report-dashboard.js", "utf8");
const helper = import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
function fixture() {
  const { window, document } = parseHTML(
    '<html><body><section id="dashboard"><div class="toolbar"><div><h2 id="reportTitle">My Active Reports</h2></div></div><div id="reportList"></div></section></body></html>',
  );
  const reviews = [],
    opened = [],
    timers = [];
  window.openReport = (id) => opened.push(id);
  window.reviewReport = (id) => reviews.push(id);
  const context = vm.createContext({
    window,
    document,
    console,
    localStorage: { getItem: () => "table", setItem: () => {} },
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    MutationObserver: window.MutationObserver,
  });
  vm.runInContext(source.replaceAll("export ", ""), context);
  vm.runInContext(
    fs.readFileSync("docs/report-view-toggle-v27.js", "utf8"),
    context,
  );
  return {
    window,
    document,
    context,
    reviews,
    opened,
    timers,
    list: document.getElementById("reportList"),
    render: (reports) => {
      context.data = reports;
      vm.runInContext(
        "renderDashboardReports(document.getElementById('reportList'),data)",
        context,
      );
    },
    table: (force) => vm.runInContext(`buildTable(${!!force})`, context),
  };
}
const report = (id, number, status = "Draft") => ({
  id,
  reportNo: number,
  status,
  userEmail: "user@example.com",
  meta: {
    purpose: "Trip " + id,
    destination: "Bangkok",
    fromDate: "2026-11-02",
    toDate: "2026-11-04",
  },
  items: [{ currency: "THB", amount: 200, fx: 0.25 }],
  createdAt: { seconds: 1 },
  updatedAt: { seconds: 10 },
});
const ids = (f) =>
  [...f.list.querySelectorAll(".report-card")].map((c) => c.dataset.reportId);
test("natural number order is stable across fetch order, edits, duplicates and missing numbers", async () => {
  const { compareReports } = await helper;
  const data = [
    report("ten", "ER-FY2027-10"),
    report("b", "ER-FY2027-2"),
    report("a", "ER-FY2027-2"),
    report("legacy-b", ""),
    report("one", "ER-FY2027-1"),
    report("legacy-a", ""),
  ];
  const expected = ["one", "a", "b", "ten", "legacy-a", "legacy-b"];
  assert.deepEqual(
    data
      .slice()
      .sort(compareReports)
      .map((r) => r.id),
    expected,
  );
  data.reverse().forEach((r) => (r.updatedAt.seconds = Math.random() * 100000));
  assert.deepEqual(
    data
      .slice()
      .sort(compareReports)
      .map((r) => r.id),
    expected,
  );
});
test("renderer preserves saved report and run numbers without mutating records", () => {
  const f = fixture(),
    data = [
      report("b", "ER-FY2027-2"),
      { ...report("a", ""), runNumber: "ER-FY2027-1" },
    ];
  const original = JSON.stringify(data);
  f.render(data);
  assert.deepEqual(ids(f), ["a", "b"]);
  assert.equal(JSON.stringify(data), original);
  assert.equal(f.list.querySelector(".report-no").textContent, "ER-FY2027-1");
});
test("refreshes with unchanged content retain card and table nodes, focus target and scroll container", () => {
  const f = fixture(),
    data = [report("a", "ER-FY2027-1"), report("b", "ER-FY2027-2")];
  f.render(data);
  f.table();
  const card = f.list.firstElementChild,
    button = f.document.querySelector('[data-report-open="a"]'),
    scroll = f.document.querySelector(".report-table-scroll");
  scroll.scrollLeft = 35;
  for (let i = 0; i < 10; i++) {
    f.render(
      data
        .slice()
        .reverse()
        .map((r) => ({ ...r, updatedAt: { seconds: i + 20 } })),
    );
    f.table(true);
  }
  assert.equal(f.list.firstElementChild, card);
  assert.equal(f.document.querySelector('[data-report-open="a"]'), button);
  assert.equal(f.document.querySelector(".report-table-scroll"), scroll);
  assert.equal(scroll.scrollLeft, 35);
});
test("genuine edits update content while keeping report order", () => {
  const f = fixture(),
    data = [report("b", "ER-FY2027-2"), report("a", "ER-FY2027-1")];
  f.render(data);
  f.table();
  data[0].items[0].amount = 400;
  f.render(data);
  f.table();
  assert.deepEqual(ids(f), ["a", "b"]);
  assert.equal(
    f.document.querySelector('[data-report-id="b"] .row strong').textContent,
    "HKD 100.00",
  );
  assert.equal(
    f.document.querySelector('tr[data-report-id="b"] .cell-total').textContent,
    "HKD 100.00",
  );
});
test("completed reports never flash in the active table", () => {
  const f = fixture();
  f.render([
    report("a", "1"),
    report("paid", "2", "Reimbursed"),
    report("closed", "3", "Closed"),
  ]);
  f.table();
  assert.deepEqual(ids(f), ["a"]);
  assert.equal(f.document.querySelectorAll("[data-report-row]").length, 1);
});
test("Report No column and Open action stay bound to document ID after sorting", () => {
  const f = fixture();
  f.render([report("b", "ER-FY2027-2"), report("a", "ER-FY2027-1")]);
  f.table();
  assert.equal(
    f.document.querySelector(".report-grid th").textContent,
    "Report No.",
  );
  assert.equal(
    f.document.querySelector(".cell-report-no").textContent,
    "ER-FY2027-1",
  );
  f.document.querySelector('[data-report-open="a"]').click();
  assert.deepEqual(f.opened, ["a"]);
  f.list.querySelector('[data-report-id="b"]').click();
  assert.deepEqual(f.opened, ["a", "b"]);
});
test("table signature includes report number changes", () => {
  const f = fixture(),
    r = report("a", "ER-FY2027-1");
  f.render([r]);
  f.table();
  r.reportNo = "ER-FY2027-3";
  f.render([r]);
  f.table();
  assert.equal(
    f.document.querySelector(".cell-report-no").textContent,
    "ER-FY2027-3",
  );
});
test("user strings are escaped and a cleared list removes old rows", () => {
  const f = fixture(),
    r = report("a", "ER-FY2027-1");
  r.meta.purpose = "<img src=x onerror=alert(1)>";
  f.render([r]);
  f.table();
  assert.equal(f.list.querySelector("h3").textContent, r.meta.purpose);
  assert.equal(f.list.querySelector("img"), null);
  f.render([]);
  f.table();
  assert.equal(f.list.querySelector(".report-card"), null);
  assert.equal(f.document.querySelector("[data-report-row]"), null);
});
test("management no longer writes dashboard HTML or allocates numbers during reads", () => {
  const management = fs.readFileSync("docs/management-v2.js", "utf8");
  assert.doesNotMatch(
    management,
    /function renderDashboard\(|assignReportNumbers|setInterval\([^\n]*renderAll/,
  );
  assert.match(management, /await window\.refreshDashboardReports\?\.\(\)/);
  const core = fs.readFileSync("docs/firebase-app.js", "utf8");
  assert.doesNotMatch(core, /sort\(\(a,b\)=>\(b.updatedAt/);
});
test("observer updates the table as data arrives without waiting for legacy refresh timers", async () => {
  const f = fixture();
  f.render([report("a", "ER-FY2027-1")]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    f.document.querySelector(".cell-report-no").textContent,
    "ER-FY2027-1",
  );
});
test("company logo is present in both production headers and references a valid local PNG", () => {
  const { document } = parseHTML(fs.readFileSync("docs/index.html", "utf8"));
  assert.equal(
    document.querySelectorAll(
      '.brand-lockup .brand-logo[alt="Suisseland Group"]',
    ).length,
    2,
  );
  for (const img of document.querySelectorAll(".brand-logo")) {
    const file = "docs/" + img.getAttribute("src").replace(/^\.\//, "");
    assert.equal(
      fs.readFileSync(file).subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
    );
  }
});

test("compact report pages contain four columns and at most ten reports, with stable numeric order", () => {
  const f = fixture(),
    data = Array.from({ length: 23 }, (_, i) =>
      report(String(i + 1), "ER-FY2027-" + (i + 1)),
    ).reverse();
  f.render(data);
  f.table();
  const currentIds = () =>
    [...f.document.querySelectorAll("[data-report-row]")].map(
      (row) => row.dataset.reportId,
    );
  assert.deepEqual(
    [...f.document.querySelectorAll(".report-grid th")].map(
      (th) => th.textContent,
    ),
    ["Report No.", "Purpose / Trip", "Total", "Status"],
  );
  assert.deepEqual(currentIds(), [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
  ]);
  f.document.getElementById("currentReportsMore").click();
  assert.deepEqual(currentIds(), [
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
  ]);
  const first = f.document.querySelector("[data-report-row]");
  f.render(data.slice().reverse());
  f.table();
  assert.equal(f.document.querySelector("[data-report-row]"), first);
  f.document.getElementById("currentReportsMore").click();
  assert.deepEqual(currentIds(), ["21", "22", "23"]);
  assert.equal(f.document.getElementById("currentReportsMore"), null);
  f.document.getElementById("currentReportsPrevious").click();
  assert.equal(currentIds()[0], "11");
  assert.equal(currentIds().length, 10);
  f.render(data.slice(20));
  f.table();
  assert.equal(currentIds().length, 3);
  assert.equal(f.document.getElementById("currentReportsPrevious"), null);
});
test("ten or fewer reports never show a More button and empty results remove stale pagination", () => {
  const f = fixture();
  f.render(
    Array.from({ length: 10 }, (_, i) => report(String(i + 1), String(i + 1))),
  );
  f.table();
  assert.equal(f.document.getElementById("currentReportsMore"), null);
  f.render([]);
  f.table();
  assert.equal(f.document.querySelector(".report-pagination"), null);
});

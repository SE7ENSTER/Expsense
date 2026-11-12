const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { createRuntime } = require("./runtime-harness.cjs");
function report(id, owner, status, total = 50) {
  return {
    id,
    userId: owner,
    userEmail: owner + "@example.test",
    status,
    reportNo: "EXP-FY2027-" + id,
    fiscalYear: "FY2027",
    totalHkd: total,
    createdAt: { seconds: 1 },
    meta: {
      employee: owner,
      purpose: "Trip " + id,
      fromDate: "2026-11-02",
      toDate: "2026-11-03",
    },
    items: [
      {
        id: "taxi",
        amount: total,
        fx: 1,
        date: "2026-11-02",
        desc: "Taxi",
        currency: "HKD",
      },
    ],
  };
}
for (const role of ["user", "manager", "finance", "admin"])
  test(
    role +
      " personal dashboard, History, totals and export contain only own reports in all statuses",
    async () => {
      const statuses = [
          "Draft",
          "Submitted",
          "Manager Approved",
          "Finance Processing",
          "Reimbursed",
          "Closed",
        ],
        mine = statuses.map((status, i) => report("own-" + i, role, status)),
        others = statuses.map((status, i) =>
          report("other-" + i, "other", status, 999),
        );
      const r = await createRuntime({
        uid: role,
        role,
        reports: [...mine, ...others],
      });
      await r.login();
      assert.equal(
        r.document.getElementById("workspaceTitle").textContent,
        "My Expenses",
      );
      assert.equal(r.document.getElementById("kReports").textContent, "6");
      assert.equal(r.document.querySelectorAll("[data-report-row]").length, 4);
      assert.equal(
        r.document.querySelectorAll("[data-history-open]").length,
        2,
      );
      assert.doesNotMatch(
        r.document.getElementById("phase1ReportSummary").textContent,
        /999/,
      );
      assert.match(
        r.document.getElementById("phase1ReportSummary").textContent,
        /300\.00/,
      );
      for (const row of r.document.querySelectorAll(
        "[data-report-row],[data-history-open]",
      ))
        assert.ok(
          (row.dataset.reportId || row.dataset.historyOpen).startsWith("own-"),
        );
      let exported = [];
      r.window.XLSX = {
        utils: {
          book_new: () => ({}),
          aoa_to_sheet: () => ({}),
          json_to_sheet: (rows) => {
            exported = rows;
            return {};
          },
          book_append_sheet() {},
        },
        writeFile() {},
      };
      await r.document.getElementById("exportSummaryExcelBtn").onclick();
      assert.equal(exported.length, 6);
      assert.ok(
        exported.every((row) => row["User Email"] === role + "@example.test"),
      );
      if (role !== "user") {
        await r.window.refreshAdmin();
        r.window.showView("admin-review");
        await r.settle();
        const queue = r.document.getElementById("reviewReports");
        assert.doesNotMatch(queue.textContent, /Trip own-/);
        assert.match(queue.textContent, /Trip other-/);
        r.window.showView("admin-reports");
        await r.settle();
        assert.equal(
          r.document.querySelectorAll("#adminReports .my-report-badge").length,
          6,
        );
        r.window.showView("dashboard");
        await r.settle();
        assert.equal(r.document.getElementById("kReports").textContent, "6");
      }
      assert.deepEqual(r.errors, []);
    },
  );
test("Manager review updates the team report without adding it to personal summary or History", async () => {
  const r = await createRuntime({
    uid: "manager",
    role: "manager",
    reports: [
      report("mine", "manager", "Draft"),
      report("team", "other", "Submitted"),
    ],
  });
  await r.login();
  assert.equal(
    await r.window.managerAction("team", "Manager Approved", "Approved"),
    true,
  );
  assert.equal(r.document.getElementById("kReports").textContent, "1");
  assert.doesNotMatch(
    r.document.getElementById("phase1ReportSummary").textContent,
    /other/,
  );
  assert.equal(r.document.querySelectorAll("[data-history-open]").length, 0);
  assert.equal(r.data.get("expenseReports/team").status, "Manager Approved");
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRuntime } = require("./runtime-harness.cjs");
const report = (id, status) => ({
  id,
  userId: "owner",
  userEmail: "owner@example.test",
  status,
  reportNo: "EXP-FY2027-" + id,
  fiscalYear: "FY2027",
  totalHkd: 50,
  createdAt: { seconds: 1 },
  meta: {
    employee: "Test",
    purpose: "Trip " + id,
    fromDate: "2026-11-02",
    toDate: "2026-11-03",
  },
  items: [
    { id: "taxi", amount: 200, fx: 0.25, desc: "Taxi", date: "2026-11-02" },
  ],
});
async function actor(role = "admin") {
  const r = await createRuntime({
    role,
    uid: role,
    reports: [report("1", "Submitted"), report("2", "Draft")],
  });
  r.data.set("users/owner", {
    email: "owner@example.test",
    role: "user",
    active: true,
  });
  await r.login();
  return r;
}
test("Management separates its pages, retains user inputs and omits create/reminder", async () => {
  const r = await actor(),
    input = r.document.getElementById("adminNewEmail");
  input.value = "retained@example.test";
  for (const page of [
    "users",
    "budget",
    "review",
    "reports",
    "invoices",
    "users",
  ]) {
    r.window.showView("admin-" + page);
    await r.settle();
    assert.deepEqual(
      [...r.document.querySelectorAll(".management-page")]
        .filter((el) => !el.hidden && !el.classList.contains("hide"))
        .map((el) => el.id),
      ["management-" + page],
    );
    assert.ok(
      r.document.querySelector(".workspace-create").classList.contains("hide"),
    );
    assert.ok(r.document.querySelector(".hero").classList.contains("hide"));
  }
  assert.equal(r.document.getElementById("adminNewEmail"), input);
  assert.equal(input.value, "retained@example.test");
  assert.ok(r.document.querySelector("#management-review #reviewReports"));
  assert.ok(r.document.querySelector("#management-reports #adminReports"));
  assert.ok(r.document.querySelector("#management-budget #companyBudget"));
  assert.deepEqual(r.errors, []);
  r.window.showView("dashboard");
  assert.equal(
    r.document.querySelector(".workspace-create").classList.contains("hide"),
    false,
  );
});
for (const role of ["manager", "finance"])
  test(
    role +
      " has shared review and read-only budgets but no user management or password reset",
    async () => {
      const r = await actor(role);
      r.window.showView("admin-users");
      assert.equal(r.document.getElementById("management-users").hidden, true);
      assert.equal(
        r.document.getElementById("management-review").hidden,
        false,
      );
      assert.ok(
        r.document
          .querySelector('[data-management-page="users"]')
          .classList.contains("hide"),
      );
      assert.equal(await r.window.adminResetPassword("owner"), false);
      assert.equal(r.passwordResetRequests.length, 0);
      r.window.showView("admin-budget");
      assert.ok(
        r.document.querySelector(".budget-input").hasAttribute("disabled"),
      );
    },
  );
test("ordinary user cannot open any Management route", async () => {
  const r = await actor("user");
  for (const page of ["users", "budget", "review", "reports"]) {
    r.window.showView("admin-" + page);
    assert.ok(r.document.getElementById("admin").classList.contains("hide"));
  }
  assert.equal(await r.window.adminResetPassword("owner"), false);
  assert.equal(r.passwordResetRequests.length, 0);
});
test("Review and All Reports have independent filters across navigation", async () => {
  const r = await actor();
  r.window.showView("admin-reports");
  r.document.getElementById("allReportsStatusFilter").value = "Draft";
  r.document.getElementById("allReportsApply").onclick();
  assert.match(r.document.getElementById("adminReports").textContent, /Trip 2/);
  assert.doesNotMatch(
    r.document.getElementById("adminReports").textContent,
    /Trip 1/,
  );
  r.window.showView("admin-review");
  assert.match(
    r.document.getElementById("reviewReports").textContent,
    /Trip 1/,
  );
  assert.equal(r.document.getElementById("mgmtStatusFilter").value, "All");
  assert.equal(
    r.document.getElementById("allReportsStatusFilter").value,
    "Draft",
  );
});
test("Admin reset requests email only for the selected known user without writing a password or profile", async () => {
  const r = await actor();
  r.window.showView("admin-users");
  const before = structuredClone(r.data.get("users/owner"));
  assert.ok(
    [...r.document.querySelectorAll("[data-reset-user]")].some(
      (el) => el.dataset.resetUser === "owner",
    ),
  );
  assert.equal(await r.window.adminResetPassword("owner"), true);
  assert.deepEqual(r.passwordResetRequests, ["owner@example.test"]);
  assert.deepEqual(r.data.get("users/owner"), before);
  assert.equal(r.writes.length, 0);
  assert.match(
    r.document.getElementById("adminPasswordResetMsg").textContent,
    /owner@example.test/,
  );
  assert.equal(await r.window.adminResetPassword("unknown"), false);
  assert.equal(r.passwordResetRequests.length, 1);
});
test("Cancelled or failed reset is handled and retry is available", async () => {
  const r = await actor();
  r.context.confirm = () => false;
  assert.equal(await r.window.adminResetPassword("owner"), false);
  assert.equal(r.passwordResetRequests.length, 0);
  r.context.confirm = () => true;
  r.failPasswordReset();
  assert.equal(await r.window.adminResetPassword("owner"), false);
  assert.match(
    r.document.getElementById("adminPasswordResetMsg").textContent,
    /Cannot request password reset/,
  );
  assert.equal(await r.window.adminResetPassword("owner"), true);
  assert.equal(r.passwordResetRequests.length, 2);
  await r.logout();
  assert.equal(await r.window.adminResetPassword("owner"), false);
});
test("Report Close control is labelled and closes the viewer", async () => {
  const r = await actor();
  await r.window.reviewReport("1");
  const close = r.document.querySelector(".review-close");
  assert.ok(close);
  assert.equal(close.getAttribute("aria-label"), "Close report");
  assert.match(close.textContent, /Close/);
  close.click();
  assert.equal(r.document.querySelector(".review-modal"), null);
});
test("Budget Save All preserves every entered amount before refreshing the table", async () => {
  const r = await actor();
  r.window.showView("admin-budget");
  const inputs = [...r.document.querySelectorAll(".budget-input")];
  inputs.forEach((input, index) => {
    input.value = String((index + 1) * 100);
  });
  const fy = r.document.getElementById("budgetFySelect").value;
  assert.equal(
    await r.document.getElementById("saveAllBudgetBtn").onclick(),
    true,
  );
  inputs.forEach((input, index) =>
    assert.equal(
      r.data.get("budgets/" + input.id.replace("budget-", "") + "_" + fy)
        .budgetAmount,
      (index + 1) * 100,
    ),
  );
});

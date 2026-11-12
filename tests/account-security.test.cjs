const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { createRuntime } = require("./runtime-harness.cjs");
async function admin() {
  const r = await createRuntime({ role: "admin", uid: "admin" });
  r.data.set("users/owner", {
    email: "owner@example.test",
    role: "user",
    active: true,
  });
  await r.login();
  r.window.showView("admin-users");
  return r;
}
test("Save role enables only for changes and saves selected role", async () => {
  const r = await admin();
  let button = r.document.querySelector('[data-save-role="owner"]'),
    select = r.document.getElementById("adminRole-owner");
  assert.equal(button.disabled, true);
  assert.equal(await r.window.adminSaveUserRole("owner"), false);
  select.value = "manager";
  select.dispatchEvent(new r.window.Event("change"));
  assert.equal(button.disabled, false);
  assert.equal(await button.onclick(), true);
  assert.equal(r.data.get("users/owner").role, "manager");
  assert.equal(
    r.document.querySelector('[data-save-role="owner"]').disabled,
    true,
  );
});
test("Changing own role signs out and closes Management", async () => {
  const r = await admin();
  r.document.getElementById("adminRole-admin").value = "user";
  assert.equal(await r.window.adminSaveUserRole("admin"), true);
  assert.ok(r.document.getElementById("appView").classList.contains("hide"));
});
test("Stale Admin role is rejected before report and audit write", async () => {
  const r = await createRuntime({
    role: "admin",
    uid: "admin",
    reports: [
      {
        id: "r",
        userId: "owner",
        status: "Submitted",
        totalHkd: 50,
        meta: { purpose: "test" },
        items: [{ amount: 50, fx: 1 }],
      },
    ],
  });
  await r.login();
  r.data.set("users/admin", { role: "user", active: true });
  assert.equal(
    await r.window.managerAction("r", "Rejected", "Not eligible"),
    false,
  );
  assert.equal(r.writes.length, 0);
  assert.match(r.alerts.join(" "), /access changed/);
});
for (const role of ["user", "manager", "finance", "admin"])
  test(role + " signs in without a callable Functions service", async () => {
    const r = await createRuntime({
      role,
      uid: role,
      functionHandlers: {
        expensioPasswordChangeStatus: async () => {
          throw Error("Server unavailable");
        },
      },
    });
    await r.login();
    assert.equal(
      r.document.getElementById("appView").classList.contains("hide"),
      false,
    );
    assert.equal(r.functionRequests.length, 0);
    assert.deepEqual(r.errors, []);
  });
test("User Management offers email reset and no Server-dependent password/branding controls", async () => {
  const r = await admin();
  assert.equal(r.document.querySelector("[data-generate-password]"), null);
  assert.equal(r.document.getElementById("applyEmailBrandingBtn"), null);
  assert.equal(r.window.adminGenerateTemporaryPassword, undefined);
  assert.equal(await r.window.adminResetPassword("owner"), true);
  assert.deepEqual(r.passwordResetRequests, ["owner@example.test"]);
  assert.equal(r.functionRequests.length, 0);
  assert.equal(r.writes.length, 0);
});
test("Active production import graph and deploy configuration require no Functions", () => {
  const seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      text,
      /firebase-functions\.js|getFunctions|httpsCallable|account-security\.js/,
    );
    if (file.endsWith(".js"))
      for (const match of text.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))
        visit(path.resolve(path.dirname(file), match[1].split("?")[0]));
  }
  const html = fs.readFileSync("docs/index.html", "utf8");
  for (const match of html.matchAll(/<script[^>]+src="\.\/([^"?]+)/g))
    visit(path.resolve("docs", match[1]));
  assert.equal(
    JSON.parse(fs.readFileSync("firebase.json", "utf8")).functions,
    undefined,
  );
  assert.equal(fs.existsSync("docs/account-security.js"), false);
});

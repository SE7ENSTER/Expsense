const fs = require("node:fs"),
  path = require("node:path");
const { createRuntime } = require("./runtime-harness.cjs");
const out = path.resolve(
  process.env.PRINT_QA_DIR || ".test-output/receipt-print",
);
(async () => {
  for (const [count, only] of [
    [1, false],
    [2, false],
    [3, false],
    [5, false],
    [5, true],
  ]) {
    const report = {
      id: "qa-report",
      userId: "qa-user",
      userEmail: "qa@example.test",
      status: "Submitted",
      reportNo: "EXP-FY2027-000001",
      createdAt: { seconds: 1 },
      meta: {
        employee: "PDF Test User",
        purpose: "PDF layout QA",
        destination: "Test destination",
        fromDate: "2026-11-01",
        toDate: "2026-11-03",
      },
      items: Array.from({ length: count }, (_, i) => ({
        id: "item-" + i,
        date: "2026-11-01",
        desc: "Synthetic receipt " + (i + 1),
        category: "Meals",
        currency: "HKD",
        amount: 100,
        fx: 1,
        receiptData:
          "data:image/png;base64," +
          fs
            .readFileSync(path.join(out, "receipt-" + (i + 1) + ".png"))
            .toString("base64"),
      })),
    };
    const r = await createRuntime({
      uid: "qa-user",
      role: "user",
      reports: [report],
    });
    await r.login();
    await r.window.reviewReport("qa-report", only);
    let html = "";
    r.window.open = () => ({
      document: {
        write: (s) => (html = s),
        close() {},
        querySelectorAll: () => [],
        getElementById: () => null,
      },
      focus() {},
      print() {},
    });
    await r.document.querySelector(".btn-print").onclick();
    const name = "review-" + count + (only ? "-receipts-only" : "");
    fs.writeFileSync(path.join(out, name + ".html"), html);
  }
  console.log(
    "Built five print fixtures through the production Review action.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

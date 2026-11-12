const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { parseHTML } = require("linkedom");
async function moduleFor(globals = {}) {
  const context = vm.createContext({ setTimeout, clearTimeout, ...globals });
  const module = new vm.SourceTextModule(
    fs.readFileSync("docs/report-print.js", "utf8"),
    { context },
  );
  await module.link(() => {});
  await module.evaluate();
  return module.namespace;
}
function modal(count = 5, only = false) {
  const { document } = parseHTML(
    '<div class="review-modal"><div class="review-box"><div class="review-head"><div><h2>' +
      (only ? "Receipt Attachments" : "Expense Report Review") +
      '</h2><span class="report-no">EXP-FY2027-000001</span></div><button>Close</button></div><div class="workflow-timeline">Timeline</div><h3>Receipts</h3><div class="receipt-grid">' +
      Array.from(
        { length: count },
        (_, i) =>
          '<div class="receipt-item"><p><b>R' +
          String(i + 1).padStart(2, "0") +
          "</b> Item " +
          i +
          '</p><img src="data:image/png;base64,aW1n"></div>',
      ).join("") +
      "</div></div></div>",
  );
  return document.querySelector(".review-modal");
}
test("Print groups receipts two per page, keeps references and leaves Review unchanged", async () => {
  const m = await moduleFor(),
    source = modal(),
    before = source.innerHTML,
    output = m.prepareReviewPrint(source),
    { document } = parseHTML(output);
  assert.equal(document.querySelectorAll(".receipt-print-page").length, 3);
  assert.equal(document.querySelectorAll(".receipt-print-slot").length, 6);
  assert.equal(document.querySelectorAll(".receipt-print-empty").length, 1);
  assert.equal(document.querySelectorAll("img").length, 5);
  assert.equal(document.querySelectorAll("button").length, 0);
  assert.equal(
    document.querySelectorAll(".receipt-print-page")[2].querySelector("b")
      .textContent,
    "R05",
  );
  assert.equal(source.innerHTML, before);
  assert.match(m.REVIEW_PRINT_CSS, /object-fit:scale-down/);
  assert.match(m.REVIEW_PRINT_CSS, /height:152mm/);
});
test("Print handles zero, one and even receipt counts without extra empty receipt pages", async () => {
  const m = await moduleFor();
  for (const n of [0, 1, 2, 4]) {
    const { document } = parseHTML(m.prepareReviewPrint(modal(n)));
    assert.equal(
      document.querySelectorAll(".receipt-print-page").length,
      Math.ceil(n / 2),
    );
    assert.equal(document.querySelectorAll("img").length, n);
  }
});
test("Receipts-only print starts with the first pair, without a separate summary page", async () => {
  const m = await moduleFor(),
    { document } = parseHTML(m.prepareReviewPrint(modal(3, true)));
  assert.ok(document.body.classList.contains("receipt-only"));
  assert.equal(document.querySelector(".workflow-timeline"), null);
  assert.equal(document.querySelector(".review-head"), null);
  assert.equal(document.querySelectorAll(".receipt-print-page").length, 2);
});
test("Print waits until images load and decode before invoking the print dialog", async () => {
  let loaded,
    decoded = false,
    printed = false;
  let decodeResolve;
  const decodePromise = new Promise((resolve) => (decodeResolve = resolve));
  const image = {
    complete: false,
    addEventListener: (type, fn) => {
      if (type === "load") loaded = fn;
    },
    removeEventListener() {},
    decode: async () => {
      await decodePromise;
      decoded = true;
    },
  };
  const popup = {
    document: {
      write() {},
      close() {},
      querySelectorAll: () => [image],
      getElementById: () => null,
      fonts: { ready: Promise.resolve() },
    },
    focus() {},
    print() {
      assert.ok(decoded);
      printed = true;
    },
  };
  const m = await moduleFor({
      window: { open: () => popup },
      alert: () => {
        throw Error("Unexpected alert");
      },
    }),
    promise = m.printReviewModal(modal(1));
  assert.equal(printed, false);
  loaded();
  await Promise.resolve();
  assert.equal(printed, false);
  decodeResolve();
  assert.equal(await promise, true);
  assert.equal(printed, true);
});
test("Broken images abort printing with a visible error", async () => {
  let printed = false;
  const alerts = [],
    popup = {
      document: {
        write() {},
        close() {},
        querySelectorAll: () => [{ complete: true, naturalWidth: 0 }],
        getElementById: () => null,
      },
      print() {
        printed = true;
      },
    };
  const m = await moduleFor({
    window: { open: () => popup },
    alert: (message) => alerts.push(message),
  });
  assert.equal(await m.printReviewModal(modal(1)), false);
  assert.equal(printed, false);
  assert.match(alerts[0], /receipt image could not be loaded/);
});
test("Blocked popups do not change the report or attempt printing", async () => {
  const alerts = [],
    m = await moduleFor({
      window: { open: () => null },
      alert: (message) => alerts.push(message),
    });
  assert.equal(await m.printReviewModal(modal(2)), false);
  assert.match(alerts[0], /allow pop-ups/);
});

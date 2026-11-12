const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");
const { webcrypto } = require("node:crypto");

exports.createRuntime = async function ({
  role = "user",
  reports = [],
  uid = "user-1",
  firestoreApi = null,
} = {}) {
  const { window: domWindow, document } = parseHTML(
    fs.readFileSync("docs/index.html", "utf8"),
  );
  // linkedom's default window forwards custom globals to the Node global.
  // Separate tabs/actors must not overwrite each other's application actions.
  const globals = new Map([["document", document]]);
  const window = new Proxy(domWindow, {
    get(target, key) {
      return globals.has(key) ? globals.get(key) : Reflect.get(target, key);
    },
    set(target, key, value) {
      globals.set(key, value);
      return true;
    },
  });
  globals.set("window", window);
  const errors = [],
    alerts = [],
    passwordResetRequests = [],
    writes = [],
    queries = [],
    intervals = new Map(),
    timeouts = [],
    modules = new Map();
  let timer = 0,
    clock = 100,
    failNextWrite = false,
    failNextPasswordReset = false,
    pauseWrite = null,
    pauseNextReportRead = null;
  const data = new Map();
  const user = { uid, email: uid + "@example.com" };
  const profile = {
    email: user.email,
    role,
    firstName: "Test",
    lastName: "User",
  };
  data.set("users/" + uid, { ...profile });
  for (const r of reports)
    data.set("expenseReports/" + r.id, structuredClone(r));
  const auth = { currentUser: null };
  let authHandler;
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() {
      return (
        [...this.options]
          .find((o) => o.hasAttribute("selected"))
          ?.getAttribute("value") ||
        [...this.options].find((o) => o.hasAttribute("selected"))
          ?.textContent ||
        this.options[0]?.getAttribute("value") ||
        this.options[0]?.textContent ||
        ""
      );
    },
    set(value) {
      for (const o of this.options) {
        if ((o.getAttribute("value") || o.textContent) === String(value))
          o.setAttribute("selected", "");
        else o.removeAttribute("selected");
      }
    },
  });
  window.HTMLSelectElement.prototype.add = function (option) {
    this.appendChild(option);
  };
  Object.defineProperty(window.HTMLElement.prototype, "cells", {
    configurable: true,
    get() {
      return this.tagName === "TR"
        ? [...this.children].filter((x) => ["TD", "TH"].includes(x.tagName))
        : undefined;
    },
  });
  const fakeConsole = {
    log: () => {},
    warn: () => {},
    error: (...args) => errors.push(args),
  };
  const context = vm.createContext({
    window,
    document,
    console: fakeConsole,
    crypto: webcrypto,
    structuredClone,
    queueMicrotask,
    URL,
    Blob,
    File: globalThis.File,
    Option: function (text, value) {
      const o = document.createElement("option");
      o.textContent = text;
      o.value = value;
      return o;
    },
    alert: (message) => alerts.push(message),
    confirm: () => true,
    prompt: () => "test comment",
    localStorage: { getItem: () => "table", setItem: () => {} },
    MutationObserver: window.MutationObserver,
    setTimeout: (fn) => {
      timeouts.push(fn);
      return timeouts.length;
    },
    clearTimeout: () => {},
    setInterval: (fn) => {
      const id = ++timer;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    fetch: async () => {
      throw new Error("Unexpected external fetch in test");
    },
  });
  window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect() {},
    fillText() {},
    drawImage() {},
  });
  window.HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/jpeg;base64,cHJldmlldw==";
  window.HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(new Blob(["preview"], { type: "image/jpeg" }));
  };
  context.FileReader = class {
    readAsDataURL(file) {
      queueMicrotask(() => {
        if (file.failRead) this.onerror?.();
        else
          this.onload?.({
            target: {
              result: file.data || "data:image/jpeg;base64,cHJldmlldw==",
            },
          });
      });
    }
  };
  context.Image = class {
    constructor() {
      this.width = 400;
      this.height = 200;
    }
    set src(value) {
      queueMicrotask(() => this.onload?.());
    }
  };
  const snapshot = (key) => ({
    id: key.split("/").pop(),
    exists: () => data.has(key),
    data: () => structuredClone(data.get(key)),
  });
  const api = {
    initializeApp: () => ({}),
    getApp: () => ({}),
    getAuth: () => auth,
    getFirestore: () => ({}),
    onAuthStateChanged: (_, fn) => {
      if (authHandler) throw Error("Duplicate auth owner");
      authHandler = fn;
    },
    signOut: async () => {
      auth.currentUser = null;
      await authHandler(null);
    },
    signInWithEmailAndPassword: async () => {},
    sendPasswordResetEmail: async (_, email) => {
      passwordResetRequests.push(email);
      if (failNextPasswordReset) {
        failNextPasswordReset = false;
        throw Error("Simulated reset failure");
      }
    },
    createUserWithEmailAndPassword: async (_, email) => {
      const created = { uid: "registered-user", email };
      auth.currentUser = created;
      void authHandler(created);
      return { user: created };
    },
    collection: (_, name) => ({ name, kind: "collection" }),
    doc: (db, name, id) => {
      if (db?.kind === "collection") {
        name = db.name;
        id = "generated-" + ++clock;
      }
      return { name, id, key: name + "/" + id };
    },
    query: (ref, ...conditions) => ({ ...ref, conditions }),
    where: (field, op, value) => ({ field, op, value }),
    serverTimestamp: () => ({ seconds: ++clock }),
    getDoc: async (ref) => snapshot(ref.key),
    getDocs: async (ref) => {
      queries.push(ref);
      let keys = [...data.keys()].filter((k) => k.startsWith(ref.name + "/"));
      for (const cond of ref.conditions || [])
        keys = keys.filter((k) => {
          const actual = data.get(k)[cond.field];
          return cond.op === "in"
            ? cond.value.includes(actual)
            : actual === cond.value;
        });
      const captured = keys.map((k) => ({
        key: k,
        value: structuredClone(data.get(k)),
      }));
      if (ref.name === "expenseReports" && pauseNextReportRead) {
        const pending = pauseNextReportRead;
        pauseNextReportRead = null;
        await pending;
      }
      return {
        docs: captured.map(({ key, value }) => ({
          id: key.split("/").pop(),
          exists: () => true,
          data: () => structuredClone(value),
        })),
      };
    },
    setDoc: async (ref, value, options) => {
      if (pauseWrite) await pauseWrite;
      if (failNextWrite) {
        failNextWrite = false;
        throw Error("Simulated write failure");
      }
      writes.push({ key: ref.key, value: structuredClone(value) });
      data.set(
        ref.key,
        options?.merge
          ? { ...data.get(ref.key), ...structuredClone(value) }
          : structuredClone(value),
      );
    },
    writeBatch: () => {
      const pending = [];
      return {
        set(ref, value, options) {
          pending.push({ ref, value, options });
          return this;
        },
        async commit() {
          if (pauseWrite) await pauseWrite;
          if (failNextWrite) {
            failNextWrite = false;
            throw Error("Simulated write failure");
          }
          for (const { ref, value, options } of pending) {
            writes.push({ key: ref.key, value: structuredClone(value) });
            data.set(
              ref.key,
              options?.merge
                ? { ...data.get(ref.key), ...structuredClone(value) }
                : structuredClone(value),
            );
          }
        },
      };
    },
    addDoc: async (ref, value) => {
      const id = "generated-" + ++clock,
        key = ref.name + "/" + id;
      writes.push({ key, value: structuredClone(value) });
      data.set(key, structuredClone(value));
      return { id };
    },
  };
  let transactionTail = Promise.resolve();
  api.runTransaction = (_, handler) => {
    const operation = transactionTail.then(async () => {
      const batch = api.writeBatch();
      const result = await handler({
        get: api.getDoc,
        set: (...args) => batch.set(...args),
      });
      await batch.commit();
      return result;
    });
    transactionTail = operation.catch(() => {});
    return operation;
  };
  if (firestoreApi) Object.assign(api, firestoreApi);
  async function load(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    if (identifier.startsWith("https:")) {
      const names = identifier.includes("firebase-auth")
        ? [
            "getAuth",
            "onAuthStateChanged",
            "signInWithEmailAndPassword",
            "sendPasswordResetEmail",
            "createUserWithEmailAndPassword",
            "signOut",
          ]
        : identifier.includes("firebase-firestore")
          ? [
              "getFirestore",
              "collection",
              "doc",
              "getDoc",
              "getDocs",
              "query",
              "where",
              "setDoc",
              "addDoc",
              "writeBatch",
              "runTransaction",
              "serverTimestamp",
            ]
          : ["initializeApp", "getApp"];
      const mod = new vm.SyntheticModule(
        names,
        function () {
          for (const name of names) this.setExport(name, api[name]);
        },
        { context, identifier },
      );
      modules.set(identifier, mod);
      return mod;
    }
    const mod = new vm.SourceTextModule(fs.readFileSync(identifier, "utf8"), {
      context,
      identifier,
    });
    modules.set(identifier, mod);
    await mod.link((specifier, referencing) =>
      load(
        specifier.startsWith("https:")
          ? specifier
          : path.resolve(
              path.dirname(referencing.identifier),
              specifier.split("?")[0],
            ),
      ),
    );
    return mod;
  }
  const scriptPaths = [...document.querySelectorAll('script[src^="./"]')].map(
    (s) => path.resolve("docs", s.getAttribute("src").slice(2).split("?")[0]),
  );
  for (const file of scriptPaths) {
    const mod = await load(file);
    if (mod.status !== "evaluated") await mod.evaluate();
  }
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return {
    window,
    document,
    context,
    errors,
    alerts,
    passwordResetRequests,
    failPasswordReset: () => {
      failNextPasswordReset = true;
    },
    writes,
    queries,
    intervals,
    data,
    profile,
    user,
    settle,
    login: async () => {
      auth.currentUser = user;
      await authHandler(user);
      await settle();
    },
    logout: async () => {
      await api.signOut();
      await settle();
    },
    failWrite: () => {
      failNextWrite = true;
    },
    holdNextReportRead: () => {
      let release;
      pauseNextReportRead = new Promise((r) => (release = r));
      return release;
    },
    holdWrites: () => {
      let release;
      pauseWrite = new Promise((r) => (release = r));
      return () => {
        ((pauseWrite = null), (pauseNextReportRead = null));
        release();
      };
    },
    changeUser: async (next) => {
      data.set("users/" + next.uid, { email: next.email, role: "user" });
      auth.currentUser = next;
      await authHandler(next);
      await settle();
    },
    eventModule: () =>
      modules.get(path.resolve("docs/app-events.js")).namespace,
    receiptModule: async () => {
      const mod = await load(path.resolve("docs/receipt-files.js"));
      if (mod.status !== "evaluated") await mod.evaluate();
      return mod.namespace;
    },
  };
};

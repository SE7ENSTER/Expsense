import { on } from "./app-events.js";
function qs(id) {
  return document.getElementById(id);
}
function buildHybridShell() {
  const app = qs("appView");
  const header = document.querySelector("#appView > .top");
  const main = document.querySelector("#appView > main.wrap");
  if (!app || !header || !main || document.querySelector(".app-shell")) return;
  const shell = document.createElement("div");
  shell.className = "app-shell";
  const aside = document.createElement("aside");
  aside.className = "app-sidebar";
  const icon = (paths) =>
    `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const icons = {
    dashboard:
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    editor:
      '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    admin:
      '<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z"/><path d="m8 12 3 3 5-6"/>',
  };
  aside.innerHTML = `<div><p class="sidebar-title">Workspace</p><nav class="side-nav" aria-label="Main navigation"><button data-view="dashboard" class="active" aria-current="page">${icon(icons.dashboard)}<span>Overview</span></button><button data-view="editor">${icon(icons.editor)}<span>Expense reports</span></button><button data-view="monthly-invoices">${icon(icons.editor)}<span>Monthly Invoice</span></button><button data-view="admin" id="side-admin">${icon(icons.admin)}<span>Management</span></button></nav></div><div class="side-footer"><strong>EXPENSiO</strong>Suisseland Group<br>Every expense. One clear view.</div>`;
  main.classList.add("main-workspace");
  header.after(shell);
  shell.appendChild(aside);
  shell.appendChild(main);
  aside.querySelectorAll("[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (
        btn.id === "side-admin" &&
        qs("tab-admin")?.classList.contains("hide")
      )
        return;
      window.showView && window.showView(btn.dataset.view);
      updateSideNav(btn.dataset.view);
    }),
  );
  updateSideVisibility();
}
function updateSideNav(view) {
  document.querySelectorAll(".side-nav [data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const titles = {
    dashboard: ["Overview", "Your expenses, all in one place."],
    editor: [
      "Expense report",
      "Keep the details together. We’ll take care of the totals.",
    ],
    "monthly-invoices": ["Monthly Invoice", "Prepare, sign and submit your monthly invoice."],
    admin: ["Management", "Review, approve and track your team’s expenses."],
  };
  const [title, description] = titles[view] || titles.dashboard;
  if (qs("workspaceTitle")) qs("workspaceTitle").textContent = title;
  if (qs("workspaceWelcome")) qs("workspaceWelcome").textContent = description;
  document
    .querySelector(".workspace-create")
    ?.classList.toggle("hide", view !== "dashboard");
  document
    .querySelector(".submission-deadline")
    ?.classList.toggle("hide", view === "admin" || view === "monthly-invoices");
  document.querySelector(".hero")?.classList.toggle("hide", view === "admin" || view === "monthly-invoices");
}
function updateSideVisibility() {
  const sideAdmin = qs("side-admin");
  if (sideAdmin && qs("tab-admin"))
    sideAdmin.classList.toggle(
      "hide",
      qs("tab-admin").classList.contains("hide"),
    );
}
buildHybridShell();
on("view-changed", ({ view }) => {
  updateSideNav(view);
  updateSideVisibility();
});
on("session", () => updateSideVisibility());

// Keep headings beside values when management tables become stacked on small screens.
function labelManagementTables() {
  document.querySelectorAll(".admin-table").forEach((table) => {
    const headings = [...table.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim(),
    );
    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (
          cell.tagName !== "TD" ||
          Number(cell.getAttribute("colspan") || 1) > 1
        )
          return;
        cell.dataset.label = headings[index] || "";
      });
    });
  });
}
labelManagementTables();
for (const event of [
  "management-rendered",
  "users-loaded",
  "review-opened",
  "view-changed",
]) {
  on(event, labelManagementTables);
}

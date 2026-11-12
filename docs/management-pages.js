import { on } from "./app-events.js";
let role = "user",
  selectedPage = "review";
const pages = {
  users: [
    "User Management",
    "Create accounts, manage access and send password reset emails.",
  ],
  budget: [
    "Budget Management",
    "Manage annual budgets and track available balances.",
  ],
  review: [
    "Manager & Finance Review",
    "Review, approve and process reimbursements in one place.",
  ],
  reports: ["All Reports", "Search the reports available to your role."],
};
export function showManagementPage(page = selectedPage) {
  const allowed = ["admin", "manager", "finance"].includes(role);
  if (!pages[page] || (page === "users" && role !== "admin")) page = "review";
  selectedPage = page;
  document.querySelectorAll(".management-page").forEach((section) => {
    const active = allowed && section.id === "management-" + page;
    section.classList.toggle("hide", !active);
    section.hidden = !active;
  });
  document.querySelectorAll("[data-management-page]").forEach((button) => {
    button.classList.toggle(
      "hide",
      !allowed ||
        (button.dataset.managementPage === "users" && role !== "admin"),
    );
    const active = allowed && button.dataset.managementPage === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const title = document.getElementById("managementPageTitle"),
    description = document.getElementById("adminScopeText");
  if (title) title.textContent = pages[page][0];
  if (description) description.textContent = pages[page][1];
  return page;
}
document.querySelectorAll("[data-management-page]").forEach((button) => {
  button.addEventListener("click", () =>
    window.showView("admin-" + button.dataset.managementPage),
  );
});
on("session", (data) => {
  role = data.profile?.role || "user";
  selectedPage = "review";
  showManagementPage();
});
showManagementPage();

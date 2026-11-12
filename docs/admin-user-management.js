import { auth, db, firebaseConfig } from "./firebase-client.js";
import {
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { on, emit } from "./app-events.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
let me = null,
  myProfile = { role: "user" },
  users = [];
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v || "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const isAdmin = () => myProfile.role === "admin";
async function loadUsers() {
  if (!isAdmin()) return;
  const uid = me.uid;
  try {
    const snap = await getDocs(collection(db, "users"));
    if (me?.uid !== uid || !isAdmin()) return;
    users = snap.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    renderAdminUserTools();
    emit("users-loaded", { users });
  } catch (e) {
    console.warn("Admin user load failed", e);
  }
}
function userLabel(u) {
  return esc(
    u.displayName ||
      [u.firstName, u.lastName].filter(Boolean).join(" ") ||
      u.email ||
      u.id,
  );
}
function roleOptions(role) {
  return ["user", "manager", "finance", "admin", "disabled"]
    .map(
      (r) =>
        `<option value="${r}" ${role === r ? "selected" : ""}>${r}</option>`,
    )
    .join("");
}
function renderAdminUserTools() {
  const card = $("adminUsersCard");
  if (!card || !isAdmin()) return;
  card.innerHTML = `<div class="admin-note"><h3>User Management</h3><p class="muted">Create users, manage access and send password reset links by email.</p></div><div class="admin-create-user"><h4>Create User</h4><div class="admin-create-grid"><label>Email<input id="adminNewEmail" type="email" placeholder="name@company.com"></label><label>Initial Password<input id="adminNewPassword" type="password" placeholder="Minimum 6 characters"></label><label>Name<input id="adminNewFirstName" placeholder="Name"></label><label>Last Name<input id="adminNewLastName" placeholder="Last name"></label><label>Employee ID<input id="adminNewEmployeeId" placeholder="Employee ID"></label><label>Office Location<input id="adminNewOfficeLocation" placeholder="Office location"></label><label>Department<input id="adminNewDepartment" placeholder="Department"></label><label>Role<select id="adminNewRole"><option>user</option><option>manager</option><option>finance</option><option>admin</option></select></label></div><div class="admin-create-actions"><button onclick="adminCreateUser()">Create User</button><button class="secondary" onclick="adminClearCreateUser()">Clear</button></div><p id="adminUserMsg" class="small muted"></p></div><p id="adminPasswordResetMsg" role="status" aria-live="polite" class="small muted"></p><div class="table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Employee ID</th><th>Office</th><th>Department</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map((u) => `<tr><td><strong>${userLabel(u)}</strong><br><span class="muted small">${esc(u.email || "-")}</span></td><td>${esc(u.employeeId || "-")}</td><td>${esc(u.officeLocation || "-")}</td><td>${esc(u.department || "-")}</td><td><select class="role-select" id="adminRole-${u.id}">${roleOptions(u.role || "user")}</select></td><td><span class="mgmt-chip ${u.active === false || u.role === "disabled" ? "red" : "ok"}">${u.active === false || u.role === "disabled" ? "Disabled" : "Active"}</span></td><td><div class="inline-actions"><button type="button" class="secondary" data-save-role="${esc(u.id)}" disabled>Save role</button><button type="button" class="secondary" data-reset-user="${esc(u.id)}">Send reset email</button>${u.active === false || u.role === "disabled" ? `<button class="secondary" onclick="adminActivateUser('${u.id}')">Activate</button>` : `<button class="danger" onclick="adminDeactivateUser('${u.id}')">Delete / Disable</button>`}</div></td></tr>`).join("") || '<tr><td colspan="7">No users found.</td></tr>'}</tbody></table></div>`;
  card.querySelectorAll("[data-save-role]").forEach((button) => {
    const uid = button.dataset.saveRole,
      select = $("adminRole-" + uid),
      original = users.find((user) => user.id === uid)?.role || "user";
    select.addEventListener("change", () => {
      button.disabled = select.value === original;
    });
    button.onclick = () => window.adminSaveUserRole(uid);
  });
  card.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.onclick = () => window.adminResetPassword(button.dataset.resetUser);
  });
}
const resetRequests = new Set();
window.adminResetPassword = async (uid) => {
  if (!me || !isAdmin() || resetRequests.has(uid)) return false;
  const user = users.find((entry) => entry.id === uid);
  if (!user?.email) return false;
  if (!confirm("Send a password reset email to " + user.email + "?"))
    return false;
  const actor = me.uid,
    message = $("adminPasswordResetMsg");
  const buttons = [...document.querySelectorAll("[data-reset-user]")].filter(
    (button) => button.dataset.resetUser === uid,
  );
  resetRequests.add(uid);
  buttons.forEach((button) => {
    button.disabled = true;
  });
  if (message)
    message.textContent =
      "Requesting password reset email for " + user.email + "…";
  try {
    await sendPasswordResetEmail(auth, user.email);
    if (me?.uid === actor && isAdmin() && message)
      message.textContent =
        "Password reset email requested for " +
        user.email +
        ". Ask the user to check Inbox and Spam.";
    return true;
  } catch (error) {
    if (me?.uid === actor && isAdmin() && message)
      message.textContent = "Cannot request password reset: " + error.message;
    return false;
  } finally {
    resetRequests.delete(uid);
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};
window.adminClearCreateUser = () =>
  [
    "adminNewEmail",
    "adminNewPassword",
    "adminNewFirstName",
    "adminNewLastName",
    "adminNewEmployeeId",
    "adminNewOfficeLocation",
    "adminNewDepartment",
  ].forEach((id) => $(id) && ($(id).value = ""));
window.adminCreateUser = async () => {
  if (!isAdmin()) return alert("Admin only.");
  const msg = $("adminUserMsg");
  const email = $("adminNewEmail").value.trim(),
    password = $("adminNewPassword").value,
    firstName = $("adminNewFirstName").value.trim(),
    lastName = $("adminNewLastName").value.trim(),
    employeeId = $("adminNewEmployeeId").value.trim(),
    officeLocation = $("adminNewOfficeLocation").value.trim(),
    department = $("adminNewDepartment").value.trim(),
    role = $("adminNewRole").value;
  if (
    !email ||
    !password ||
    !firstName ||
    !lastName ||
    !employeeId ||
    !officeLocation ||
    !department
  ) {
    msg.textContent = "Please complete all create user fields.";
    return;
  }
  msg.textContent = "Creating Firebase Authentication user...";
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Cannot create user");
    await setDoc(
      doc(db, "users", data.localId),
      {
        email,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        employeeId,
        officeLocation,
        department,
        role,
        active: true,
        createdBy: me.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    msg.textContent = "User created successfully.";
    window.adminClearCreateUser();
    await loadUsers();
  } catch (e) {
    msg.textContent = "Create user failed: " + e.message;
  }
};
window.adminSaveUserRole = async (uid) => {
  if (!me || !isAdmin()) return false;
  const target = users.find((user) => user.id === uid),
    role = $("adminRole-" + uid)?.value;
  if (!target || !role || role === (target.role || "user")) return false;
  if (uid === me.uid && !confirm("Change your own access and sign out?"))
    return false;
  try {
    await setDoc(
      doc(db, "users", uid),
      {
        role,
        active: role !== "disabled",
        updatedBy: me.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (uid === me.uid) {
      await signOut(auth);
      alert("Your role changed. Sign in again.");
      return true;
    }
    await loadUsers();
    return true;
  } catch (error) {
    alert("Cannot save role: " + error.message);
    return false;
  }
};
window.adminDeactivateUser = async (uid) => {
  if (!isAdmin()) return alert("Admin only.");
  if (
    !confirm(
      "Disable this user? The user will not be able to continue using the app.",
    )
  )
    return;
  await setDoc(
    doc(db, "users", uid),
    {
      active: false,
      role: "disabled",
      disabledBy: me.uid,
      disabledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await loadUsers();
};
window.adminActivateUser = async (uid) => {
  if (!isAdmin()) return alert("Admin only.");
  await setDoc(
    doc(db, "users", uid),
    {
      active: true,
      role: "user",
      updatedBy: me.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await loadUsers();
};
window.refreshAdminUsers = loadUsers;
on("session", (data) => {
  me = data.user;
  myProfile = data.profile || { role: "user" };
  users = [];
  if (me && isAdmin()) return loadUsers();
  $("adminUsersCard")?.replaceChildren();
});

import { auth, db } from "./firebase-client.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let pendingProfile = null;
export async function waitForUserProfile() {
  if (!pendingProfile) return;
  const result = await pendingProfile;
  if (result.error) throw result.error;
}
export async function createUserProfile(profile, password) {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  pendingProfile = pending;
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      profile.email,
      password,
    );
    await setDoc(doc(db, "users", credential.user.uid), {
      ...profile,
      role: "user",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    complete({});
    return credential;
  } catch (error) {
    complete({ error });
    throw error;
  } finally {
    if (pendingProfile === pending) pendingProfile = null;
  }
}

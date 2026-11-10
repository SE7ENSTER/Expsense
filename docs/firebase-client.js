import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyByUZX7ScSa__yrkmOjh9sbviKg1Qppcl4",
  authDomain: "expsense-cf0a5.firebaseapp.com",
  projectId: "expsense-cf0a5",
  storageBucket: "expsense-cf0a5.firebasestorage.app",
  messagingSenderId: "667841901219",
  appId: "1:667841901219:web:6c9c2226ab74885eb08516",
  measurementId: "G-0CFSZ757Z9",
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

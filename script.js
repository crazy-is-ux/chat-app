import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCCpko-ZR-y56460Y0k0ZfRXLkFrsNnGW8",
  authDomain: "mini-chat-8b112.firebaseapp.com",
  projectId: "mini-chat-8b112",
  storageBucket: "mini-chat-8b112.firebasestorage.app",
  messagingSenderId: "972388289647",
  appId: "1:972388289647:web:c9874e059ddf5ed992519a",
  measurementId: "G-QFHP0FNKSP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginView = document.getElementById("login-view");
const chatView = document.getElementById("chat-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const userEmail = document.getElementById("user-email");
const logoutButton = document.getElementById("logout-button");
const messageForm = document.getElementById("message-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");

let currentUser = null;
let stopListening = null;

function showLogin() {
  loginView.hidden = false;
  chatView.hidden = true;
  emailInput.focus();
}

function showChat(user) {
  loginView.hidden = true;
  chatView.hidden = false;
  userEmail.textContent = user.email;
  input.focus();
}

function getLoginError(code) {
  const errors = {
    "auth/invalid-credential": "E-Mail-Adresse oder Passwort ist falsch.",
    "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
    "auth/too-many-requests": "Zu viele Versuche. Bitte warte kurz.",
    "auth/user-disabled": "Dieses Konto wurde deaktiviert."
  };

  return errors[code] || "Anmeldung fehlgeschlagen. Bitte versuche es erneut.";
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "Jetzt";
  }

  return timestamp.toDate().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createMessageElement(message) {
  const wrapper = document.createElement("article");
  const sender = document.createElement("span");
  const text = document.createElement("p");
  const time = document.createElement("time");

  wrapper.className = "message";
  sender.className = "message-sender";
  text.className = "message-text";
  time.className = "message-time";

  if (message.senderId === currentUser.uid) {
    wrapper.classList.add("own-message");
    sender.textContent = "Du";
  } else {
    sender.textContent = message.senderEmail || "Freund";
  }

  text.textContent = message.text;
  time.textContent = formatTime(message.createdAt);
  wrapper.append(sender, text, time);

  return wrapper;
}

function listenForMessages() {
  if (stopListening) {
    stopListening();
  }

  const messagesQuery = query(
    collection(db, "messages"),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  stopListening = onSnapshot(
    messagesQuery,
    (snapshot) => {
      messages.querySelectorAll(".message").forEach((message) => message.remove());
      emptyState.hidden = !snapshot.empty;

      snapshot.forEach((document) => {
        messages.appendChild(createMessageElement(document.data()));
      });

      messages.scrollTop = messages.scrollHeight;
    },
    () => {
      emptyState.hidden = false;
      emptyState.textContent = "Nachrichten konnten nicht geladen werden.";
    }
  );
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
    loginForm.reset();
  } catch (error) {
    loginError.textContent = getLoginError(error.code);
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text || !currentUser) {
    return;
  }

  input.disabled = true;

  try {
    await addDoc(collection(db, "messages"), {
      text,
      senderId: currentUser.uid,
      senderEmail: currentUser.email,
      createdAt: serverTimestamp()
    });
    messageForm.reset();
  } catch {
    window.alert("Nachricht konnte nicht gesendet werden.");
  } finally {
    input.disabled = false;
    input.focus();
  }
});

logoutButton.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    showChat(user);
    listenForMessages();
    return;
  }

  if (stopListening) {
    stopListening();
    stopListening = null;
  }

  messages.querySelectorAll(".message").forEach((message) => message.remove());
  showLogin();
});
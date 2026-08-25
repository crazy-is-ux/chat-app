import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
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
const usernameView = document.getElementById("username-view");
const chatView = document.getElementById("chat-view");
const loginForm = document.getElementById("login-form");
const usernameForm = document.getElementById("username-form");
const loginError = document.getElementById("login-error");
const usernameError = document.getElementById("username-error");
const usernameInput = document.getElementById("username");
const userName = document.getElementById("user-name");
const profileAvatar = document.getElementById("profile-avatar");
const logoutButton = document.getElementById("logout-button");
const messageForm = document.getElementById("message-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");

let currentUser = null;
let stopListening = null;

function showView(view) {
  loginView.hidden = view !== "login";
  usernameView.hidden = view !== "username";
  chatView.hidden = view !== "chat";
}

function showLogin() {
  showView("login");
  document.getElementById("email").focus();
}

function showUsernameSetup() {
  showView("username");
  usernameInput.focus();
}

function showChat(user) {
  const name = user.displayName || "Nutzer";
  userName.textContent = name;
  profileAvatar.textContent = name.charAt(0);
  showView("chat");
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
  if (!timestamp) return "Jetzt";

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
    sender.textContent = message.senderName || "Nutzer";
  }

  text.textContent = message.text;
  time.textContent = formatTime(message.createdAt);
  wrapper.append(sender, text, time);
  return wrapper;
}

function listenForMessages() {
  if (stopListening) stopListening();

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

      snapshot.forEach((messageDocument) => {
        messages.appendChild(createMessageElement(messageDocument.data()));
      });

      messages.scrollTop = messages.scrollHeight;
    },
    () => {
      emptyState.hidden = false;
      emptyState.querySelector("h2").textContent = "Verbindung fehlgeschlagen";
      emptyState.querySelector("p").textContent = "Bitte prüfe die Firebase-Regeln.";
    }
  );
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );
    loginForm.reset();
  } catch (error) {
    loginError.textContent = getLoginError(error.code);
  }
});

usernameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  usernameError.textContent = "";
  const name = usernameInput.value.trim();

  if (name.length < 3 || name.length > 20) {
    usernameError.textContent = "Der Benutzername muss 3 bis 20 Zeichen haben.";
    return;
  }

  try {
    await updateProfile(currentUser, { displayName: name });
    usernameForm.reset();
    showChat(currentUser);
    listenForMessages();
  } catch {
    usernameError.textContent = "Benutzername konnte nicht gespeichert werden.";
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text || !currentUser?.displayName) return;

  input.disabled = true;

  try {
    await addDoc(collection(db, "messages"), {
      text,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
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
document.getElementById("username-logout-button").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (!user) {
    if (stopListening) {
      stopListening();
      stopListening = null;
    }

    messages.querySelectorAll(".message").forEach((message) => message.remove());
    showLogin();
    return;
  }

  if (!user.displayName) {
    showUsernameSetup();
    return;
  }

  showChat(user);
  listenForMessages();
});
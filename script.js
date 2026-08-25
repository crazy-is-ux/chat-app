import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
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
const persistenceReady = setPersistence(auth, browserLocalPersistence);

const views = {
  login: document.getElementById("login-view"),
  username: document.getElementById("username-view"),
  inbox: document.getElementById("inbox-view"),
  chat: document.getElementById("chat-view")
};

const loginForm = document.getElementById("login-form");
const usernameForm = document.getElementById("username-form");
const contactSearchForm = document.getElementById("contact-search-form");
const messageForm = document.getElementById("message-form");
const loginError = document.getElementById("login-error");
const usernameError = document.getElementById("username-error");
const contactSearchError = document.getElementById("contact-search-error");
const usernameInput = document.getElementById("username");
const contactUsernameInput = document.getElementById("contact-username");
const messageInput = document.getElementById("message-input");
const inboxUsername = document.getElementById("inbox-username");
const inboxAvatar = document.getElementById("inbox-avatar");
const contactName = document.getElementById("contact-name");
const contactAvatar = document.getElementById("contact-avatar");
const newChatPanel = document.getElementById("new-chat-panel");
const chatList = document.getElementById("chat-list");
const emptyChats = document.getElementById("empty-chats");
const messages = document.getElementById("messages");
const emptyMessages = document.getElementById("empty-messages");

let currentUser = null;
let currentUsername = "";
let activeChatId = "";
let activeChatData = null;
let chatCache = new Map();
let stopChats = null;
let stopMessages = null;

function showView(name) {
  Object.entries(views).forEach(([viewName, element]) => {
    element.hidden = viewName !== name;
  });
}

function firstLetter(name) {
  return (name || "N").trim().charAt(0).toUpperCase();
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function isValidUsername(value) {
  return /^[A-Za-z0-9._-]{3,20}$/.test(value);
}

function getAuthError(code) {
  const errors = {
    "auth/invalid-credential": "E-Mail-Adresse oder Passwort ist falsch.",
    "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
    "auth/too-many-requests": "Zu viele Versuche. Bitte warte kurz.",
    "auth/user-disabled": "Dieses Konto wurde deaktiviert."
  };

  return errors[code] || "Anmeldung fehlgeschlagen. Bitte versuche es erneut.";
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "Jetzt";

  return timestamp.toDate().toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatChatTime(timestamp) {
  if (!timestamp) return "";

  const date = timestamp.toDate();
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit"
  });
}

async function saveUsername(user, rawUsername) {
  const username = rawUsername.trim();
  const usernameLower = normalizeUsername(username);

  if (!isValidUsername(username)) {
    throw new Error("invalid-username");
  }

  const userRef = doc(db, "users", user.uid);
  const usernameRef = doc(db, "usernames", usernameLower);

  await runTransaction(db, async (transaction) => {
    const usernameSnapshot = await transaction.get(usernameRef);
    const userSnapshot = await transaction.get(userRef);

    if (usernameSnapshot.exists() && usernameSnapshot.data().uid !== user.uid) {
      throw new Error("username-taken");
    }

    if (userSnapshot.exists()) {
      if (userSnapshot.data().usernameLower !== usernameLower) {
        throw new Error("profile-already-exists");
      }
      return;
    }

    transaction.set(userRef, {
      username,
      usernameLower,
      createdAt: serverTimestamp()
    });

    transaction.set(usernameRef, {
      uid: user.uid,
      username,
      createdAt: serverTimestamp()
    });
  });

  if (user.displayName !== username) {
    await updateProfile(user, { displayName: username });
  }

  currentUsername = username;
}

async function loadProfile(user) {
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));

  if (profileSnapshot.exists()) {
    currentUsername = profileSnapshot.data().username;

    if (user.displayName !== currentUsername) {
      await updateProfile(user, { displayName: currentUsername });
    }

    openInbox();
    return;
  }

  if (user.displayName && isValidUsername(user.displayName)) {
    try {
      await saveUsername(user, user.displayName);
      openInbox();
      return;
    } catch (error) {
      if (error.message !== "username-taken") throw error;
    }
  }

  usernameError.textContent = "";
  showView("username");
  usernameInput.focus();
}

function openInbox() {
  inboxUsername.textContent = currentUsername;
  inboxAvatar.textContent = firstLetter(currentUsername);
  showView("inbox");
  listenForChats();
}

function otherParticipant(chatData) {
  const otherUid = chatData.participants.find((uid) => uid !== currentUser.uid);
  const name = chatData.participantNames?.[otherUid] || "Kontakt";
  return { uid: otherUid, name };
}

function createChatItem(chatId, chatData) {
  const contact = otherParticipant(chatData);
  const button = document.createElement("button");
  const avatar = document.createElement("span");
  const copy = document.createElement("span");
  const name = document.createElement("span");
  const preview = document.createElement("span");
  const time = document.createElement("time");

  button.type = "button";
  button.className = "chat-item";
  button.dataset.chatId = chatId;

  avatar.className = "chat-item-avatar";
  avatar.textContent = firstLetter(contact.name);

  copy.className = "chat-item-copy";
  name.className = "chat-item-name";
  name.textContent = contact.name;
  preview.className = "chat-item-preview";
  preview.textContent = chatData.lastMessage || "Noch keine Nachrichten";
  copy.append(name, preview);

  time.className = "chat-item-time";
  time.textContent = formatChatTime(chatData.updatedAt);

  button.append(avatar, copy, time);
  button.addEventListener("click", () => openChat(chatId, chatData));
  return button;
}

function renderChats(chatDocuments) {
  chatList.replaceChildren();
  chatCache = new Map();

  const sortedChats = chatDocuments
    .map((chatDocument) => ({
      id: chatDocument.id,
      data: chatDocument.data()
    }))
    .sort((a, b) => {
      const aTime = a.data.updatedAt?.toMillis?.() || 0;
      const bTime = b.data.updatedAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

  emptyChats.hidden = sortedChats.length > 0;

  sortedChats.forEach(({ id, data }) => {
    chatCache.set(id, data);
    chatList.appendChild(createChatItem(id, data));
  });
}

function listenForChats() {
  if (stopChats) stopChats();

  const chatsQuery = query(
    collection(db, "chats"),
    where("participants", "array-contains", currentUser.uid)
  );

  stopChats = onSnapshot(
    chatsQuery,
    (snapshot) => renderChats(snapshot.docs),
    () => {
      emptyChats.hidden = false;
      emptyChats.querySelector("h3").textContent = "Chats konnten nicht geladen werden";
      emptyChats.querySelector("p").textContent = "Bitte prüfe die Firebase-Regeln.";
    }
  );
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
    sender.textContent = message.senderName || "Kontakt";
  }

  text.textContent = message.text;
  time.textContent = formatMessageTime(message.createdAt);
  wrapper.append(sender, text, time);
  return wrapper;
}

function listenForMessages(chatId) {
  if (stopMessages) stopMessages();

  const messagesQuery = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  stopMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      messages.querySelectorAll(".message").forEach((message) => message.remove());
      emptyMessages.hidden = !snapshot.empty;

      snapshot.forEach((messageDocument) => {
        messages.appendChild(createMessageElement(messageDocument.data()));
      });

      messages.scrollTop = messages.scrollHeight;
    },
    () => {
      emptyMessages.hidden = false;
      emptyMessages.querySelector("h2").textContent = "Chat nicht verfügbar";
      emptyMessages.querySelector("p").textContent = "Du hast keinen Zugriff oder die Regeln fehlen.";
    }
  );
}

function openChat(chatId, chatData) {
  activeChatId = chatId;
  activeChatData = chatData;

  const contact = otherParticipant(chatData);
  contactName.textContent = contact.name;
  contactAvatar.textContent = firstLetter(contact.name);

  showView("chat");
  listenForMessages(chatId);
  messageInput.focus();
}

async function startChat(rawUsername) {
  const usernameLower = normalizeUsername(rawUsername);

  if (!isValidUsername(rawUsername.trim())) {
    throw new Error("invalid-username");
  }

  const usernameSnapshot = await getDoc(doc(db, "usernames", usernameLower));

  if (!usernameSnapshot.exists()) {
    throw new Error("user-not-found");
  }

  const otherUid = usernameSnapshot.data().uid;

  if (otherUid === currentUser.uid) {
    throw new Error("self-chat");
  }

  const otherProfileSnapshot = await getDoc(doc(db, "users", otherUid));

  if (!otherProfileSnapshot.exists()) {
    throw new Error("user-not-found");
  }

  const otherUsername = otherProfileSnapshot.data().username;
  const participants = [currentUser.uid, otherUid].sort();
  const chatId = participants.join("--");
  const chatRef = doc(db, "chats", chatId);
  const chatSnapshot = await getDoc(chatRef);

  let chatData;

  if (chatSnapshot.exists()) {
    chatData = chatSnapshot.data();
  } else {
    chatData = {
      participants,
      participantNames: {
        [currentUser.uid]: currentUsername,
        [otherUid]: otherUsername
      },
      lastMessage: "",
      lastSenderId: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(chatRef, chatData);
  }

  newChatPanel.hidden = true;
  contactSearchForm.reset();
  openChat(chatId, chatData);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  try {
    await persistenceReady;
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value
    );
    loginForm.reset();
  } catch (error) {
    loginError.textContent = getAuthError(error.code);
  }
});

usernameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  usernameError.textContent = "";

  try {
    await saveUsername(currentUser, usernameInput.value);
    usernameForm.reset();
    openInbox();
  } catch (error) {
    if (error.message === "username-taken") {
      usernameError.textContent = "Dieser Benutzername ist bereits vergeben.";
    } else if (error.message === "invalid-username") {
      usernameError.textContent = "Bitte nutze nur Buchstaben, Zahlen, Punkt, _ oder -.";
    } else {
      usernameError.textContent = "Benutzername konnte nicht gespeichert werden.";
    }
  }
});

document.getElementById("new-chat-button").addEventListener("click", () => {
  newChatPanel.hidden = !newChatPanel.hidden;
  contactSearchError.textContent = "";

  if (!newChatPanel.hidden) contactUsernameInput.focus();
});

contactSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  contactSearchError.textContent = "";

  try {
    await startChat(contactUsernameInput.value);
  } catch (error) {
    const messagesByError = {
      "invalid-username": "Dieser Benutzername ist ungültig.",
      "user-not-found": "Kein Nutzer mit diesem Namen gefunden.",
      "self-chat": "Du kannst keinen Chat mit dir selbst starten."
    };

    contactSearchError.textContent =
      messagesByError[error.message] || "Chat konnte nicht erstellt werden.";
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();

  if (!text || !activeChatId) return;

  messageInput.disabled = true;

  try {
    const batch = writeBatch(db);
    const messageRef = doc(collection(db, "chats", activeChatId, "messages"));
    const chatRef = doc(db, "chats", activeChatId);

    batch.set(messageRef, {
      text,
      senderId: currentUser.uid,
      senderName: currentUsername,
      createdAt: serverTimestamp()
    });

    batch.update(chatRef, {
      lastMessage: text,
      lastSenderId: currentUser.uid,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
    messageForm.reset();
  } catch {
    window.alert("Nachricht konnte nicht gesendet werden.");
  } finally {
    messageInput.disabled = false;
    messageInput.focus();
  }
});

document.getElementById("back-button").addEventListener("click", () => {
  if (stopMessages) {
    stopMessages();
    stopMessages = null;
  }

  activeChatId = "";
  activeChatData = null;
  messages.querySelectorAll(".message").forEach((message) => message.remove());
  emptyMessages.hidden = false;
  showView("inbox");
});

document.getElementById("logout-button").addEventListener("click", () => signOut(auth));
document.getElementById("username-logout-button").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    if (stopChats) {
      stopChats();
      stopChats = null;
    }

    if (stopMessages) {
      stopMessages();
      stopMessages = null;
    }

    currentUsername = "";
    activeChatId = "";
    activeChatData = null;
    chatCache.clear();
    chatList.replaceChildren();
    showView("login");
    document.getElementById("email").focus();
    return;
  }

  try {
    await loadProfile(user);
  } catch {
    usernameError.textContent = "Profil konnte nicht geladen werden. Prüfe die Firebase-Regeln.";
    showView("username");
  }
});
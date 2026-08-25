const form = document.getElementById("message-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");
const clearButton = document.getElementById("clear-button");
const storageKey = "mini-chat-messages";

let chatMessages = loadMessages();

function loadMessages() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch {
    return [];
  }
}

function saveMessages() {
  localStorage.setItem(storageKey, JSON.stringify(chatMessages));
}

function createMessageElement(message) {
  const wrapper = document.createElement("article");
  const text = document.createElement("p");
  const time = document.createElement("time");

  wrapper.className = "message";
  text.className = "message-text";
  time.className = "message-time";

  text.textContent = message.text;
  time.textContent = message.time;

  wrapper.append(text, time);
  return wrapper;
}

function renderMessages() {
  messages.querySelectorAll(".message").forEach((message) => message.remove());
  emptyState.hidden = chatMessages.length > 0;

  chatMessages.forEach((message) => {
    messages.appendChild(createMessageElement(message));
  });

  messages.scrollTop = messages.scrollHeight;
}

function sendMessage() {
  const text = input.value.trim();

  if (!text) {
    return;
  }

  chatMessages.push({
    text,
    time: new Date().toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit"
    })
  });

  saveMessages();
  renderMessages();
  form.reset();
  input.focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

clearButton.addEventListener("click", () => {
  if (!chatMessages.length) {
    return;
  }

  const shouldClear = window.confirm("Möchtest du wirklich alle Nachrichten löschen?");

  if (shouldClear) {
    chatMessages = [];
    saveMessages();
    renderMessages();
  }
});

renderMessages();
input.focus();
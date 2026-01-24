function sendMessage() {
  const input = document.getElementById("input");
  const messages = document.getElementById("messages");

  if (input.value.trim() === "") return;

  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = input.value;

  messages.appendChild(msg);
  input.value = "";

  messages.scrollTop = messages.scrollHeight;
}

// The notes page. Plain script, no framework, no build step. Every request
// carries the X-Kit-Request header; text from the App is set as text, and
// Cards arrive as escaped HTML made by the App's cardHtml.
const $ = (id) => document.getElementById(id);
const CONVERSATION = "main";

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "x-kit-request": "1", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && path !== "/api/session") showSignIn();
  return response.json();
}

const call = (action, input) =>
  api("/api/calls", { method: "POST", body: { id: crypto.randomUUID(), action, input } });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function describe(outcome) {
  if (outcome.state === "succeeded") return "Done.";
  if (outcome.state === "held") return "Waiting for your yes.";
  return `${outcome.state}: ${outcome.reason.message}`;
}

// A Card from the App, already escaped by cardHtml; or the Outcome as text.
function result(outcome) {
  const box = el("div");
  if (outcome.state === "succeeded" && outcome.card?.html) box.innerHTML = outcome.card.html;
  else box.textContent = describe(outcome);
  return box;
}

function showLast(outcome) {
  $("last").className = "";
  $("last").replaceChildren(result(outcome));
}

async function refreshNotes() {
  const outcome = await call("notes.list-notes", {});
  const list = outcome.state === "succeeded" ? outcome.output : [];
  $("notes").replaceChildren(
    ...list.map((note) => {
      const li = el("li");
      li.append(el("span", "", note.text), el("small", "", note.id));
      li.append(
        button("Delete", "quiet", async () => {
          showLast(await call("notes.delete-note", { id: note.id }));
          await refreshHolds();
        }),
      );
      return li;
    }),
  );
  $("notes-empty").hidden = list.length > 0;
}

async function decide(id, decision) {
  showLast(
    await api(`/api/calls/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: { decision },
    }),
  );
  await refreshHolds();
}

async function refreshHolds() {
  const held = await api("/api/holds");
  $("holds").replaceChildren(
    ...held.map((h) => {
      const li = el("li");
      const what = h.action === "notes.delete-note" ? `Delete note ${h.input.id}?` : `${h.action}?`;
      li.append(el("span", "", `${what}${h.conversation ? " (asked in the chat)" : ""}`));
      li.append(
        button("Yes", "", () => decide(h.call, "yes")),
        button("No", "no", () => decide(h.call, "no")),
      );
      return li;
    }),
  );
  $("holds-empty").hidden = held.length > 0;
}

function renderView(view) {
  const box = $("messages");
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  // A held Call that has ended shows only its ending.
  const ended = new Set(
    view.messages.filter((m) => m.from === "call" && m.outcome.state !== "held").map((m) => m.call),
  );
  box.replaceChildren(
    ...view.messages
      .filter((m) => !(m.from === "call" && m.outcome.state === "held" && ended.has(m.call)))
      .map((m) => {
        if (m.from !== "call") return el("li", `msg ${m.from}`, m.text);
        const li = el("li", `msg call${m.outcome.state === "held" ? " held" : ""}`);
        li.append(el("div", "what", m.action), result(m.outcome));
        if (m.outcome.state === "held") {
          const row = el("div", "row");
          row.append(
            button("Yes", "", () => decide(m.call, "yes")),
            button("No", "no", () => decide(m.call, "no")),
          );
          li.append(row);
        }
        return li;
      }),
  );
  if (view.status === "running") box.append(el("li", "msg agent working", "Working…"));
  if (atEnd) box.scrollTop = box.scrollHeight;
}

let streams = [];
function showSignIn() {
  for (const s of streams) s.close();
  streams = [];
  $("app").hidden = true;
  $("sign-out").hidden = true;
  $("sign-in").hidden = false;
}

async function showApp() {
  $("sign-in").hidden = true;
  $("app").hidden = false;
  $("sign-out").hidden = false;
  await Promise.all([refreshNotes(), refreshHolds()]);
  const changes = new EventSource("/events");
  changes.addEventListener("change", () => {
    void refreshNotes();
    void refreshHolds();
  });
  const view = new EventSource(`/api/conversations/${CONVERSATION}/view`);
  view.addEventListener("view", (event) => renderView(JSON.parse(event.data)));
  streams = [changes, view];
}

$("sign-in-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = await api("/api/session", { method: "POST", body: { secret: $("secret").value } });
  $("secret").value = "";
  $("sign-in-error").hidden = !!answer.signedIn;
  $("sign-in-error").textContent = answer.signedIn ? "" : answer.error;
  if (answer.signedIn) await showApp();
});

$("sign-out").addEventListener("click", async () => {
  await api("/api/session", { method: "DELETE" });
  showSignIn();
});

$("add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("add-text").value.trim();
  if (!text) return;
  $("add-text").value = "";
  showLast(await call("notes.add-note", { text }));
});

$("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("chat-text").value.trim();
  if (!text) return;
  $("chat-text").value = "";
  await api(`/api/conversations/${CONVERSATION}/inputs`, { method: "POST", body: { text } });
});

(async () => {
  const { signedIn } = await api("/api/session");
  if (signedIn) await showApp();
  else showSignIn();
})();

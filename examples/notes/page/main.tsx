// The notes page, built from @jaetask/toolkit: the app shell, panels and one edit page.
// Pages are routed on the hash (#/notes, #/notes/new, #/waiting, #/chat, #/settings). Every request
// carries the X-Kit-Request header; Cards arrive as escaped HTML made by the App's cardHtml.
import "@fontsource-variable/inter";
import {
  AppShell,
  EditFrame,
  type LinkComponent,
  LinkProvider,
  ListCard,
  ListRow,
  PageBody,
  Panel,
  PrimaryLink,
  Row,
  useBackTo,
} from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import { Card, CardContent } from "@jaetask/toolkit/ui/card";
import { Empty, EmptyDescription } from "@jaetask/toolkit/ui/empty";
import { Input } from "@jaetask/toolkit/ui/input";
import { Textarea } from "@jaetask/toolkit/ui/textarea";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const CONVERSATION = "main";

type Outcome =
  | { state: "succeeded"; output: unknown; card?: { html?: string } }
  | { state: "held" }
  | { state: string; reason: { message: string } };
type Note = { id: string; text: string };
type Hold = { call: string; action: string; input: { id?: string }; conversation?: string };
type Message =
  | { from: "person" | "agent"; text: string }
  | { from: "call"; call: string; action: string; outcome: Outcome };
type View = { status: string; messages: Message[] };

let onSignedOut = () => {};

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: { "x-kit-request": "1", "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (response.status === 401 && path !== "/api/session") onSignedOut();
  return response.json() as Promise<T>;
}

const call = (action: string, input: unknown) =>
  api<Outcome>("/api/calls", {
    method: "POST",
    body: { id: crypto.randomUUID(), action, input },
  });

const decide = (id: string, decision: "yes" | "no") =>
  api<Outcome>(`/api/calls/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    body: { decision },
  });

function describe(outcome: Outcome): string {
  if (outcome.state === "succeeded") return "Done.";
  if (outcome.state === "held") return "Waiting for your yes.";
  return `${outcome.state}: ${"reason" in outcome ? outcome.reason.message : ""}`;
}

/** A Card from the App, already escaped by cardHtml (so innerHTML is safe); or the Outcome as text. */
function Result({ outcome }: { outcome: Outcome }) {
  if (outcome.state === "succeeded" && "card" in outcome && outcome.card?.html)
    return <div className="card-html" dangerouslySetInnerHTML={{ __html: outcome.card.html }} />;
  return <p className="tk-muted">{describe(outcome)}</p>;
}

// ---------- Routing on the hash ----------

const hashPath = () => window.location.hash.replace(/^#/, "") || "/notes";
function useHashPath() {
  const [path, setPath] = useState(hashPath);
  useEffect(() => {
    const on = () => setPath(hashPath());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}
const go = (path: string) => {
  window.location.hash = path;
};
const HashLink: LinkComponent = ({ href, children, ...rest }) => (
  <a href={href.startsWith("/") ? `#${href}` : href} {...rest}>
    {children}
  </a>
);

// ---------- Data ----------

function useData(signedIn: boolean) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [view, setView] = useState<View>({ status: "idle", messages: [] });
  const refresh = useCallback(async () => {
    const [list, held] = await Promise.all([
      call("notes.list-notes", {}),
      api<Hold[]>("/api/holds"),
    ]);
    setNotes(list.state === "succeeded" && "output" in list ? (list.output as Note[]) : []);
    setHolds(held);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    void refresh();
    const changes = new EventSource("/events");
    changes.addEventListener("change", () => void refresh());
    const talk = new EventSource(`/api/conversations/${CONVERSATION}/view`);
    talk.addEventListener("view", (e) => setView(JSON.parse((e as MessageEvent).data)));
    return () => {
      changes.close();
      talk.close();
    };
  }, [signedIn, refresh]);
  return { notes, holds, view, refresh };
}

// ---------- Pages ----------

function NotesPage({
  notes,
  last,
  onDelete,
}: {
  notes: Note[];
  last: Outcome | null;
  onDelete: (id: string) => void;
}) {
  return (
    <PageBody
      title="Notes"
      line="Your notes. The agent reads and writes the same ones."
      action={<PrimaryLink to="/notes/new">Add note</PrimaryLink>}
    >
      <Panel id="notes" title="Your notes" line="Deleting one waits for your yes.">
        {notes.length ? (
          <ListCard>
            {notes.map((n) => (
              <ListRow
                key={n.id}
                aside={
                  <Button variant="secondary" onClick={() => onDelete(n.id)}>
                    Delete
                  </Button>
                }
              >
                {n.text}
                <small className="tk-muted">{n.id}</small>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <Empty>
            <EmptyDescription>No notes yet. Add one, or ask the agent to.</EmptyDescription>
            <PrimaryLink to="/notes/new">Add note</PrimaryLink>
          </Empty>
        )}
      </Panel>
      <Panel id="last" title="Last result" line="What your last action did.">
        <Card>
          <CardContent className="pt-6">
            {last ? <Result outcome={last} /> : <p className="tk-muted">Nothing yet.</p>}
          </CardContent>
        </Card>
      </Panel>
    </PageBody>
  );
}

function AddNotePage({ onSaved }: { onSaved: (o: Outcome) => void }) {
  const back = useBackTo("/notes");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const outcome = await call("notes.add-note", { text: text.trim() });
    setBusy(false);
    onSaved(outcome);
    go(back);
  };
  return (
    <EditFrame title="Add note" line="One line or a few." backTo={back} onSave={save} busy={busy}>
      <Row title="Note" line="Up to 500 characters." htmlFor="note-text">
        <Textarea
          id="note-text"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buy milk"
        />
      </Row>
    </EditFrame>
  );
}

function holdText(h: Hold) {
  const what = h.action === "notes.delete-note" ? `Delete note ${h.input.id}?` : `${h.action}?`;
  return `${what}${h.conversation ? " (asked in the chat)" : ""}`;
}

function WaitingPage({ holds, onDecide }: { holds: Hold[]; onDecide: Decide }) {
  return (
    <PageBody title="Waiting" line="Calls that need your yes before they run.">
      <Panel id="holds" title="Waiting for your yes" line="Yes runs it; No refuses it.">
        {holds.length ? (
          <ListCard>
            {holds.map((h) => (
              <ListRow key={h.call} aside={<YesNo id={h.call} onDecide={onDecide} />}>
                {holdText(h)}
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <Empty>
            <EmptyDescription>Nothing is waiting.</EmptyDescription>
          </Empty>
        )}
      </Panel>
    </PageBody>
  );
}

type Decide = (id: string, decision: "yes" | "no") => void;
function YesNo({ id, onDecide }: { id: string; onDecide: Decide }) {
  return (
    <>
      <Button onClick={() => onDecide(id, "yes")}>Yes</Button>
      <Button variant="secondary" onClick={() => onDecide(id, "no")}>
        No
      </Button>
    </>
  );
}

function ChatPage({ view, onDecide }: { view: View; onDecide: Decide }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLLIElement>(null);
  const ended = new Set(
    view.messages
      .filter((m) => m.from === "call" && m.outcome.state !== "held")
      .map((m) => (m.from === "call" ? m.call : "")),
  );
  const shown = view.messages.filter(
    (m) => !(m.from === "call" && m.outcome.state === "held" && ended.has(m.call)),
  );
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), []);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = { text: text.trim() };
    setText("");
    await api(`/api/conversations/${CONVERSATION}/inputs`, { method: "POST", body });
  };
  return (
    <PageBody title="Ask the agent" line="It uses the same notes, and asks before it deletes.">
      <Panel id="chat" title="Conversation" line="Each Call the agent makes shows its Card.">
        {shown.length ? (
          <ol className="messages">
            {shown.map((m, i) =>
              m.from === "call" ? (
                <li key={i} className="msg call">
                  <span className="tk-kicker">{m.action}</span>
                  <Result outcome={m.outcome} />
                  {m.outcome.state === "held" && (
                    <div className="msg-actions">
                      <YesNo id={m.call} onDecide={onDecide} />
                    </div>
                  )}
                </li>
              ) : (
                <li key={i} className={`msg ${m.from}`}>
                  {m.text}
                </li>
              ),
            )}
            {view.status === "running" && <li className="msg agent tk-muted">Working…</li>}
            <li ref={end} aria-hidden />
          </ol>
        ) : (
          <Empty>
            <EmptyDescription>
              No messages yet. Ask for something, such as: add milk to my notes.
            </EmptyDescription>
          </Empty>
        )}
        <form className="composer" onSubmit={send}>
          <Input
            aria-label="Message"
            value={text}
            maxLength={2000}
            placeholder="Add milk to my notes"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit">Send</Button>
        </form>
      </Panel>
    </PageBody>
  );
}

function SettingsPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <PageBody title="Settings" line="This browser's session.">
      <Panel
        id="session"
        title="Session"
        line="You are signed in with the setup secret."
        action={
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
        }
      >
        <Card>
          <CardContent className="pt-6">
            <p className="tk-muted">Signing out ends the session in this browser only.</p>
          </CardContent>
        </Card>
      </Panel>
    </PageBody>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const answer = await api<{ signedIn: boolean; error?: string }>("/api/session", {
      method: "POST",
      body: { secret },
    });
    setSecret("");
    setError(answer.signedIn ? "" : (answer.error ?? "Could not sign in."));
    if (answer.signedIn) onSignedIn();
  };
  return (
    <div className="tk-root sign-in">
      <Panel
        id="sign-in"
        title="Sign in to Notes"
        line="Enter the setup secret this App printed when it first started."
      >
        <form className="composer" onSubmit={submit}>
          <Input
            type="password"
            aria-label="Setup secret"
            autoComplete="current-password"
            placeholder="Setup secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
          <Button type="submit">Sign in</Button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}

// ---------- App ----------

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICONS = {
  notes: icon("M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5"),
  waiting: icon("M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18"),
  chat: icon("M4 5h16v11H9l-5 4z"),
};

function App() {
  const path = useHashPath();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [last, setLast] = useState<Outcome | null>(null);
  const { notes, holds, view, refresh } = useData(signedIn === true);
  onSignedOut = () => setSignedIn(false);

  useEffect(() => {
    void api<{ signedIn: boolean }>("/api/session").then((s) => setSignedIn(s.signedIn));
  }, []);

  if (signedIn === null) return null;
  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />;

  const onDecide: Decide = async (id, decision) => {
    setLast(await decide(id, decision));
    await refresh();
  };
  const onDelete = async (id: string) => {
    setLast(await call("notes.delete-note", { id }));
    await refresh();
  };
  const signOut = async () => {
    await api("/api/session", { method: "DELETE" });
    setSignedIn(false);
  };

  const page = path.split("?")[0] ?? "/notes";
  const nav = [
    { href: "/notes", label: "Notes", icon: ICONS.notes },
    {
      href: "/waiting",
      label: holds.length ? `Waiting (${holds.length})` : "Waiting",
      icon: ICONS.waiting,
    },
    { href: "/chat", label: "Ask the agent", icon: ICONS.chat },
  ].map((n) => ({ ...n, current: page === n.href || page.startsWith(`${n.href}/`) }));
  const titles: Record<string, string> = {
    "/notes": "Notes",
    "/notes/new": "Add note",
    "/waiting": "Waiting",
    "/chat": "Ask the agent",
    "/settings": "Settings",
  };

  return (
    <AppShell
      app={{ name: "Notes", href: "/notes" }}
      title={titles[page] ?? "Notes"}
      nav={nav}
      settingsHref="/settings"
    >
      {page === "/notes/new" ? (
        <AddNotePage onSaved={setLast} />
      ) : page === "/waiting" ? (
        <WaitingPage holds={holds} onDecide={onDecide} />
      ) : page === "/chat" ? (
        <ChatPage view={view} onDecide={onDecide} />
      ) : page === "/settings" ? (
        <SettingsPage onSignOut={signOut} />
      ) : (
        <NotesPage notes={notes} last={last} onDelete={onDelete} />
      )}
    </AppShell>
  );
}

function Root() {
  const path = useHashPath();
  return (
    <LinkProvider link={HashLink} location={path}>
      <App />
    </LinkProvider>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Root />);

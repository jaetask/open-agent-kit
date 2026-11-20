// The example Domain carried through every layer: one read, one write and
// one danger Action, and the Cards that show their Outcomes.
import { z } from "zod";
import {
  defineAction,
  defineCard,
  defineDomain,
  Refusal,
  type RunContext,
} from "../../src/index.js";
import { Note, type NotesDeps } from "./notes.js";

export const noteList = defineCard({
  name: "note-list",
  version: 1,
  about: "A list of notes.",
  view: {
    kind: "list",
    title: "Notes",
    fields: [
      { label: "Note", path: "text" },
      { label: "Id", path: "id" },
    ],
  },
});
export const noteCard = defineCard({
  name: "note",
  version: 1,
  about: "One note.",
  view: {
    kind: "record",
    title: "Note",
    fields: [
      { label: "Text", path: "text" },
      { label: "Id", path: "id" },
    ],
  },
});
export const notesChanged = defineCard({
  name: "notes-changed",
  version: 1,
  about: "What a Call changed in the notes.",
  view: { kind: "change", title: "Notes changed" },
});

export const listNotes = defineAction({
  name: "list-notes",
  description: "List your notes.",
  effect: "read",
  input: z.object({}),
  output: z.array(Note),
  card: noteList,
  run: (_input, { principal, notes }: RunContext<NotesDeps>) => notes.list(principal.id),
});

export const addNote = defineAction({
  name: "add-note",
  description: "Add a note.",
  effect: "write",
  input: z.object({ text: z.string().min(1) }),
  output: Note,
  card: noteCard,
  run: ({ text }, { principal, notes, change }: RunContext<NotesDeps>) => {
    if (notes.list(principal.id).some((n) => n.text === text)) {
      throw new Refusal("duplicate", "You already have that note.");
    }
    const note = notes.add(principal.id, text);
    change({ kind: "created", subject: "note", id: note.id });
    return note;
  },
});

export const deleteNote = defineAction({
  name: "delete-note",
  description: "Delete a note. It cannot be brought back.",
  effect: "danger",
  input: z.object({ id: z.string() }),
  output: z.object({ deleted: z.boolean() }),
  card: notesChanged,
  run: ({ id }, { principal, notes, change }: RunContext<NotesDeps>) => {
    const deleted = notes.remove(principal.id, id);
    if (deleted) change({ kind: "deleted", subject: "note", id });
    return { deleted };
  },
});

export const whoAmI = defineAction({
  name: "who-am-i",
  description: "Say who this Call acts as and where it came from.",
  effect: "read",
  input: z.object({}),
  output: z.object({
    principal: z.string(),
    caller: z.string(),
    throughConnection: z.boolean(),
  }),
  run: (_input, { principal, caller, connection }: RunContext<NotesDeps>) => ({
    principal: principal.id,
    caller,
    throughConnection: connection !== undefined,
  }),
});

export const notesDomain = defineDomain({
  name: "notes",
  version: "1.0.0",
  about: "Short notes, one list per Principal.",
  actions: [listNotes, addNote, deleteNote, whoAmI],
  cards: [noteList, noteCard, notesChanged],
  // A guest may read; only signed-in Principals may change notes.
  authorise: (principal, action) => principal.id !== "guest" || action.effect === "read",
});

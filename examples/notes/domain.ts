// The example Domain carried through every layer: one read, one write and
// one danger Action, and the Cards that show their Outcomes.
import { z } from "zod";
import { defineAction, defineCard, defineDomain, type RunContext } from "../../src/index.js";
import { Note, type NotesDeps } from "./notes.js";

export const noteList = defineCard({ name: "note-list", version: 1, about: "A list of notes." });
export const noteCard = defineCard({ name: "note", version: 1, about: "One note." });

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
  run: ({ text }, { principal, notes }: RunContext<NotesDeps>) => notes.add(principal.id, text),
});

export const deleteNote = defineAction({
  name: "delete-note",
  description: "Delete a note. It cannot be brought back.",
  effect: "danger",
  input: z.object({ id: z.string() }),
  output: z.object({ deleted: z.boolean() }),
  run: ({ id }, { principal, notes }: RunContext<NotesDeps>) => ({
    deleted: notes.remove(principal.id, id),
  }),
});

export const notesDomain = defineDomain({
  name: "notes",
  version: "1.0.0",
  about: "Short notes, one list per Principal.",
  actions: [listNotes, addNote, deleteNote],
  cards: [noteList, noteCard],
});

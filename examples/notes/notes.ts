import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export const Note = z.object({ id: z.string(), owner: z.string(), text: z.string() });
export type Note = z.infer<typeof Note>;

export type Notes = {
  list(owner: string): Note[];
  add(owner: string, text: string): Note;
  remove(owner: string, id: string): boolean;
};

export type NotesDeps = { notes: Notes };

export function mapNotes(data: Map<string, unknown>): Notes {
  const all = () => (data.get("notes") as Note[] | undefined) ?? [];
  return {
    list: (owner) => all().filter((n) => n.owner === owner),
    add: (owner, text) => {
      const last = ((data.get("notes.last") as number | undefined) ?? 0) + 1;
      const note = { id: `n${last}`, owner, text };
      data.set("notes.last", last);
      data.set("notes", [...all(), note]);
      return note;
    },
    remove: (owner, id) => {
      const notes = all();
      const kept = notes.filter((n) => !(n.owner === owner && n.id === id));
      data.set("notes", kept);
      return kept.length < notes.length;
    },
  };
}

export function sqliteNotes(db: DatabaseSync): Notes {
  db.exec(
    "CREATE TABLE IF NOT EXISTS notes (seq INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, text TEXT NOT NULL)",
  );
  const row = (r: unknown) => {
    const { seq, owner, text } = r as { seq: number; owner: string; text: string };
    return { id: `n${seq}`, owner, text };
  };
  return {
    list: (owner) =>
      db.prepare("SELECT * FROM notes WHERE owner = ? ORDER BY seq").all(owner).map(row),
    add: (owner, text) =>
      row(db.prepare("INSERT INTO notes (owner, text) VALUES (?, ?) RETURNING *").get(owner, text)),
    remove: (owner, id) =>
      db.prepare("DELETE FROM notes WHERE owner = ? AND seq = ?").run(owner, Number(id.slice(1)))
        .changes > 0,
  };
}

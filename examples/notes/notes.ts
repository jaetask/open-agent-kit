import { z } from "zod";

export const Note = z.object({ id: z.string(), owner: z.string(), text: z.string() });
export type Note = z.infer<typeof Note>;

/** The notes repository. The Domain owns it; Kit never looks inside. */
export type Notes = {
  list(owner: string): Note[];
  add(owner: string, text: string): Note;
  remove(owner: string, id: string): boolean;
};

export type NotesDeps = { notes: Notes };

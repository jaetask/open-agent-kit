# 19. A note's id is never used again

## Context

The notes example deletes notes. Call records, Changes and Cards keep the ids of notes after they are gone.

## Decision

Both notes stores in `examples/notes/notes.ts` give each note a new id that no note had before. The Map store keeps the last number under its own key, `notes.last`, apart from the list of notes. The SQLite store uses an `AUTOINCREMENT` column.

## Consequences

An id in an old Call record always points at the same note or at none. The counter must not be taken from the number of notes or the highest id in the list. The SQLite column must keep `AUTOINCREMENT`, because a plain row id can be given out again after a delete.

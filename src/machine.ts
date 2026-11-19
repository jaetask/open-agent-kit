// A minimal finite state machine: a transition table and one function to
// follow it. It stands in for machina's MachineDefinition until machina is
// published; the table is the part that carries over.

/** For each state, the events it accepts and the state each one leads to. */
export type MachineDefinition<State extends string, Event extends string> = {
  readonly initial: State;
  readonly states: { readonly [S in State]: { readonly [E in Event]?: State } };
};

/** The state that `event` leads to from `state`. Throws if the table has no such move. */
export function next<State extends string, Event extends string>(
  machine: MachineDefinition<State, Event>,
  state: State,
  event: Event,
): State {
  const to = machine.states[state][event];
  if (to === undefined) throw new Error(`${event} is not allowed in state ${state}`);
  return to;
}

/** A state with no way out. */
export function isFinal<State extends string, Event extends string>(
  machine: MachineDefinition<State, Event>,
  state: State,
): boolean {
  return Object.keys(machine.states[state]).length === 0;
}

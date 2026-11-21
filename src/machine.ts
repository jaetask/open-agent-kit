export type MachineDefinition<State extends string, Event extends string> = {
  readonly initial: State;
  readonly states: { readonly [S in State]: { readonly [E in Event]?: State } };
};

export function next<State extends string, Event extends string>(
  machine: MachineDefinition<State, Event>,
  state: State,
  event: Event,
): State {
  const to = machine.states[state][event];
  if (to === undefined) throw new Error(`${event} is not allowed in state ${state}`);
  return to;
}

export function isFinal<State extends string, Event extends string>(
  machine: MachineDefinition<State, Event>,
  state: State,
): boolean {
  return Object.keys(machine.states[state]).length === 0;
}

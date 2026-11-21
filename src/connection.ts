import type { Effect } from "./action.js";
import type { Principal } from "./call.js";
import type { MachineDefinition } from "./machine.js";

export type Credentials = { token: string };

export interface Identity {
  authenticate(credentials: Credentials): Promise<Principal | null>;
}

export type ConnectionState = "pairing" | "connected" | "revoked";
export type ConnectionEvent = "APPROVE" | "REVOKE";

export const CONNECTION_MACHINE: MachineDefinition<ConnectionState, ConnectionEvent> = {
  initial: "pairing",
  states: {
    pairing: { APPROVE: "connected", REVOKE: "revoked" },
    connected: { REVOKE: "revoked" },
    revoked: {},
  },
};

export type Connection = {
  id: string;
  host: string;
  principal: Principal;
  effects: Effect[];
  state: ConnectionState;
};

export interface Connections extends Identity {
  request(host: string, principal: Principal, effects: Effect[]): Promise<Connection>;
  approve(id: string, as?: { principal?: Principal; effects?: Effect[] }): Promise<string>;
  revoke(id: string): Promise<void>;
  get(id: string): Promise<Connection | undefined>;
  find(credentials: Credentials): Promise<Connection | null>;
  pair(
    host: string,
    principal: Principal,
    effects: Effect[],
  ): Promise<{ connection: Connection; claim: string } | null>;
  claim(id: string, claim: string): Promise<string | "waiting" | null>;
  list(): Promise<Connection[]>;
}

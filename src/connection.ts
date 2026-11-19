import type { Effect } from "./action.js";
import type { Principal } from "./call.js";
import type { MachineDefinition } from "./machine.js";

/** What a caller presents to prove who it is. */
export type Credentials = { token: string };

/** Turns credentials into a Principal, or null. */
export interface Identity {
  authenticate(credentials: Credentials): Promise<Principal | null>;
}

export type ConnectionState = "pairing" | "connected" | "revoked";
export type ConnectionEvent = "APPROVE" | "REVOKE";

/** The life of a Connection, as kept by the App that owns the Actions. */
export const CONNECTION_MACHINE: MachineDefinition<ConnectionState, ConnectionEvent> = {
  initial: "pairing",
  states: {
    pairing: { APPROVE: "connected", REVOKE: "revoked" },
    connected: { REVOKE: "revoked" },
    revoked: {},
  },
};

/**
 * A link from a Host to this App, as this App keeps it: who it acts as, and
 * which Effects its Calls may have. With `danger` in `effects`, the person
 * has let the Host decide Holds: a danger Call that brings the Host's yes
 * runs here without asking again.
 */
export type Connection = {
  id: string;
  /** The Host's name, as the person saw it when pairing. */
  host: string;
  principal: Principal;
  effects: Effect[];
  state: ConnectionState;
};

/**
 * Connections and their bearer tokens. A token is stored only as a hash and
 * shown once, when the person approves the pairing.
 */
export interface Connections extends Identity {
  /** A Host asks to connect. The Connection waits in `pairing`. */
  request(host: string, principal: Principal, effects: Effect[]): Promise<Connection>;
  /** The person approved: the Connection is `connected`; returns its token. */
  approve(id: string): Promise<string>;
  revoke(id: string): Promise<void>;
  get(id: string): Promise<Connection | undefined>;
  /** The connected Connection a token belongs to, or null. */
  find(credentials: Credentials): Promise<Connection | null>;
}

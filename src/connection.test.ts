// Connections through their public interface, on SQLite.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { sqliteConnections } from "./sqlite.js";

test("a token works only while its Connection is connected", async () => {
  const connections = sqliteConnections(new DatabaseSync(":memory:"));
  const pairing = await connections.request("talk", { id: "p1" }, ["read"]);
  assert.equal(pairing.state, "pairing");
  const token = await connections.approve(pairing.id);
  assert.deepEqual(await connections.authenticate({ token }), { id: "p1" });
  await connections.revoke(pairing.id);
  assert.equal(await connections.authenticate({ token }), null);
  assert.equal(await connections.find({ token }), null);
});

test("a Connection is approved once, and a revoked one stays revoked", async () => {
  const connections = sqliteConnections(new DatabaseSync(":memory:"));
  const { id } = await connections.request("talk", { id: "p1" }, ["read"]);
  await connections.approve(id);
  await assert.rejects(connections.approve(id), /APPROVE is not allowed in state connected/);
  await connections.revoke(id);
  await assert.rejects(connections.approve(id), /APPROVE is not allowed in state revoked/);
});

test("only a hash of the token is stored", async () => {
  const db = new DatabaseSync(":memory:");
  const connections = sqliteConnections(db);
  const { id } = await connections.request("talk", { id: "p1" }, ["read"]);
  const token = await connections.approve(id);
  const dump = JSON.stringify(db.prepare("SELECT * FROM kit_connections").all());
  assert.ok(!dump.includes(token));
});

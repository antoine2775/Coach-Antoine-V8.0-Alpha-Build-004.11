import test from "node:test";
import assert from "node:assert/strict";
import { createWorkoutId } from "../src/utils/workoutId.js";

test("PC : conserver randomUUID lorsqu'il est disponible", () => {
  assert.equal(createWorkoutId({ randomUUID: () => "native-session", getRandomValues() { throw Error("unused"); } }), "native-session");
});

test("HTTP/mobile sans randomUUID : produire un identifiant avec getRandomValues", () => {
  let sequence = 0;
  const crypto = { getRandomValues(bytes) { bytes.fill(++sequence); return bytes; } };
  const first = createWorkoutId(crypto), second = createWorkoutId(crypto);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
});

test("environnement sans Web Crypto : ne pas bloquer la sélection, identifiants distincts", () => {
  const ids = Array.from({ length: 50 }, () => createWorkoutId(null));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
});

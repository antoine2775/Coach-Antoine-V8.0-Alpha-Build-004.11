import test from "node:test";
import assert from "node:assert/strict";
import { COUNTDOWN_PROTOTYPE, playCountdownPrototype } from "../src/utils/countdownPrototype.js";
import { createVibraphonePlayer } from "../src/utils/vibraphone.js";

function audio({ suspended = false } = {}) {
  const notes = [], gains = [];
  let instance;
  class Context {
    constructor() { instance = this; this.state = suspended ? "suspended" : "running"; this.currentTime = 10; this.destination = {}; this.closed = 0; this.resumed = 0; }
    resume() { this.resumed++; return Promise.resolve(); }
    close() { this.closed++; return Promise.resolve(); }
    createOscillator() {
      const node = { frequency: { setValueAtTime(value) { node.hz = value; } }, connect() {}, disconnect() {}, start(time) { node.startTime = time; }, stop(time) { node.endTime = time; } };
      notes.push(node); return node;
    }
    createGain() {
      const events = [];
      gains.push(events);
      return { connect() {}, disconnect() {}, gain: {
        setValueAtTime: (...args) => events.push(["set", ...args]),
        linearRampToValueAtTime: (...args) => events.push(["attack", ...args]),
        exponentialRampToValueAtTime: (...args) => events.push(["decay", ...args]),
      } };
    }
  }
  return { Context, notes, gains, get instance() { return instance; } };
}

test("prototype : trois notes identiques espacées d'une seconde, enveloppe courte et fermeture", async () => {
  const fake = audio();
  const playback = playCountdownPrototype({ AudioContext: fake.Context });
  await Promise.resolve();
  assert.equal(fake.notes.length, 6);
  const fundamentals = fake.notes.filter((note) => note.hz === COUNTDOWN_PROTOTYPE.frequency);
  assert.equal(fundamentals.length, 3);
  for (let index = 0; index < 3; index++) {
    assert.equal(fundamentals[index].hz, 277);
    assert.equal(fundamentals[index].startTime, 10.03 + index);
    assert.ok(Math.abs(fundamentals[index].endTime - fundamentals[index].startTime - 0.50) < 1e-10);
    assert.equal(fake.notes[index * 2 + 1].hz, 1108);
    assert.ok(Math.abs(fake.notes[index * 2 + 1].endTime - fundamentals[index].startTime - 0.25) < 1e-10);
    assert.equal(fake.gains[index * 2][1][1], 0.26);
  }
  fundamentals[2].onended();
  assert.equal(await playback.finished, true);
  assert.equal(fake.instance.closed, 1);
});

test("prototype : réveil immédiat du contexte Safari et compatibilité webkit", async () => {
  const fake = audio({ suspended: true });
  const playback = playCountdownPrototype({ webkitAudioContext: fake.Context });
  assert.equal(fake.instance.resumed, 1);
  await Promise.resolve();
  assert.equal(fake.notes.length, 6);
  playback.stop();
  assert.equal(await playback.finished, false);
  assert.equal(fake.instance.closed, 1);
});

test("prototype : quitter avant le réveil annule les notes et libère le contexte", async () => {
  const fake = audio({ suspended: true });
  const playback = playCountdownPrototype({ AudioContext: fake.Context });
  playback.stop();
  await Promise.resolve();
  assert.equal(fake.notes.length, 0);
  assert.equal(await playback.finished, false);
  playback.stop();
  assert.equal(fake.instance.closed, 1);
});

test("prototype : API indisponible signalée sans exception", async () => {
  assert.equal(await playCountdownPrototype({}).finished, false);
});

test("séance : contexte débloqué sans son puis une seule note validée à chaque appel", () => {
  const fake = audio();
  const player = createVibraphonePlayer({ AudioContext: fake.Context });
  player.play(); assert.equal(fake.notes.length, 0);
  player.unlock(); assert.equal(fake.notes.length, 0);
  for (let index = 0; index < 3; index++) {
    fake.instance.currentTime = 10 + index;
    player.play();
    assert.equal(fake.notes[index * 2].hz, 277);
    assert.equal(fake.notes[index * 2 + 1].hz, 1108);
    assert.equal(fake.notes[index * 2].startTime, 10 + index);
    assert.equal(fake.notes[index * 2].endTime, 10.5 + index);
    assert.equal(fake.notes[index * 2 + 1].endTime, 10.25 + index);
    assert.deepEqual(fake.gains[index * 2], [["set", 0.0001, 10 + index], ["attack", 0.26, 10.008 + index], ["decay", 0.0001, 10.5 + index]]);
    assert.equal(fake.gains[index * 2 + 1][1][1], 0.26 * 0.12);
  }
  assert.equal(fake.notes.length, 6);
  player.close(); assert.equal(fake.instance.closed, 1);
  player.play(); assert.equal(fake.notes.length, 6);
});

test("séance : Safari réveillé sur appui, pas de note différée pendant la suspension", async () => {
  const fake = audio({ suspended: true });
  const player = createVibraphonePlayer({ webkitAudioContext: fake.Context });
  player.unlock(); assert.equal(fake.instance.resumed, 1);
  player.play(); await Promise.resolve();
  assert.equal(fake.notes.length, 0);
  fake.instance.state = "running";
  player.play(); assert.equal(fake.notes.length, 2);
  player.close();
});

test("séance : création sans navigateur ni API audio sans erreur", () => {
  const player = createVibraphonePlayer();
  player.unlock(); player.play(); player.close();
});

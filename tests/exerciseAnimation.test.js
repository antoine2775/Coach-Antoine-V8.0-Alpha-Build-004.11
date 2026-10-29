import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import vm from "node:vm";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSync } from "esbuild";
import { workoutSteps } from "../src/data.js";
import { EXERCISE_MOTIONS } from "../src/workout/exerciseMotions.js";

const require = createRequire(import.meta.url);
const code = buildSync({ entryPoints: ["src/components/ExerciseAnimation.jsx"], bundle: true,
  write: false, platform: "node", format: "cjs", external: ["react"],
}).outputFiles[0].text;
const module = { exports: {} };
vm.runInNewContext(code, { module, require });

for (const exercise of workoutSteps) {
  test(`animation et démonstration communes : ${exercise.id}`, () => {
    assert.ok(EXERCISE_MOTIONS[exercise.id].frames.length >= 2);
    for (const frame of EXERCISE_MOTIONS[exercise.id].frames) {
      for (const point of Object.values(frame)) assert.ok(point.every(Number.isFinite));
    }
    const running = renderToStaticMarkup(React.createElement(module.exports.default, { exercise }));
    assert.ok(running.includes('<svg'));
    assert.ok(running.includes('<animate'));
    assert.ok(running.includes('repeatCount="indefinite"'));
    const paused = renderToStaticMarkup(React.createElement(module.exports.default, { exercise, playing: false }));
    assert.ok(paused.includes('<svg'));
    assert.ok(!paused.includes('<animate'));
  });
}

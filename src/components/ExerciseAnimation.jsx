import React from "react";
import { EXERCISE_MOTIONS } from "../workout/exerciseMotions.js";

const paths = ["neck,hip", "neck,leftElbow,leftHand", "neck,rightElbow,rightHand", "hip,leftKnee,leftFoot", "hip,rightKnee,rightFoot"];
export default function ExerciseAnimation({ exercise, playing = true }) {
  const motion = EXERCISE_MOTIONS[exercise.id];
  if (!motion) return null;
  const frames = [...motion.frames, motion.frames[0]];
  const animate = (attributeName, values) => playing && <animate attributeName={attributeName} values={values.join(";")} dur="6s" repeatCount="indefinite" />;
  return <svg className="exercise-animation" viewBox="0 0 200 165" role="img" aria-label={`Mouvement : ${exercise.name}`}>
    <path d="M25 153 H178" className="exercise-floor" />
    {motion.chair && <path d="M65 112 H137 M75 112 V151 M130 112 V151 M137 112 V75" className="exercise-prop" />}
    {motion.wall && <path d="M172 20 V153" className="exercise-prop" />}
    <g className="exercise-figure">
      <circle cx={frames[0].head[0]} cy={frames[0].head[1]} r="10">
        {animate("cx", frames.map((frame) => frame.head[0]))}
        {animate("cy", frames.map((frame) => frame.head[1]))}
      </circle>
      {paths.map((path) => {
        const points = frames.map((frame) => path.split(",").map((joint) => frame[joint].join(",")).join(" "));
        return <polyline key={path} points={points[0]}>{animate("points", points)}</polyline>;
      })}
    </g>
  </svg>;
}

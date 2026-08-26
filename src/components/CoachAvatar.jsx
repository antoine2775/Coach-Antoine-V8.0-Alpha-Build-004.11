import React from "react";

const COACH_IMAGES = {
  start: "/coach/coach-start.png",
  active: "/coach/coach-active.png",
  finish: "/coach/coach-finish.png",
};

export default function CoachAvatar({
  phase = "start",
  size = 180,
  alt = "Coach Antoine",
}) {
  const image = COACH_IMAGES[phase] || COACH_IMAGES.start;

  return (
    <div
      className="coach-avatar-v65"
      style={{
        width: size,
        height: size,
        borderRadius: "28%",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        src={image}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: "cover",
          objectPosition: "50% 20%",
        }}
      />
    </div>
  );
}

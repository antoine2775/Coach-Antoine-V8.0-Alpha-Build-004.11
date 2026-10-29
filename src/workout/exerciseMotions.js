// Schémas articulés : une même séquence sert à l'exercice et à sa démonstration.
const standing = { head: [100, 28], neck: [100, 43], hip: [100, 96],
  leftElbow: [80, 65], leftHand: [78, 90], rightElbow: [120, 65], rightHand: [122, 90],
  leftKnee: [88, 121], leftFoot: [85, 151], rightKnee: [112, 121], rightFoot: [115, 151] };
const pose = (changes = {}) => ({ ...standing, ...changes });
const seated = pose({ head: [100, 48], neck: [100, 63], hip: [100, 111],
  leftElbow: [83, 88], leftHand: [75, 108], rightElbow: [118, 88], rightHand: [126, 108],
  leftKnee: [68, 112], leftFoot: [68, 151], rightKnee: [132, 112], rightFoot: [132, 151] });
const lifted = Object.fromEntries(Object.entries(standing).map(([name, [x, y]]) => [name, [x, y - (name.endsWith("Foot") ? 0 : 8)]]));
export const EXERCISE_MOTIONS = Object.freeze({
  "mobilite-epaules": { frames: [pose(), pose({ leftElbow: [66, 48], leftHand: [75, 27], rightElbow: [134, 48], rightHand: [125, 27] }), pose({ leftElbow: [69, 76], leftHand: [57, 58], rightElbow: [131, 76], rightHand: [143, 58] })] },
  "marche-active": { frames: [pose({ leftKnee: [73, 102], leftFoot: [68, 123], rightHand: [127, 49] }), pose({ rightKnee: [127, 102], rightFoot: [132, 123], leftHand: [73, 49] })] },
  "assis-debout-chaise": { chair: true, frames: [seated, pose()] },
  "pompes-mur": { wall: true, frames: [pose({ head: [124, 28], neck: [120, 43], hip: [105, 96], rightElbow: [144, 54], rightHand: [170, 48], leftElbow: [145, 65], leftHand: [170, 60] }), pose({ head: [150, 34], neck: [144, 49], hip: [114, 96], rightElbow: [147, 66], rightHand: [170, 48], leftElbow: [148, 78], leftHand: [170, 60] })] },
  "pas-lateraux": { frames: [pose({ leftFoot: [58, 151], leftKnee: [72, 121], leftHand: [65, 74] }), pose(), pose({ rightFoot: [142, 151], rightKnee: [128, 121], rightHand: [135, 74] })] },
  "equilibre": { frames: [pose({ rightKnee: [125, 105], rightFoot: [108, 119] }), pose(), pose({ leftKnee: [75, 105], leftFoot: [92, 119] })] },
  "extension-jambes-assis": { chair: true, frames: [seated, { ...seated, leftFoot: [38, 112] }, seated, { ...seated, rightFoot: [162, 112] }] },
  "montees-pointe-pieds": { frames: [pose(), lifted] },
  "rotations-buste": { frames: [pose({ leftElbow: [73, 63], leftHand: [95, 65], rightElbow: [118, 63], rightHand: [95, 65] }), pose({ leftElbow: [82, 63], leftHand: [105, 65], rightElbow: [127, 63], rightHand: [105, 65] })] },
  "ouverture-poitrine": { frames: [pose({ leftElbow: [84, 63], leftHand: [98, 65], rightElbow: [116, 63], rightHand: [102, 65] }), pose({ leftElbow: [69, 55], leftHand: [50, 69], rightElbow: [131, 55], rightHand: [150, 69] })] },
  "etirement-mollets": { frames: [pose({ head: [119, 28], neck: [115, 43], hip: [108, 96], leftKnee: [85, 118], leftFoot: [56, 151], rightKnee: [130, 121], rightFoot: [130, 151] }), pose({ head: [81, 28], neck: [85, 43], hip: [92, 96], rightKnee: [115, 118], rightFoot: [144, 151], leftKnee: [70, 121], leftFoot: [70, 151] })] },
  "respiration-grandissement": { frames: [pose(), pose({ head: [100, 23], neck: [100, 38], leftElbow: [77, 33], leftHand: [83, 9], rightElbow: [123, 33], rightHand: [117, 9] })] },
});

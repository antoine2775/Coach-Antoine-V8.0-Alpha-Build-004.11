const K="coachAntoineBrainV1";const D={lastPhraseByCategory:{},lastPhraseGlobal:"",lastVisitAt:null,lastWorkoutAt:null,sessionCount:0,lastSpokenAt:0,silenceUntil:0};
export function loadCoachMemory(){try{return {...D,...JSON.parse(localStorage.getItem(K)||"{}")}}catch{return {...D}}}
export function saveCoachMemory(m){localStorage.setItem(K,JSON.stringify(m))}
export function updateCoachMemory(p){const n={...loadCoachMemory(),...p};saveCoachMemory(n);return n}
export function rememberPhrase(c,p){const m=loadCoachMemory();m.lastPhraseByCategory={...m.lastPhraseByCategory,[c]:p};m.lastPhraseGlobal=p;saveCoachMemory(m)}
export function markVisit(){updateCoachMemory({lastVisitAt:new Date().toISOString()})}
export function markWorkoutComplete(){const m=loadCoachMemory();updateCoachMemory({lastWorkoutAt:new Date().toISOString(),sessionCount:Number(m.sessionCount||0)+1})}
export function daysSince(v){if(!v)return null;return Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/86400000))}
export function resetCoachMemory(){localStorage.removeItem(K)}
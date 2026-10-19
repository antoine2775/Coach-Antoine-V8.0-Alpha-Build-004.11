import React, { useMemo, useState } from "react";
import CoachPresence from "../components/CoachPresence";
import CoachBubble from "../components/CoachBubble";
import { listCoachCategories, listPhraseEntries, getCoachPhrase } from "../coach";
import { useUserProfile } from "../context/UserProfileContext";
import { PREVIEW_CONTEXTS } from "../coach/previewContexts.js";
import { playRiff } from "../utils/sound";

export default function Garage() {
  const { profile } = useUserProfile();
  const cats = useMemo(() => listCoachCategories(), []);
  const [cat, setCat] = useState(cats[0]);
  const [addressMode, setAddressMode] = useState(profile?.addressMode || "tu");
  const [sex, setSex] = useState(profile?.sex || "male");
  const [firstName, setFirstName] = useState(profile?.firstName || "");
  const [scenario, setScenario] = useState(0);
  const [msg, setMsg] = useState("Bienvenue dans le Garage du Coach.");
  const previewProfile = { ...profile, addressMode, sex, firstName };
  const phrases = listPhraseEntries(cat, previewProfile);
  const select = (force) => setMsg(getCoachPhrase(cat, { profile: previewProfile, context: PREVIEW_CONTEXTS[scenario].context, preview: true, force }));
  return <>
    <header className="page-header"><p className="eyebrow">MODE DÉVELOPPEUR</p><h1>Le Garage du Coach</h1><p>Notre atelier pour vérifier les phrases et le son.</p></header>
    <section className="garage-stage"><CoachPresence size={190} /><CoachBubble message={msg} visible={Boolean(msg)} onClose={() => setMsg("")} /></section>
    <section className="card"><h2>Tester une catégorie</h2>
      <label className="field"><span>Catégorie</span><select value={cat} onChange={e => { setCat(e.target.value); setMsg(""); }}>{cats.map(x => <option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Mode d’adresse</span><select value={addressMode} onChange={e => { setAddressMode(e.target.value); setMsg(""); }}><option value="tu">Tutoiement</option><option value="vous">Vouvoiement</option></select></label>
      <label className="field"><span>Accord grammatical</span><select value={sex} onChange={e => { setSex(e.target.value); setMsg(""); }}><option value="male">Homme</option><option value="female">Femme</option></select></label>
      <label className="field"><span>Prénom de prévisualisation</span><input value={firstName} onChange={e => { setFirstName(e.target.value); setMsg(""); }} /></label>
      <label className="field"><span>Contexte de prévisualisation</span><select value={scenario} onChange={e => { setScenario(Number(e.target.value)); setMsg(""); }}>{PREVIEW_CONTEXTS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}</select></label>
      <p>Prévisualisation sans modification du profil ni de la mémoire du pratiquant.</p>
      <button className="primary-button" onClick={() => select(true)}>Afficher une phrase</button>
      <button className="secondary-button" onClick={() => select(false)}>Tester la sélection avec silence possible</button>
      {!msg && <p role="status">Aucune phrase affichée.</p>}
    </section>
    <section className="card"><h2>Phrases de la catégorie</h2><div className="garage-phrases">{phrases.map(p => <button className="garage-phrase" key={p.id} disabled={!p.text} onClick={() => setMsg(p.text)}><small>{p.id} · {p.frequency}</small><br />{p.text || p.tu}</button>)}</div></section>
    <section className="card"><h2>Outils</h2><div className="garage-tools"><button className="secondary-button" onClick={() => playRiff("start")}>🎸 Tester le riff</button></div></section>
  </>;
}

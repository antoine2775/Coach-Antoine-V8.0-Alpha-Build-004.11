import { lireEtat, enregistrerEtat, decisionPour, resumeLot, exporterLot, importerValidationsUtilisateur } from './etat.js';

const libelles = { valide: 'Validé', a_corriger: 'À corriger', non_examine: 'Non examiné' };
const variantes = { tu: 'Tutoiement', vous: 'Vouvoiement', commun: 'Commune · tu et vous' };

function telechargerJSON(document, data, nom) {
  const vue = document.defaultView;
  const blob = new vue.Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = vue.URL.createObjectURL(blob), lien = document.createElement('a');
  lien.href = url; lien.download = nom; document.body.append(lien); lien.click(); lien.remove();
  vue.setTimeout(() => vue.URL.revokeObjectURL(url), 1000);
}

export async function demarrer({ document = globalThis.document, storage, fetchImpl = globalThis.fetch,
  telecharger = (data, nom) => telechargerJSON(document, data, nom), maintenant = () => new Date() } = {}) {
  const $ = id => document.getElementById(id), vue = document.defaultView;
  try { storage ??= vue.localStorage; } catch { storage = null; }
  const charge = lireEtat(storage);
  let etat = charge.etat, lot, index = 0, idActuel = null, lectureTicket = 0;
  const audio = $('lecteur');
  const alerte = message => { $('erreur').hidden = !message; $('erreur').textContent = message || ''; };
  if (charge.erreur) alerte(charge.erreur);
  const sauvegarder = () => {
    const erreur = enregistrerEtat(storage, etat);
    $('stockage').textContent = erreur || 'Décisions enregistrées dans ce navigateur, sur cette adresse. Exportez le bilan pour le transmettre.';
    $('stockage').classList.toggle('avertissement', Boolean(erreur));
    return erreur;
  };
  const arreterAudio = () => {
    lectureTicket++;
    audio.onerror = null;
    audio.pause(); audio.removeAttribute('src'); audio.load();
  };
  vue.addEventListener('pagehide', arreterAudio);
  let inventaire;
  try {
    const response = await fetchImpl('/api/inventaire', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    inventaire = await response.json();
    if (!inventaire.lots?.length) throw new Error();
  } catch {
    alerte('Impossible de charger l’inventaire local. Vérifiez que le serveur est lancé, puis rechargez la page.');
    return { dispose: () => { arreterAudio(); vue.removeEventListener('pagehide', arreterAudio); } };
  }

  importerValidationsUtilisateur(etat, inventaire);
  if (inventaire.erreursValidation?.length) alerte(inventaire.erreursValidation.join(' '));

  const libelleStatut = statut => lot.type === 'essais' ? ({ valide: 'Validé pour réutilisation', a_corriger: 'À refaire', non_examine: 'Non examiné' })[statut] : libelles[statut];
  function listeEtResume() {
    const resume = resumeLot(etat, lot);
    $('resume').textContent = `${resume.valides} validé(s) · ${resume.aCorriger} à corriger · ${resume.nonExamines} non examiné(s)`;
    $('liste').replaceChildren();
    for (const [i, fichier] of lot.fichiers.entries()) {
      const ligne = document.createElement('li'), bouton = document.createElement('button');
      bouton.type = 'button'; bouton.className = 'ligne'; bouton.setAttribute('aria-current', String(i === index));
      const titre = document.createElement('span');
      titre.textContent = `${fichier.numero}. ${fichier.identifiantAudio.replace(/^inscription-/, '')}`;
      const sousTitre = document.createElement('small');
      sousTitre.textContent = `${variantes[fichier.variante]}${fichier.disponible ? '' : ' · MP3 absent'}`;
      const statut = document.createElement('small'); statut.className = 'statut';
      statut.textContent = libelleStatut(decisionPour(etat, fichier).statut);
      bouton.append(titre, sousTitre, statut); bouton.addEventListener('click', () => ouvrir(i, true));
      ligne.append(bouton); $('liste').append(ligne);
    }
  }

  function ouvrir(position, focaliser = false) {
    if (!Number.isInteger(position) || position < 0 || position >= lot.fichiers.length) return;
    const fichier = lot.fichiers[position];
    if (idActuel === fichier.idDecision) return;
    arreterAudio(); index = position; idActuel = fichier.idDecision;
    etat.dernierLot = lot.id; etat.curseurs[lot.id] = fichier.idDecision;
    $('position').textContent = `${lot.type === 'essais' ? 'Anciens essais' : lot.type === 'corrections' ? (lot.libelle ?? 'Corrections · R02 à valider') : 'Lot ' + lot.id} · dialogue ${index + 1} sur ${lot.fichiers.length} · entrée ${fichier.numero}`;
    $('titre-dialogue').textContent = fichier.identifiantAudio;
    $('variante').textContent = variantes[fichier.variante];
    $('texte').textContent = fichier.texte;
    $('nom-fichier').textContent = fichier.nomFichier;
    $('decision').disabled = !fichier.disponible;
    $('remarque').disabled = !fichier.disponible;
    $('reecouter').disabled = !fichier.disponible;
    $('etat-audio').textContent = fichier.disponible ? 'Lecture manuelle · utilisez les commandes du lecteur.' : 'MP3 absent : aucune décision possible.';
    if (fichier.disponible) {
      audio.src = fichier.urlAudio;
      const ticket = lectureTicket;
      audio.onerror = () => {
        if (lectureTicket === ticket) $('etat-audio').textContent = 'Lecture impossible. Vérifiez le fichier et rechargez la page. Aucune lecture de remplacement.';
      };
    }
    const decision = decisionPour(etat, fichier);
    for (const radio of document.querySelectorAll('input[name="statut"]')) radio.checked = radio.value === decision.statut;
    $('remarque').value = decision.remarque;
    $('precedent').disabled = index === 0;
    $('suivant').disabled = index === lot.fichiers.length - 1;
    listeEtResume(); sauvegarder();
    if (focaliser) $('titre-dialogue').focus();
  }

  function choisirLot(id) {
    const suivant = inventaire.lots.find(l => l.id === id);
    if (!suivant) return;
    arreterAudio(); idActuel = null; lot = suivant; $('lot').value = id;
    for (const radio of document.querySelectorAll('input[name="statut"]')) radio.nextSibling.textContent = ' ' + libelleStatut(radio.value);
    if (!lot.fichiers.length) {
      etat.dernierLot = lot.id;
      $('position').textContent = 'Lot ' + lot.id;
      $('titre-dialogue').textContent = 'Réserve — aucun fichier';
      for (const id of ['variante', 'texte', 'nom-fichier', 'etat-audio']) $(id).textContent = '';
      for (const id of ['decision', 'remarque', 'reecouter', 'precedent', 'suivant']) $(id).disabled = true;
      $('remarque').value = '';
      for (const radio of document.querySelectorAll('input[name="statut"]')) radio.checked = false;
      listeEtResume(); sauvegarder(); return;
    }
    const reprise = lot.fichiers.findIndex(f => f.idDecision === etat.curseurs[id]);
    ouvrir(Math.max(0, reprise));
  }

  function modifierDecision(statut) {
    const fichier = lot.fichiers[index];
    if (!fichier?.disponible) return;
    etat.decisions[fichier.idDecision] = { ...decisionPour(etat, fichier),
      ...(statut ? { statut } : {}), remarque: $('remarque').value, modifieLe: maintenant().toISOString() };
    listeEtResume(); sauvegarder();
  }

  for (const radio of document.querySelectorAll('input[name="statut"]')) radio.addEventListener('change', () => {
    if (radio.checked) modifierDecision(radio.value);
  });
  $('remarque').addEventListener('input', () => modifierDecision());
  $('precedent').addEventListener('click', () => ouvrir(index - 1, true));
  $('suivant').addEventListener('click', () => ouvrir(index + 1, true));
  $('reecouter').addEventListener('click', async () => {
    const fichier = lot.fichiers[index], ticket = lectureTicket;
    if (!fichier?.disponible) return;
    try { audio.currentTime = 0; await audio.play(); }
    catch { if (ticket === lectureTicket) $('etat-audio').textContent = 'Lecture refusée par le navigateur. Essayez les commandes du lecteur.'; }
  });
  $('exporter').addEventListener('click', () => {
    const data = exporterLot(etat, lot, maintenant());
    telecharger(data, `validation-coach-antoine-lot-${lot.id}-${data.exporteLe.slice(0, 10)}.json`);
  });
  $('lot').replaceChildren(...inventaire.lots.map(l => {
    const option = document.createElement('option'); option.value = l.id;
    option.textContent = l.type === 'corrections' ? l.libelle : l.type === 'essais' ? 'Anciens essais · 2 fichiers · décisions de réutilisation séparées' : l.fichiers.length === 0 ? `Lot ${l.id} · Réserve — aucun fichier` : `Lot ${l.id} · ${l.fichiers.length} fichiers · ${l.fichiers.filter(f => f.disponible).length} présents`;
    return option;
  }));
  $('lot').disabled = false; $('exporter').disabled = false;
  $('lot').addEventListener('change', () => choisirLot($('lot').value));
  choisirLot(inventaire.lots.some(l => l.id === etat.dernierLot) ? etat.dernierLot : inventaire.lotParDefaut);
  return { exporter: () => exporterLot(etat, lot, maintenant()),
    dispose: () => { arreterAudio(); vue.removeEventListener('pagehide', arreterAudio); } };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') demarrer();

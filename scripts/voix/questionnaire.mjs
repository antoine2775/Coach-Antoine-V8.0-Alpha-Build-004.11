import { EARLY_MESSAGES } from '../../src/onboarding/earlyMessages.js';
import { ASSESSMENT_MESSAGES } from '../../src/onboarding/assessmentMessages.js';
import { COMPLETION_MESSAGES } from '../../src/onboarding/completionMessages.js';
import { QUESTIONS } from '../../src/onboarding/questions.js';
import { LEVEL_LABELS } from '../../src/onboarding/assessmentSteps.js';

// Références aux dialogues existants : aucun texte de dialogue recopié.
export function listerQuestionnaire() {
  const entrees = [];
  function ajouter(identifiantAudio, source, lire) {
    const tu = lire('tu'), vous = lire('vous');
    if ([tu, vous].some(texte => typeof texte !== 'string' || !texte || /\[Prénom\]/u.test(texte))) {
      throw new Error('Une formulation fixe est invalide ou contient un prénom.');
    }
    const variantes = tu === vous ? [['commun', tu]] : [['tu', tu], ['vous', vous]];
    for (const [adresse, texte] of variantes) entrees.push(Object.freeze({
      identifiantAudio, adresse, genre: 'hf', revision: 'r01', source, texte,
      nomFichier: `${identifiantAudio}--${adresse}--hf--r01.mp3`,
    }));
  }
  const debut = (id, cle, index) => ajouter(`inscription-${id}`, `src/onboarding/earlyMessages.js : ${cle}${index === undefined ? '' : `[${index}]`}`,
    mode => index === undefined ? EARLY_MESSAGES[mode][cle] : EARLY_MESSAGES[mode][cle][index]);
  debut('explication-niveau-depart', 'explanation', 0);
  debut('explication-forme-du-jour', 'explanation', 1);
  debut('explication-seance-adaptee', 'explanation', 2);
  debut('question-sexe', 'sex');
  debut('question-prenom', 'firstName');
  debut('question-age', 'age');
  debut('mineur-remerciement', 'underage', 0);
  debut('mineur-condition-age', 'underage', 1);
  debut('mineur-retour-majorite', 'underage', 2);

  const bilan = (id, cle, index) => ajouter(`inscription-${id}`, `src/onboarding/assessmentMessages.js : ${cle}${index === undefined ? '' : `.${index}`}`,
    mode => index === undefined ? ASSESSMENT_MESSAGES[mode][cle] : ASSESSMENT_MESSAGES[mode][cle][index]);
  bilan('explication-securite', 'safety');
  bilan('question-materiel', 'equipment');
  bilan('bilan-presentation', 'introduction', 0);
  bilan('bilan-duree', 'introduction', 1);
  bilan('bilan-consigne-reponses', 'introduction', 2);
  bilan('niveau-accord', 'proposalDetails', 0);
  bilan('niveau-evolution', 'proposalDetails', 1);
  bilan('niveau-libre-decision', 'proposalDetails', 2);
  for (const [cle, nom] of [['reprise', 'reprise'], ['forme', 'equilibre'], ['tonique', 'tonique']]) {
    ajouter(`inscription-recommandation-niveau-${nom}`, `src/onboarding/assessmentMessages.js : proposal(${LEVEL_LABELS[cle]})`,
      mode => ASSESSMENT_MESSAGES[mode].proposal(LEVEL_LABELS[cle]));
    bilan(`description-niveau-${nom}`, 'levelDescriptions', cle);
    bilan(`niveau-${nom}-changement`, 'levelChange', cle);
  }
  bilan('question-niveau-manuel', 'manual');
  bilan('niveau-manuel-consigne', 'manualHint');

  const questions = {
    q1: 'escaliers', q2: 'assis-debout', q3: 'equilibre', q4: 'rotation-buste',
    q5: 'frequence-activite', q6: 'renforcement', q7: 'mobilite', q8: 'activite-passee', q9: 'duree-seance',
  };
  for (const question of QUESTIONS) {
    if (!questions[question.id]) throw new Error('Question sans identifiant audio validé.');
    ajouter(`inscription-question-${questions[question.id]}`, `src/onboarding/questions.js : ${question.id}`,
      mode => mode === 'tu' ? question.text : question.textVous);
  }

  const fin = (id, cle, index) => ajouter(`inscription-${id}`, `src/onboarding/completionMessages.js : ${cle}${index === undefined ? '' : `[${index}]`}`,
    mode => index === undefined ? COMPLETION_MESSAGES[mode][cle] : COMPLETION_MESSAGES[mode][cle][index]);
  fin('niveau-choisi', 'transition', 0);
  fin('experience-presentation', 'transition', 1);
  fin('experience-accompagnement', 'transition', 2);
  fin('question-experience', 'experience');
  fin('question-programme-actuel', 'currentQuestion');
  fin('question-arret-programme', 'reason');
  fin('reaction-experience', 'reaction');
  for (const [index, nom] of [[1, 'seances-adaptees'], [2, 'profil-evolutif'], [3, 'premiere-seance']]) {
    ajouter(`inscription-conclusion-${nom}`, `src/onboarding/completionMessages.js : conclusion()[${index}]`,
      mode => COMPLETION_MESSAGES[mode].conclusion('')[index]);
  }
  if (new Set(entrees.map(e => e.nomFichier)).size !== entrees.length) throw new Error('Collision de noms audio.');
  if (new Set(entrees.map(e => e.texte)).size !== entrees.length) throw new Error('Doublon textuel à arbitrer avant génération.');
  return Object.freeze(entrees);
}

export function selectionnerEssai(entrees = listerQuestionnaire()) {
  return [
    ['inscription-question-escaliers', 'tu'],
    ['inscription-explication-seance-adaptee', 'tu'],
    ['inscription-description-niveau-reprise', 'commun'],
    ['inscription-reaction-experience', 'tu'],
  ].map(([id, adresse]) => {
    const entree = entrees.find(e => e.identifiantAudio === id && e.adresse === adresse);
    if (!entree) throw new Error('Formulation d’essai introuvable.');
    return entree;
  });
}

// Décisions V1 : l'inventaire source reste complet, sans changer l'interface.
export const EXCLUSIONS_V1 = Object.freeze([
  'inscription-mineur-condition-age--commun--hf--r01.mp3',
  'inscription-niveau-manuel-consigne--tu--hf--r01.mp3',
  'inscription-niveau-manuel-consigne--vous--hf--r01.mp3',
]);

export function selectionnerV1(entrees = listerQuestionnaire()) {
  return Object.freeze(entrees.filter(e => !EXCLUSIONS_V1.includes(e.nomFichier)));
}

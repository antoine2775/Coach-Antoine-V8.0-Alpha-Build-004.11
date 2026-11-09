import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectionnerV1, EXCLUSIONS_V1 } from './questionnaire.mjs';

const racine = fileURLToPath(new URL('../../', import.meta.url));
export const SORTIE_V1 = join(racine, 'public/audio/voix/inscription');
export const TAILLE_LOT = 10;
export const MAX_FICHIERS_LOT = 25;
export const REUTILISATION_REPRISE = Object.freeze({
  nomFichier: 'inscription-description-niveau-reprise--commun--hf--r01.mp3',
  cheminSource: join(racine, 'essais-audio/coach-antoine-questionnaire/inscription-description-niveau-reprise--commun--hf--r01.mp3'),
  // Version validée à l'écoute par l'utilisateur et contrôlée localement (code 0).
  sha256Attendu: 'b545f842934e2bc120294a54d6a6c7cb9a78210d7f98387dacbb1fb1797126cc',
});
export const REUTILISATION_ESCALIERS = Object.freeze({
  nomFichier: 'inscription-question-escaliers--tu--hf--r01.mp3',
  cheminSource: join(racine, 'essais-audio/coach-antoine-questionnaire/inscription-question-escaliers--tu--hf--r01.mp3'),
  // Écoute validée par l'utilisateur ; contrôle technique local code 0.
  sha256Attendu: 'e3f57f6abb80d28fe19a75d0f2b4abaf12b7b1f852b07a1549c661ed54906cb5',
});
export const REUTILISATION_REACTION = Object.freeze({
  nomFichier: 'inscription-reaction-experience--tu--hf--r01.mp3',
  cheminSource: join(racine, 'essais-audio/coach-antoine-questionnaire/inscription-reaction-experience--tu--hf--r01.mp3'),
  // Écoute approuvée ; décodage et contrôle acoustique locaux réussis (code 0).
  sha256Attendu: '0e412dcf1b6a167713fb21d234f7ca5db240aff3fa08bbb69d2ec8c097162d70',
});
const reutilisations = new Map([REUTILISATION_REPRISE, REUTILISATION_ESCALIERS, REUTILISATION_REACTION].map(source => [source.nomFichier, source]));
export const PARAMETRES = Object.freeze({
  nomVoix: 'coach antoine',
  // Empreinte historique non secrète : aucune voix homonyme de substitution.
  empreinteVoix: '3c024833094a1e5112e9134424197f26bcb0e25187f18c091980d63efa999a20',
  modele: 'eleven_v4', langue: 'fr', format: 'mp3_44100_128',
  stabilite: 0.5, similarite: 0.75,
  direction: "[voix d'homme mûr, grave et chaleureuse, débit naturel et dynamique, sans lenteur excessive]",
});
const empreinte = valeur => createHash('sha256').update(valeur).digest('hex');
const longueur = texte => [...texte].length;
const sceller = plan => ({ ...plan, accordPaiement: empreinte(JSON.stringify(plan)) });

export function listerLots() {
  const entrees = selectionnerV1();
  // 01 et 02 inchangés ; 03 inclut les deux variantes de la description Équilibré.
  // Bornes de l'inventaire V1 : paires tu/vous indivisibles ; 07 en réserve.
  const groupes = [
    entrees.slice(0, TAILLE_LOT), entrees.slice(TAILLE_LOT, 20), entrees.slice(20, 41),
    entrees.slice(41, 62), entrees.slice(62, 82), entrees.slice(82, 88), [],
  ];
  return groupes.map((entrees, index) => ({
    lot: String(index + 1).padStart(2, '0'),
    entrees,
  }));
}

// Lecture locale uniquement ; aucun chargement de clé, appel réseau ou écriture.
export async function preparerPlan({ lot, sortie = SORTIE_V1, correctionsR02 = false, fsImpl = fs } = {}) {
  if (correctionsR02 && !['05', '06'].includes(lot)) throw new Error('Corrections R02 réservées aux lots 05 (71/73 TU) et 06 (85 TU/86 VOUS).');
  const lots = listerLots();
  const numeros = new Map(selectionnerV1().map((e, index) => [e.nomFichier, index + 1]));
  if (lot !== undefined && !lots.some(l => l.lot === lot)) throw new Error('Lot inconnu : choisir 01 à 07 (07 en réserve, sans entrée).');
  const selectionLot = lot === undefined ? lots.flatMap(l => l.entrees) : lots.find(l => l.lot === lot).entrees;
  // Sélection fermée, sans modifier l'inventaire ni autoriser des révisions arbitraires.
  const selection = correctionsR02 ? selectionLot.filter(e => (lot === '06' ? [85, 86] : [71, 73]).includes(numeros.get(e.nomFichier)))
    .map(e => ({ ...e, revision: 'r02', nomFichier: e.nomFichier.replace('--r01.mp3', '--r02.mp3') })) : selectionLot;
  const fichiers = [];
  for (const e of selection) {
    const chemin = join(resolve(sortie), e.nomFichier);
    let existe = false;
    try { await fsImpl.lstat(chemin); existe = true; }
    catch (erreur) { if (erreur.code !== 'ENOENT') throw new Error('Sortie inaccessible.'); }
    const sourceReutilisation = reutilisations.get(e.nomFichier);
    const reutiliser = Boolean(sourceReutilisation);
    let reutilisation = null;
    if (reutiliser) {
      let sourceExiste = false, sha256 = null;
      try {
        const stat = await fsImpl.lstat(sourceReutilisation.cheminSource);
        sourceExiste = true;
        if (stat.isFile?.() !== false) sha256 = empreinte(await fsImpl.readFile(sourceReutilisation.cheminSource));
      } catch (erreur) {
        if (erreur.code !== 'ENOENT') throw new Error('Source de réutilisation inaccessible.');
      }
      reutilisation = { ...sourceReutilisation, existe: sourceExiste, sha256,
        conforme: sourceExiste && sha256 === sourceReutilisation.sha256Attendu,
        validation: 'Écoute utilisateur validée ; contrôle technique local code 0 pour cette empreinte. Aucun appel API.' };
    }
    fichiers.push({ ...e, numeroInventaire: numeros.get(correctionsR02 ? e.nomFichier.replace('--r02.mp3', '--r01.mp3') : e.nomFichier),
      chemin, existe, action: reutiliser ? 'reutiliser' : 'synthetiser', reutilisation,
      caracteresDialogue: longueur(e.texte), caracteresInstruction: reutiliser ? 0 : longueur(PARAMETRES.direction),
      caracteresSeparateur: reutiliser ? 0 : 1,
      caracteresTransmis: reutiliser ? 0 : longueur(e.texte) + longueur(PARAMETRES.direction) + 1,
      texteEnvoye: reutiliser ? null : `${PARAMETRES.direction} ${e.texte}` });
  }
  const total = cle => fichiers.reduce((s, e) => s + e[cle], 0);
  return sceller({
    ...(correctionsR02 ? { correctionsR02: true } : {}),
    version: 'questionnaire-v1-r02-reutilisation', lot: lot ?? null, sortie: resolve(sortie), parametres: PARAMETRES,
    maximumFichiersParLot: MAX_FICHIERS_LOT,
    nombreCibles: fichiers.length,
    nombreSyntheses: fichiers.filter(e => e.action === 'synthetiser').length,
    nombreReutilisations: fichiers.filter(e => e.action === 'reutiliser').length,
    lots: lots.map(l => ({ lot: l.lot, nombreFichiers: l.entrees.length,
      fichiers: l.entrees.map(e => e.nomFichier),
      creditsEstimes: l.entrees.reduce((s, e) => s + (reutilisations.has(e.nomFichier) ? 0 : longueur(e.texte) + longueur(PARAMETRES.direction) + 1), 0) })),
    verificationAPI: 'Non effectuée par le plan local. eleven_v4 et la voix historique doivent être confirmés avant production ; aucune substitution.',
    exclusions: EXCLUSIONS_V1, introductionExistante: 'public/audio/intro-coach-antoine.mp3',
    titreSilencieux: 'Faisons connaissance.', fichiers,
    caracteresDialogues: total('caracteresDialogue'), caracteresInstructions: total('caracteresInstruction'),
    caracteresSeparateurs: total('caracteresSeparateur'), caracteresTransmis: total('caracteresTransmis'),
    creditsEstimes: total('caracteresTransmis'),
    hypotheseCredits: 'Provision à 1 crédit par caractère transmis, instruction et espace inclus ; pas un tarif garanti. Balises, remises, arrondis et coût réel à confirmer par le fournisseur.',
    limitationDirection: 'Direction expérimentale : non-prononciation et rendu non garantis sans écoute.',
    blocages: fichiers.flatMap(e => [
      ...(e.existe ? [`Fichier existant : ${e.nomFichier}`] : []),
      ...(e.reutilisation && !e.reutilisation.conforme ? [`Source de réutilisation absente ou différente : ${e.nomFichier}`] : []),
    ]),
  });
}

export function verifierModele(modeles) {
  const modele = Array.isArray(modeles) && modeles.find(m => m.model_id === PARAMETRES.modele);
  if (!modele?.can_do_text_to_speech || !modele.languages?.some(l => l.language_id === 'fr')) {
    throw new Error('Identifiant API eleven_v4 avec français non confirmé ; aucun autre modèle ne sera utilisé.');
  }
  return modele;
}

// À appeler uniquement après confirmation du plan exact, y compris pour les GET.
export async function verifierConnexion({ fetchImpl = fetch, cle }) {
  if (!cle) throw new Error('Clé ElevenLabs absente ; aucun secret affiché.');
  const get = async chemin => {
    let reponse;
    try { reponse = await fetchImpl(`https://api.elevenlabs.io${chemin}`, {
      method: 'GET', headers: { 'xi-api-key': cle }, signal: AbortSignal.timeout(20000),
    }); } catch { throw new Error('Lecture ElevenLabs impossible.'); }
    if (!reponse.ok) throw new Error(`Lecture ElevenLabs refusée (HTTP ${reponse.status}).`);
    try { return await reponse.json(); } catch { throw new Error('Réponse ElevenLabs illisible.'); }
  };
  const [voix, modeles] = await Promise.all([
    get('/v2/voices?search=Coach%20Antoine&page_size=100'), get('/v1/models'),
  ]);
  const candidates = voix.voices?.filter(v => typeof v.name === 'string' && v.name.trim().toLocaleLowerCase('fr') === PARAMETRES.nomVoix) || [];
  if (candidates.length !== 1 || typeof candidates[0].voice_id !== 'string' || empreinte(candidates[0].voice_id) !== PARAMETRES.empreinteVoix) {
    throw new Error('La voix Coach Antoine vérifiée est absente ou ambiguë ; aucune substitution autorisée.');
  }
  const modele = verifierModele(modeles);
  const reglages = await get(`/v1/voices/${encodeURIComponent(candidates[0].voice_id)}/settings`);
  if (reglages.stability !== PARAMETRES.stabilite || reglages.similarity_boost !== PARAMETRES.similarite) {
    throw new Error('Les réglages de la voix ont changé ; nouvelle validation nécessaire.');
  }
  return { voiceId: candidates[0].voice_id, modele, reglages };
}

export function verifierAccord(plan, { accordPaiement, accepterDirectionExperimentale } = {}) {
  if (!plan.lot || plan.fichiers.length < 1 || plan.fichiers.length > MAX_FICHIERS_LOT) throw new Error('Sélection explicite d’un seul lot de 25 MP3 maximum obligatoire.');
  if (accordPaiement !== plan.accordPaiement) throw new Error('Accord de paiement absent ou différent du plan exact.');
  if (!accepterDirectionExperimentale) throw new Error('La limite de la direction vocale doit être acceptée.');
  if (plan.blocages.length) throw new Error('Fichier existant ou source de réutilisation invalide ; aucun écrasement ni synthèse de remplacement autorisé.');
}

export function verifierConfigurationLocale() {
  // La clé ne doit pas être suivie, même si une règle ignore le chemin.
  try {
    const options = { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    const suivi = execFileSync('git', ['ls-files', '--', '.env.local'], options).trim();
    execFileSync('git', ['check-ignore', '-q', '--', '.env.local'], options);
    if (suivi) throw new Error();
  } catch { throw new Error('Configuration locale non ignorée ou suivie par Git ; production interdite.'); }
}

async function chargerCleLocale() {
  verifierConfigurationLocale();
  try {
    const configuration = parseEnv(await fs.readFile(join(racine, '.env.local'), 'utf8'));
    if (!configuration.ELEVENLABS_API_KEY || Object.keys(configuration).some(k => /^VITE_.*(KEY|TOKEN|SECRET)/i.test(k))) throw new Error();
    return configuration.ELEVENLABS_API_KEY;
  } catch { throw new Error('Configuration locale ElevenLabs absente ou invalide ; aucun secret affiché.'); }
}

export async function generer(plan, options = {}) {
  // Même l'API JavaScript est une simulation par défaut.
  const { fsImpl = fs, fetchImpl = fetch, chargerCle = chargerCleLocale, connexionImpl = verifierConnexion } = options;
  const actuel = await preparerPlan({ lot: plan.lot ?? undefined, sortie: plan.sortie, correctionsR02: plan.correctionsR02 === true, fsImpl });
  if (JSON.stringify(plan) !== JSON.stringify(actuel)) throw new Error('Plan modifié ou périmé : refaire la simulation et confirmer.');
  if (options.simulation !== false) return { simulation: true, plan: actuel };
  verifierAccord(actuel, options);
  // Réserver tous les chemins AVANT le réseau, avec ouverture exclusive.
  // Aucun écrasement, même si un fichier apparaît entre le plan et cette étape.
  const reserves = [];
  try {
    await fsImpl.mkdir(actuel.sortie, { recursive: true });
    for (const fichier of actuel.fichiers) {
      try { reserves.push({ fichier, handle: await fsImpl.open(fichier.chemin, 'wx'), conserve: false }); }
      catch { throw new Error('Réservation impossible ou fichier existant ; aucun appel à ElevenLabs.'); }
    }
    // Charger/vérifier toutes les sources avant le moindre accès API.
    for (const reserve of reserves.filter(r => r.fichier.action === 'reutiliser')) {
      try { reserve.octetsReutilises = new Uint8Array(await fsImpl.readFile(reserve.fichier.reutilisation.cheminSource)); }
      catch { throw new Error('Source de réutilisation inaccessible ; aucune synthèse de remplacement.'); }
      if (empreinte(reserve.octetsReutilises) !== reserve.fichier.reutilisation.sha256Attendu) {
        throw new Error('Source de réutilisation modifiée ; refaire le contrôle et le plan.');
      }
    }
    const syntheses = reserves.some(r => r.fichier.action === 'synthetiser');
    const cle = syntheses ? await chargerCle() : null;
    const connexion = syntheses ? await connexionImpl({ cle, fetchImpl }) : null;
    for (const reserve of reserves) {
      if (reserve.fichier.action === 'reutiliser') {
        await reserve.handle.writeFile(reserve.octetsReutilises);
        reserve.conserve = true;
        console.log(`MP3 réutilisé sans synthèse : ${reserve.fichier.nomFichier}`);
        continue;
      }
      let reponse;
      try {
        reponse = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(connexion.voiceId)}?output_format=${PARAMETRES.format}`, {
          method: 'POST', headers: { 'xi-api-key': cle, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reserve.fichier.texteEnvoye, model_id: PARAMETRES.modele, language_code: PARAMETRES.langue,
            voice_settings: { stability: PARAMETRES.stabilite, similarity_boost: PARAMETRES.similarite } }),
          signal: AbortSignal.timeout(120000),
        });
      } catch { throw new Error('Génération interrompue ; vérifier l’historique avant toute reprise payante.'); }
      if (!reponse.ok) throw new Error(`Génération arrêtée (HTTP ${reponse.status}) ; aucune reprise automatique.`);
      if (!/audio\/(mpeg|mp3)/i.test(reponse.headers.get('content-type') || '')) throw new Error('Format audio inattendu ; aucune reprise automatique.');
      let octets;
      try { octets = new Uint8Array(await reponse.arrayBuffer()); }
      catch { throw new Error('Réception interrompue ; vérifier l’historique avant toute reprise payante.'); }
      if (!octets.length) throw new Error('Audio vide ; aucune reprise automatique.');
      try { await reserve.handle.writeFile(octets); }
      catch { throw new Error('Écriture interrompue après facturation possible ; vérifier avant toute reprise.'); }
      reserve.conserve = true;
      console.log(`MP3 enregistré : ${reserve.fichier.nomFichier}`);
    }
    return { simulation: false, fichiers: reserves.map(r => r.fichier.nomFichier) };
  } finally {
    for (const reserve of reserves) {
      await reserve.handle.close();
      if (!reserve.conserve) await fsImpl.unlink(reserve.fichier.chemin);
    }
  }
}

export async function executer(args = process.argv.slice(2), { log = console.log, ...dependances } = {}) {
  const valeurs = new Set(['--lot', '--sortie', '--accord-paiement']);
  const autorises = new Set([...valeurs, '--plan', '--dry-run', '--generer', '--accepter-direction-experimentale', '--corrections-r02']);
  const lus = new Map();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!autorises.has(arg) || lus.has(arg)) throw new Error('Argument inconnu ou répété.');
    if (valeurs.has(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Valeur d’argument manquante.');
      lus.set(arg, args[++i]);
    } else lus.set(arg, true);
  }
  if (['--plan', '--dry-run', '--generer'].filter(a => lus.has(a)).length > 1) throw new Error('Choisir une seule opération.');
  const plan = await preparerPlan({ lot: lus.get('--lot'), sortie: lus.get('--sortie'), correctionsR02: lus.has('--corrections-r02'), fsImpl: dependances.fsImpl });
  // Affichage toujours AVANT toute opération réseau, y compris en production.
  log(JSON.stringify({ simulation: !lus.has('--generer'), ...plan }, null, 2));
  if (!lus.has('--generer')) return { simulation: true, plan };
  return generer(plan, { ...dependances, simulation: false, accordPaiement: lus.get('--accord-paiement'),
    accepterDirectionExperimentale: lus.has('--accepter-direction-experimentale') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executer().catch(() => {
    // Ne jamais afficher un objet d'erreur ou une réponse contenant un secret.
    console.error('Opération arrêtée. Vérifier le lot, le plan, la confirmation, les fichiers existants et la configuration ; aucune reprise payante automatique.');
    process.exitCode = 1;
  });
}

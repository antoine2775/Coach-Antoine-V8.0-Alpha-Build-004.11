import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { listerQuestionnaire, selectionnerEssai, selectionnerV1, EXCLUSIONS_V1 } from '../scripts/voix/questionnaire.mjs';
import { preparerPlan, listerLots, generer, executer, verifierConnexion, verifierModele, verifierConfigurationLocale, verifierAccord, MAX_FICHIERS_LOT, REUTILISATION_REPRISE, REUTILISATION_ESCALIERS, REUTILISATION_REACTION, PARAMETRES, SORTIE_V1 } from '../scripts/voix/generer-questionnaire.mjs';
import { QUESTIONS } from '../src/onboarding/questions.js';
import { EARLY_MESSAGES } from '../src/onboarding/earlyMessages.js';
import { ASSESSMENT_MESSAGES } from '../src/onboarding/assessmentMessages.js';
import { COMPLETION_MESSAGES } from '../src/onboarding/completionMessages.js';

const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' });
// Stockage en mémoire : aucun MP3 créé sur disque, aucun fournisseur contacté.
function stockage() {
  const fichiers = new Map();
  const appels = [];
  const fsImpl = {
    async lstat(path) { if (!fichiers.has(path)) throw absent(); return { isFile: () => true }; },
    async readFile(path) { if (!fichiers.has(path)) throw absent(); return fichiers.get(path); },
    async mkdir() { appels.push('mkdir'); },
    async open(path, flag) {
      appels.push('open');
      assert.equal(flag, 'wx');
      if (fichiers.has(path)) throw Object.assign(new Error('existe'), { code: 'EEXIST' });
      fichiers.set(path, null);
      return { async close() {}, async writeFile(bytes) { fichiers.set(path, bytes); } };
    },
    async unlink(path) { fichiers.delete(path); },
  };
  return { fsImpl, fichiers, appels };
}
const accord = plan => ({ simulation: false, accordPaiement: plan.accordPaiement, accepterDirectionExperimentale: true });

test('inventaire source : 91 textes, 7095 caractères, noms et textes uniques', () => {
  const entrees = listerQuestionnaire();
  assert.equal(entrees.length, 91);
  assert.equal(entrees.reduce((s, e) => s + [...e.texte].length, 0), 7095);
  const normaliser = t => t.normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/gu, ' ').trim().toLocaleLowerCase('fr');
  assert.equal(new Set(entrees.map(e => normaliser(e.texte))).size, 91);
  assert.equal(new Set(entrees.map(e => e.nomFichier)).size, 91);
  for (const e of entrees) {
    assert.doesNotMatch(e.texte, /\[Prénom\]/u);
    assert.match(e.nomFichier, /^[a-z]+(?:-[a-z]+)*--(?:tu|vous|commun)--hf--r01\.mp3$/);
    assert.ok(e.source.startsWith('src/onboarding/'));
  }
});

test('V1 : exactement les trois exclusions validées et 43 tu, 43 vous, 2 communs', () => {
  const all = listerQuestionnaire(), v1 = selectionnerV1();
  assert.equal(v1.length, 88);
  assert.deepEqual(all.filter(e => !v1.some(v => v.nomFichier === e.nomFichier)).map(e => e.nomFichier), [...EXCLUSIONS_V1]);
  assert.deepEqual(['tu', 'vous', 'commun'].map(v => v1.filter(e => e.adresse === v).length), [43, 43, 2]);
  assert.equal(all.length, 91, 'aucune suppression des sources UI');
  for (const e of v1) assert.deepEqual(e, all.find(a => a.nomFichier === e.nomFichier));
  assert.equal(v1.reduce((s, e) => s + [...e.texte].length, 0), 6922);
  assert.equal(v1.filter(e => e.identifiantAudio === 'inscription-explication-securite').length, 2);
  assert.ok(v1.every(e => !/Faisons connaissance|Je confirme|J’ai lu et je confirme/.test(e.texte)));
});

test('sources tu/vous et quatre essais historiques conservés', () => {
  assert.deepEqual(selectionnerEssai().map(e => e.texte), [QUESTIONS[0].text, EARLY_MESSAGES.tu.explanation[2], ASSESSMENT_MESSAGES.tu.levelDescriptions.reprise, COMPLETION_MESSAGES.tu.reaction]);
  assert.ok(selectionnerEssai().every(e => selectionnerV1().some(v => v.nomFichier === e.nomFichier)));
  for (const q of QUESTIONS) {
    const source = selectionnerV1().filter(e => e.source.endsWith(`: ${q.id}`));
    assert.deepEqual(source.map(e => e.texte), [q.text, q.textVous]);
  }
});

test('introduction existante hors inventaire et emplacement V1 conservé', async () => {
  const plan = await preparerPlan();
  assert.ok(SORTIE_V1.endsWith(join('public', 'audio', 'voix', 'inscription')));
  assert.equal(plan.introductionExistante, 'public/audio/intro-coach-antoine.mp3');
  assert.ok(readFileSync(new URL('../public/audio/intro-coach-antoine.mp3', import.meta.url)).length > 0);
  assert.ok(plan.fichiers.every(e => !e.nomFichier.includes('presentation-coach') && e.chemin === join(SORTIE_V1, e.nomFichier)));
});

test('lots : 01/02 conservés, 03 couvre 21–41, suite sans omission ni répétition', async () => {
  const lots = listerLots();
  assert.deepEqual(lots.map(l => l.lot), ['01', '02', '03', '04', '05', '06', '07']);
  assert.deepEqual(lots.map(l => l.entrees.length), [10, 10, 21, 21, 20, 6, 0]);
  assert.deepEqual(lots.flatMap(l => l.entrees), [...selectionnerV1()]);
  await assert.rejects(preparerPlan({ lot: '1' }), /Lot inconnu/);
  await assert.rejects(preparerPlan({ lot: '09' }), /Lot inconnu/);
});

test('R02 exact et provision intégrale, identifiants historiques sans substitution', async () => {
  const plan = await preparerPlan();
  assert.equal(PARAMETRES.modele, 'eleven_v4');
  assert.equal(PARAMETRES.nomVoix, 'coach antoine');
  assert.equal(PARAMETRES.stabilite, 0.5);
  assert.equal(PARAMETRES.similarite, 0.75);
  assert.equal(PARAMETRES.langue, 'fr');
  assert.equal(PARAMETRES.direction, "[voix d'homme mûr, grave et chaleureuse, débit naturel et dynamique, sans lenteur excessive]");
  assert.equal([...PARAMETRES.direction].length, 92);
  for (const interdit of ['speed', 'style', 'use_speaker_boost']) assert.equal(Object.hasOwn(PARAMETRES, interdit), false);
  for (const e of plan.fichiers) {
    assert.equal(e.texteEnvoye, e.action === 'reutiliser' ? null : `${PARAMETRES.direction} ${e.texte}`);
    assert.equal(e.caracteresInstruction, e.action === 'reutiliser' ? 0 : 92);
    assert.equal(e.caracteresTransmis, e.action === 'reutiliser' ? 0 : e.caracteresDialogue + 93);
  }
  assert.equal(plan.caracteresDialogues, 6922);
  assert.equal(plan.caracteresInstructions, 7820);
  assert.equal(plan.caracteresTransmis, 14581);
  assert.equal(plan.creditsEstimes, 14581);
  assert.match(plan.verificationAPI, /Non effectuée/);
  assert.match(plan.hypotheseCredits, /pas un tarif garanti/);
});

test('simulation par défaut : zéro accès réseau, zéro chargement de clé, zéro écriture', async () => {
  const store = stockage();
  const interdit = async () => { assert.fail('effet de bord interdit'); };
  const plan = await preparerPlan({ lot: '01', fsImpl: store.fsImpl });
  const resultat = await generer(plan, { fsImpl: store.fsImpl, fetchImpl: interdit, chargerCle: interdit });
  assert.equal(resultat.simulation, true);
  let affichage;
  assert.equal((await executer(['--lot', '01', '--dry-run'], { fsImpl: store.fsImpl, log: v => { affichage = JSON.parse(v); }, fetchImpl: interdit, chargerCle: interdit })).simulation, true);
  assert.equal(affichage.fichiers.length, 10);
  assert.deepEqual(store.appels, []);
});

test('confirmation obligatoire : lot explicite, empreinte exacte et direction acceptée', async () => {
  const store = stockage(), plan = await preparerPlan({ lot: '01', fsImpl: store.fsImpl });
  const options = { fsImpl: store.fsImpl, simulation: false, chargerCle: async () => assert.fail('clé interdite') };
  await assert.rejects(generer(plan, options), /Accord/);
  await assert.rejects(generer(plan, { ...options, accordPaiement: plan.accordPaiement }), /direction/);
  const complet = await preparerPlan({ fsImpl: store.fsImpl });
  await assert.rejects(generer(complet, { ...options, ...accord(complet) }), /lot/);
  const autre = await preparerPlan({ lot: '02', fsImpl: store.fsImpl });
  await assert.rejects(generer(autre, { ...options, ...accord(plan) }), /Accord/);
  const affichages = [];
  await assert.rejects(executer(['--lot', '01', '--generer'], { ...options, log: x => affichages.push(x) }), /Accord/);
  assert.equal(affichages.length, 1, 'plan affiché avant refus et avant réseau');
  assert.deepEqual(store.appels, []);
});

test('plan exact : modification de texte, chemin, lot ou état disque impose une nouvelle confirmation', async () => {
  const store = stockage(), plan = await preparerPlan({ lot: '01', fsImpl: store.fsImpl });
  const options = { ...accord(plan), fsImpl: store.fsImpl };
  const modifie = structuredClone(plan); modifie.fichiers[0].texteEnvoye = 'substitution';
  await assert.rejects(generer(modifie, options), /périmé/);
  await assert.rejects(generer({ ...plan, sortie: join(plan.sortie, 'autre') }, options), /périmé/);
  await assert.rejects(generer({ ...plan, lot: '02' }, options), /périmé/);
  store.fichiers.set(plan.fichiers[0].chemin, 'existant');
  await assert.rejects(generer(plan, options), /périmé/);
  const nouveau = await preparerPlan({ lot: '01', fsImpl: store.fsImpl });
  await assert.rejects(generer(nouveau, { ...accord(nouveau), fsImpl: store.fsImpl }), /existant/);
  assert.equal(store.fichiers.get(plan.fichiers[0].chemin), 'existant');
  assert.deepEqual(store.appels, []);
});

test('course de création : réservation exclusive avant tout accès réseau, nettoyage des seules réservations', async () => {
  const store = stockage(), plan = await preparerPlan({ lot: '01', fsImpl: store.fsImpl });
  const ouvrir = store.fsImpl.open;
  store.fsImpl.open = async (path, flag) => {
    if (path === plan.fichiers[1].chemin) store.fichiers.set(path, 'créé par un autre processus');
    return ouvrir(path, flag);
  };
  await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl, chargerCle: async () => assert.fail('réseau interdit') }), /Réservation/);
  assert.equal(store.fichiers.size, 1);
  assert.equal(store.fichiers.get(plan.fichiers[1].chemin), 'créé par un autre processus');
});

test('production simulée en mémoire : seul lot choisi, paramètres POST exacts et arrêt sans reprise', async () => {
  const store = stockage(), plan = await preparerPlan({ lot: '06', fsImpl: store.fsImpl });
  let posts = 0;
  const fetchImpl = async (url, options) => {
    posts++;
    assert.equal(options.method, 'POST');
    assert.ok(url.endsWith('?output_format=mp3_44100_128'));
    assert.deepEqual(JSON.parse(options.body), { text: plan.fichiers[posts - 1].texteEnvoye, model_id: 'eleven_v4', language_code: 'fr', voice_settings: { stability: 0.5, similarity_boost: 0.75 } });
    return { ok: false, status: 429 };
  };
  await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl, chargerCle: async () => 'factice', connexionImpl: async () => ({ voiceId: 'factice' }), fetchImpl }), /429/);
  assert.equal(posts, 1);
  assert.equal(store.fichiers.size, 0);
});

test('vérification fournisseur factice : refuse voix absente ou homonyme sans substitution', async () => {
  for (const voices of [[], [{ name: 'coach antoine', voice_id: 'autre' }], [{ name: 'coach antoine', voice_id: 'a' }, { name: 'coach antoine', voice_id: 'b' }]]) {
    const appels = [];
    await assert.rejects(verifierConnexion({ cle: 'factice', fetchImpl: async (url, options) => {
      appels.push(options.method);
      return { ok: true, json: async () => url.includes('/voices?') ? { voices } : [] };
    } }), /absente ou ambiguë/);
    assert.deepEqual(appels, ['GET', 'GET']);
  }
});

test('secret : configuration locale ignorée et non suivie ; erreurs fournisseur expurgées', async () => {
  verifierConfigurationLocale();
  const sentinelle = 'SECRET_FACTICE_A_NE_PAS_AFFICHER';
  await assert.rejects(verifierConnexion({ cle: sentinelle, fetchImpl: async () => { throw Error(sentinelle); } }), e => !e.message.includes(sentinelle) && /Lecture ElevenLabs impossible/.test(e.message));
  await assert.rejects(verifierConnexion({ cle: sentinelle, fetchImpl: async () => ({ ok: false, status: 403 }) }), e => !e.message.includes(sentinelle) && /403/.test(e.message));
});

test('CLI locale : simulation par défaut, anciennes commandes et options ambiguës refusées', () => {
  const script = fileURLToPath(new URL('../scripts/voix/generer-questionnaire.mjs', import.meta.url));
  const plan = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' }));
  assert.equal(plan.simulation, true);
  assert.equal(plan.fichiers.length, 88);
  assert.equal(plan.caracteresTransmis, 14581);
  for (const args of [['--questionnaire'], ['--verifier'], ['--generer'], ['--lot', '01', '--lot', '02'], ['--dry-run', '--generer']]) {
    const refus = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(refus.status, 1);
    assert.match(refus.stderr, /Opération arrêtée/);
  }
});


test('modèle : identifiant exact, synthèse et français obligatoires sans repli', () => {
  for (const modeles of [[], null, [{ model_id: 'eleven_v3', can_do_text_to_speech: true, languages: [{ language_id: 'fr' }] }], [{ model_id: 'eleven_v4', can_do_text_to_speech: false, languages: [{ language_id: 'fr' }] }], [{ model_id: 'eleven_v4', can_do_text_to_speech: true, languages: [{ language_id: 'en' }] }]]) {
    assert.throws(() => verifierModele(modeles), /non confirmé/);
  }
  const modele = { model_id: 'eleven_v4', can_do_text_to_speech: true, languages: [{ language_id: 'fr' }] };
  assert.equal(verifierModele([modele]), modele);
});

test('échec partiel factice : fichier terminé conservé, aucune reprise ni écrasement', async () => {
  const store = stockage(), plan = await preparerPlan({ lot: '06', fsImpl: store.fsImpl });
  let posts = 0;
  const originalLog = console.log;
  const logs = [];
  console.log = x => logs.push(x);
  try {
    await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl,
      chargerCle: async () => 'SECRET_FACTICE', connexionImpl: async () => ({ voiceId: 'factice' }),
      fetchImpl: async () => {
        posts++;
        if (posts === 2) throw Error('SECRET_FACTICE');
        return { ok: true, headers: new Map([['content-type', 'audio/mpeg']]), arrayBuffer: async () => Uint8Array.of(1, 2, 3).buffer };
      },
    }), e => /interrompue/.test(e.message) && !e.message.includes('SECRET_FACTICE'));
  } finally { console.log = originalLog; }
  assert.equal(posts, 2);
  assert.equal(store.fichiers.size, 1);
  assert.deepEqual(store.fichiers.get(plan.fichiers[0].chemin), Uint8Array.of(1, 2, 3));
  assert.equal(logs.length, 1);
  assert.ok(logs.every(x => !x.includes('SECRET_FACTICE')));
  const nouveau = await preparerPlan({ lot: '06', fsImpl: store.fsImpl });
  await assert.rejects(generer(nouveau, { ...accord(nouveau), fsImpl: store.fsImpl }), /existant/);
});


const archiveReprise = () => readFileSync(REUTILISATION_REPRISE.cheminSource);
const stockAvecArchive = () => {
  const store = stockage();
  store.fichiers.set(REUTILISATION_REPRISE.cheminSource, archiveReprise());
  return store;
};

test('lots historiques 01 et 02 : mêmes entrées, chemins, paramètres et provisions', async () => {
  for (const [lot, debut, credits] of [['01', 0, 1688], ['02', 10, 1528]]) {
    const plan = await preparerPlan({ lot, fsImpl: stockage().fsImpl });
    assert.deepEqual(plan.fichiers.map(e => e.nomFichier), selectionnerV1().slice(debut, debut + 10).map(e => e.nomFichier));
    assert.equal(plan.creditsEstimes, credits);
    assert.equal(plan.nombreSyntheses, 10);
    assert.equal(plan.nombreReutilisations, 0);
    assert.ok(plan.fichiers.every(e => e.action === 'synthetiser' && e.texteEnvoye === PARAMETRES.direction + ' ' + e.texte));
  }
});

test('lot 03 : exactement 21–41, paire Équilibré complète, 20 synthèses et une réutilisation', async () => {
  const store = stockAvecArchive(), plan = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
  assert.deepEqual(plan.fichiers.map(e => e.nomFichier), selectionnerV1().slice(20, 41).map(e => e.nomFichier));
  assert.deepEqual(plan.fichiers.map(e => e.numeroInventaire), Array.from({length: 21}, (_, i) => i + 21));
  assert.deepEqual(['tu', 'vous', 'commun'].map(v => plan.fichiers.filter(e => e.adresse === v).length), [10, 10, 1]);
  assert.equal(plan.nombreCibles, 21);
  assert.equal(plan.nombreSyntheses, 20);
  assert.equal(plan.nombreReutilisations, 1);
  assert.equal(plan.creditsEstimes, 3603);
  assert.equal(plan.caracteresTransmis, 3603);
  assert.equal(plan.caracteresInstructions, 1840);
  assert.equal(plan.caracteresSeparateurs, 20);
  assert.equal(plan.blocages.length, 0);
  const reuse = plan.fichiers.find(e => e.action === 'reutiliser');
  assert.equal(reuse.numeroInventaire, 35);
  assert.equal(reuse.reutilisation.conforme, true);
  assert.equal(reuse.reutilisation.sha256, REUTILISATION_REPRISE.sha256Attendu);
  assert.equal(reuse.caracteresTransmis, 0);
  assert.equal(reuse.texteEnvoye, null);
  assert.equal(reuse.existe, false);
  assert.deepEqual(plan.fichiers.slice(-2).map(e => e.adresse), ['tu', 'vous']);
});

test('plafond de 25 cibles : 25 acceptées, 26 refusées ; plan global interdit en production', async () => {
  assert.equal(MAX_FICHIERS_LOT, 25);
  const plan = await preparerPlan({ lot: '01', fsImpl: stockage().fsImpl });
  assert.doesNotThrow(() => verifierAccord({ ...plan, fichiers: Array(25).fill(plan.fichiers[0]) }, accord(plan)));
  assert.throws(() => verifierAccord({ ...plan, fichiers: Array(26).fill(plan.fichiers[0]) }, accord(plan)), /25 MP3 maximum/);
});

test('lot 03 dry-run : affiche les textes, variantes, chemins et actions, sans réseau, clé ou copie', async () => {
  const store = stockAvecArchive();let affichage;
  const interdit = async () => assert.fail('aucun effet de bord autorisé');
  const result = await executer(['--lot', '03', '--dry-run'], {
    fsImpl: store.fsImpl, fetchImpl: interdit, chargerCle: interdit,
    log: value => { affichage = JSON.parse(value); },
  });
  assert.equal(result.simulation, true);
  assert.equal(affichage.fichiers.length, 21);
  assert.equal(affichage.fichiers.filter(e => e.action === 'reutiliser').length, 1);
  assert.ok(affichage.fichiers.every(e => e.texte && e.adresse && e.chemin && e.existe === false));
  const resultAPI = await generer(result.plan, { fsImpl: store.fsImpl, fetchImpl: interdit, chargerCle: interdit });
  assert.equal(resultAPI.simulation, true);
  assert.deepEqual(store.appels, []);
  assert.equal(store.fichiers.size, 1, 'seule la source en mémoire existe');
});

test('archive absente ou changée : blocage sans remplacement payant ni écriture', async () => {
  for (const contenu of [null, Buffer.from('autre version')]) {
    const store = stockage();
    if (contenu) store.fichiers.set(REUTILISATION_REPRISE.cheminSource, contenu);
    const plan = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
    assert.ok(plan.blocages.some(b => /réutilisation absente ou différente/.test(b)));
    assert.equal(plan.nombreSyntheses, 20, 'aucun repli vers une 21e synthèse');
    assert.equal(plan.fichiers.find(e => e.numeroInventaire === 35).action, 'reutiliser');
    await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl,
      chargerCle: async () => assert.fail('chargement de clé interdit') }), /réutilisation invalide/);
    assert.deepEqual(store.appels, []);
  }
});

test('lot 03 : destination existante, y compris la réutilisation, interdit tout écrasement', async () => {
  const store = stockAvecArchive();
  const initial = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
  const path = initial.fichiers.find(e => e.action === 'reutiliser').chemin;
  store.fichiers.set(path, Buffer.from('à conserver'));
  const plan = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
  assert.equal(plan.fichiers.find(e => e.action === 'reutiliser').existe, true);
  await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl }), /existant/);
  assert.equal(store.fichiers.get(path).toString(), 'à conserver');
  assert.deepEqual(store.appels, []);
});

test('lot 03 entièrement factice : copie exacte en mémoire et seulement 20 POST', async () => {
  const store = stockAvecArchive(), plan = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
  const syntheses = plan.fichiers.filter(e => e.action === 'synthetiser');
  let posts = 0;const originalLog = console.log;console.log = () => {};
  try {
    const result = await generer(plan, { ...accord(plan), fsImpl: store.fsImpl,
      chargerCle: async () => 'factice', connexionImpl: async () => ({voiceId: 'factice'}),
      fetchImpl: async (_, options) => {
        assert.equal(options.method, 'POST');
        assert.equal(JSON.parse(options.body).text, syntheses[posts].texteEnvoye);
        posts++;
        return {ok: true, headers: new Map([['content-type', 'audio/mpeg']]), arrayBuffer: async () => Uint8Array.of(1,2,3).buffer};
      },
    });
    assert.equal(result.fichiers.length, 21);
  } finally { console.log = originalLog; }
  assert.equal(posts, 20);
  const reuse = plan.fichiers.find(e => e.action === 'reutiliser');
  assert.deepEqual(Buffer.from(store.fichiers.get(reuse.chemin)), archiveReprise());
  assert.deepEqual(store.fichiers.get(REUTILISATION_REPRISE.cheminSource), archiveReprise());
});

test('archive changée après le plan : confirmation périmée, aucun appel réseau', async () => {
  const store = stockAvecArchive(), plan = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
  store.fichiers.set(REUTILISATION_REPRISE.cheminSource, Buffer.from('modification'));
  await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl,
    chargerCle: async () => assert.fail('réseau interdit') }), /périmé/);
  assert.deepEqual(store.appels, []);
});


test('archive changée pendant les réservations : arrêt avant clé/API et nettoyage des cibles en mémoire', async () => {
  const store = stockAvecArchive(), plan = await preparerPlan({ lot: '03', fsImpl: store.fsImpl });
  const ouvrir = store.fsImpl.open;
  store.fsImpl.open = async (path, flag) => {
    const handle = await ouvrir(path, flag);
    store.fichiers.set(REUTILISATION_REPRISE.cheminSource, Buffer.from('changement concurrent'));
    return handle;
  };
  await assert.rejects(generer(plan, { ...accord(plan), fsImpl: store.fsImpl,
    chargerCle: async () => assert.fail('aucune clé/API avant validation de la source') }), /réutilisation modifiée/);
  assert.equal(store.fichiers.size, 1);
  assert.ok(store.fichiers.has(REUTILISATION_REPRISE.cheminSource));
});

test('lots 04–07 : bornes validées, 23 paires groupées, commun unique et réutilisations Escaliers et Réaction approuvées', async () => {
  const v1 = selectionnerV1(), lots = listerLots();
  for (const [index, debut, fin] of [[0, 0, 10], [1, 10, 20], [2, 20, 41], [3, 41, 62], [4, 62, 82], [5, 82, 88], [6, 88, 88]]) {
    assert.deepEqual(lots[index].entrees, v1.slice(debut, fin));
  }
  const restants = lots.slice(3).flatMap(l => l.entrees);
  assert.equal(restants.length, 47);
  assert.equal(new Set(restants.map(e => e.nomFichier)).size, 47);
  const groupes = Map.groupBy(restants, e => e.identifiantAudio);
  let paires = 0, communs = 0;
  for (const [id, entrees] of groupes) {
    if (entrees[0].adresse === 'commun') { assert.equal(entrees.length, 1); communs++; }
    else { assert.deepEqual(entrees.map(e => e.adresse), ['tu', 'vous']); paires++; }
    assert.equal(lots.filter(l => l.entrees.some(e => e.identifiantAudio === id)).length, 1, id);
  }
  assert.equal(paires, 23); assert.equal(communs, 1);
  for (const [lot, debut, fin] of [['04', 42, 62], ['05', 63, 82], ['06', 83, 88]]) {
    const store = stockage(), plan = await preparerPlan({ lot, fsImpl: store.fsImpl });
    assert.deepEqual(plan.fichiers.map(e => e.numeroInventaire), Array.from({ length: fin - debut + 1 }, (_, i) => debut + i));
    assert.ok(plan.fichiers.every(e => [51, 81].includes(e.numeroInventaire) ? e.action === 'reutiliser' : e.action === 'synthetiser' && e.reutilisation === null));
    assert.deepEqual(store.appels, []);
  }
  await assert.rejects(preparerPlan({ lot: '08' }), /Lot inconnu/);
});

test('lot 07 réserve : simulation vide et production refusée avant toute opération', async () => {
  const store = stockage(), plan = await preparerPlan({ lot: '07', fsImpl: store.fsImpl });
  assert.equal(plan.nombreCibles, 0); assert.equal(plan.nombreSyntheses, 0);
  assert.equal(plan.nombreReutilisations, 0); assert.equal(plan.creditsEstimes, 0);
  assert.equal((await generer(plan, { fsImpl: store.fsImpl })).simulation, true);
  assert.throws(() => verifierAccord(plan, accord(plan)), /Sélection explicite/);
  assert.deepEqual(store.appels, []);
});

const archiveEscaliers = () => readFileSync(REUTILISATION_ESCALIERS.cheminSource);
function stockEscaliers() {
  const store = stockage();
  store.fichiers.set(REUTILISATION_ESCALIERS.cheminSource, archiveEscaliers());
  return store;
}

test('lot 04 : dry-run sans réseau, clé, copie ni écriture ; 21 cibles, 20 synthèses, 3359 crédits', async () => {
  const store = stockEscaliers(); const interdit = async () => assert.fail('effet de bord interdit');
  let affichage;
  const result = await executer(['--lot', '04', '--dry-run'], { fsImpl: store.fsImpl,
    fetchImpl: interdit, chargerCle: interdit, connexionImpl: interdit, log: x => { affichage = JSON.parse(x); } });
  const plan = result.plan;
  assert.equal(result.simulation, true); assert.equal(affichage.simulation, true);
  assert.equal(plan.nombreCibles, 21); assert.equal(plan.nombreSyntheses, 20); assert.equal(plan.nombreReutilisations, 1);
  assert.equal(plan.creditsEstimes, 3359); assert.equal(plan.caracteresTransmis, 3359);
  assert.equal(plan.caracteresInstructions, 1840); assert.equal(plan.caracteresSeparateurs, 20);
  assert.equal(plan.fichiers.filter(e => e.action === 'synthetiser').reduce((s,e)=>s+e.caracteresDialogue,0),1499);
  assert.deepEqual(plan.fichiers.map(e=>e.numeroInventaire),Array.from({length:21},(_,i)=>42+i));
  assert.deepEqual(plan.fichiers.map(e=>e.nomFichier),selectionnerV1().slice(41,62).map(e=>e.nomFichier));
  const reuse = plan.fichiers.find(e=>e.numeroInventaire===51);
  assert.equal(reuse.action,'reutiliser');assert.equal(reuse.texteEnvoye,null);assert.equal(reuse.caracteresTransmis,0);
  assert.equal(reuse.reutilisation.conforme,true);assert.equal(plan.blocages.length,0);
  assert.equal((await generer(plan,{fsImpl:store.fsImpl,fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit})).simulation,true);
  assert.deepEqual(store.appels,[]);assert.equal(store.fichiers.size,1);
});

test('lot 04 : copie exclusivement en mémoire, SHA exact et seulement 20 requêtes factices sans Escaliers TU', async () => {
  const store=stockEscaliers(),plan=await preparerPlan({lot:'04',fsImpl:store.fsImpl});
  const textes=plan.fichiers.filter(e=>e.action==='synthetiser').map(e=>e.texteEnvoye),envoyes=[];
  const log=console.log;console.log=()=>{};
  try {
    await generer(plan,{...accord(plan),fsImpl:store.fsImpl,chargerCle:async()=>'factice',connexionImpl:async()=>({voiceId:'factice'}),fetchImpl:async(_,options)=>{
      envoyes.push(JSON.parse(options.body).text);
      return {ok:true,headers:new Map([['content-type','audio/mpeg']]),arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer};
    }});
  } finally {console.log=log;}
  assert.deepEqual(envoyes,textes);assert.equal(envoyes.length,20);
  assert.ok(!envoyes.includes(PARAMETRES.direction+' '+selectionnerV1()[50].texte));
  const reuse=plan.fichiers.find(e=>e.numeroInventaire===51);
  assert.deepEqual(Buffer.from(store.fichiers.get(reuse.chemin)),archiveEscaliers());
  assert.deepEqual(store.fichiers.get(REUTILISATION_ESCALIERS.cheminSource),archiveEscaliers());
});

for(const scenario of ['absente','modifiee','destination','apres-plan','pendant-reservation']) {
  test('lot 04 : protection '+scenario+', aucun repli payant ni écrasement',async()=>{
    const store=stockEscaliers();
    if(scenario==='absente')store.fichiers.delete(REUTILISATION_ESCALIERS.cheminSource);
    if(scenario==='modifiee')store.fichiers.set(REUTILISATION_ESCALIERS.cheminSource,Buffer.from('modifie'));
    let plan=await preparerPlan({lot:'04',fsImpl:store.fsImpl});
    const reuse=plan.fichiers.find(e=>e.numeroInventaire===51);
    if(scenario==='destination'){store.fichiers.set(reuse.chemin,Buffer.from('conserver'));plan=await preparerPlan({lot:'04',fsImpl:store.fsImpl});}
    if(scenario==='apres-plan')store.fichiers.set(REUTILISATION_ESCALIERS.cheminSource,Buffer.from('modifie'));
    if(scenario==='pendant-reservation'){
      const open=store.fsImpl.open;store.fsImpl.open=async(path,flag)=>{const handle=await open(path,flag);store.fichiers.set(REUTILISATION_ESCALIERS.cheminSource,Buffer.from('modifie'));return handle;};
    }
    const interdit=async()=>assert.fail('réseau ou clé interdits');
    await assert.rejects(generer(plan,{...accord(plan),fsImpl:store.fsImpl,fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit}),/invalide|existant|périmé|modifiée/);
    assert.equal(plan.nombreSyntheses,20);assert.equal(reuse.action,'reutiliser');
    if(scenario==='destination')assert.equal(store.fichiers.get(reuse.chemin).toString(),'conserver');
    else assert.ok(!store.fichiers.has(reuse.chemin));
  });
}

const archiveReaction = () => readFileSync(REUTILISATION_REACTION.cheminSource);
function stockReaction() {
  const store = stockage();
  store.fichiers.set(REUTILISATION_REACTION.cheminSource, archiveReaction());
  return store;
}

test('lot 05 : dry-run sans réseau, clé, copie ni écriture ; 20 cibles, 19 synthèses, 3178 crédits', async () => {
  const store = stockReaction(); const interdit = async () => assert.fail('effet de bord interdit');
  let affichage;
  const result = await executer(['--lot', '05', '--dry-run'], { fsImpl: store.fsImpl,
    fetchImpl: interdit, chargerCle: interdit, connexionImpl: interdit, log: x => { affichage = JSON.parse(x); } });
  const plan = result.plan;
  assert.equal(result.simulation, true); assert.equal(affichage.simulation, true);
  assert.equal(plan.nombreCibles, 20); assert.equal(plan.nombreSyntheses, 19); assert.equal(plan.nombreReutilisations, 1);
  assert.equal(plan.creditsEstimes, 3178); assert.equal(plan.caracteresTransmis, 3178);
  assert.equal(plan.caracteresInstructions, 1748); assert.equal(plan.caracteresSeparateurs, 19);
  assert.equal(plan.fichiers.filter(e => e.action === 'synthetiser').reduce((s,e)=>s+e.caracteresDialogue,0),1411);
  assert.deepEqual(plan.fichiers.map(e=>e.numeroInventaire),Array.from({length:20},(_,i)=>63+i));
  assert.deepEqual(plan.fichiers.map(e=>e.nomFichier),selectionnerV1().slice(62,82).map(e=>e.nomFichier));
  const reuse = plan.fichiers.find(e=>e.numeroInventaire===81);
  assert.equal(reuse.action,'reutiliser');assert.equal(reuse.texteEnvoye,null);assert.equal(reuse.caracteresTransmis,0);
  assert.equal(reuse.reutilisation.conforme,true);assert.equal(plan.blocages.length,0);
  assert.equal((await generer(plan,{fsImpl:store.fsImpl,fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit})).simulation,true);
  assert.deepEqual(store.appels,[]);assert.equal(store.fichiers.size,1);
});

test('lot 05 : copie exclusivement en mémoire, SHA exact et seulement 19 requêtes factices sans Réaction TU', async () => {
  const store=stockReaction(),plan=await preparerPlan({lot:'05',fsImpl:store.fsImpl});
  const textes=plan.fichiers.filter(e=>e.action==='synthetiser').map(e=>e.texteEnvoye),envoyes=[];
  const log=console.log;console.log=()=>{};
  try {
    await generer(plan,{...accord(plan),fsImpl:store.fsImpl,chargerCle:async()=>'factice',connexionImpl:async()=>({voiceId:'factice'}),fetchImpl:async(_,options)=>{
      envoyes.push(JSON.parse(options.body).text);
      return {ok:true,headers:new Map([['content-type','audio/mpeg']]),arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer};
    }});
  } finally {console.log=log;}
  assert.deepEqual(envoyes,textes);assert.equal(envoyes.length,19);
  assert.ok(!envoyes.includes(PARAMETRES.direction+' '+selectionnerV1()[80].texte));
  const reuse=plan.fichiers.find(e=>e.numeroInventaire===81);
  assert.deepEqual(Buffer.from(store.fichiers.get(reuse.chemin)),archiveReaction());
  assert.deepEqual(store.fichiers.get(REUTILISATION_REACTION.cheminSource),archiveReaction());
});

for(const scenario of ['absente','modifiee','destination','apres-plan','pendant-reservation']) {
  test('lot 05 : protection '+scenario+', aucun repli payant ni écrasement',async()=>{
    const store=stockReaction();
    if(scenario==='absente')store.fichiers.delete(REUTILISATION_REACTION.cheminSource);
    if(scenario==='modifiee')store.fichiers.set(REUTILISATION_REACTION.cheminSource,Buffer.from('modifie'));
    let plan=await preparerPlan({lot:'05',fsImpl:store.fsImpl});
    const reuse=plan.fichiers.find(e=>e.numeroInventaire===81);
    if(scenario==='destination'){store.fichiers.set(reuse.chemin,Buffer.from('conserver'));plan=await preparerPlan({lot:'05',fsImpl:store.fsImpl});}
    if(scenario==='apres-plan')store.fichiers.set(REUTILISATION_REACTION.cheminSource,Buffer.from('modifie'));
    if(scenario==='pendant-reservation'){
      const open=store.fsImpl.open;store.fsImpl.open=async(path,flag)=>{const handle=await open(path,flag);store.fichiers.set(REUTILISATION_REACTION.cheminSource,Buffer.from('modifie'));return handle;};
    }
    const interdit=async()=>assert.fail('réseau ou clé interdits');
    await assert.rejects(generer(plan,{...accord(plan),fsImpl:store.fsImpl,fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit}),/invalide|existant|périmé|modifiée/);
    assert.equal(plan.nombreSyntheses,19);assert.equal(reuse.action,'reutiliser');
    if(scenario==='destination')assert.equal(store.fichiers.get(reuse.chemin).toString(),'conserver');
    else assert.ok(!store.fichiers.has(reuse.chemin));
  });
}

 test('lot 05 : formulaires 71/72 et variante VOUS réaction conservés, dix paires sans omission',async()=>{
  const store=stockReaction(),plan=await preparerPlan({lot:'05',fsImpl:store.fsImpl});
  assert.deepEqual(plan.fichiers.map(e=>e.texte),selectionnerV1().slice(62,82).map(e=>e.texte));
  for(const [id,es] of Map.groupBy(plan.fichiers,e=>e.identifiantAudio))assert.deepEqual(es.map(e=>e.adresse),['tu','vous'],id);
  for(const e of plan.fichiers)assert.equal(e.chemin,join(SORTIE_V1,e.nomFichier));
  assert.equal(plan.fichiers.find(e=>e.numeroInventaire===71).texte,COMPLETION_MESSAGES.tu.transition[1]);
  assert.equal(plan.fichiers.find(e=>e.numeroInventaire===72).texte,COMPLETION_MESSAGES.vous.transition[1]);
  assert.equal(plan.fichiers.find(e=>e.numeroInventaire===82).action,'synthetiser');
});

test('corrections lot 05 : deux TU R02, textes originaux et simulation sans effet de bord',async()=>{
  const store=stockage(),interdit=async()=>assert.fail('effet de bord interdit');let affichage;
  const result=await executer(['--lot','05','--corrections-r02','--dry-run'],{fsImpl:store.fsImpl,fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit,log:x=>{affichage=JSON.parse(x)}});
  const p=result.plan;assert.equal(result.simulation,true);assert.equal(affichage.simulation,true);
  assert.equal(p.nombreCibles,2);assert.equal(p.nombreSyntheses,2);assert.equal(p.nombreReutilisations,0);assert.equal(p.creditsEstimes,346);
  assert.deepEqual(p.fichiers.map(e=>e.numeroInventaire),[71,73]);assert.deepEqual(p.fichiers.map(e=>e.adresse),['tu','tu']);
  assert.deepEqual(p.fichiers.map(e=>e.texte),[COMPLETION_MESSAGES.tu.transition[1],COMPLETION_MESSAGES.tu.transition[2]]);
  for(const f of p.fichiers){assert.match(f.nomFichier,/--tu--hf--r02.mp3$/);assert.equal(f.revision,'r02');assert.equal(f.chemin,join(SORTIE_V1,f.nomFichier));assert.equal(f.texteEnvoye,PARAMETRES.direction+' '+f.texte);}
  assert.equal(p.caracteresDialogues,160);assert.equal(p.caracteresInstructions,184);assert.equal(p.caracteresSeparateurs,2);
  await generer(p,{fsImpl:store.fsImpl,fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit});assert.deepEqual(store.appels,[]);assert.equal(store.fichiers.size,0);
});

test('corrections lot 05 : sélection fermée, confirmation propre au mode et plan modifié refusé',async()=>{
  for(const lot of [undefined,'01','02','03','04','07'])await assert.rejects(preparerPlan({lot,correctionsR02:true}),/réservées aux lots/);
  const store=stockage(),p=await preparerPlan({lot:'05',correctionsR02:true,fsImpl:store.fsImpl});
  const lotNormal=await preparerPlan({lot:'05',fsImpl:store.fsImpl});assert.notEqual(p.accordPaiement,lotNormal.accordPaiement);
  for(const altere of [{...p,correctionsR02:false},{...p,fichiers:[...p.fichiers,p.fichiers[0]]}])await assert.rejects(generer(altere,{...accord(altere),fsImpl:store.fsImpl}),/périmé/);
  assert.deepEqual(store.appels,[]);
});

test('corrections lot 05 : deux requêtes factices maximum, R01 et autres fichiers intacts en mémoire',async()=>{
  const store=stockage(),p=await preparerPlan({lot:'05',correctionsR02:true,fsImpl:store.fsImpl});
  const historiques=p.fichiers.map(f=>f.chemin.replace('--r02.mp3','--r01.mp3'));for(const path of historiques)store.fichiers.set(path,Buffer.from('original'));
  let posts=0;const log=console.log;console.log=()=>{};
  try{const r=await generer(p,{...accord(p),fsImpl:store.fsImpl,chargerCle:async()=>'factice',connexionImpl:async()=>({voiceId:'factice'}),fetchImpl:async(_,options)=>{
    assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).text,p.fichiers[posts].texteEnvoye);posts++;
    return{ok:true,headers:new Map([['content-type','audio/mpeg']]),arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer};
  }});assert.equal(r.fichiers.length,2);}finally{console.log=log;}
  assert.equal(posts,2);for(const path of historiques)assert.equal(store.fichiers.get(path).toString(),'original');assert.equal(store.fichiers.size,4);
});

test('corrections lot 05 : sortie existante bloque tout réseau, sans écrasement',async()=>{
  const store=stockage();let p=await preparerPlan({lot:'05',correctionsR02:true,fsImpl:store.fsImpl});store.fichiers.set(p.fichiers[0].chemin,Buffer.from('conserver'));
  p=await preparerPlan({lot:'05',correctionsR02:true,fsImpl:store.fsImpl});const interdit=async()=>assert.fail('aucun réseau');
  await assert.rejects(generer(p,{...accord(p),fsImpl:store.fsImpl,chargerCle:interdit,fetchImpl:interdit,connexionImpl:interdit}),/existant/);
  assert.equal(store.fichiers.get(p.fichiers[0].chemin).toString(),'conserver');assert.deepEqual(store.appels,[]);
});

for(const reponse of ['refus','incertain'])test('corrections lot 05 : arrêt après premier échec '+reponse+', aucune relance',async()=>{
  const store=stockage(),p=await preparerPlan({lot:'05',correctionsR02:true,fsImpl:store.fsImpl});let posts=0;
  await assert.rejects(generer(p,{...accord(p),fsImpl:store.fsImpl,chargerCle:async()=>'factice',connexionImpl:async()=>({voiceId:'factice'}),fetchImpl:async()=>{posts++;if(reponse==='incertain')throw Error('connexion');return{ok:false,status:429};}}),/interrompue|429/);
  assert.equal(posts,1);assert.equal(store.fichiers.size,0);
});

test('corrections lot 06 : 85/86 R02 uniquement, 495 crédits et simulation hors réseau', async()=>{
 const store=stockage(),interdit=async()=>assert.fail('réseau interdit');
 const {plan:p}=await executer(['--lot','06','--corrections-r02','--dry-run'],{fsImpl:store.fsImpl,log:()=>{},fetchImpl:interdit,chargerCle:interdit,connexionImpl:interdit});
 assert.equal(p.creditsEstimes,495);assert.deepEqual(p.fichiers.map(f=>f.numeroInventaire),[85,86]);
 assert.deepEqual(p.fichiers.map(f=>f.adresse),['tu','vous']);
 for(const f of p.fichiers){assert.match(f.nomFichier,/--r02.mp3$/);assert.ok(f.texte.startsWith('Mais '));assert.equal(f.texteEnvoye,PARAMETRES.direction+' '+f.texte);}
 assert.deepEqual(store.appels,[]);
});

test('corrections lot 06 : deux appels maximum, arrêt sans relance, R01 intacts',async()=>{
 const store=stockage(),p=await preparerPlan({lot:'06',correctionsR02:true,fsImpl:store.fsImpl});
 for(const f of p.fichiers)store.fichiers.set(f.chemin.replace('--r02.mp3','--r01.mp3'),Buffer.from('original'));
 let posts=0;
 await assert.rejects(generer(p,{...accord(p),fsImpl:store.fsImpl,chargerCle:async()=>'factice',connexionImpl:async()=>({voiceId:'factice'}),fetchImpl:async()=>{posts++;throw Error('incertain')}}),/interrompue/);
 assert.equal(posts,1);assert.equal(store.fichiers.size,2);for(const b of store.fichiers.values())assert.equal(b.toString(),'original');
});

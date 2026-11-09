import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { controlerFichiers, trouverBlender, codeSortie, rapportLisible, executerControle } from '../scripts/voix/controler-mp3.mjs';

const folder = resolve('public/audio/voix/inscription');
const nomsDefectueux = [
  'inscription-question-sexe--tu--hf--r01.mp3',
  'inscription-question-age--vous--hf--r01.mp3',
  'inscription-mineur-message-complet--vous--hf--r01.mp3',
];
const nomsCorriges = nomsDefectueux.map(n => n.replace('--r01.mp3', '--r02.mp3'));
const ids = ['explication-niveau-depart', 'explication-forme-du-jour', 'explication-seance-adaptee',
  'question-sexe', 'question-prenom', 'question-age', 'mineur-remerciement',
  'mineur-retour-majorite', 'explication-securite', 'question-materiel', 'mineur-message-complet'];
const temoins = ids.flatMap(id => ['tu', 'vous'].map(mode => {
  const revision = (id === 'question-sexe' && mode === 'tu') ||
    (['question-age', 'mineur-message-complet'].includes(id) && mode === 'vous') ? 'r02' : 'r01';
  return `inscription-${id}--${mode}--hf--${revision}.mp3`;
}));
const paths = [...new Set([...nomsDefectueux, ...nomsCorriges, ...temoins])].map(n => join(folder, n));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let temp, fichiersTemporaires = [], report, byName, hashes;
const executable = trouverBlender();

before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'coach-audio-qc-'));
  const original = await readFile(paths[0]);
  const fixtures = [
    ['vide.mp3', Buffer.alloc(0)], ['trame-tronquee.mp3', original.subarray(0, original.length - 1)],
    ['fichier avec espaces.mp3', Buffer.from('Ceci ne contient aucun MP3')],
    ['id3-tronque.mp3', Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 127, 127])],
    ['extension.txt', Buffer.from('non audio')],
  ];
  for (const [name, bytes] of fixtures) {
    const path = join(temp, name); await writeFile(path, bytes, { flag: 'wx' }); fichiersTemporaires.push(path);
  }
  hashes = await Promise.all(paths.map(async p => [p, hash(await readFile(p))]));
  if (executable) {
    report = await controlerFichiers([...paths, ...fichiersTemporaires, join(temp, 'absent.mp3'), temp]);
    byName = new Map(report.resultats.map(r => [r.fichier, r]));
  }
});

after(async () => {
  for (const path of fichiersTemporaires) await unlink(path);
  if (temp) await rmdir(temp);
});

function disponible(t) {
  if (report) return true;
  t.skip('Décodeur Blender local absent : aucun téléchargement ou accès réseau automatique.');
  return false;
}

test('QC : trois répétitions connues signalées au seuil exploratoire inchangé de 0,94', t => {
  if (!disponible(t)) return;
  assert.equal(report.parametres.seuil, 0.94);
  assert.equal(report.parametres.seuilProvisoireNonValideIndependamment, true);
  assert.equal(report.ecouteHumaineObligatoire, true);
  const expected = [0.976, 0.944, 0.958];
  for (const [index, name] of nomsDefectueux.entries()) {
    const result = byName.get(join(folder, name));
    assert.equal(result.statut, 'repetition_suspecte', name);
    assert.equal(result.repetitions.alertes.length, 1);
    const alert = result.repetitions.alertes[0];
    assert.ok(Math.abs(alert.score - expected[index]) < 0.002, `${name} : méthode du diagnostic reproduite`);
    const [first, second] = alert.plagesSecondes;
    assert.ok(first[0] >= 0 && first[1] <= second[0] - 0.079);
    assert.ok(second[1] <= result.technique.dureeSecondes + 0.01);
    assert.equal(result.technique.decodageComplet, true, 'un MP3 répétitif peut être techniquement valide');
  }
});

test('QC : trois R02 corrigés sans alerte ; le fichier court signale une couverture limitée', t => {
  if (!disponible(t)) return;
  for (const name of nomsCorriges) {
    const r = byName.get(join(folder, name));
    assert.equal(r.statut, 'sans_alerte', name);
    assert.equal(r.repetitions.alertes.length, 0);
    assert.match(r.repetitions.limite, /Écoute humaine obligatoire/);
  }
  const court = byName.get(join(folder, nomsCorriges[0]));
  assert.equal(court.repetitions.comparaisonDisponible, false);
  assert.ok(court.avertissements.some(a => /courtes non couvertes/.test(a)));
});

test('QC : les 22 témoins du diagnostic ne produisent pas de faux positif sur ce corpus', t => {
  if (!disponible(t)) return;
  assert.equal(temoins.length, 22);
  for (const name of temoins) {
    const r = byName.get(join(folder, name));
    assert.equal(r.statut, 'sans_alerte', name);
    assert.equal(r.technique.frequenceHz, 44100);
    assert.equal(r.technique.canaux, 1);
    assert.deepEqual(r.technique.debitsKbps, [128]);
    assert.ok(r.technique.dureeSecondes > 0 && r.technique.tramesCompletes > 1);
  }
  assert.ok(byName.get(join(folder, 'inscription-mineur-message-complet--tu--hf--r01.mp3')).repetitions.meilleurePaire.score > 0.93,
    'le témoin proche du seuil reste visible : aucune garantie de fiabilité générale');
});

test('QC : fichier vide, tronqué, format invalide, ID3 incomplet, chemin absent et dossier', t => {
  if (!disponible(t)) return;
  for (const path of [...fichiersTemporaires, join(temp, 'absent.mp3'), temp]) {
    const r = byName.get(path);
    assert.equal(r.statut, 'analyse_impossible', path);
    assert.ok(r.problemes.length);
    assert.equal(r.repetitions, null);
  }
  assert.match(byName.get(join(temp, 'trame-tronquee.mp3')).problemes.join(' '), /tronquée/);
});

test('QC : aucun des 25 MP3 du corpus n’est modifié', async t => {
  if (!disponible(t)) return;
  assert.equal(paths.length, 25);
  for (const [path, beforeHash] of hashes) {
    const r = byName.get(path);
    assert.equal(r.fichierInchange, true);
    assert.equal(r.sha256Avant, beforeHash);
    assert.equal(r.sha256Apres, beforeHash);
    assert.equal(hash(await readFile(path)), beforeHash);
  }
});

test('QC : rapport lisible, trois catégories, scores et plages temporelles sans validation automatique', t => {
  if (!disponible(t)) return;
  const text = rapportLisible(report);
  assert.match(text, /ALERTE : score .*plages \[/);
  assert.match(text, /non validé indépendamment/);
  assert.match(text, /écoute humaine obligatoire de TOUS/);
  assert.match(text, /Anomalie technique ou analyse impossible/);
  assert.equal(codeSortie(report), 1);
  assert.equal(codeSortie({ resultats: report.resultats.filter(r => r.statut !== 'analyse_impossible') }), 2);
  assert.equal(codeSortie({ resultats: report.resultats.filter(r => r.statut === 'sans_alerte') }), 0);
});

test('QC : décodeur absent signalé par fichier, jamais d’installation automatique', async () => {
  const r = await controlerFichiers([paths[0], paths[0], paths[1]], { blender: join(temp, 'inexistant.exe') });
  assert.equal(r.resultats.length, 2, 'entrées dédoublonnées');
  assert.equal(codeSortie(r), 1);
  assert.ok(r.resultats.every(e => e.statut === 'analyse_impossible' && /absent/.test(e.problemes[0])));
  await assert.rejects(controlerFichiers([]), /au moins un/);
});

test('QC : CLI JSON, dossier et chemin avec espaces ; erreurs d’arguments', async () => {
  const out = [];
  const exit = await executerControle(['--json', '--blender', join(temp, 'absent.exe'), '--dossier', temp], { log: x => out.push(x) });
  assert.equal(exit, 1);
  const parsed = JSON.parse(out[0]);
  assert.equal(parsed.resultats.length, fichiersTemporaires.length - 1);
  assert.ok(parsed.resultats.some(r => r.fichier.endsWith('fichier avec espaces.mp3')));
  assert.ok(parsed.resultats.every(r => !r.fichier.endsWith('.txt')));
  await assert.rejects(executerControle(['--inconnu']), /Option inconnue/);
  await assert.rejects(executerControle(['--dossier']), /Valeur manquante/);
});

test('QC : commande réelle JSON et code 2 pour une répétition suspecte', t => {
  if (!disponible(t)) return;
  assert.throws(() => execFileSync(process.execPath,
    ['scripts/voix/controler-mp3.mjs', '--json', '--blender', executable, paths[0]],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), error => {
      assert.equal(error.status, 2);
      const parsed = JSON.parse(error.stdout);
      assert.equal(parsed.resultats[0].statut, 'repetition_suspecte');
      return true;
    });
});

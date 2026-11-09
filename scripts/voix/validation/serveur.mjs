import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listerLots } from '../generer-questionnaire.mjs';
import { selectionnerV1 } from '../questionnaire.mjs';

const dossierUI = fileURLToPath(new URL('./', import.meta.url));
const dossierAudio = fileURLToPath(new URL('../../../public/audio/voix/inscription/', import.meta.url));
const dossierEssais = fileURLToPath(new URL('../../../essais-audio/coach-antoine-questionnaire/', import.meta.url));
const nomsEssais = ['inscription-question-escaliers--tu--hf--r01.mp3', 'inscription-reaction-experience--tu--hf--r01.mp3'];
const groupesCorrections = [
  { id: 'corrections-06-r03', libelle: 'Correction lot 06 · Profil évolutif TU R03 · à valider',
    noms: ['inscription-conclusion-profil-evolutif--tu--hf--r03.mp3'] },
  { id: 'corrections-06', libelle: 'Corrections lot 06 · Profil évolutif TU/VOUS R02 · à valider',
    noms: ['inscription-conclusion-profil-evolutif--tu--hf--r02.mp3', 'inscription-conclusion-profil-evolutif--vous--hf--r02.mp3'] },
  { id: 'corrections-04', libelle: 'Corrections lot 04 · Équilibre TU/VOUS R02 · à valider',
    noms: ['inscription-question-equilibre--tu--hf--r02.mp3', 'inscription-question-equilibre--vous--hf--r02.mp3'] },
  { id: 'corrections-05', libelle: 'Corrections lot 05 · Présentation et accompagnement TU R02 · à valider',
    noms: ['inscription-experience-presentation--tu--hf--r02.mp3', 'inscription-experience-accompagnement--tu--hf--r02.mp3'] },
];
const nomsCorrections = groupesCorrections.flatMap(groupe => groupe.noms);
const sha = valeur => createHash('sha256').update(valeur).digest('hex');
// Révisions déjà validées ; ne jamais sélectionner automatiquement le dernier Rxx.
const revisions = new Map([
  ['inscription-conclusion-profil-evolutif--tu--hf--r01.mp3', 'inscription-conclusion-profil-evolutif--tu--hf--r03.mp3'],
  ['inscription-conclusion-profil-evolutif--vous--hf--r01.mp3', 'inscription-conclusion-profil-evolutif--vous--hf--r02.mp3'],
  ['inscription-question-sexe--tu--hf--r01.mp3', 'inscription-question-sexe--tu--hf--r02.mp3'],
  ['inscription-question-age--vous--hf--r01.mp3', 'inscription-question-age--vous--hf--r02.mp3'],
  ['inscription-experience-presentation--tu--hf--r01.mp3', 'inscription-experience-presentation--tu--hf--r03.mp3'],
  ['inscription-experience-accompagnement--tu--hf--r01.mp3', 'inscription-experience-accompagnement--tu--hf--r02.mp3'],
]);

export async function construireInventaire() {
  const numeros = new Map(selectionnerV1().map((e, i) => [e.nomFichier, i + 1]));
  const lots = [];
  for (const lot of listerLots()) {
    const fichiers = [];
    for (const entree of lot.entrees) {
      const nomFichier = revisions.get(entree.nomFichier) ?? entree.nomFichier;
      let empreinteAudio = null, tailleOctets = null;
      try {
        const bytes = await readFile(join(dossierAudio, nomFichier));
        empreinteAudio = sha(bytes); tailleOctets = bytes.length;
      } catch (erreur) { if (erreur.code !== 'ENOENT') throw erreur; }
      fichiers.push({ numero: numeros.get(entree.nomFichier), identifiantAudio: entree.identifiantAudio,
        variante: entree.adresse, texte: entree.texte, nomFichier,
        nomInventaire: entree.nomFichier, source: entree.source,
        cheminProjet: `public/audio/voix/inscription/${nomFichier}`,
        urlAudio: `/audio/${encodeURIComponent(nomFichier)}`, disponible: tailleOctets > 0,
        sha256: empreinteAudio, tailleOctets,
        idDecision: sha(JSON.stringify([entree.identifiantAudio, entree.adresse, nomFichier, empreinteAudio, entree.texte])),
      });
    }
    lots.push({ id: lot.lot, fichiers });
  }
  const essais = [];
  for (const nom of nomsEssais) {
    const entree = selectionnerV1().find(e => e.nomFichier === nom);
    const officiel = lots.flatMap(l => l.fichiers).find(f => f.nomInventaire === nom);
    let bytes = null;
    try { bytes = await readFile(join(dossierEssais, nom)); }
    catch (erreur) { if (erreur.code !== 'ENOENT') throw erreur; }
    const empreinte = bytes ? sha(bytes) : null;
    essais.push({ ...officiel, nomFichier: nom, disponible: Boolean(bytes?.length),
      cheminProjet: 'essais-audio/coach-antoine-questionnaire/' + nom,
      urlAudio: '/essais/' + encodeURIComponent(nom), sha256: empreinte, tailleOctets: bytes?.length ?? null,
      idDecision: 'essai:' + sha(JSON.stringify([entree.identifiantAudio, entree.adresse, nom, empreinte, entree.texte])) });
  }
  lots.push({ id: 'essais', type: 'essais', fichiers: essais });
  // Candidats R02 à écouter : les R01 officiels et leurs décisions restent intacts.
  for (const groupe of groupesCorrections) {
    const corrections = [];
    for (const nom of groupe.noms) {
    const original = lots.flatMap(l => l.fichiers).find(f => f.nomInventaire === nom.replace(/--r0[23]\.mp3$/, '--r01.mp3') && !f.idDecision.startsWith('essai:'));
    let bytes = null;
    try { bytes = await readFile(join(dossierAudio, nom)); }
    catch (erreur) { if (erreur.code !== 'ENOENT') throw erreur; }
    const empreinte = bytes ? sha(bytes) : null;
    corrections.push({ ...original, nomFichier: nom, disponible: Boolean(bytes?.length),
      cheminProjet: 'public/audio/voix/inscription/' + nom, urlAudio: '/audio/' + encodeURIComponent(nom),
      sha256: empreinte, tailleOctets: bytes?.length ?? null,
      idDecision: 'correction:' + sha(JSON.stringify([original.identifiantAudio, original.variante, nom, empreinte, original.texte])) });
  }
    lots.push({ id: groupe.id, type: 'corrections', libelle: groupe.libelle, fichiers: corrections });
  }
  let registre = null;
  try { registre = JSON.parse(await readFile(join(dossierUI, 'validation-lot05.json'), 'utf8')); }
  catch (erreur) { if (erreur.code !== 'ENOENT') throw new Error('Manifeste de validation du lot 05 illisible.'); }
  const erreursValidation = registre ? appliquerManifeste(lots, registre) : [];
  try {
    const registre06 = JSON.parse(await readFile(join(dossierUI, 'validation-lot06.json'), 'utf8'));
    erreursValidation.push(...appliquerManifeste(lots, registre06));
  } catch (erreur) { if (erreur.code !== 'ENOENT') throw erreur; }
  return { version: 1, projet: 'Coach Antoine', lotParDefaut: '03', lots,
    ...(erreursValidation.length ? { erreursValidation } : {}) };
}

// Validation humaine explicite, valable uniquement pour le texte et les octets approuvés.
export function appliquerManifeste(lots, registre) {
  const lot = lots.find(l => l.id === registre.lot);
  const lot06 = registre.lot === '06';
  if (registre.version !== 1 || !['05', '06'].includes(registre.lot) || !registre.reference || !registre.date ||
      !Array.isArray(registre.fichiers) || (lot06 ? registre.fichiers.length < 1 || registre.fichiers.length > 6 : registre.fichiers.length !== 20) ||
      new Set(registre.fichiers.map(f => f.numero)).size !== registre.fichiers.length ||
      registre.fichiers.some(f => !Number.isInteger(f.numero) || f.numero < (lot06 ? 83 : 63) || f.numero > (lot06 ? 88 : 82))) {
    throw new Error('Manifeste de validation invalide.');
  }
  const erreurs = [];
  if (lot06) for (const groupe of lots.filter(l => l.type === 'corrections')) for (const f of groupe.fichiers) if (f.numero >= 83 && f.numero <= 88) delete f.validationUtilisateur;
  for (const fichier of lot?.fichiers ?? []) delete fichier.validationUtilisateur;
  for (const approuve of registre.fichiers) {
    const fichier = lot?.fichiers.find(f => f.numero === approuve.numero);
    if (!fichier?.disponible || fichier.nomFichier !== approuve.nomFichier ||
        fichier.sha256 !== approuve.sha256 || fichier.idDecision !== approuve.idDecision) {
      erreurs.push('Validation non appliquée : entrée ' + approuve.numero + ', fichier absent ou version différente.');
      continue;
    }
    fichier.validationUtilisateur = { statut: 'valide', remarque: registre.origine,
      modifieLe: registre.date, reference: registre.reference + ':' + fichier.idDecision };
  }
  // Une validation du lot 06 vaut aussi pour le même fichier présenté en comparaison.
  if (lot06) for (const groupe of lots.filter(l => l.type === 'corrections')) for (const candidat of groupe.fichiers) {
    const approuve = lot.fichiers.find(f => f.validationUtilisateur && f.nomFichier === candidat.nomFichier && f.sha256 === candidat.sha256 && f.texte === candidat.texte);
    if (approuve) candidat.validationUtilisateur = { ...approuve.validationUtilisateur, reference: registre.reference + ':' + candidat.idDecision };
  }
  return erreurs;
}

export function plageOctets(header, taille) {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || taille === 0) throw new Error('Plage invalide');
  const debut = match[1] ? Number(match[1]) : Math.max(0, taille - Number(match[2]));
  const fin = match[1] && match[2] ? Math.min(Number(match[2]), taille - 1) : taille - 1;
  if (!Number.isSafeInteger(debut) || !Number.isSafeInteger(fin) || debut > fin || debut >= taille) throw new Error('Plage invalide');
  return { debut, fin };
}

export function creerServeurValidation() {
  const autorises = new Set(listerLots().flatMap(l => l.entrees.map(e => revisions.get(e.nomFichier) ?? e.nomFichier)));
  for (const nom of nomsCorrections) autorises.add(nom);
  const statiques = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/etat.js', ['etat.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ]);
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    const erreur = (code, message) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(message); };
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return erreur(403, 'Accès local uniquement.');
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return erreur(405, 'Lecture seule.'); }
    try {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname === '/api/inventaire') {
        const body = JSON.stringify(await construireInventaire());
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        return res.end(req.method === 'HEAD' ? undefined : body);
      }
      if (statiques.has(pathname)) {
        const [fichier, type] = statiques.get(pathname), bytes = await readFile(join(dossierUI, fichier));
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      if (pathname.startsWith('/audio/') || pathname.startsWith('/essais/')) {
        const essai = pathname.startsWith('/essais/');
        const nom = decodeURIComponent(pathname.slice(essai ? 8 : 7));
        if (!(essai ? nomsEssais.includes(nom) : autorises.has(nom))) return erreur(404, 'Fichier hors inventaire.');
        const path = join(essai ? dossierEssais : dossierAudio, nom), info = await stat(path);
        if (!info.isFile()) return erreur(404, 'MP3 absent.');
        let plage;
        try { plage = plageOctets(req.headers.range, info.size); }
        catch { res.setHeader('Content-Range', `bytes */${info.size}`); return erreur(416, 'Plage audio invalide.'); }
        const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes',
          'Content-Length': plage ? plage.fin - plage.debut + 1 : info.size };
        if (plage) headers['Content-Range'] = `bytes ${plage.debut}-${plage.fin}/${info.size}`;
        res.writeHead(plage ? 206 : 200, headers);
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(path, plage ? { start: plage.debut, end: plage.fin } : {});
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        return stream.pipe(res);
      }
      return erreur(404, 'Page introuvable.');
    } catch (error) {
      if (res.headersSent) return res.destroy();
      return erreur(error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'MP3 absent.' : 'Lecture locale impossible.');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const port = args.length === 0 ? 8787 : args.length === 2 && args[0] === '--port' ? Number(args[1]) : NaN;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('Usage : node scripts/voix/validation/serveur.mjs [--port 8787]'); process.exitCode = 1;
  } else {
    const server = creerServeurValidation();
    server.on('error', () => { console.error(`Démarrage impossible sur le port ${port}. Aucun autre port choisi automatiquement.`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Validation audio locale : http://127.0.0.1:${port}/\nCtrl+C pour arrêter. Même adresse et navigateur pour retrouver les décisions.`));
  }
}

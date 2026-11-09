import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const backend = fileURLToPath(new URL('./controle-mp3.py', import.meta.url));
export const CATEGORIES = Object.freeze({
  sans_alerte: 'Contrôle technique réussi, aucune répétition suspecte détectée',
  repetition_suspecte: 'Répétition suspecte : écoute prioritaire',
  analyse_impossible: 'Anomalie technique ou analyse impossible',
});

export function trouverBlender(explicite) {
  if (explicite) return resolve(explicite);
  if (process.env.BLENDER_EXECUTABLE) return resolve(process.env.BLENDER_EXECUTABLE);
  for (const folder of (process.env.PATH || '').split(delimiter)) {
    const candidate = join(folder, process.platform === 'win32' ? 'blender.exe' : 'blender');
    if (existsSync(candidate)) return candidate;
  }
  // Installation Windows déjà présente : aucune installation ni téléchargement.
  const foundation = join(process.env.ProgramFiles || 'C:/Program Files', 'Blender Foundation');
  try {
    for (const entry of readdirSync(foundation).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const candidate = join(foundation, entry, 'blender.exe');
      if (existsSync(candidate)) return candidate;
    }
  } catch { /* Un décodeur absent sera signalé dans le rapport. */ }
  return null;
}

export async function controlerFichiers(fichiers, { blender, timeoutMs = 120000 } = {}) {
  if (!Array.isArray(fichiers) || !fichiers.length) throw new Error('Indiquer au moins un fichier MP3.');
  const uniques = [...new Map(fichiers.map(p => {
    const path = resolve(p);
    return [process.platform === 'win32' ? path.toLowerCase() : path, path];
  })).values()];
  const executable = trouverBlender(blender);
  const impossible = motif => ({
    version: 1, parametres: { seuil: 0.94, seuilProvisoireNonValideIndependamment: true },
    ecouteHumaineObligatoire: true,
    avertissement: 'Aucun résultat ne dispense de l’écoute humaine. Aucun fichier modifié.',
    resultats: uniques.map(fichier => ({ fichier, statut: 'analyse_impossible',
      categorie: CATEGORIES.analyse_impossible, technique: {}, repetitions: null,
      problemes: [motif], avertissements: [] })),
  });
  if (!executable || !existsSync(executable)) return impossible('Blender local absent : utiliser --blender CHEMIN ou BLENDER_EXECUTABLE. Aucune installation automatique.');
  try {
    const { stdout } = await execFileAsync(executable, [
      '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', backend,
    ], {
      windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1',
        COACH_AUDIO_QC_INPUT: JSON.stringify({ fichiers: uniques }) },
    });
    const line = stdout.split(/\r?\n/).find(l => l.startsWith('COACH_AUDIO_QC_JSON='));
    if (!line) return impossible('Le décodeur local n’a pas retourné de rapport exploitable.');
    const report = JSON.parse(line.slice('COACH_AUDIO_QC_JSON='.length));
    if (!Array.isArray(report.resultats) || report.resultats.length !== uniques.length) {
      return impossible('Rapport du décodeur incomplet.');
    }
    return report;
  } catch {
    return impossible('Décodeur local indisponible, erreur de dépendance ou délai dépassé. Aucun MP3 modifié.');
  }
}

export function codeSortie(report) {
  if (report.resultats.some(r => r.statut === 'analyse_impossible')) return 1;
  if (report.resultats.some(r => r.statut === 'repetition_suspecte')) return 2;
  return 0;
}

export function rapportLisible(report) {
  const lines = [
    'Contrôle local des MP3 — écoute humaine obligatoire de TOUS les fichiers.',
    'Seuil exploratoire : 0,94, provisoire et non validé indépendamment.',
    'L’absence d’alerte ne garantit pas l’absence de répétition.', '',
  ];
  for (const result of report.resultats) {
    lines.push(result.fichier, `  ${result.categorie}`);
    const t = result.technique;
    if (t.dureeSecondes !== undefined) lines.push(`  ${t.dureeSecondes.toFixed(3)} s ; ${t.tailleOctets} octets ; ${t.format} ; ${t.frequenceHz} Hz ; ${t.canaux} canal/canaux ; ${t.debitsKbps.join('/')} kbit/s`);
    if (t.decodageComplet) lines.push(`  Décodage complet ; ${t.tramesCompletes} trames complètes.`);
    for (const alert of result.repetitions?.alertes || []) {
      const ranges = alert.plagesSecondes.map(([a, b]) => `[${a.toFixed(3)}–${b.toFixed(3)} s]`).join(' et ');
      lines.push(`  ALERTE : score ${alert.score.toFixed(4)} ; plages ${ranges}.`);
    }
    const best = result.repetitions?.meilleurePaire;
    if (best && !result.repetitions.alertes.length) lines.push(`  Meilleur score : ${best.score.toFixed(4)} ; aucune alerte au seuil actuel.`);
    for (const message of [...result.problemes, ...result.avertissements]) lines.push(`  Attention : ${message}`);
    lines.push('');
  }
  for (const [statut, titre] of Object.entries(CATEGORIES)) lines.push(`${report.resultats.filter(r => r.statut === statut).length} — ${titre}`);
  lines.push('Aucune validation, correction ou intégration automatique.');
  return lines.join('\n');
}

export async function executerControle(args = process.argv.slice(2), { log = console.log } = {}) {
  const fichiers = [];
  let json = false, blender, apresSeparateur = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (apresSeparateur) { fichiers.push(arg); continue; }
    if (arg === '--') { apresSeparateur = true; continue; }
    if (arg === '--aide' || arg === '--help' || arg === '-h') {
      log('Usage : node scripts/voix/controler-mp3.mjs [--json] [--blender CHEMIN] [--dossier DOSSIER] fichier1.mp3 fichier2.mp3 ...\nLecture seule ; aucun réseau ; écoute humaine obligatoire. Codes : 0 sans alerte, 2 répétition suspecte, 1 anomalie ou analyse impossible.');
      return 0;
    }
    if (arg === '--json') { json = true; continue; }
    if (arg === '--blender' || arg === '--dossier') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Valeur manquante pour ${arg}.`);
      if (arg === '--blender') blender = value;
      else {
        const folder = resolve(value);
        for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (entry.isFile() && /\.mp3$/i.test(entry.name)) fichiers.push(join(folder, entry.name));
        }
      }
    } else if (arg.startsWith('--')) throw new Error('Option inconnue. Consulter --aide.');
    else fichiers.push(arg);
  }
  const report = await controlerFichiers(fichiers, { blender });
  log(json ? JSON.stringify(report, null, 2) : rapportLisible(report));
  return codeSortie(report);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executerControle().then(code => { process.exitCode = code; }).catch(() => {
    console.error('Contrôle impossible : vérifier les arguments, les chemins et le décodeur local (--aide). Aucun MP3 modifié.');
    process.exitCode = 1;
  });
}

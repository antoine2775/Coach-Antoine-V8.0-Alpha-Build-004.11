export const CLE_STOCKAGE = 'coach-antoine-validation-audio.v1';
const statuts = new Set(['valide', 'a_corriger', 'non_examine']);
export const etatVide = () => ({ version: 1, decisions: {}, curseurs: {}, dernierLot: '03' });

export function lireEtat(storage) {
  try {
    const contenu = storage.getItem(CLE_STOCKAGE);
    if (contenu === null) return { etat: etatVide(), erreur: null };
    const etat = JSON.parse(contenu);
    if (etat.version !== 1 || !etat.decisions || Array.isArray(etat.decisions) || typeof etat.decisions !== 'object' ||
        !etat.curseurs || Array.isArray(etat.curseurs) || typeof etat.curseurs !== 'object') throw new Error();
    for (const decision of Object.values(etat.decisions)) {
      if (!statuts.has(decision.statut) || typeof decision.remarque !== 'string') throw new Error();
    }
    return { etat, erreur: null };
  } catch {
    return { etat: etatVide(), erreur: 'Stockage indisponible ou illisible. Aucune donnée existante ne sera écrasée. Les décisions restent en mémoire : exportez le bilan.' };
  }
}

export function decisionPour(etat, fichier) {
  if (!fichier.disponible) return { statut: 'non_examine', remarque: '', modifieLe: null };
  return etat.decisions[fichier.idDecision] ?? { statut: 'non_examine', remarque: '', modifieLe: null };
}

export function enregistrerEtat(storage, etat) {
  const precedent = lireEtat(storage);
  if (precedent.erreur) return precedent.erreur;
  try { storage.setItem(CLE_STOCKAGE, JSON.stringify(etat)); return null; }
  catch { return 'Enregistrement local impossible. Exportez le bilan avant de fermer cette page.'; }
}

export function resumeLot(etat, lot) {
  const resume = { valides: 0, aCorriger: 0, nonExamines: 0 };
  for (const fichier of lot.fichiers) {
    const statut = decisionPour(etat, fichier).statut;
    resume[statut === 'valide' ? 'valides' : statut === 'a_corriger' ? 'aCorriger' : 'nonExamines']++;
  }
  return resume;
}

export function exporterLot(etat, lot, date = new Date()) {
  return { version: 1, projet: 'Coach Antoine', lot: lot.id, ...(lot.type === 'essais' ? { type: 'essais', objet: 'Décisions de réutilisation uniquement, aucune intégration automatique' } : {}), exporteLe: date.toISOString(),
    resume: resumeLot(etat, lot), decisions: lot.fichiers.map(fichier => ({
      numero: fichier.numero, identifiantAudio: fichier.identifiantAudio, variante: fichier.variante,
      texte: fichier.texte, nomFichier: fichier.nomFichier, cheminProjet: fichier.cheminProjet,
      sha256: fichier.sha256, disponible: fichier.disponible, ...decisionPour(etat, fichier),
    })) };
}

// Import unique d'une décision explicite ; les décisions ultérieures de l'utilisateur restent prioritaires.
export function importerValidationsUtilisateur(etat, inventaire) {
  for (const lot of inventaire.lots) for (const fichier of lot.fichiers) {
    const validation = fichier.validationUtilisateur;
    if (!fichier.disponible || validation?.statut !== 'valide' || !validation.reference) continue;
    if (etat.decisions[fichier.idDecision]?.validationReference === validation.reference) continue;
    etat.decisions[fichier.idDecision] = { statut: 'valide', remarque: validation.remarque,
      modifieLe: validation.modifieLe, validationReference: validation.reference };
  }
  return etat;
}

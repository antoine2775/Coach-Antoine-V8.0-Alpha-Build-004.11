"""Contrôle local en lecture seule, exécuté avec le Python de Blender.
Aucun import du générateur, aucune API réseau, aucune écriture de fichier.
"""
import hashlib
import json
import os
from pathlib import Path

import aud
import numpy as np

SEUIL_EXPLORATOIRE = 0.94
CATEGORIES = {
    'sans_alerte': 'Contrôle technique réussi, aucune répétition suspecte détectée',
    'repetition_suspecte': 'Répétition suspecte : écoute prioritaire',
    'analyse_impossible': 'Anomalie technique ou analyse impossible',
}
PARAMETRES = {
    'seuil': SEUIL_EXPLORATOIRE,
    'seuilProvisoireNonValideIndependamment': True,
    'methode': 'Corrélation des enveloppes RMS normalisées, sans reconnaissance des mots',
    'pasRmsMs': 10,
    'fenetreNominaleSecondes': 0.90,
    'facteursDuree': [1, 1.15, 1 / 1.15],
    'pasBalayageMs': 50,
    'pointsInterpolation': 64,
    'seuilActiviteDbfs': -45,
    'fractionActiviteMinimale': 0.55,
    'normeMinimale': 0.015,
    'separationMinimaleSecondes': 0.08,
    'dureeMaximaleSecondes': 60,
}


class AnalyseImpossible(Exception):
    pass


def empreinte(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def examiner_trames(data):
    """MPEG Layer III : trames complètes et ID3v1/v2 ; pas de contrôle CRC."""
    if not data:
        raise AnalyseImpossible('Fichier vide.')
    position = 0
    if data[:3] == b'ID3':
        if len(data) < 10 or data[3] not in (2, 3, 4) or any(v & 128 for v in data[6:10]):
            raise AnalyseImpossible('En-tête ID3 invalide ou non pris en charge.')
        position = 10 + sum(data[6 + i] << (21 - 7 * i) for i in range(4))
        if data[3] == 4 and data[5] & 16:
            position += 10
        if position > len(data):
            raise AnalyseImpossible('Bloc ID3 tronqué.')
    frames = 0
    rates, frequencies, channels, versions = set(), set(), set(), set()
    duration = 0.0
    while position < len(data):
        if len(data) - position == 128 and data[position:position + 3] == b'TAG':
            position += 128
            break
        if position + 4 > len(data):
            raise AnalyseImpossible('En-tête de trame MP3 tronqué.')
        header = int.from_bytes(data[position:position + 4], 'big')
        version, layer = (header >> 19) & 3, (header >> 17) & 3
        bitrate_index, frequency_index = (header >> 12) & 15, (header >> 10) & 3
        if (header >> 21) & 2047 != 2047 or version == 1 or layer != 1:
            raise AnalyseImpossible('Format non MP3 Layer III ou synchronisation invalide.')
        if bitrate_index in (0, 15) or frequency_index == 3:
            raise AnalyseImpossible('Débit libre ou en-tête réservé : analyse non prise en charge.')
        table = ([0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
                 if version == 3 else [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])
        bitrate = table[bitrate_index]
        divisor = {3: 1, 2: 2, 0: 4}[version]
        frequency = [44100, 48000, 32000][frequency_index] // divisor
        size = int((144000 if version == 3 else 72000) * bitrate / frequency) + ((header >> 9) & 1)
        if position + size > len(data):
            raise AnalyseImpossible('Trame MP3 tronquée.')
        count_channels = 1 if (header >> 6) & 3 == 3 else 2
        frames += 1
        rates.add(bitrate)
        frequencies.add(frequency)
        channels.add(count_channels)
        versions.add(version)
        duration += (1152 if version == 3 else 576) / frequency
        position += size
    if frames < 2:
        raise AnalyseImpossible('Pas assez de trames audio MP3.')
    if len(frequencies) != 1 or len(channels) != 1 or len(versions) != 1:
        raise AnalyseImpossible('Caractéristiques MP3 changeantes à l’intérieur du fichier.')
    return {
        'format': 'MPEG Layer III (MP3)', 'tramesCompletes': frames,
        'frequenceHz': next(iter(frequencies)), 'canaux': next(iter(channels)),
        'debitsKbps': sorted(rates), 'dureeTramesSecondes': duration,
        'crcEtIntegriteSemantiqueNonVerifies': True,
    }


def comparer_segments(samples, sample_rate):
    """Reproduction du balayage exploratoire, seuil inchangé, aucune coupe."""
    hop = round(sample_rate * 0.01)
    step = hop / sample_rate
    # Même calcul RMS que le diagnostic ; en stéréo, puissance des deux canaux.
    energy = np.array([np.sqrt(np.mean(samples[i:i + hop] ** 2))
                       for i in range(0, len(samples) - hop + 1, hop)])
    db = 20 * np.log10(energy + 1e-12)
    vectors, ranges = [], []
    for duration in [0.90, 0.90 * 1.15, 0.90 / 1.15]:
        size = round(duration / step)
        for start in range(0, len(energy) - size + 1, 5):
            segment = energy[start:start + size]
            if np.mean(db[start:start + size] > -45) < 0.55:
                continue
            vector = np.interp(np.linspace(0, size - 1, 64), np.arange(size), segment)
            vector -= vector.mean()
            norm = np.linalg.norm(vector)
            if norm < 0.015:
                continue
            vectors.append(vector / norm)
            ranges.append((start * step, (start + size) * step))
    best = None
    pairs = 0
    if vectors:
        matrix = np.array(vectors)
        correlations = matrix @ matrix.T
        starts = np.array([r[0] for r in ranges])
        for i, (start, end) in enumerate(ranges):
            candidates = np.flatnonzero(starts >= end + 0.08)
            pairs += len(candidates)
            if not len(candidates):
                continue
            j = int(candidates[np.argmax(correlations[i, candidates])])
            score = float(correlations[i, j])
            if best is None or score > best['score']:
                best = {'score': score, 'plagesSecondes': [[start, end], list(ranges[j])]}
    return {
        'meilleurePaire': best,
        'pairesComparees': pairs,
        'comparaisonDisponible': best is not None,
        'alertes': [best] if best and best['score'] >= SEUIL_EXPLORATOIRE else [],
        'limite': 'Aucun score ne prouve l’absence de répétition. Écoute humaine obligatoire.',
    }


def controler(path_text):
    path = Path(path_text)
    result = {'fichier': str(path), 'statut': 'analyse_impossible', 'technique': {},
              'repetitions': None, 'problemes': [], 'avertissements': []}
    before = None
    try:
        if not path.is_file():
            raise AnalyseImpossible('Fichier absent ou chemin non régulier.')
        if path.suffix.lower() != '.mp3':
            raise AnalyseImpossible('Extension attendue : .mp3.')
        before = empreinte(path)
        result['sha256Avant'] = before
        data = path.read_bytes()
        result['technique']['tailleOctets'] = len(data)
        metadata = examiner_trames(data)
        result['technique'].update(metadata)
        if metadata['dureeTramesSecondes'] > PARAMETRES['dureeMaximaleSecondes']:
            raise AnalyseImpossible('Durée supérieure à 60 s : limite de ressources de ce premier outil.')
        sound = aud.Sound.file(str(path)).cache()
        samples = sound.data()
        sample_rate, count_channels = sound.specs
        if samples.ndim != 2 or len(samples) == 0 or not np.isfinite(samples).all():
            raise AnalyseImpossible('Échantillons décodés vides ou non finis.')
        duration = len(samples) / sample_rate
        peak = float(np.max(np.abs(samples)))
        result['technique'].update({'decodageComplet': True, 'dureeSecondes': duration,
                                   'creteLineaire': peak})
        if sample_rate != metadata['frequenceHz'] or count_channels != metadata['canaux']:
            raise AnalyseImpossible('Désaccord entre les en-têtes et les caractéristiques décodées.')
        if abs(duration - metadata['dureeTramesSecondes']) > 0.25:
            raise AnalyseImpossible('Écart de durée inhabituel entre les trames et le décodage.')
        if peak <= 0.001:
            raise AnalyseImpossible('Signal silencieux ou extrêmement faible : vérifier à l’écoute.')
        if peak >= 1:
            raise AnalyseImpossible('Crête à 0 dBFS ou au-delà : saturation possible, non prouvée.')
        analysis = comparer_segments(samples, sample_rate)
        result['repetitions'] = analysis
        if not analysis['comparaisonDisponible']:
            result['avertissements'].append('Aucune paire exploitable avec ces fenêtres ; répétitions courtes non couvertes.')
        result['statut'] = 'repetition_suspecte' if analysis['alertes'] else 'sans_alerte'
    except AnalyseImpossible as error:
        result['problemes'].append(str(error))
    except Exception:
        result['problemes'].append('Lecture, décodage ou analyse locale impossible.')
    finally:
        if before is not None:
            try:
                after = empreinte(path)
                result['sha256Apres'] = after
                result['fichierInchange'] = before == after
                if before != after:
                    result['statut'] = 'analyse_impossible'
                    result['problemes'].append('Fichier changé pendant le contrôle ; résultat non fiable.')
            except OSError:
                result['statut'] = 'analyse_impossible'
                result['problemes'].append('Fichier inaccessible après analyse.')
    result['categorie'] = CATEGORIES[result['statut']]
    return result


def main():
    request = json.loads(os.environ['COACH_AUDIO_QC_INPUT'])
    results = [controler(path) for path in request['fichiers']]
    report = {'version': 1, 'parametres': PARAMETRES, 'ecouteHumaineObligatoire': True,
              'avertissement': 'Seuil exploratoire calibré sur les cas connus, non validé indépendamment. Aucune validation ni correction automatique.',
              'resultats': results}
    print('COACH_AUDIO_QC_JSON=' + json.dumps(report, ensure_ascii=True, allow_nan=False))


if __name__ == '__main__':
    main()

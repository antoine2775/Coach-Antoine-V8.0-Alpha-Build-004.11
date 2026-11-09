import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { construireInventaire, creerServeurValidation, plageOctets, appliquerManifeste } from '../scripts/voix/validation/serveur.mjs';
import { CLE_STOCKAGE, lireEtat, decisionPour, exporterLot, importerValidationsUtilisateur, resumeLot } from '../scripts/voix/validation/etat.js';
import { demarrer } from '../scripts/voix/validation/app.js';
import { selectionnerV1 } from '../scripts/voix/questionnaire.mjs';

let inventaire, serveur, origine, html;
before(async () => {
  inventaire = await construireInventaire();
  html = await readFile(new URL('../scripts/voix/validation/index.html', import.meta.url), 'utf8');
  serveur = creerServeurValidation();
  await new Promise(resolve => serveur.listen(0, '127.0.0.1', resolve));
  origine = `http://127.0.0.1:${serveur.address().port}`;
});
after(async () => { serveur.closeAllConnections(); await new Promise(resolve => serveur.close(resolve)); });

function stockage() {
  const data = new Map([['coachAntoineProfile', 'profil à conserver']]);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
async function monter({ storage = stockage(), play = () => Promise.resolve(), fetchImpl, inventaireTest = inventaire } = {}) {
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:8787/' });
  const appels = [], exports = [];
  const media = dom.window.HTMLMediaElement.prototype;
  media.play = function () { appels.push(['play', this.getAttribute('src')]); return play(); };
  media.pause = function () { appels.push(['pause']); };
  media.load = function () { appels.push(['load']); };
  const app = await demarrer({ document: dom.window.document, storage,
    fetchImpl: fetchImpl ?? (async (url, options) => {
      assert.equal(url, '/api/inventaire'); assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => structuredClone(inventaireTest) };
    }), telecharger: (data, nom) => exports.push({ data, nom }), maintenant: () => new Date('2026-11-05T12:00:00Z') });
  const $ = id => dom.window.document.getElementById(id);
  return { $, dom, appels, exports, storage, app,
    async click(id) { $(id).click(); await Promise.resolve(); },
    choisir(statut) { dom.window.document.querySelector(`input[value="${statut}"]`).click(); },
    remarque(value) { $('remarque').value = value; $('remarque').dispatchEvent(new dom.window.Event('input', { bubbles: true })); },
    lot(id) { $('lot').value = id; $('lot').dispatchEvent(new dom.window.Event('change')); },
    dispose() { app.dispose(); dom.window.close(); },
  };
}

test('validation : 21 fichiers du lot 03 dans l’ordre exact, texte, variantes et empreintes', () => {
  const lot = inventaire.lots.find(l => l.id === '03');
  const source = selectionnerV1().slice(20, 41);
  assert.equal(lot.fichiers.length, 21);
  assert.deepEqual(lot.fichiers.map(f => f.numero), Array.from({ length: 21 }, (_, i) => i + 21));
  assert.deepEqual(lot.fichiers.map(f => f.texte), source.map(f => f.texte));
  assert.deepEqual(lot.fichiers.map(f => f.variante), source.map(f => f.adresse));
  assert.ok(lot.fichiers.every(f => f.disponible && f.sha256.length === 64 && f.tailleOctets > 0));
  assert.ok(inventaire.lots.find(l => l.id === '04').fichiers.every(f => typeof f.disponible === 'boolean'));
  const deux = inventaire.lots.find(l => l.id === '02');
  assert.ok(deux.fichiers.find(f => f.identifiantAudio === 'inscription-question-age' && f.variante === 'vous').nomFichier.endsWith('--r02.mp3'));
});

test('validation : page française, un seul lecteur, lot 03 par défaut, aucun autoplay', async () => {
  const h = await monter();
  try {
    assert.equal(h.dom.window.document.documentElement.lang, 'fr');
    assert.equal(h.$('lot').value, '03');
    assert.equal(h.dom.window.document.querySelectorAll('audio').length, 1);
    assert.equal(h.$('lecteur').autoplay, false);
    assert.equal(h.$('lecteur').controls, true);
    assert.equal(h.dom.window.document.querySelectorAll('#liste button').length, 21);
    assert.deepEqual([...h.dom.window.document.querySelectorAll('#liste button')].map(b => Number(b.textContent.split('.')[0])), Array.from({ length: 21 }, (_, i) => i + 21));
    assert.equal(h.$('texte').textContent, selectionnerV1()[20].texte);
    assert.match(h.$('nom-fichier').textContent, /bilan-presentation--tu/);
    assert.match(h.$('resume').textContent, /0 validé.*0 à corriger.*21 non examiné/);
    assert.equal(h.appels.filter(a => a[0] === 'play').length, 0);
    assert.equal(h.storage.data.get('coachAntoineProfile'), 'profil à conserver');
  } finally { h.dispose(); }
});

test('validation : lecture/réécoute, choix et remarque sans interruption ; Suivant arrête le MP3', async () => {
  const h = await monter();
  try {
    await h.click('reecouter'); assert.equal(h.appels.filter(a => a[0] === 'play').length, 1);
    const avant = h.appels.length;
    h.choisir('valide'); h.remarque('Bonne diction.');
    assert.equal(h.appels.length, avant, 'décision et frappe ne rechargent pas le lecteur');
    assert.match(h.$('resume').textContent, /1 validé.*20 non examiné/);
    await h.click('suivant');
    assert.equal(h.$('lecteur').getAttribute('src'), inventaire.lots.find(l => l.id === '03').fichiers[1].urlAudio);
    assert.ok(h.appels.slice(avant).some(a => a[0] === 'pause'));
    assert.equal(h.appels.filter(a => a[0] === 'play').length, 1, 'aucune lecture automatique au suivant');
    h.choisir('a_corriger'); h.remarque('Répétition vers 2 secondes.');
    assert.match(h.$('resume').textContent, /1 validé.*1 à corriger.*19 non examiné/);
    await h.click('precedent');
    assert.equal(h.$('remarque').value, 'Bonne diction.');
    assert.ok(h.dom.window.document.querySelector('input[value="valide"]').checked);
  } finally { h.dispose(); }
});

test('validation : décisions et position restaurées entre deux sessions', async () => {
  const storage = stockage(); let h = await monter({ storage });
  h.choisir('valide'); await h.click('suivant'); h.choisir('a_corriger'); h.remarque('Mot répété.'); h.dispose();
  h = await monter({ storage });
  try {
    assert.match(h.$('position').textContent, /entrée 22/);
    assert.equal(h.$('remarque').value, 'Mot répété.');
    assert.ok(h.dom.window.document.querySelector('input[value="a_corriger"]').checked);
    assert.match(h.$('resume').textContent, /1 validé.*1 à corriger.*19 non examiné/);
  } finally { h.dispose(); }
});

test('validation : export JSON complet, remarques et statut non examiné conservés', async () => {
  const h = await monter();
  try {
    h.choisir('a_corriger'); h.remarque('Deux fois « Très bien ».'); await h.click('exporter');
    assert.equal(h.exports.length, 1);
    const { data, nom } = h.exports[0];
    assert.match(nom, /^validation-coach-antoine-lot-03-.*\.json$/);
    assert.equal(data.lot, '03'); assert.equal(data.decisions.length, 21);
    assert.deepEqual(data.resume, { valides: 0, aCorriger: 1, nonExamines: 20 });
    assert.equal(data.decisions[0].remarque, 'Deux fois « Très bien ».');
    assert.equal(data.decisions[0].statut, 'a_corriger');
    assert.equal(data.decisions[1].statut, 'non_examine');
    assert.equal(data.decisions[0].texte, selectionnerV1()[20].texte);
    assert.match(data.decisions[0].cheminProjet, /^public\/audio\/voix\/inscription\//);
    assert.equal(data.decisions[0].sha256.length, 64);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  } finally { h.dispose(); }
});

test('validation : autre lot sans recréer l’outil, absence MP3 signalée et validation désactivée', async () => {
  // Fixture indépendante des futures générations du lot 04.
  const inventaireTest = structuredClone(inventaire);
  for (const fichier of inventaireTest.lots.find(l => l.id === '04').fichiers) fichier.disponible = false;
  const h = await monter({ inventaireTest });
  try {
    h.lot('04');
    assert.equal(h.$('lot').value, '04');
    assert.equal(h.$('decision').disabled, true);
    assert.equal(h.$('remarque').disabled, true);
    assert.equal(h.$('reecouter').disabled, true);
    assert.equal(h.$('lecteur').getAttribute('src'), null);
    assert.match(h.$('etat-audio').textContent, /MP3 absent/);
    h.lot('03'); assert.equal(h.$('decision').disabled, false);
  } finally { h.dispose(); }
});

test('validation : refus de lecture et erreur fichier sans blocage ni nouvelle tentative', async () => {
  const h = await monter({ play: () => Promise.reject(Error('NotAllowedError')) });
  try {
    await h.click('reecouter'); assert.match(h.$('etat-audio').textContent, /Lecture refusée/);
    const oldError = h.$('lecteur').onerror;
    await h.click('suivant'); oldError();
    assert.match(h.$('etat-audio').textContent, /Lecture manuelle/);
    h.$('lecteur').onerror(); assert.match(h.$('etat-audio').textContent, /Lecture impossible/);
    assert.equal(h.appels.filter(a => a[0] === 'play').length, 1);
    await h.click('suivant'); assert.match(h.$('position').textContent, /entrée 23/);
  } finally { h.dispose(); }
});

test('validation : stockage indisponible ou corrompu, pas d’effacement silencieux, export possible', async () => {
  const corrupt = stockage(); corrupt.data.set(CLE_STOCKAGE, 'JSON illisible');
  const indisponible = { getItem() { throw Error('refus'); }, setItem() { assert.fail('pas d’écriture si lecture impossible'); } };
  for (const storage of [corrupt, indisponible]) {
    const h = await monter({ storage });
    try {
      assert.equal(h.$('erreur').hidden, false);
      h.choisir('a_corriger'); h.remarque('À exporter.'); await h.click('exporter');
      assert.equal(h.exports[0].data.decisions[0].remarque, 'À exporter.');
      assert.match(h.$('stockage').textContent, /mémoire|export/i);
    } finally { h.dispose(); }
  }
  assert.equal(corrupt.data.get(CLE_STOCKAGE), 'JSON illisible');
});

test('validation : quota de stockage dépassé visible, remarque disponible dans l’export', async () => {
  const storage = { getItem: () => null, setItem() { throw Error('quota'); } };
  const h = await monter({ storage });
  try { h.remarque('Ne pas perdre.'); await h.click('exporter'); assert.match(h.$('stockage').textContent, /impossible/); assert.equal(h.exports[0].data.decisions[0].remarque, 'Ne pas perdre.'); }
  finally { h.dispose(); }
});

test('validation : fichier ou texte remplacé ne récupère pas une ancienne décision', () => {
  const fichier = inventaire.lots.find(l => l.id === '03').fichiers[0];
  const storage = stockage(); storage.data.set(CLE_STOCKAGE, JSON.stringify({ version: 1,
    decisions: { [fichier.idDecision]: { statut: 'valide', remarque: 'ancienne version' } }, curseurs: {} }));
  const { etat } = lireEtat(storage);
  assert.equal(decisionPour(etat, { ...fichier, idDecision: 'autre-empreinte' }).statut, 'non_examine');
  assert.equal(exporterLot(etat, { id: '03', fichiers: [fichier] }).decisions[0].statut, 'valide');
});

test('validation : serveur ne sert que l’interface, l’inventaire et les MP3 autorisés, sans écriture', async () => {
  const accueil = await fetch(origine); assert.equal(accueil.status, 200); assert.match(await accueil.text(), /Validation des voix/);
  const response = await fetch(origine + '/api/inventaire'); assert.equal(response.status, 200);
  assert.equal((await response.json()).lots.find(l => l.id === '03').fichiers.length, 21);
  for (const path of ['/.env.local', '/scripts/voix/generer-questionnaire.mjs', '/audio/%2E%2E%2F.env.local']) {
    const r = await fetch(origine + path); assert.equal(r.status, 404); await r.text();
  }
  const post = await fetch(origine + '/api/inventaire', { method: 'POST', body: '{}' });
  assert.equal(post.status, 405); await post.text();
});

test('validation : lecture partielle MP3 pour recherche et réécoute, plages invalides refusées', async () => {
  const fichier = inventaire.lots.find(l => l.id === '03').fichiers[0];
  const source = await readFile(new URL('../' + fichier.cheminProjet, import.meta.url));
  const r = await fetch(origine + fichier.urlAudio, { headers: { Range: 'bytes=10-39' } });
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r.headers.get('content-range'), `bytes 10-39/${source.length}`);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), source.subarray(10, 40));
  const head = await fetch(origine + fichier.urlAudio, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(source.length));
  const bad = await fetch(origine + fichier.urlAudio, { headers: { Range: 'bytes=99999999-' } }); assert.equal(bad.status, 416); await bad.text();
  assert.deepEqual(plageOctets('bytes=-10', 100), { debut: 90, fin: 99 });
  assert.throws(() => plageOctets('bytes=20-10', 100));
  assert.throws(() => plageOctets('bytes=0-1,4-5', 100));
});

test('nouveau découpage : couverture 42–88, paires groupées, réserve et ancien lot 08 absent', async () => {
  const officiels = inventaire.lots.filter(l => !l.type);
  assert.deepEqual(officiels.map(l => [l.id, l.fichiers.length]), [['01',10],['02',10],['03',21],['04',21],['05',20],['06',6],['07',0]]);
  const suite = officiels.slice(3).flatMap(l => l.fichiers);
  assert.deepEqual(suite.map(f => f.numero), Array.from({length:47},(_,i)=>42+i));
  assert.equal(new Set(suite.map(f=>f.nomInventaire)).size,47);
  let paires=0, communs=0;
  for(const [id,files] of Map.groupBy(suite,f=>f.identifiantAudio)) {
    if(files[0].variante==='commun'){assert.equal(files.length,1);communs++;}
    else {assert.deepEqual(files.map(f=>f.variante),['tu','vous']);paires++;}
    assert.equal(officiels.filter(l=>l.fichiers.some(f=>f.identifiantAudio===id)).length,1);
  }
  assert.equal(paires,23);assert.equal(communs,1);
  const h=await monter();try {h.lot('07');assert.match(h.$('titre-dialogue').textContent,/Réserve — aucun fichier/);assert.equal(h.$('lecteur').getAttribute('src'),null);assert.ok(h.$('decision').disabled);await h.click('reecouter');assert.equal(h.appels.filter(a=>a[0]==='play').length,0);h.lot('03');assert.equal(h.$('liste').children.length,21);}finally{h.dispose();}
});

test('essais : lecteur original, décisions distinctes persistantes et export séparé', async () => {
  const storage=stockage();let h=await monter({storage});
  try {
    h.lot('essais');assert.equal(h.$('liste').children.length,2);
    assert.match(h.$('decision').textContent,/Validé pour réutilisation/);
    assert.match(h.$('decision').textContent,/À refaire/);
    assert.match(h.$('lecteur').getAttribute('src'),/^\/essais\//);
    assert.equal(h.app.exporter().resume.valides,0);
    await h.click('reecouter');assert.equal(h.appels.filter(a=>a[0]==='play').length,1);
    h.choisir('valide');h.remarque('Réutilisation approuvée explicitement');
    const data=h.app.exporter();assert.equal(data.type,'essais');assert.equal(data.resume.valides,1);
    h.lot('04');assert.equal(h.app.exporter().decisions.find(f=>f.numero===51).statut,'non_examine');
    h.lot('essais');h.dispose();h=await monter({storage});
    assert.equal(h.$('lot').value,'essais');assert.equal(h.app.exporter().resume.valides,1);
    assert.equal(h.$('remarque').value,'Réutilisation approuvée explicitement');
    h.choisir('non_examine');assert.equal(h.app.exporter().resume.valides,0);
    await h.click('suivant');h.choisir('a_corriger');assert.equal(h.app.exporter().resume.aCorriger,1);
  }finally{h.dispose();}
});

test('essais : octets servis identiques, plages partielles et liste fermée', async () => {
  for(const f of inventaire.lots.find(l=>l.id==='essais').fichiers){
    const bytes=await readFile(new URL('../'+f.cheminProjet,import.meta.url));
    assert.ok(f.disponible);assert.ok(f.idDecision.startsWith('essai:'));
    const response=await fetch(origine+f.urlAudio);assert.equal(response.status,200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const range=await fetch(origine+f.urlAudio,{headers:{Range:'bytes=0-15'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(0,16));
  }
  assert.equal((await fetch(origine+'/essais/non-autorise.mp3')).status,404);
});

test('21 validations lot 03 et lots 01/02 préservées après rechargement ; absent jamais validé', async () => {
  const storage=stockage();const decisions={};
  for(const lot of inventaire.lots.slice(0,3))for(const f of lot.fichiers)if(f.disponible)decisions[f.idDecision]={statut:'valide',remarque:'Validation existante',modifieLe:null};
  storage.setItem(CLE_STOCKAGE,JSON.stringify({version:1,decisions,curseurs:{},dernierLot:'03'}));
  const h=await monter({storage});try{assert.equal(h.app.exporter().resume.valides,21);h.lot('essais');assert.equal(h.app.exporter().resume.valides,0);h.lot('03');assert.equal(h.app.exporter().resume.valides,21);for(const [id,decision] of Object.entries(decisions))assert.deepEqual(lireEtat(storage).etat.decisions[id],decision);}finally{h.dispose();}
  const f={...inventaire.lots[2].fichiers[0],disponible:false};assert.equal(decisionPour({decisions},f).statut,'non_examine');
});

test('corrections équilibre R02 : candidats séparés, R01 conservés, aucun héritage de validation', async()=>{
  const groupe=inventaire.lots.find(l=>l.id==='corrections-04');
  assert.equal(groupe.fichiers.length,2);assert.deepEqual(groupe.fichiers.map(f=>f.numero),[55,56]);
  const storage=stockage(),decisions={};
  for(const f of inventaire.lots.find(l=>l.id==='04').fichiers.filter(f=>[55,56].includes(f.numero))){
    assert.match(f.nomFichier,/--r01.mp3$/);decisions[f.idDecision]={statut:'a_corriger',remarque:'Répétition R01'};
  }
  storage.setItem(CLE_STOCKAGE,JSON.stringify({version:1,decisions,curseurs:{},dernierLot:'04'}));
  let h=await monter({storage});
  try{
    h.lot('corrections-04');assert.equal(h.app.exporter().resume.nonExamines,2);
    for(const f of groupe.fichiers){
      assert.match(f.nomFichier,/--r02.mp3$/);assert.ok(f.disponible);assert.ok(f.idDecision.startsWith('correction:'));
      const response=await fetch(origine+f.urlAudio);assert.equal(response.status,200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(new URL('../'+f.cheminProjet,import.meta.url)));
    }
    await h.click('reecouter');assert.match(h.appels.at(-1)[1],/--r02.mp3$/);
    h.choisir('valide');h.dispose();h=await monter({storage});assert.equal(h.$('lot').value,'corrections-04');assert.equal(h.app.exporter().resume.valides,1);
    h.lot('04');assert.equal(h.app.exporter().decisions.find(f=>f.numero===55).statut,'a_corriger');
  }finally{h.dispose();}
});

test('lot 05 : vingt fichiers officiels, numéros 63–82 et réutilisation sans héritage de décision essai',()=>{
  const lot=inventaire.lots.find(l=>l.id==='05'), source=selectionnerV1().slice(62,82);
  assert.deepEqual(lot.fichiers.map(f=>f.numero),Array.from({length:20},(_,i)=>63+i));
  assert.deepEqual(lot.fichiers.map(f=>f.nomFichier),source.map((e,i)=>i===8?e.nomFichier.replace('--r01.mp3','--r03.mp3'):i===10?e.nomFichier.replace('--r01.mp3','--r02.mp3'):e.nomFichier));
  assert.deepEqual(lot.fichiers.map(f=>f.texte),source.map(e=>e.texte));
  assert.deepEqual(lot.fichiers.map(f=>f.variante),source.map(e=>e.adresse));
  assert.ok(lot.fichiers.every(f=>f.cheminProjet==='public/audio/voix/inscription/'+f.nomFichier));
  const officiel=lot.fichiers.find(f=>f.numero===81);
  const essai=inventaire.lots.find(l=>l.id==='essais').fichiers.find(f=>f.numero===81);
  assert.notEqual(officiel.idDecision,essai.idDecision);
  const etat={decisions:{[essai.idDecision]:{statut:'valide',remarque:'Réutilisation approuvée'}}};
  assert.equal(decisionPour(etat,{...officiel,disponible:true}).statut,'non_examine');
});

test('corrections lot 05 : R02 séparés, textes exacts et décisions distinctes des R01',async()=>{
  const groupe=inventaire.lots.find(l=>l.id==='corrections-05');
  assert.deepEqual(groupe.fichiers.map(f=>f.numero),[71,73]);assert.deepEqual(groupe.fichiers.map(f=>f.variante),['tu','tu']);
  const officiel=inventaire.lots.find(l=>l.id==='05');
  for(const f of groupe.fichiers){
    assert.match(f.nomFichier,/--tu--hf--r02.mp3$/);assert.ok(f.idDecision.startsWith('correction:'));
    const r01=officiel.fichiers.find(e=>e.numero===f.numero);assert.match(r01.nomInventaire,/--r01.mp3$/);assert.equal(f.texte,r01.texte);assert.notEqual(f.idDecision,r01.idDecision);
  }
  const fixture=structuredClone(inventaire);for(const f of fixture.lots.find(l=>l.id==='corrections-05').fichiers)f.disponible=false;
  let h=await monter({inventaireTest:fixture});try{h.lot('corrections-05');assert.match(h.$('position').textContent,/Corrections lot 05/);assert.equal(h.app.exporter().resume.nonExamines,2);assert.ok(h.$('decision').disabled);assert.equal(h.$('lecteur').getAttribute('src'),null);}finally{h.dispose();}
  const storage=stockage(),decisions={};for(const f of officiel.fichiers)decisions[f.idDecision]={statut:[71,73].includes(f.numero)?'a_corriger':'valide',remarque:'Décision R01'};
  storage.setItem(CLE_STOCKAGE,JSON.stringify({version:1,decisions,curseurs:{},dernierLot:'05'}));
  const presents=structuredClone(inventaire);for(const f of presents.lots.find(l=>l.id==='corrections-05').fichiers)f.disponible=true;
  for(const f of presents.lots.find(l=>l.id==='05').fichiers)delete f.validationUtilisateur;
  h=await monter({storage,inventaireTest:presents});try{
    assert.equal(h.app.exporter().resume.valides,18);h.lot('corrections-05');assert.equal(h.app.exporter().resume.nonExamines,2);
    await h.click('reecouter');assert.match(h.appels.at(-1)[1],/experience-presentation--tu--hf--r02.mp3$/);
    await h.click('suivant');await h.click('reecouter');assert.match(h.appels.at(-1)[1],/experience-accompagnement--tu--hf--r02.mp3$/);
    h.lot('05');assert.equal(h.app.exporter().resume.valides,18);assert.equal(h.app.exporter().resume.aCorriger,2);
  }finally{h.dispose();}
});

test('lot 05 final : manifeste humain, 20/20 validés, R03 et R02 exacts et rechargement',async()=>{
  const lot=inventaire.lots.find(l=>l.id==='05');
  assert.equal(lot.fichiers.filter(f=>f.validationUtilisateur?.statut==='valide').length,20);
  assert.equal(lot.fichiers.find(f=>f.numero===71).nomFichier,'inscription-experience-presentation--tu--hf--r03.mp3');
  assert.equal(lot.fichiers.find(f=>f.numero===73).nomFichier,'inscription-experience-accompagnement--tu--hf--r02.mp3');
  assert.equal(inventaire.erreursValidation,undefined);
  const storage=stockage(),decisions={};for(const f of lot.fichiers)decisions[f.idDecision]={statut:'a_corriger',remarque:'Ancienne décision avant validation finale'};
  storage.setItem(CLE_STOCKAGE,JSON.stringify({version:1,decisions,curseurs:{},dernierLot:'05'}));
  let h=await monter({storage});try{
    assert.match(h.$('resume').textContent,/20 validé.*0 à corriger.*0 non examiné/);
    assert.deepEqual(h.app.exporter().resume,{valides:20,aCorriger:0,nonExamines:0});
    h.dispose();h=await monter({storage});assert.equal(h.app.exporter().resume.valides,20);
    h.choisir('a_corriger');assert.equal(h.app.exporter().resume.valides,19);
    h.dispose();h=await monter({storage});assert.equal(h.app.exporter().resume.valides,19,'ne pas écraser une décision plus récente');
  }finally{h.dispose();}
});

test('lot 05 final : empreinte, texte, absence ou nom différent invalident la validation déclarée',async()=>{
  const registre=JSON.parse(await readFile(new URL('../scripts/voix/validation/validation-lot05.json',import.meta.url),'utf8'));
  for(const mutation of [f=>{f.sha256='autre';},f=>{f.idDecision='texte-different';},f=>{f.disponible=false;},f=>{f.nomFichier='autre.mp3';}]){
    const fixture=structuredClone(inventaire),lot=fixture.lots.find(l=>l.id==='05');mutation(lot.fichiers.find(f=>f.numero===71));
    const erreurs=appliquerManifeste(fixture.lots,registre);assert.equal(erreurs.length,1);
    assert.equal(lot.fichiers.find(f=>f.numero===71).validationUtilisateur,undefined);
    const etat={decisions:{}};importerValidationsUtilisateur(etat,fixture);
    assert.deepEqual(resumeLot(etat,lot),{valides:19,aCorriger:0,nonExamines:1});
    assert.ok(!fixture.lots.find(l=>l.id==='corrections-05').fichiers.some(f=>f.validationUtilisateur));
  }
});

test('lot 05 final : les vingt ressources approuvées sont servies sous leurs noms définitifs',async()=>{
  const lot=inventaire.lots.find(l=>l.id==='05');
  for(const f of lot.fichiers){const r=await fetch(origine+f.urlAudio,{method:'HEAD'});assert.equal(r.status,200,f.nomFichier);assert.equal(Number(r.headers.get('content-length')),f.tailleOctets);}
});

test('lot 06 : six validations humaines par empreinte, TU R03 approuvée',async()=>{
 const i=await construireInventaire();const lot=i.lots.find(l=>l.id==='06');
 assert.deepEqual(lot.fichiers.filter(f=>f.validationUtilisateur?.statut==='valide').map(f=>f.numero),[83,84,85,86,87,88]);
 const corrections=i.lots.find(l=>l.id==='corrections-06');assert.equal(corrections.fichiers.length,2);
 assert.deepEqual(corrections.fichiers.map(f=>f.numero),[85,86]);assert.ok(corrections.fichiers.every(f=>f.nomFichier.endsWith('--r02.mp3')));assert.equal(corrections.fichiers[0].validationUtilisateur,undefined);assert.equal(corrections.fichiers[1].validationUtilisateur.statut,'valide');
 const manifeste=JSON.parse(await readFile(new URL('../scripts/voix/validation/validation-lot06.json',import.meta.url),'utf8'));
 const fixture=structuredClone(i);fixture.lots.find(l=>l.id==='06').fichiers[0].sha256='modifie';
 assert.equal(appliquerManifeste(fixture.lots,manifeste).length,1);assert.equal(fixture.lots.find(l=>l.id==='06').fichiers[0].validationUtilisateur,undefined);
});

test('lot 06 TU R03 : candidat distinct, HTTP lisible et validation humaine',async()=>{
 const groupe=inventaire.lots.find(l=>l.id==='corrections-06-r03');assert.equal(groupe.fichiers.length,1);const f=groupe.fichiers[0];
 assert.equal(f.numero,85);assert.equal(f.nomFichier,'inscription-conclusion-profil-evolutif--tu--hf--r03.mp3');assert.equal(f.disponible,true);assert.equal(f.validationUtilisateur.statut,'valide');
 assert.equal(f.sha256,'a1d3db42b81c97848c836c9253ccdab05fb7ea09e85490ed39c2d710045efebd');
 const r=await fetch(origine+f.urlAudio,{method:'HEAD'});assert.equal(r.status,200);assert.equal(Number(r.headers.get('content-length')),130402);
 const h=await monter();try{assert.ok(h.$('lot').querySelector('option[value="corrections-06-r03"]'));h.lot('corrections-06-r03');assert.equal(h.app.exporter().resume.valides,1);assert.match(h.$('lecteur').getAttribute('src'),/--r03.mp3$/);h.lot('06');assert.equal(h.app.exporter().resume.valides,6);}finally{h.dispose();}
});

// node tests/mediation.test.cjs
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const nodes = new Map();
let seq=0;
function make(id='') {
 const n={id,classes:new Set(),dataset:{},style:{setProperty(){}},events:{},children:[],hidden:false,textContent:'',
  addEventListener(type,fn){this.events[type]=fn},appendChild(n){this.children.push(n)},focus(){},setAttribute(){},
  querySelector(){return make()},replaceChildren(...ns){this.children=ns}};
 Object.defineProperty(n,'className',{get(){return [...this.classes].join(' ')},set(v){this.classes=new Set(v.split(/\s+/))}});
 n.classList={contains:c=>n.classes.has(c),add:(...cs)=>cs.forEach(c=>n.classes.add(c)),remove:(...cs)=>cs.forEach(c=>n.classes.delete(c)),toggle(c,b){if(b===undefined)b=!n.classes.has(c);b?n.classes.add(c):n.classes.delete(c)}};
 return n;
}
for(const m of fs.readFileSync('index.html','utf8').matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){
 const n=make(m[1]);n.className=m[0].match(/class="([^"]*)"/)?.[1]||'';nodes.set(n.id,n);
}
const get=id=>{assert(nodes.has(id),id);return nodes.get(id)};
const context=vm.createContext({console,Date,URLSearchParams,location:{search:'?test=1'},matchMedia:()=>({matches:true}),
 setInterval:()=>++seq,clearInterval(){},setTimeout:()=>++seq,clearTimeout(){},
 document:{getElementById:get,createElement:()=>make(),addEventListener(){},
  querySelector:()=>get('feuilles').children.find(n=>n.dataset.mode==='mediateur'),
  querySelectorAll(s){
   if(s==='.ecran')return [...nodes.values()].filter(n=>n.classes.has('ecran'));
   if(s==='.modale.ouvert')return [...nodes.values()].filter(n=>n.classes.has('modale')&&n.classes.has('ouvert'));
   if(s==='.modale')return [...nodes.values()].filter(n=>n.classes.has('modale'));
   if(s==='.feuille')return get('feuilles').children;
   return [];
  }},
 modes:JSON.parse(fs.readFileSync('data/modes.json')),
 livre:JSON.parse(fs.readFileSync('data/livre.json')),
 casBruts:JSON.parse(fs.readFileSync('data/cas.json')),
 bouton:make()
});
const run=s=>vm.runInContext(s,context);
run(fs.readFileSync('js/cas.js','utf8'));
const source=fs.readFileSync('js/jeu.js','utf8');run(source.slice(0,source.lastIndexOf('\ninitTampon();')));
run('etat.modes=modes; etat.livre=livre; etat.cas=preparerCas(casBruts,modes); remplirManuel(); creerFeuilles(); demarrer()');
assert.equal(run('etat.cas.length'),4);
assert(get('manuel-page-droite').innerHTML.includes('Source officielle'));
assert(get('liste-types-mediateurs').innerHTML.includes('Défenseur des droits'));
assert.equal((get('liste-types-mediateurs').innerHTML.match(/data-proposition-mediateur=/g)||[]).length,8);
assert(!get('liste-types-mediateurs').innerHTML.includes('Source officielle'));
assert(!get('liste-types-mediateurs').innerHTML.includes('Coût'));
assert(get('manuel-page-droite').innerHTML.includes('Médiateur familial'));
assert(get('manuel-page-droite').innerHTML.includes('Coût'));
// Consulter la liste pendant le dialogue n'oriente pas le dossier.
const mediateur=get('feuilles').children.find(n=>n.dataset.mode==='mediateur');
mediateur.events.click({detail:1,stopPropagation(){}});
assert(get('types-mediateurs').classList.contains('ouvert'));
run('choisirTypeMediateur(2)');
assert.equal(run('etat.mediateurChoisi.nom'),'Médiateur familial');
assert(mediateur.innerHTML.includes('Médiateur familial'));
assert.equal(get('btn-changer-mediateur').hidden,false);
assert.equal(run('etat.resultats.length'),0);
run('fermerModales(); etat.index=3; afficherCas(); choisirPersonnage("Mathis")');
assert.equal(run('etat.docs.length'),0);
assert(get('pile-documents').innerHTML.includes('Dossier incomplet'));
run('demanderDocument(etat.cas[3].documents[0],bouton)');
assert.equal(run('etat.documentsRecus.size'),0); // On laisse finir la réplique.
run('etat.pos=etat.file.length; afficherReplique(); demanderDocument(etat.cas[3].documents[0],bouton)');
assert.equal(run('etat.documentsRecus.size'),1);
assert.equal(run('etat.docs.length'),1);
assert.equal(context.bouton.disabled,true);
const longueur=run('etat.file.length');
run('demanderDocument(etat.cas[3].documents[0],bouton)');assert.equal(run('etat.file.length'),longueur);
// Une feuille générique ne se tamponne pas ; choisir un papier prépare la décision.
run('etat.pos=etat.file.length; afficherReplique(); tamponner("mediateur",etat.feuilleMediateur)');
assert.equal(run('etat.resultats.length'),0);
assert(get('types-mediateurs').classList.contains('ouvert'));
run('choisirTypeMediateur(2)');
assert.equal(run('etat.resultats.length'),0);
assert.equal(run('etat.decision'),false);
assert(mediateur.innerHTML.includes('Médiateur familial'));
assert.equal(get('types-mediateurs').classList.contains('ouvert'),false);
run('ouvrirTypesMediateurs(); choisirTypeMediateur(3)');
assert(mediateur.innerHTML.includes('Médiateur libéral'));
assert.equal(run('etat.resultats.length'),0);
mediateur.events.click({detail:0,stopPropagation(){}});
assert.equal(run('etat.resultats.length'),1);
assert.equal(run('etat.resultats[0].choix'),'mediateur');
assert.equal(run('etat.resultats[0].mediateur'),'Médiateur libéral');
run('afficherFeedback(etat.cas[3],"mediateur",false)');
assert(get('feedback-reponse').innerHTML.includes('Médiateur libéral'));
run('afficherRecap()');
assert(get('recap-liste').innerHTML.includes('Médiateur libéral'));
assert.equal(run('etat.resultats[0].documentsDemandes'),1);
run('demarrer()');assert.equal(run('etat.documentsRecus.size'),0);
assert.equal(run('etat.mediateurChoisi'),null);
assert(!mediateur.innerHTML.includes('Médiateur libéral'));
assert.equal(get('btn-changer-mediateur').hidden,true);
console.log('OK : explications dans le livre, 8 papiers, choix sans validation, changement de type, tampon obligatoire, bilan et remise à zéro.');

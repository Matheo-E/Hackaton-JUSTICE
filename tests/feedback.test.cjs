// node tests/feedback.test.cjs
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const nodes = new Map();
for (const m of fs.readFileSync('index.html', 'utf8').matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
  const classes = new Set((m[0].match(/class="([^"]*)"/)?.[1] || '').split(/\s+/));
  nodes.set(m[1], {textContent:'', innerHTML:'', className:'', hidden:false,
    classList:{contains:c=>classes.has(c), add:c=>classes.add(c), remove:c=>classes.delete(c)}});
}
const get = id => { assert(nodes.has(id), id); return nodes.get(id); };
const calls = [];
let unavailable = false;
const context = vm.createContext({console, URLSearchParams, location:{search:''}, AbortController,
  setTimeout, clearTimeout, crypto:webcrypto,
  fetch:async (url, options) => {
    calls.push({url, options});
    return {ok:!unavailable, json:async()=>({total:3, choix:{conciliateur:2,mediateur:1,tribunal:0}})};
  },
  document:{getElementById:get, querySelectorAll:()=>[...nodes.values()]},
  modes:JSON.parse(fs.readFileSync('data/modes.json', 'utf8'))
});
const run = s => vm.runInContext(s,context);
const source = fs.readFileSync('js/jeu.js','utf8');
run(source.slice(0, source.indexOf('\ndocument.querySelectorAll("[data-modale]")')));
run('etat.modes=modes; const cas={id:"voisins",reponse:"conciliateur",explication:"Le contexte favorise la discussion.",personnages:[{nom:"Voisins"}],questions:[],indices:[]}; etat.cas=[cas]; etat.resultats=[{cas,choix:"mediateur",correct:false,questions:0,indices:0,tempsRestant:200,penalites:0,appels:0}];');
(async () => {
  run('afficherFeedback(cas,"mediateur",false)');
  await new Promise(setImmediate);
  assert.equal(get('feedback-titre').textContent,'Une autre piste à explorer');
  assert(get('feedback-reponse').innerHTML.includes('la piste la plus adaptée'));
  assert.equal(get('feedback-sceau').alt,'Orientation retenue');
  assert(!get('feedback-sceau').src.includes('banned'));
  assert.equal(calls[0].options.method,'POST');
  const firstToken = JSON.parse(calls[0].options.body).participation;
  await run('chargerStatistiques(cas,"mediateur")');
  assert.equal(JSON.parse(calls[1].options.body).participation, firstToken);
  const markup = get('feedback-statistiques').innerHTML;
  assert.equal([...markup.matchAll(/value="(\d+)"/g)].reduce((sum,m)=>sum+Number(m[1]),0),100);
  assert(markup.includes('Votre choix'));
  run('afficherRecap()');
  assert(get('recap-liste').innerHTML.includes('Les choix des joueurs'));
  assert(!get('recap-liste').innerHTML.includes('class="ko"'));
  assert.equal(get('recap-score').textContent,'1 dossier exploré');
  run('afficherFeedback(cas,null,false)');
  await new Promise(setImmediate);
  assert.equal(get('feedback-sceau').hidden,true);
  assert.equal(calls.at(-1).options.method,undefined); // Un délai écoulé ne crée pas de vote.
  const before = calls.length;
  context.location.search='?test=1';
  await run('chargerStatistiques(cas,"conciliateur")');
  assert.equal(calls.length,before);
  context.location.search=''; unavailable=true;
  await run('chargerStatistiques(cas,"conciliateur")');
  assert(get('feedback-statistiques').textContent.includes('indisponibles'));
  assert(run('htmlStatistiques({total:0,choix:{}},null)').includes('Aucun choix enregistré'));
  console.log('OK : retours neutres, pourcentages à 100 %, envoi sans doublon, bilan, expiration, test exclu et service indisponible.');
})().catch(err=>{console.error(err);process.exitCode=1;});

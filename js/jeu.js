// Boucle principale du jeu : titre -> visiteur -> feedback -> ... -> récap.
"use strict";

const etat = {
  modes: [],      // contenu du manuel (data/modes.json)
  cas: [],        // liste des cas (data/cas.json)
  index: 0,       // cas en cours
  resultats: [],  // { cas, choix, correct }
};

const $ = (id) => document.getElementById(id);

function afficherEcran(id) {
  document.querySelectorAll(".ecran").forEach((e) => e.classList.remove("actif"));
  $(id).classList.add("actif");
}

function nomDuMode(id) {
  const m = etat.modes.find((m) => m.id === id);
  return m ? m.nom : id;
}

// Chargement des données (cas + manuel), séparées du code.
async function charger() {
  try {
    const [modes, cas] = await Promise.all([
      fetch("data/modes.json").then((r) => r.json()),
      fetch("data/cas.json").then((r) => r.json()),
    ]);
    etat.modes = modes;
    etat.cas = preparerCas(cas, modes);
    if (!etat.cas.length) throw new Error("Aucun cas valide dans data/cas.json");
  } catch (err) {
    document.body.innerHTML =
      "<p style='color:#fff;padding:2rem'>Impossible de charger les données du jeu. " +
      "Lancez un serveur local (voir README.md) au lieu d'ouvrir le fichier directement.</p>";
    throw err;
  }
  remplirManuel();
  creerTampons();
  // Le bouton n'est actif qu'une fois les cas chargés (sinon etat.cas est vide).
  $("btn-commencer").disabled = false;
  $("btn-commencer").textContent = "Ouvrir le cabinet";
}

function remplirManuel() {
  $("manuel-contenu").innerHTML = etat.modes
    .map((m) => `<dt>${m.nom}</dt><dd>${m.description}</dd>`)
    .join("");
}

function creerTampons() {
  const zone = $("tampons");
  zone.innerHTML = "";
  etat.modes.forEach((m) => {
    const b = document.createElement("button");
    b.className = "tampon";
    b.dataset.mode = m.id;
    b.innerHTML = `<strong>${m.nom}</strong><small>${m.resume}</small>`;
    b.addEventListener("click", () => choisir(m.id));
    zone.appendChild(b);
  });
}

function demarrer() {
  if (!etat.cas.length) return; // données pas encore chargées
  etat.index = 0;
  etat.resultats = [];
  afficherCas();
}

function afficherCas() {
  const cas = etat.cas[etat.index];
  etat.replique = 0;          // réplique en cours dans le dialogue
  etat.indicesObtenus = 0;    // nombre d'indices déjà donnés par Papi pour ce cas
  $("progression").textContent = `Client ${etat.index + 1} / ${etat.cas.length}`;
  $("score").textContent = `Bonnes orientations : ${etat.resultats.filter((r) => r.correct).length}`;

  $("visiteurs").innerHTML = cas.personnages
    .map((p) => `<div class="visiteur" data-nom="${p.nom}">
        <div class="bulle-scene"></div>
        <img src="${p.sprite}" alt="${p.nom}">
      </div>`)
    .join("");
  $("telephone").hidden = !cas.indices.length;
  afficherEcran("ecran-visiteur");
  afficherReplique();
}

// Affiche la réplique courante dans une bulle au-dessus de celui qui parle.
// Quand etat.replique dépasse la dernière réplique, plus aucune bulle n'est affichée.
function afficherReplique() {
  const cas = etat.cas[etat.index];
  const ligne = cas.dialogue[etat.replique]; // undefined après le clic final
  document.querySelectorAll(".visiteur").forEach((v) => {
    const parle = !!ligne && v.dataset.nom === ligne.qui;
    v.classList.toggle("parle", parle);
    const bulle = v.querySelector(".bulle-scene");
    bulle.textContent = "";
    if (parle) { bulle.style.animation = "none"; bulle.offsetWidth; bulle.style.animation = ""; } // relance l'animation
    if (parle) ecrire(bulle, ligne.texte); // le nom reste dans les données, non affiché
  });
  const termine = etat.replique >= cas.dialogue.length;
  $("continuer").textContent = termine ? "Le client attend votre décision" : "Cliquez pour continuer ›";
  // Les tampons ne s'activent qu'après le clic qui fait disparaître la dernière bulle.
  $("choix").classList.toggle("verrouille", !termine);
}

// Défilement du texte lettre par lettre (« stream »).
const VITESSE_ECRITURE = 25; // millisecondes par caractère
let ecriture = null;         // { bulle, texte, minuterie } tant qu'une bulle s'écrit

function ecrire(bulle, texte) {
  arreterEcriture();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { bulle.textContent = texte; return; }
  // Le texte complet est posé dès le départ : la partie pas encore « écrite » est
  // invisible mais occupe sa place, donc la bulle a tout de suite sa taille finale.
  const visible = document.createElement("span");
  const cache = document.createElement("span");
  cache.className = "a-ecrire";
  cache.textContent = texte;
  bulle.replaceChildren(visible, cache);
  let n = 0;
  ecriture = { bulle, texte, minuterie: setInterval(() => {
    n++;
    visible.textContent = texte.slice(0, n);
    cache.textContent = texte.slice(n);
    if (n >= texte.length) arreterEcriture();
  }, VITESSE_ECRITURE) };
}

// Termine immédiatement la bulle en cours d'écriture (texte complet affiché).
function arreterEcriture() {
  if (!ecriture) return;
  clearInterval(ecriture.minuterie);
  ecriture.bulle.textContent = ecriture.texte;
  ecriture = null;
}

// Un clic pendant l'écriture affiche tout le texte d'un coup ;
// sinon il passe à la réplique suivante ; un clic de plus après la dernière efface la bulle.
function repliqueSuivante() {
  if (ecriture) { arreterEcriture(); return; }
  const cas = etat.cas[etat.index];
  if (etat.replique < cas.dialogue.length) { etat.replique++; afficherReplique(); }
}

// Récap : tout ce qui a été dit jusqu'ici + les indices déjà obtenus.
function remplirSituation() {
  const cas = etat.cas[etat.index];
  $("situation-dialogue").innerHTML = cas.dialogue.slice(0, etat.replique + 1)
    .map((l) => `<div class="bulle"><b>${l.qui}</b>${l.texte}</div>`).join("");
  const obtenus = cas.indices.slice(0, etat.indicesObtenus);
  $("situation-indices").innerHTML = obtenus.length
    ? obtenus.map((i) => `<li>${i}</li>`).join("")
    : `<li class="vide">Vous n'avez pas encore appelé Papi.</li>`;
}

// Téléphone : chaque appel donne l'indice suivant.
let minuterieAppel;
function appelerPapi() {
  const cas = etat.cas[etat.index];
  clearTimeout(minuterieAppel);
  $("papi-message").hidden = true;
  if (etat.indicesObtenus >= cas.indices.length) {
    $("papi-statut").textContent = "En ligne";
    $("papi-message").textContent = "Je t'ai déjà tout dit, mon petit. Regarde ton récap !";
    $("papi-message").hidden = false;
    return;
  }
  $("papi-statut").textContent = "Appel en cours…";
  $("papi").classList.add("sonne");
  minuterieAppel = setTimeout(() => {
    $("papi").classList.remove("sonne");
    const indice = cas.indices[etat.indicesObtenus++];
    $("papi-statut").textContent = `Indice ${etat.indicesObtenus} / ${cas.indices.length}`;
    $("papi-message").textContent = indice;
    $("papi-message").hidden = false;
  }, 1200);
}

function choisir(modeId) {
  const cas = etat.cas[etat.index];
  const correct = modeId === cas.reponse;
  arreterEcriture();
  fermerModales();
  etat.resultats.push({ cas, choix: modeId, correct, indices: etat.indicesObtenus });

  $("feedback-titre").textContent = correct ? "Bonne orientation !" : "Mauvaise orientation";
  $("feedback-titre").className = correct ? "bonne" : "mauvaise";
  $("feedback-reponse").innerHTML = correct
    ? `Vous avez choisi : <b>${nomDuMode(modeId)}</b>.`
    : `Vous avez choisi : <b>${nomDuMode(modeId)}</b>. La bonne réponse était : <b>${nomDuMode(cas.reponse)}</b>.`;
  $("feedback-explication").textContent = cas.explication;
  $("btn-suivant").textContent =
    etat.index + 1 < etat.cas.length ? "Client suivant" : "Voir le bilan";
  afficherEcran("ecran-feedback");
}

function suivant() {
  etat.index++;
  if (etat.index < etat.cas.length) afficherCas();
  else afficherRecap();
}

function afficherRecap() {
  const bons = etat.resultats.filter((r) => r.correct).length;
  $("recap-score").textContent = `${bons} / ${etat.resultats.length} bonnes orientations`;
  $("recap-liste").innerHTML = etat.resultats
    .map((r) => `<li class="${r.correct ? "ok" : "ko"}">
        <b>${r.cas.personnages.map((p) => p.nom).join(" & ")}</b> → ${nomDuMode(r.cas.reponse)}<br>
        <small>Conseils de Papi utilisés : ${r.indices} / ${r.cas.indices.length}</small>
        <small>${r.cas.explication}</small></li>`)
    .join("");
  afficherEcran("ecran-recap");
}

// Fenêtres superposées (manuel, récap, Papi) : un même mécanisme pour toutes.
// Un bouton avec data-modale="id" ouvre la fenêtre ; Échap, un clic à côté
// ou un bouton .btn-fermer la referme.
const AVANT_OUVERTURE = { situation: remplirSituation, papi: appelerPapi };

function ouvrirModale(id) {
  fermerModales();
  if (AVANT_OUVERTURE[id]) AVANT_OUVERTURE[id]();
  $(id).classList.add("ouvert");
  $(id).querySelector(".btn-fermer").focus();
}
function fermerModales() {
  clearTimeout(minuterieAppel);
  document.querySelectorAll(".modale.ouvert").forEach((m) => m.classList.remove("ouvert", "sonne"));
}

document.querySelectorAll("[data-modale]").forEach((b) =>
  b.addEventListener("click", (e) => { e.stopPropagation(); ouvrirModale(b.dataset.modale); }));
document.querySelectorAll(".modale").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m || e.target.classList.contains("btn-fermer")) fermerModales(); }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerModales(); });

// Faire avancer le dialogue : clic sur la scène, Entrée ou Espace.
$("scene").addEventListener("click", repliqueSuivante);
$("scene").addEventListener("keydown", (e) => {
  if (e.target === $("scene") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); repliqueSuivante(); }
});

$("btn-commencer").addEventListener("click", demarrer);
$("btn-suivant").addEventListener("click", suivant);
$("btn-rejouer").addEventListener("click", demarrer);

charger();

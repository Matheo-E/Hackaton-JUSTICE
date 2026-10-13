// Boucle principale du jeu : titre -> visiteur -> feedback -> ... -> récap.
"use strict";

const etat = {
  modes: [],      // modes de résolution = tampons (data/modes.json)
  livre: null,    // compléments du livre juridique (data/livre.json, facultatif)
  cas: [],        // liste des cas (data/cas.json)
  index: 0,       // cas en cours
  resultats: [],  // { cas, choix, correct, indices, questions }
  // Pour le cas en cours :
  file: [],       // répliques à jouer, dans l'ordre : { qui: [noms], texte, joueur? }
  pos: 0,         // réplique affichée (== file.length : plus aucune bulle)
  posees: new Set(), // index des questions déjà posées
  selection: null,   // nom du personnage dont on regarde les documents (null = personne)
  docs: [],          // documents affichés dans la pile et la visionneuse (ceux du personnage choisi)
};

const $ = (id) => document.getElementById(id);

// Les textes viennent du JSON (futur espace admin) : on les échappe avant innerHTML.
const echapper = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function afficherEcran(id) {
  document.querySelectorAll(".ecran").forEach((e) => e.classList.remove("actif"));
  $(id).classList.add("actif");
}

function nomDuMode(id) {
  const m = etat.modes.find((m) => m.id === id);
  return m ? m.nom : id;
}

// Une échéance réelle évite de gagner du temps en changeant d'onglet.
const DUREE_DOSSIER = 5 * 60;
const COUT_APPEL = 20;
let minuterieChrono = null;

function arreterChrono() {
  clearInterval(minuterieChrono);
  minuterieChrono = null;
}

function demarrerChrono() {
  arreterChrono();
  etat.echeance = Date.now() + DUREE_DOSSIER * 1000;
  etat.penalites = 0;
  etat.appels = 0;
  etat.docOuvert = 0;
  $("chrono-penalite").textContent = "";
  actualiserChrono();
  minuterieChrono = setInterval(actualiserChrono, 250);
}

function actualiserChrono() {
  if (etat.decision || !$("ecran-visiteur").classList.contains("actif")) return false;
  etat.tempsRestant = Math.max(0, Math.ceil((etat.echeance - Date.now()) / 1000));
  const minutes = Math.floor(etat.tempsRestant / 60);
  $("chrono").textContent = `${String(minutes).padStart(2, "0")}:${String(etat.tempsRestant % 60).padStart(2, "0")}`;
  $("chrono").classList.toggle("urgent", etat.tempsRestant <= 30);
  $("chrono-modale").textContent = `Temps restant : ${$("chrono").textContent}`;
  $("chrono-modale").classList.toggle("urgent", etat.tempsRestant <= 30);
  if (!etat.tempsRestant) { tempsEcoule(); return false; }
  return true;
}

function consommerTemps(secondes, objet) {
  if (!actualiserChrono()) return false;
  etat.echeance -= secondes * 1000;
  etat.penalites += secondes;
  $("chrono-penalite").textContent = `${objet} : −${secondes} s`;
  return actualiserChrono();
}

function tempsEcoule() {
  if (etat.decision) return;
  etat.decision = true;
  arreterChrono();
  arreterEcriture();
  fermerModales();
  const cas = etat.cas[etat.index];
  etat.resultats.push({ cas, choix: null, correct: false, expire: true,
    indices: etat.indicesObtenus, questions: etat.posees.size,
    penalites: etat.penalites, tempsRestant: 0, appels: etat.appels });
  afficherFeedback(cas, null, false);
}

// Chargement des données (cas + manuel), séparées du code.
async function charger() {
  try {
    // cache: "no-store" : une situation enregistrée dans l'espace admin apparaît à la partie suivante.
    const [modes, cas, livre] = await Promise.all([
      fetch("data/modes.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("data/cas.json", { cache: "no-store" }).then((r) => r.json()),
      // Le livre est un complément : son absence ne doit pas bloquer le jeu.
      fetch("data/livre.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    etat.modes = modes;
    etat.livre = livre;
    // Bouton « Tester » de l'espace admin (/?test=1) : on joue uniquement la situation
    // en cours d'édition, transmise par localStorage, même si elle n'est pas encore enregistrée.
    const test = new URLSearchParams(location.search).has("test") && localStorage.getItem("justice-test-cas");
    etat.cas = preparerCas(test ? [JSON.parse(test)] : cas, modes);
    if (test) document.title = "Test · " + document.title;
    if (!etat.cas.length) throw new Error("Aucun cas valide dans data/cas.json");
  } catch (err) {
    document.body.innerHTML =
      "<p style='color:#fff;padding:2rem'>Impossible de charger les données du jeu. " +
      "Lancez un serveur local (voir README.md) au lieu d'ouvrir le fichier directement.</p>";
    throw err;
  }
  remplirManuel();
  creerFeuilles();
  // Le bouton n'est actif qu'une fois les cas chargés (sinon etat.cas est vide).
  $("btn-commencer").disabled = false;
  $("btn-commencer").textContent = "Ouvrir le cabinet";
}

// Guide de la résolution amiable : tableau « Je vois… / J'envoie… », détail des modes, bon à savoir.
function remplirManuel() {
  const lignes = etat.modes.filter((m) => m.je_vois)
    .map((m) => `<tr><td>${echapper(m.je_vois)}</td><td><b>${echapper(m.nom)}</b></td></tr>`).join("");
  let html = lignes
    ? `<table class="livre-table"><thead><tr><th>Je vois…</th><th>J'envoie…</th></tr></thead><tbody>${lignes}</tbody></table>`
    : "";
  if (etat.livre && etat.livre.ordre) html += `<p class="livre-ordre">${echapper(etat.livre.ordre)}</p>`;
  $("manuel-page-gauche").innerHTML = html;
  // Page de droite : le détail des 4 choix, puis « Bon à savoir ».
  let droite = `<dl>${etat.modes.map((m) => `<dt>${echapper(m.nom)}</dt><dd>${echapper(m.description)}</dd>`).join("")}</dl>`;
  if (etat.livre && etat.livre.bon_a_savoir && etat.livre.bon_a_savoir.length)
    droite += `<h3>Bon à savoir</h3><ul class="bon-a-savoir">${
      etat.livre.bon_a_savoir.map((b) => `<li>${echapper(b)}</li>`).join("")}</ul>`;
  $("manuel-page-droite").innerHTML = droite;
}

// Une feuille d'orientation par mode, posée sur le bureau : on y glisse le tampon.
function creerFeuilles() {
  const zone = $("feuilles");
  zone.innerHTML = "";
  etat.modes.forEach((m) => {
    const b = document.createElement("button");
    b.className = "feuille";
    b.dataset.mode = m.id;
    b.setAttribute("aria-label", `Tamponner : ${m.nom}`);
    b.innerHTML = `<strong>${echapper(m.nom)}</strong><small>${echapper(m.resume)}</small><img class="sceau" alt="">`;
    b.addEventListener("click", (e) => {
      e.stopPropagation(); // ne pas faire avancer le dialogue
      // Clavier (Entrée/Espace, e.detail === 0) : tamponne directement, pour l'accessibilité.
      // Souris/tactile : rappelle qu'il faut glisser le tampon.
      if (e.detail === 0) tamponner(m.id, b);
      else indiquerTampon();
    });
    zone.appendChild(b);
  });
}

function indiquerTampon() {
  const t = $("tampon");
  t.classList.remove("secoue"); t.offsetWidth; t.classList.add("secoue");
}

// Glisser-déposer du tampon (événements « pointer » : souris, doigt et stylet).
// Le tampon suit le pointeur ; relâché au-dessus d'une feuille, il la tamponne,
// sinon il revient à sa place.
function initTampon() {
  const t = $("tampon");
  let depart = null; // position du pointeur au début du glisser
  const feuilleSous = (e) => document.elementsFromPoint(e.clientX, e.clientY)
    .map((el) => el.closest(".feuille")).find(Boolean) || null;
  const survoler = (f) => document.querySelectorAll(".feuille")
    .forEach((x) => x.classList.toggle("survol", x === f));
  const relacher = () => { depart = null; t.classList.remove("tenu"); survoler(null); };

  t.addEventListener("pointerdown", (e) => {
    if ($("plan").classList.contains("verrouille") || etat.decision) return;
    e.preventDefault();
    t.setPointerCapture(e.pointerId); // continue de recevoir les mouvements hors du tampon
    depart = { x: e.clientX, y: e.clientY };
    t.classList.add("tenu");
  });
  t.addEventListener("pointermove", (e) => {
    if (!depart) return;
    t.style.translate = `${e.clientX - depart.x}px ${e.clientY - depart.y}px`;
    survoler(feuilleSous(e));
  });
  t.addEventListener("pointerup", (e) => {
    if (!depart) return;
    const f = feuilleSous(e);
    relacher();
    if (f) tamponner(f.dataset.mode, f);
    else t.style.translate = ""; // retour à sa place (transition CSS)
  });
  t.addEventListener("pointercancel", () => { relacher(); t.style.translate = ""; });
  t.addEventListener("click", (e) => e.stopPropagation());
}

function demarrer() {
  if (!etat.cas.length) return; // données pas encore chargées
  etat.index = 0;
  etat.resultats = [];
  afficherCas();
}

function afficherCas() {
  const cas = etat.cas[etat.index];
  etat.file = cas.dialogue.map((l) => ({ qui: [l.qui], texte: l.texte }));
  etat.pos = 0;
  etat.posees = new Set();
  etat.indicesObtenus = 0;    // nombre d'indices déjà donnés par Papi pour ce cas
  $("progression").textContent = `Dossier ${etat.index + 1} / ${etat.cas.length}`;
  $("score").textContent = `Bonnes orientations : ${etat.resultats.filter((r) => r.correct).length}`;

  $("visiteurs").innerHTML = cas.personnages
    .map((p) => `<div class="visiteur" data-nom="${echapper(p.nom)}" role="button" tabindex="0"
          aria-pressed="false" aria-label="Voir les documents de ${echapper(p.nom)}">
        <div class="bulle-scene"></div>
        <img src="${echapper(p.sprite)}" alt="${echapper(p.nom)}">
      </div>`)
    .join("");
  // Remise à zéro du bureau : tampon à sa place, feuilles vierges.
  etat.decision = false;
  $("tampon").style.translate = "";
  $("tampon").className = "tampon-outil";
  $("plan").classList.remove("decide");
  document.querySelectorAll(".feuille").forEach((f) => f.classList.remove("tamponnee", "bonne", "mauvaise"));
  etat.selection = null;
  document.querySelectorAll(".visiteur").forEach((v) => {
    v.addEventListener("click", () => choisirPersonnage(v.dataset.nom));
    v.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); choisirPersonnage(v.dataset.nom); }
    });
  });
  remplirDossier();
  creerQuestions();
  afficherEcran("ecran-visiteur");
  afficherReplique();
  demarrerChrono();
}

// Affiche la réplique courante : bulle au-dessus de celui (ou ceux) qui parle(nt),
// ou bulle du joueur en bas de la scène quand c'est lui qui pose une question.
function afficherReplique() {
  const ligne = etat.file[etat.pos]; // undefined quand tout a été dit
  document.querySelectorAll(".visiteur").forEach((v) => {
    const parle = !!ligne && !ligne.joueur && ligne.qui.includes(v.dataset.nom);
    v.classList.toggle("parle", parle);
    const bulle = v.querySelector(".bulle-scene");
    bulle.textContent = "";
    if (parle) { bulle.style.animation = "none"; bulle.offsetWidth; bulle.style.animation = ""; } // relance l'animation
    if (parle) ecrire(bulle, ligne.texte);
  });
  const bj = $("bulle-joueur");
  bj.textContent = "";
  if (ligne && ligne.joueur) { bj.style.animation = "none"; bj.offsetWidth; bj.style.animation = ""; ecrire(bj, ligne.texte); }

  const termine = etat.pos >= etat.file.length;
  const ouvertureFinie = etat.pos >= etat.cas[etat.index].dialogue.length;
  $("continuer").textContent = termine ? "Posez une question ou décidez" : "Cliquez pour continuer ›";
  // Le tampon s'active une fois l'exposé initial terminé ; les questions,
  // dès qu'aucune réplique n'est en cours (on n'interrompt pas quelqu'un qui parle).
  $("plan").classList.toggle("verrouille", !ouvertureFinie || !termine);
  $("questions").classList.toggle("verrouille", !termine);
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
  const lettres = Array.from(texte); // découpe par caractère (emojis compris)
  let n = 0;
  ecriture = { bulle, texte, minuterie: setInterval(() => {
    n++;
    visible.textContent = lettres.slice(0, n).join("");
    cache.textContent = lettres.slice(n).join("");
    if (n >= lettres.length) arreterEcriture();
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
  if (!actualiserChrono()) return;
  if (ecriture) { arreterEcriture(); return; }
  if (etat.pos < etat.file.length) { etat.pos++; afficherReplique(); }
}

// Questions : une liste de boutons ; poser une question ajoute la question du
// joueur puis la réponse du (ou des) personnage(s) à la file des répliques.
function creerQuestions() {
  const cas = etat.cas[etat.index];
  const zone = $("liste-questions");
  zone.innerHTML = "";
  $("questions").hidden = !cas.questions.length;
  cas.questions.forEach((q, i) => {
    const b = document.createElement("button");
    b.className = "question";
    b.textContent = q.question;
    b.addEventListener("click", () => poserQuestion(i, b));
    zone.appendChild(b);
  });
}

function poserQuestion(i, bouton) {
  if (!actualiserChrono()) return;
  if (etat.pos < etat.file.length) return; // quelqu'un parle encore
  const q = etat.cas[etat.index].questions[i];
  etat.posees.add(i);
  bouton.classList.add("posee");
  bouton.disabled = true;
  etat.file.push({ qui: [], texte: q.question, joueur: true });
  etat.file.push({ qui: q.qui, texte: q.reponse });
  afficherReplique();
  $("scene").focus({ preventScroll: true });
}

// Documents du client : une pile de miniatures sur le bord droit de l'écran ;
// un clic ouvre le document en grand dans la visionneuse (‹ › ou flèches pour feuilleter).
// La pile montre les documents du personnage sur lequel on a cliqué (et rien s'il n'en a pas).
function htmlDocument(d) {
  return d.image
    ? `<img src="${echapper(d.image)}" alt="${echapper(d.titre + " : " + d.texte)}">`
    : `<article class="document doc-${d.type}"><h4>${echapper(d.titre)}</h4><p>${echapper(d.texte)}</p></article>`;
}

function choisirPersonnage(nom) {
  if (!actualiserChrono()) return;
  etat.selection = nom;
  document.querySelectorAll(".visiteur").forEach((v) => {
    const choisi = v.dataset.nom === nom;
    v.classList.toggle("choisi", choisi);
    v.setAttribute("aria-pressed", choisi);
  });
  remplirDossier();
}

function remplirDossier() {
  const cas = etat.cas[etat.index];
  const pile = $("pile-documents");
  pile.innerHTML = "";
  // Un document sans propriétaire reste visible pour tous les personnages.
  etat.docs = etat.selection
    ? cas.documents.filter((d) => !d.proprietaires.length || d.proprietaires.includes(etat.selection))
    : [];
  etat.docOuvert = 0;
  $("titre-documents").textContent = etat.selection ? `Documents de ${etat.selection}` : "Documents du client";
  if (!etat.selection) pile.innerHTML = `<p class="vide">Cliquez sur un personnage pour voir ses documents.</p>`;
  else if (!etat.docs.length) pile.innerHTML = `<p class="vide">Ce personnage n’a apporté aucun document.</p>`;
  etat.docs.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "miniature";
    b.style.setProperty("--rot", `${[-3, 2, -1.5, 3][i % 4]}deg`); // papiers posés en vrac
    b.innerHTML = `${htmlDocument(d)}<span class="legende">${echapper(d.titre)}</span>`;
    b.addEventListener("click", () => ouvrirDocument(i));
    pile.appendChild(b);
  });
}

function ouvrirDocument(i) {
  if (!actualiserChrono()) return;
  const docs = etat.docs;
  if (!docs.length) return;
  etat.docOuvert = (i + docs.length) % docs.length;
  const d = docs[etat.docOuvert];
  $("dossier-titre").textContent = d.titre;
  $("dossier-contenu").innerHTML = `<div class="document-zoom">${htmlDocument(d)}</div>`;
  $("doc-position").textContent = `${etat.docOuvert + 1} / ${docs.length}`;
  $("doc-precedent").hidden = $("doc-suivant").hidden = docs.length < 2;
  if (!$("dossier").classList.contains("ouvert")) ouvrirModale("dossier");
}

// Récap : tout ce qui a été dit jusqu'ici + les indices déjà obtenus.
function remplirSituation() {
  const cas = etat.cas[etat.index];
  const nomsDe = (l) => (l.joueur ? "Vous" : l.qui.join(" & "));
  $("situation-dialogue").innerHTML = etat.file.slice(0, etat.pos + 1)
    .map((l) => `<div class="bulle${l.joueur ? " joueur" : ""}"><b>${echapper(nomsDe(l))}</b>${echapper(l.texte)}</div>`)
    .join("");
  const obtenus = cas.indices.slice(0, etat.indicesObtenus);
  $("situation-indices-bloc").hidden = !cas.indices.length;
  $("situation-indices").innerHTML = obtenus.length
    ? obtenus.map((i) => `<li>${echapper(i)}</li>`).join("")
    : `<li class="vide">Vous n'avez pas encore appelé Papi.</li>`;
}

// Téléphone : chaque appel donne l'indice suivant.
let minuterieAppel;
function appelerPapi() {
  if (!actualiserChrono()) return;
  etat.appels++;
  if (!consommerTemps(COUT_APPEL, "Téléphone")) return;
  const cas = etat.cas[etat.index];
  clearTimeout(minuterieAppel);
  $("papi-message").hidden = true;
  if (etat.indicesObtenus >= cas.indices.length) {
    $("papi-statut").textContent = "En ligne";
    $("papi-message").textContent = cas.indices.length
      ? "Je t'ai déjà tout dit, mon petit. Regarde ton récap !"
      // Cas sans indice rédigé : Papi renvoie vers les outils du joueur.
      : "Pose-leur des questions, lis bien leurs documents et regarde ton guide, mon petit !";
    $("papi-message").hidden = false;
    return;
  }
  $("papi-statut").textContent = "Appel en cours…";
  $("papi").classList.add("sonne");
  minuterieAppel = setTimeout(() => {
    if (etat.decision) return;
    $("papi").classList.remove("sonne");
    const indice = cas.indices[etat.indicesObtenus++];
    $("papi-statut").textContent = `Indice ${etat.indicesObtenus} / ${cas.indices.length}`;
    $("papi-message").textContent = indice;
    $("papi-message").hidden = false;
  }, 1200);
}

// Sceaux affichés sur la scène puis sur l'écran de feedback.
const SCEAU = { bonne: "assets/scene/certified.png", mauvaise: "assets/scene/banned.png" };
const DUREE_COUP_TAMPON = 1300; // ms : coup de tampon + sceau visible avant le feedback

// Le tampon a été déposé sur la feuille d'un mode : on frappe, on laisse le sceau, puis feedback.
function tamponner(modeId, feuille) {
  if (etat.decision || $("plan").classList.contains("verrouille")) return; // un seul coup par dossier
  if (!actualiserChrono()) return;
  etat.decision = true;
  arreterChrono();
  const cas = etat.cas[etat.index];
  const correct = modeId === cas.reponse;
  arreterEcriture();
  fermerModales();
  etat.resultats.push({ cas, choix: modeId, correct, indices: etat.indicesObtenus, questions: etat.posees.size,
    penalites: etat.penalites, tempsRestant: etat.tempsRestant, appels: etat.appels });

  // Animation : le tampon frappe (classe .frappe), la feuille reçoit le sceau.
  feuille.querySelector(".sceau").src = SCEAU[correct ? "bonne" : "mauvaise"];
  feuille.classList.add("tamponnee", correct ? "bonne" : "mauvaise");
  $("tampon").classList.add("frappe");
  $("plan").classList.add("decide");
  $("questions").classList.add("verrouille");
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(() => afficherFeedback(cas, modeId, correct), reduit ? 0 : DUREE_COUP_TAMPON);
}

function afficherFeedback(cas, modeId, correct) {
  $("feedback-sceau").src = SCEAU[correct ? "bonne" : "mauvaise"];
  $("feedback-sceau").alt = correct ? "Certifié" : "Refusé";

  $("feedback-titre").textContent = modeId === null ? "Temps écoulé !" : correct ? "Bonne orientation !" : "Mauvaise orientation";
  $("feedback-titre").className = correct ? "bonne" : "mauvaise";
  $("feedback-reponse").innerHTML = modeId === null
    ? `Ce dossier n’a pas été traité à temps. La bonne orientation était : <b>${echapper(nomDuMode(cas.reponse))}</b>.`
    : correct
    ? `Vous avez choisi : <b>${echapper(nomDuMode(modeId))}</b>.`
    : `Vous avez choisi : <b>${echapper(nomDuMode(modeId))}</b>. La bonne réponse était : <b>${echapper(nomDuMode(cas.reponse))}</b>.`;
  $("feedback-explication").textContent = cas.explication;
  $("btn-suivant").textContent =
    etat.index + 1 < etat.cas.length ? "Dossier suivant" : "Voir le bilan";
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
        <b>${echapper(r.cas.personnages.map((p) => p.nom).join(" & "))}</b> → ${echapper(nomDuMode(r.cas.reponse))}<br>
        <small>${r.expire ? "Temps écoulé — dossier non traité" : `${r.tempsRestant} s restantes`} · Bonus : −${r.penalites} s (${r.appels} appel(s))</small>
        ${r.cas.questions.length ? `<small>Questions posées : ${r.questions} / ${r.cas.questions.length}</small>` : ""}
        ${r.cas.indices.length ? `<small>Conseils de Papi utilisés : ${r.indices} / ${r.cas.indices.length}</small>` : ""}
        <small>${echapper(r.cas.explication)}</small></li>`)
    .join("");
  afficherEcran("ecran-recap");
}

// Fenêtres superposées (livre, dossier, récap, Papi) : un même mécanisme pour toutes.
// Un bouton avec data-modale="id" ouvre la fenêtre ; Échap, un clic à côté
// ou un bouton .btn-fermer la referme.
const AVANT_OUVERTURE = { situation: remplirSituation, papi: appelerPapi };

function ouvrirModale(id) {
  if (!actualiserChrono()) return;
  fermerModales();
  if (AVANT_OUVERTURE[id]) AVANT_OUVERTURE[id]();
  if (etat.decision) return; // une pénalité peut épuiser le temps restant
  $(id).classList.add("ouvert");
  $("chrono-modale").hidden = false;
  $(id).querySelector(".btn-fermer").focus();
}
function fermerModales() {
  clearTimeout(minuterieAppel);
  $("chrono-modale").hidden = true;
  document.querySelectorAll(".modale.ouvert").forEach((m) => m.classList.remove("ouvert", "sonne"));
}

document.querySelectorAll("[data-modale]").forEach((b) =>
  b.addEventListener("click", (e) => { e.stopPropagation(); ouvrirModale(b.dataset.modale); }));
document.querySelectorAll(".modale").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m || e.target.classList.contains("btn-fermer")) fermerModales(); }));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fermerModales();
  // Feuilleter les documents au clavier quand la visionneuse est ouverte.
  if ($("dossier").classList.contains("ouvert") && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
    ouvrirDocument(etat.docOuvert + (e.key === "ArrowRight" ? 1 : -1));
});
$("doc-precedent").addEventListener("click", () => ouvrirDocument(etat.docOuvert - 1));
$("doc-suivant").addEventListener("click", () => ouvrirDocument(etat.docOuvert + 1));

// Faire avancer le dialogue : clic sur la scène, Entrée ou Espace.
$("scene").addEventListener("click", repliqueSuivante);
$("scene").addEventListener("keydown", (e) => {
  if (e.target === $("scene") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); repliqueSuivante(); }
});

initTampon();
$("btn-commencer").addEventListener("click", demarrer);
$("btn-suivant").addEventListener("click", suivant);
$("btn-rejouer").addEventListener("click", demarrer);

charger();

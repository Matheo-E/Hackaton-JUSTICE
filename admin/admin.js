// Espace admin : créer et modifier les situations du jeu, sans toucher au code.
// Les données éditées ont exactement le format de data/cas.json (voir README).
// Réutilise normaliserCas() / validerCas() de js/cas.js : l'admin et le jeu
// appliquent donc les mêmes règles.
"use strict";

const $ = (id) => document.getElementById(id);
const echapper = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Les chemins du JSON sont relatifs à la racine du jeu ; la page admin est sous /admin/.
const url = (chemin) => (chemin ? "/" + chemin.replace(/^\/+/, "") : "/assets/visiteur.svg");

const MAX_PERSONNAGES = 2;
const CLE_TEST = "justice-test-cas"; // situation à tester, lue par le jeu (/?test=1)

const etat = {
  cas: [],          // situations, au format brut de data/cas.json
  modes: [],        // data/modes.json : les 4 orientations possibles
  images: { documents: [], personnages: [] },
  sel: 0,           // situation sélectionnée
  modifie: false,   // modifications non enregistrées
  serveur: true,    // false si le site est servi sans server.py (enregistrement impossible)
};

const casCourant = () => etat.cas[etat.sel];
const nomMode = (id) => (etat.modes.find((m) => m.id === id) || {}).nom || "";

// ---------------------------------------------------------------- chargement
async function charger() {
  try {
    const [modes, cas] = await Promise.all([
      fetch("/data/modes.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("/data/cas.json", { cache: "no-store" }).then((r) => r.json()),
    ]);
    etat.modes = modes;
    etat.cas = cas.map(versEdition);
  } catch {
    afficherBandeau("Impossible de lire les situations du jeu (data/cas.json). Vérifiez que le jeu est lancé avec <code>python3 server.py</code>.");
    return;
  }
  try {
    const r = await fetch("/api/images", { cache: "no-store" });
    if (!r.ok) throw new Error();
    etat.images = await r.json();
  } catch {
    etat.serveur = false;
    afficherBandeau(
      "Le jeu n'a pas été lancé avec <code>python3 server.py</code> : vous pouvez modifier les situations, " +
      "mais pas les enregistrer directement. <button class='lien' id='telecharger'>Télécharger cas.json</button> " +
      "puis remplacez le fichier <code>data/cas.json</code> par celui-ci.");
    $("telecharger").addEventListener("click", telecharger);
  }
  rendreTout();
}

// Forme pratique pour l'édition : « qui » d'une question toujours en liste.
function versEdition(c) {
  return {
    ...c,
    nom_admin: c.nom_admin || "",
    personnages: (c.personnages || (c.visiteurs || []).map((nom) => ({ nom }))).map((p) => ({ nom: p.nom || "", sprite: p.sprite || "" })),
    dialogue: (c.dialogue || []).map((l) => ({ qui: l.qui || "", texte: l.texte || "" })),
    questions: (c.questions || []).map((q) => ({ question: q.question || "", qui: [].concat(q.qui || []), reponse: q.reponse || "" })),
    documents: (c.documents || []).map((d) => ({ ...d, titre: d.titre || "", image: d.image || "", texte: d.texte || "" })),
    indices: c.indices || [],
    reponse: c.reponse || "",
    explication: c.explication || "",
  };
}

// ------------------------------------------------------------- vérification
// Messages en langage courant, chacun rattaché à la section à compléter.
function verifier(c) {
  const pb = [];
  const ajouter = (section, message) => pb.push({ section, message });
  const noms = c.personnages.map((p) => p.nom.trim()).filter(Boolean);
  if (!c.personnages.length) ajouter("personnages", "Ajoutez au moins un personnage.");
  c.personnages.forEach((p, i) => { if (!p.nom.trim()) ajouter("personnages", `Le personnage ${i + 1} n'a pas de nom.`); });
  if (new Set(noms).size !== noms.length) ajouter("personnages", "Deux personnages portent le même nom.");
  if (!c.dialogue.length) ajouter("ouverture", "Ajoutez au moins une réplique d'ouverture.");
  c.dialogue.forEach((l, i) => {
    if (!noms.includes(l.qui)) ajouter("ouverture", `Réplique ${i + 1} : choisissez qui parle.`);
    if (!l.texte.trim()) ajouter("ouverture", `Réplique ${i + 1} : le texte est vide.`);
  });
  c.questions.forEach((q, i) => {
    if (!q.question.trim()) ajouter("questions", `Question ${i + 1} : écrivez la question.`);
    if (!q.qui.some((n) => noms.includes(n))) ajouter("questions", `Question ${i + 1} : choisissez qui répond.`);
    if (!q.reponse.trim()) ajouter("questions", `Question ${i + 1} : écrivez la réponse.`);
  });
  c.documents.forEach((d, i) => {
    if (!d.titre.trim()) ajouter("documents", `Document ${i + 1} : donnez-lui un titre.`);
    if (!d.image && !d.texte.trim()) ajouter("documents", `Document ${i + 1} : choisissez une image ou écrivez son contenu.`);
  });
  if (!c.reponse) ajouter("orientation", "Choisissez la bonne orientation.");
  if (!c.explication.trim()) ajouter("explication", "Écrivez l'explication montrée au joueur.");
  // Filet de sécurité : les règles exactes du jeu (js/cas.js).
  if (!pb.length) validerCas(normaliserCas(versJeu(c)), etat.modes.map((m) => m.id))
    .forEach((m) => ajouter("orientation", m));
  return pb;
}

// Forme enregistrée : on retire les « qui » vides et les conseils vides.
function versJeu(c) {
  return {
    ...c,
    questions: c.questions.map((q) => ({ ...q, qui: q.qui.length === 1 ? q.qui[0] : q.qui })),
    indices: c.indices.filter((t) => t.trim()),
  };
}

// ------------------------------------------------------------------- rendu
function rendreTout() {
  $("vide").hidden = etat.cas.length > 0;
  $("editeur").hidden = !etat.cas.length;
  document.querySelector(".outils-actions").hidden = !etat.cas.length;
  etat.sel = Math.min(etat.sel, Math.max(0, etat.cas.length - 1));
  rendreListe();
  rendreEditeur();
  majEtat();
}

function rendreListe() {
  $("liste").innerHTML = etat.cas.map((c, i) => {
    const ok = !verifier(c).length;
    const noms = c.personnages.map((p) => p.nom).filter(Boolean).join(" & ") || "Aucun personnage";
    return `<li class="rangee" data-rang="${i}">
      <button class="item${i === etat.sel ? " actif" : ""}" data-sel="${i}" aria-current="${i === etat.sel}"
              title="Cliquez pour modifier · glissez pour changer l'ordre">
        <span class="item-num">${i + 1}</span>
        <span class="item-texte">
          <strong>${echapper(c.nom_admin || "Sans titre")}</strong>
          <small>${echapper(noms)}${c.reponse ? " · " + echapper(nomMode(c.reponse)) : ""}</small>
        </span>
        <span class="pastille ${ok ? "ok" : "ko"}">${ok ? "Prête" : "À compléter"}</span>
      </button>
      <span class="poignee" aria-hidden="true">≡</span>
    </li>`;
  }).join("");
}

// ------------------------------------------------- réordonner par glisser-déposer
// Souris et stylet : on attrape la ligne n'importe où. Tactile : la liste doit rester
// défilable, donc on n'attrape que par la poignée (≡), qui bloque le défilement.
// Elle suit le doigt au 1:1 ; les autres lignes s'écartent ; au relâchement, la
// situation est posée à la place la plus proche. Au clavier : Alt + ↑ / ↓.
let glisser = null;        // { rangees, i, depY, dy, pas, cible, rects }
let vientDeGlisser = false; // pour ignorer le clic qui suit le relâchement

$("liste").addEventListener("pointerdown", (e) => {
  if (glisser || (e.pointerType === "mouse" && e.button !== 0)) return;
  const li = e.target.closest(".rangee");
  if (!li || !$("liste").contains(li)) return;
  const parPoignee = !!e.target.closest(".poignee");
  if (e.pointerType === "touch" && !parPoignee) {
    // appui long sur la poignée seulement ; ailleurs, le doigt fait défiler la liste
    return;
  }
  e.preventDefault();          // pas de sélection de texte pendant le glisser
  glisser = preparerGlisser(li, e.clientY);
  li.setPointerCapture(e.pointerId);
  li.classList.add("drague");
  document.body.classList.add("glisse");
});

$("liste").addEventListener("pointermove", (e) => {
  if (!glisser) return;
  glisser.dy = e.clientY - glisser.depY;
  glisser.li.style.transform = `translateY(${glisser.dy}px)`;
  const cible = cibleDuGlisser();
  if (cible !== glisser.cible) { glisser.cible = cible; ecarterLesAutres(); }
});

$("liste").addEventListener("pointerup", (e) => {
  if (!glisser) return;
  const { i, cible } = glisser;
  const aBouge = cible !== i;
  terminerGlisser();
  if (aBouge) { vientDeGlisser = true; deplacerCas(i, cible); }
  else setTimeout(() => { vientDeGlisser = false; }, 0);
});
$("liste").addEventListener("pointercancel", () => { if (glisser) terminerGlisser(); });

function preparerGlisser(li, y) {
  const rangees = [...$("liste").children];
  const rects = rangees.map((r) => r.getBoundingClientRect());
  const ecart = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
  return { li, rangees, i: rangees.indexOf(li), depY: y, dy: 0, cible: rangees.indexOf(li), pas: rects[0].height + ecart, rects };
}

// Où la ligne attrapée serait-elle posée ? On compare son centre à celui des autres.
function cibleDuGlisser() {
  const { rects, i, dy, rangees } = glisser;
  const centre = rects[i].top + rects[i].height / 2 + dy;
  const avant = rangees.map((r, j) => j).filter((j) => j !== i)
    .filter((j) => rects[j].top + rects[j].height / 2 < centre).length;
  return Math.max(0, Math.min(rangees.length - 1, avant));
}

function ecarterLesAutres() {
  const { rangees, i, cible, pas } = glisser;
  rangees.forEach((r, j) => {
    if (j === i) return;
    const decale = (cible > i && j > i && j <= cible) ? -pas : (cible < i && j >= cible && j < i) ? pas : 0;
    r.classList.toggle("decale", decale !== 0);
    r.style.transform = decale ? `translateY(${decale}px)` : "";
  });
}

function terminerGlisser() {
  glisser.rangees.forEach((r) => { r.style.transform = ""; r.classList.remove("decale", "drague"); });
  document.body.classList.remove("glisse");
  glisser = null;
}

function deplacerCas(de, vers) {
  const [bouge] = etat.cas.splice(de, 1);
  etat.cas.splice(vers, 0, bouge);
  etat.sel = vers;
  marquerModifie();
  rendreTout();
  $("liste").querySelectorAll(".rangee")[vers].scrollIntoView({ block: "nearest" });
  toast(`« ${bouge.nom_admin || "Sans titre"} » est maintenant en position ${vers + 1}.`, () => {
    etat.cas.splice(vers, 1);
    etat.cas.splice(de, 0, bouge);
    etat.sel = de;
    rendreTout();
  });
}

// Re-rend l'éditeur en gardant le champ actif et la position de défilement.
function rendreEditeur() {
  const c = casCourant();
  $("titre-edition").textContent = c ? (c.nom_admin || "Sans titre") : "Espace admin";
  if (!c) { $("editeur").innerHTML = ""; return; }
  const actif = document.activeElement && document.activeElement.dataset.k;
  const debut = actif && document.activeElement.selectionStart;
  const defilement = $("editeur").parentElement.scrollTop;
  $("editeur").innerHTML = htmlEditeur(c);
  majVerification();
  $("editeur").parentElement.scrollTop = defilement;
  if (actif) {
    const el = $("editeur").querySelector(`[data-k="${CSS.escape(actif)}"]`);
    if (el) { el.focus({ preventScroll: true }); if (debut != null && el.setSelectionRange) try { el.setSelectionRange(debut, debut); } catch {} }
  }
}

function section(id, titre, aide, contenu, pied = "") {
  return `<section class="section" id="sec-${id}">
      <h3>${titre}</h3>
      ${aide ? `<p class="aide">${aide}</p>` : ""}
      <div class="groupe">${contenu}</div>
      ${pied}
    </section>`;
}

const boutonAjouter = (liste, texte, cache = false) =>
  cache ? "" : `<button class="ajouter" data-action="ajouter" data-liste="${liste}">＋ ${texte}</button>`;

function boutonsLigne(liste, i, n) {
  return `<div class="ligne-actions">
      <button class="icone" data-action="monter" data-liste="${liste}" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
      <button class="icone" data-action="descendre" data-liste="${liste}" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
      <button class="icone danger" data-action="supprimer" data-liste="${liste}" data-i="${i}" aria-label="Supprimer">✕</button>
    </div>`;
}

const vide = (texte) => `<p class="ligne vide-ligne">${texte}</p>`;

function htmlEditeur(c) {
  const noms = c.personnages.map((p) => p.nom.trim()).filter(Boolean);
  const html = [];

  html.push(`<div id="verif"></div>`);

  html.push(section("titre", "Titre", "Pour vous repérer dans la liste. Il n'est jamais affiché dans le jeu.",
    `<label class="ligne"><input class="champ" data-k="titre" data-champ="nom_admin" value="${echapper(c.nom_admin)}"
       placeholder="Ex. : Le manguier qui dépasse"></label>`));

  html.push(section("orientation", "Bonne orientation", "Où le joueur doit-il envoyer ces personnes ?",
    `<div class="choix-orientation" role="radiogroup" aria-label="Bonne orientation">${etat.modes.map((m) => `
      <label class="orientation${c.reponse === m.id ? " choisie" : ""}">
        <input type="radio" name="reponse" value="${m.id}" data-k="reponse-${m.id}" data-champ="reponse" ${c.reponse === m.id ? "checked" : ""}>
        <strong>${echapper(m.nom)}</strong>
        <small>${echapper(m.resume)}</small>
      </label>`).join("")}</div>`));

  html.push(section("personnages", "Personnages", "Une ou deux personnes viennent vous voir. L'image est facultative.",
    c.personnages.map((p, i) => `
      <div class="ligne personnage">
        <button class="vignette" data-action="image" data-type="personnages" data-i="${i}" aria-label="Choisir l'image de ${echapper(p.nom || "ce personnage")}">
          <img src="${echapper(url(p.sprite))}" alt=""><span>Changer</span>
        </button>
        <input class="champ" data-k="perso-${i}" data-liste="personnages" data-i="${i}" data-cle="nom"
               value="${echapper(p.nom)}" placeholder="Nom (ex. : M. Payet)" aria-label="Nom du personnage ${i + 1}">
        ${boutonsLigne("personnages", i, c.personnages.length)}
      </div>`).join("") || vide("Aucun personnage."),
    boutonAjouter("personnages", "Ajouter un personnage", c.personnages.length >= MAX_PERSONNAGES)));

  const optionsQui = (qui) => htmlOptionsQui(noms, qui);
  html.push(section("ouverture", "Ouverture", "Ce que disent les personnages en arrivant, dans l'ordre. Une bulle par réplique.",
    c.dialogue.map((l, i) => `
      <div class="ligne bloc">
        <div class="bloc-tete">
          <select class="champ selecteur" data-k="dial-qui-${i}" data-liste="dialogue" data-i="${i}" data-cle="qui" aria-label="Qui parle (réplique ${i + 1})">${optionsQui(l.qui)}</select>
          ${boutonsLigne("dialogue", i, c.dialogue.length)}
        </div>
        <textarea class="champ" rows="2" data-k="dial-${i}" data-liste="dialogue" data-i="${i}" data-cle="texte"
          placeholder="Ce qu'il ou elle dit…" aria-label="Texte de la réplique ${i + 1}">${echapper(l.texte)}</textarea>
      </div>`).join("") || vide("Aucune réplique."),
    boutonAjouter("dialogue", "Ajouter une réplique")));

  html.push(section("questions", "Questions du joueur", "Facultatif. Le joueur choisit lesquelles poser ; chaque question n'est posée qu'une fois.",
    c.questions.map((q, i) => `
      <div class="ligne bloc">
        <div class="bloc-tete">
          <span class="numero">Question ${i + 1}</span>
          ${boutonsLigne("questions", i, c.questions.length)}
        </div>
        <input class="champ" data-k="q-${i}" data-liste="questions" data-i="${i}" data-cle="question"
          value="${echapper(q.question)}" placeholder="Ex. : Avez-vous essayé d'en parler ensemble ?" aria-label="Question ${i + 1}">
        <div class="repondants" role="group" aria-label="Qui répond à la question ${i + 1}" data-repondants="${i}">
          ${htmlRepondants(noms, q, i)}
        </div>
        <textarea class="champ" rows="2" data-k="qr-${i}" data-liste="questions" data-i="${i}" data-cle="reponse"
          placeholder="Leur réponse…" aria-label="Réponse à la question ${i + 1}">${echapper(q.reponse)}</textarea>
      </div>`).join("") || vide("Aucune question."),
    boutonAjouter("questions", "Ajouter une question")));

  html.push(section("documents", "Documents du client", "Facultatif. Les pièces que le joueur peut examiner : lettres, factures, attestations…",
    c.documents.map((d, i) => `
      <div class="ligne bloc">
        <div class="bloc-tete">
          <span class="numero">Document ${i + 1}</span>
          ${boutonsLigne("documents", i, c.documents.length)}
        </div>
        <div class="document-edition">
          <button class="vignette document" data-action="image" data-type="documents" data-i="${i}" aria-label="Choisir l'image du document ${i + 1}">
            ${d.image ? `<img src="${echapper(url(d.image))}" alt="">` : `<span class="sans-image">Pas d'image</span>`}<span>Changer</span>
          </button>
          <div class="document-champs">
            <input class="champ" data-k="d-${i}" data-liste="documents" data-i="${i}" data-cle="titre"
              value="${echapper(d.titre)}" placeholder="Titre (ex. : Facture d'achat du vélo)" aria-label="Titre du document ${i + 1}">
            <textarea class="champ" rows="3" data-k="dt-${i}" data-liste="documents" data-i="${i}" data-cle="texte"
              placeholder="${d.image ? "Ce qui est écrit sur l'image (lu par les lecteurs d'écran)" : "Contenu du document, affiché tel quel"}"
              aria-label="Contenu du document ${i + 1}">${echapper(d.texte)}</textarea>
            <label>Mention en petits caractères (à lire avec la loupe)
              <textarea class="champ" rows="2" data-k="dd-${i}" data-liste="documents" data-i="${i}" data-cle="detail"
                placeholder="Une petite information utile pour comprendre le dossier…"
                aria-label="Petit détail du document ${i + 1}">${echapper(d.detail || "")}</textarea>
            </label>
          </div>
        </div>
      </div>`).join("") || vide("Aucun document."),
    boutonAjouter("documents", "Ajouter un document")));

  html.push(section("indices", "Conseils de Papi", "Facultatif. Donnés un par appel au téléphone, dans l'ordre : du plus vague au plus précis.",
    c.indices.map((t, i) => `
      <div class="ligne">
        <input class="champ" data-k="i-${i}" data-liste="indices" data-i="${i}" value="${echapper(t)}"
          placeholder="Ex. : Regarde bien les dates sur les documents…" aria-label="Conseil ${i + 1}">
        ${boutonsLigne("indices", i, c.indices.length)}
      </div>`).join("") || vide("Aucun conseil : Papi renverra le joueur vers ses outils."),
    boutonAjouter("indices", "Ajouter un conseil")));

  html.push(section("explication", "Explication", "Affichée après la décision du joueur. C'est le cœur pédagogique : expliquez pourquoi.",
    `<label class="ligne"><textarea class="champ" rows="5" data-k="explication" data-champ="explication"
       placeholder="Ex. : Le numéro de cadre est le même sur les deux documents…">${echapper(c.explication)}</textarea></label>`));

  html.push(`<section class="section">
      <h3>Organisation</h3>
      <p class="aide" style="margin-left:1rem">Pour changer l'ordre de jeu, glissez la situation dans la liste de gauche (ou Alt + ↑ / ↓).</p>
      <div class="groupe">
        <button class="ligne action" data-action="dupliquer">Dupliquer cette situation</button>
      </div>
      <div class="groupe"><button class="ligne action destructive" data-action="supprimer-cas">Supprimer cette situation</button></div>
    </section>`);
  return html.join("");
}

function htmlOptionsQui(noms, qui) {
  return `<option value="" ${noms.includes(qui) ? "" : "selected"} disabled>Qui parle ?</option>` +
    noms.map((n) => `<option ${n === qui ? "selected" : ""}>${echapper(n)}</option>`).join("");
}

function htmlRepondants(noms, q, i) {
  return `<span class="petit">Qui répond ?</span>` + (noms.map((n) => `<label class="puce${q.qui.includes(n) ? " cochee" : ""}">
      <input type="checkbox" data-k="q-${i}-${echapper(n)}" data-question="${i}" value="${echapper(n)}" ${q.qui.includes(n) ? "checked" : ""}>${echapper(n)}</label>`).join("")
    || `<span class="petit">Nommez d'abord les personnages.</span>`);
}

// Quand un nom change, on met à jour sur place les menus « Qui parle ? » et les puces
// « Qui répond ? ». Pas de reconstruction de l'éditeur : le champ où l'on tape garde le focus.
function majNoms() {
  const c = casCourant();
  const noms = c.personnages.map((p) => p.nom.trim()).filter(Boolean);
  $("editeur").querySelectorAll('select[data-liste="dialogue"]').forEach((s) => {
    s.innerHTML = htmlOptionsQui(noms, c.dialogue[+s.dataset.i].qui);
  });
  $("editeur").querySelectorAll("[data-repondants]").forEach((z) => {
    const i = +z.dataset.repondants;
    z.innerHTML = htmlRepondants(noms, c.questions[i], i);
  });
}

// Carte « À compléter » en haut de l'éditeur, mise à jour à chaque frappe.
function majVerification() {
  const zone = $("verif");
  if (!zone) return;
  const pb = verifier(casCourant());
  zone.innerHTML = pb.length
    ? `<div class="verif ko"><strong>À compléter avant que la situation apparaisse dans le jeu</strong>
         <ul>${pb.map((p) => `<li><button class="lien" data-aller="${p.section}">${echapper(p.message)}</button></li>`).join("")}</ul></div>`
    : `<div class="verif ok"><strong>Situation prête</strong> · Elle sera jouée à la prochaine partie, une fois enregistrée.</div>`;
}

function majEtat() {
  $("etat").textContent = etat.modifie ? "Modifications non enregistrées" : "";
  $("etat").classList.toggle("visible", etat.modifie);
  $("enregistrer").disabled = !etat.modifie;
}

function marquerModifie() {
  etat.modifie = true;
  majEtat();
}

// -------------------------------------------------------------- événements
function nouveauCas() {
  const id = "situation-" + Date.now().toString(36);
  return { id, nom_admin: "", personnages: [{ nom: "", sprite: "" }, { nom: "", sprite: "" }],
           dialogue: [{ qui: "", texte: "" }], questions: [], documents: [], indices: [], reponse: "", explication: "" };
}

function ajouterCas() {
  etat.cas.push(nouveauCas());
  etat.sel = etat.cas.length - 1;
  marquerModifie();
  rendreTout();
  ouvrirEdition();
  $("editeur").querySelector('[data-k="titre"]').focus();
}

const MODELES = {
  personnages: () => ({ nom: "", sprite: "" }),
  dialogue: (c) => {
    const noms = c.personnages.map((p) => p.nom).filter(Boolean);
    return { qui: noms.length ? noms[c.dialogue.length % noms.length] : "", texte: "" }; // alterne les personnages
  },
  questions: () => ({ question: "", qui: [], reponse: "" }),
  documents: () => ({ titre: "", image: "", texte: "" }),
  indices: () => "",
};

// Renommer un personnage met à jour ses répliques et ses réponses.
function renommer(c, ancien, nouveau) {
  if (!ancien || c.personnages.filter((p) => p.nom === ancien).length > 1) return;
  c.dialogue.forEach((l) => { if (l.qui === ancien) l.qui = nouveau; });
  c.questions.forEach((q) => { q.qui = q.qui.map((n) => (n === ancien ? nouveau : n)); });
}

$("editeur").addEventListener("input", (e) => {
  const el = e.target;
  const c = casCourant();
  if (el.dataset.champ) {
    c[el.dataset.champ] = el.value;
    if (el.dataset.champ === "reponse") el.closest(".choix-orientation").querySelectorAll(".orientation")
      .forEach((o) => o.classList.toggle("choisie", o.contains(el)));
    if (el.dataset.champ === "nom_admin") $("titre-edition").textContent = el.value || "Sans titre";
  } else if (el.dataset.question != null) {
    const q = c.questions[+el.dataset.question];
    q.qui = el.checked ? [...new Set([...q.qui, el.value])] : q.qui.filter((n) => n !== el.value);
    el.closest(".puce").classList.toggle("cochee", el.checked);
  } else if (el.dataset.liste) {
    const liste = c[el.dataset.liste];
    const i = +el.dataset.i;
    if (el.dataset.cle) {
      const nom = el.dataset.liste === "personnages" && el.dataset.cle === "nom";
      if (nom) renommer(c, liste[i].nom, el.value);
      liste[i][el.dataset.cle] = el.value;
      if (nom) majNoms();
    } else liste[i] = el.value;
  } else return;
  marquerModifie();
  majVerification();
  rendreListe();
});

$("editeur").addEventListener("click", (e) => {
  const aller = e.target.closest("[data-aller]");
  if (aller) {
    const sec = $("sec-" + aller.dataset.aller);
    sec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    const champ = sec.querySelector(".champ, input, button.ajouter");
    if (champ) setTimeout(() => champ.focus({ preventScroll: true }), 300);
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const c = casCourant();
  const liste = c[b.dataset.liste];
  const i = +b.dataset.i;
  switch (b.dataset.action) {
    case "ajouter":
      liste.push(MODELES[b.dataset.liste](c));
      break;
    case "supprimer": {
      const [retire] = liste.splice(i, 1);
      if (b.dataset.liste === "personnages") {
        c.questions.forEach((q) => { q.qui = q.qui.filter((n) => n !== retire.nom); });
      }
      toast("Élément supprimé.", () => { liste.splice(i, 0, retire); marquerModifie(); rendreTout(); });
      break;
    }
    case "monter": case "descendre": {
      const j = b.dataset.action === "monter" ? i - 1 : i + 1;
      [liste[i], liste[j]] = [liste[j], liste[i]];
      break;
    }
    case "image":
      return choisirImage(b.dataset.type, i);
    case "dupliquer": {
      const copie = JSON.parse(JSON.stringify(c));
      copie.id = nouveauCas().id;
      copie.nom_admin = (c.nom_admin || "Sans titre") + " (copie)";
      etat.cas.splice(etat.sel + 1, 0, copie);
      etat.sel++;
      toast("Situation dupliquée.");
      break;
    }
    case "supprimer-cas": {
      const index = etat.sel;
      const [retire] = etat.cas.splice(index, 1);
      toast(`« ${retire.nom_admin || "Sans titre"} » supprimée.`, () => {
        etat.cas.splice(index, 0, retire); etat.sel = index; marquerModifie(); rendreTout();
      });
      fermerEdition();
      break;
    }
    default: return;
  }
  marquerModifie();
  rendreTout();
  // Après un ajout, place le curseur dans le nouvel élément.
  if (b.dataset.action === "ajouter") {
    const champs = $("sec-" + ({ dialogue: "ouverture" }[b.dataset.liste] || b.dataset.liste)).querySelectorAll(".champ");
    if (champs.length) champs[champs.length - (b.dataset.liste === "questions" ? 2 : b.dataset.liste === "documents" ? 2 : 1)].focus();
  }
});

$("liste").addEventListener("click", (e) => {
  // Après un glisser, le navigateur envoie aussi un clic : on l'ignore, l'ordre a déjà changé.
  if (vientDeGlisser) { vientDeGlisser = false; return; }
  const b = e.target.closest("[data-sel]");
  if (!b) return;
  etat.sel = +b.dataset.sel;
  rendreListe();
  $("editeur").parentElement.scrollTop = 0;
  rendreEditeur();
  ouvrirEdition();
});

$("ajouter").addEventListener("click", ajouterCas);
$("ajouter-vide").addEventListener("click", ajouterCas);
$("enregistrer").addEventListener("click", enregistrer);
$("tester").addEventListener("click", tester);
$("retour").addEventListener("click", fermerEdition);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (etat.modifie) enregistrer(); }
  // Alt + ↑ / ↓ : même chose qu'un glisser, au clavier.
  if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !e.target.closest("input, textarea, select")) {
    const vers = etat.sel + (e.key === "ArrowUp" ? -1 : 1);
    if (vers >= 0 && vers < etat.cas.length) {
      e.preventDefault();
      const de = etat.sel;
      deplacerCas(de, vers);
    }
  }
});
window.addEventListener("beforeunload", (e) => { if (etat.modifie) { e.preventDefault(); e.returnValue = ""; } });

// Petit écran : liste et éditeur sont deux « pages » ; on glisse de l'une à l'autre.
function ouvrirEdition() { $("app").classList.add("edition"); }
function fermerEdition() { $("app").classList.remove("edition"); }

// ------------------------------------------------------------ enregistrer
async function enregistrer() {
  if (!etat.serveur) return telecharger();
  const incompletes = etat.cas.filter((c) => verifier(c).length).length;
  $("enregistrer").disabled = true;
  $("enregistrer").textContent = "Enregistrement…";
  try {
    const r = await fetch("/api/cas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(etat.cas.map(versJeu)),
    });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(rep.erreur || `Erreur ${r.status}`);
    etat.modifie = false;
    toast(incompletes
      ? `Enregistré. ${incompletes} situation${incompletes > 1 ? "s" : ""} à compléter ne ser${incompletes > 1 ? "ont" : "a"} pas jouée${incompletes > 1 ? "s" : ""}.`
      : "Enregistré. Les changements seront visibles à la prochaine partie.");
  } catch (err) {
    toast("Échec de l'enregistrement : " + (err.message === "Failed to fetch" ? "le serveur ne répond pas." : err.message));
  } finally {
    $("enregistrer").textContent = "Enregistrer";
    majEtat();
  }
}

function telecharger() {
  const blob = new Blob([JSON.stringify(etat.cas.map(versJeu), null, 2) + "\n"], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "cas.json" });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Tester : joue uniquement cette situation (même non enregistrée) dans un nouvel onglet.
function tester() {
  const c = casCourant();
  const pb = verifier(c);
  if (pb.length) {
    toast("Complétez d'abord la situation : " + pb[0].message);
    $("verif").scrollIntoView({ behavior: "smooth" });
    return;
  }
  localStorage.setItem(CLE_TEST, JSON.stringify(versJeu(c)));
  window.open("/?test=1", "_blank");
}

// ------------------------------------------------------------- images
let choixEnCours = null; // { type, i }

function choisirImage(type, i) {
  choixEnCours = { type, i };
  const c = casCourant();
  const actuelle = type === "personnages" ? c.personnages[i].sprite : c.documents[i].image;
  $("choix-image-titre").textContent = type === "personnages" ? "Image du personnage" : "Image du document";
  const options = [{ chemin: "", libelle: type === "personnages" ? "Silhouette par défaut" : "Pas d'image (texte seul)" }]
    .concat(etat.images[type].map((chemin) => ({ chemin, libelle: chemin.split("/").pop().replace(/\.\w+$/, "").replace(/[_-]+/g, " ") })));
  $("grille-images").innerHTML = options.map((o) => `
    <button type="button" class="tuile${o.chemin === actuelle ? " choisie" : ""}" data-chemin="${echapper(o.chemin)}">
      ${o.chemin || type === "personnages" ? `<img src="${echapper(url(o.chemin))}" alt="" loading="lazy">` : `<span class="sans-image">Aa</span>`}
      <span>${echapper(o.libelle)}</span>
    </button>`).join("");
  $("feuille-import").hidden = !etat.serveur;
  const bouton = $("bouton-importer"); // remis à zéro à chaque ouverture, quoi qu'il soit arrivé avant
  bouton.classList.remove("en-cours");
  bouton.firstChild.textContent = "Importer une image depuis l'ordinateur…";
  $("choix-image").showModal();
}

// Envoie un fichier du disque de l'ordinateur vers assets/characters ou assets/documents_jeu.
async function importerFichier(fichier) {
  if (!fichier) return;
  if (!etat.serveur) return toast("Import impossible : lancez le jeu avec python3 server.py.");
  const bouton = $("bouton-importer");
  if (bouton) { bouton.classList.add("en-cours"); bouton.firstChild.textContent = "Import en cours…"; }
  try {
    const r = await fetch(`/api/images?type=${choixEnCours.type}&nom=${encodeURIComponent(fichier.name)}`, { method: "POST", body: fichier });
    const rep = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(rep.erreur || `Erreur ${r.status}`);
    etat.images[choixEnCours.type].push(rep.chemin);
    // Un titre pris sur le nom du fichier évite de retaper ce qui est déjà écrit dessus.
    if (choixEnCours.type === "documents") {
      const doc = casCourant().documents[choixEnCours.i];
      if (doc && !doc.titre.trim()) doc.titre = fichier.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
    }
    toast("Image importée dans " + rep.chemin.split("/").slice(0, 2).join("/") + "/");
    appliquerImage(rep.chemin);
  } catch (err) {
    toast("Import impossible : " + (err.message === "Failed to fetch" ? "le serveur ne répond pas." : err.message));
  } finally {
    // Dans tous les cas, le bouton redevient cliquable (sinon on ne peut plus importer qu'une image).
    if (bouton) { bouton.classList.remove("en-cours"); bouton.firstChild.textContent = "Importer une image depuis l'ordinateur…"; }
  }
}

// Faire glisser un fichier depuis le bureau sur la fenêtre du navigateur.
(function preparerDepot() {
  const boite = $("choix-image");
  let minuterie;
  boite.addEventListener("dragover", (e) => {
    if (!etat.serveur) return;
    e.preventDefault();
    boite.classList.add("depot");
    clearTimeout(minuterie); // retirer l'état 200 ms après le dernier survol
    minuterie = setTimeout(() => boite.classList.remove("depot"), 200);
  });
  boite.addEventListener("drop", (e) => {
    e.preventDefault();
    boite.classList.remove("depot");
    const fichier = [...(e.dataTransfer.files || [])][0];
    if (!fichier) return;
    if (!fichier.type.startsWith("image/")) return toast("Ce fichier n'est pas une image.");
    importerFichier(fichier);
  });
})();

function appliquerImage(chemin) {
  const { type, i } = choixEnCours;
  const c = casCourant();
  if (type === "personnages") c.personnages[i].sprite = chemin;
  else c.documents[i].image = chemin;
  $("choix-image").close();
  marquerModifie();
  rendreTout();
}

$("grille-images").addEventListener("click", (e) => {
  const t = e.target.closest(".tuile[data-chemin]");
  if (t) appliquerImage(t.dataset.chemin);
});

$("fichier-image").addEventListener("change", (e) => {
  const fichier = e.target.files[0];
  e.target.value = "";
  importerFichier(fichier);
});

// ------------------------------------------------------------- messages
function afficherBandeau(html) {
  $("bandeau").innerHTML = html;
  $("bandeau").hidden = false;
}

let minuterieToast;
function toast(message, annuler) {
  const t = $("toast");
  t.innerHTML = `<span>${echapper(message)}</span>${annuler ? `<button class="lien">Annuler</button>` : ""}`;
  if (annuler) t.querySelector("button").addEventListener("click", () => { annuler(); t.classList.remove("visible"); });
  t.classList.add("visible");
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => t.classList.remove("visible"), annuler ? 6000 : 4000);
}

charger();

// Chargement et validation des cas (NPC + situation).
// Seul point d'entrée des données : le futur espace admin n'aura qu'à produire
// le même format JSON (fichier ou API) pour que le jeu fonctionne sans modification.
"use strict";

const SPRITE_PAR_DEFAUT = "assets/visiteur.svg";

// Transforme un cas brut en cas prêt à jouer, en complétant les valeurs par défaut.
// Accepte aussi l'ancien format du PROJECT.md ("visiteurs": ["M. Payet", ...]).
function normaliserCas(brut) {
  const personnages = (brut.personnages || (brut.visiteurs || []).map((nom) => ({ nom })))
    .map((p) => ({ nom: p.nom, sprite: p.sprite || SPRITE_PAR_DEFAUT }));
  return {
    id: brut.id,
    nomAdmin: brut.nom_admin || brut.id,
    personnages,
    type: personnages.length > 1 ? "duo" : "solo", // déduit, pas besoin de le saisir
    dialogue: brut.dialogue || [],
    indices: brut.indices || [],
    reponse: brut.reponse,
    explication: brut.explication || "",
  };
}

// Retourne la liste des erreurs d'un cas (vide = cas valide).
function validerCas(cas, idsModes) {
  const err = [];
  if (!cas.id) err.push("« id » manquant");
  if (!cas.personnages.length) err.push("aucun personnage");
  cas.personnages.forEach((p, i) => { if (!p.nom) err.push(`personnage ${i + 1} sans nom`); });
  if (!cas.dialogue.length) err.push("dialogue vide");
  const noms = cas.personnages.map((p) => p.nom);
  cas.dialogue.forEach((l, i) => {
    if (!noms.includes(l.qui)) err.push(`réplique ${i + 1} : « ${l.qui} » n'est pas un personnage du cas`);
    if (!l.texte) err.push(`réplique ${i + 1} sans texte`);
  });
  if (!idsModes.includes(cas.reponse))
    err.push(`réponse « ${cas.reponse} » inconnue (attendu : ${idsModes.join(", ")})`);
  if (!cas.explication) err.push("explication manquante");
  return err;
}

// Charge, normalise et valide. Les cas invalides sont écartés (avec un message
// clair dans la console) au lieu de faire planter la partie.
function preparerCas(bruts, modes) {
  const ids = modes.map((m) => m.id);
  const vus = new Set();
  const valides = [];
  bruts.map(normaliserCas).forEach((cas) => {
    const err = validerCas(cas, ids);
    if (vus.has(cas.id)) err.push("« id » déjà utilisé par un autre cas");
    vus.add(cas.id);
    if (err.length) console.warn(`Cas « ${cas.nomAdmin} » ignoré :\n - ${err.join("\n - ")}`);
    else valides.push(cas);
  });
  return valides;
}

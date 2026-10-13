# Justice Au Choix — prototype

Jeu court (esprit *Papers, Please*) pour sensibiliser aux modes alternatifs de règlement des différends. Voir `PROJECT.md` pour le concept.

## Lancer le jeu

Aucune installation : HTML/CSS/JavaScript pur. Il faut seulement un petit serveur local (les navigateurs bloquent la lecture des fichiers JSON en `file://`) :

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Arborescence

```
index.html        écrans du jeu (titre, visiteur, feedback, récap, manuel)
style.css         mise en page
js/jeu.js         boucle principale
js/cas.js         chargement + validation des cas
data/cas.json     les cas (visiteurs, dialogue, indices, réponse, explication)
data/modes.json   les modes de résolution = boutons « tampons » + manuel
assets/           images provisoires (SVG), à remplacer (scene/ = fond + bureau)
```

## Boucle de jeu

```
Titre -> [Visiteur -> choix d'un tampon -> Feedback] x N cas -> Récap -> Rejouer
                  ^ manuel consultable à tout moment (bouton ou Échap pour fermer)
```

## Ajouter / modifier un PNJ et sa situation

Un « cas » = un ou deux PNJ + leur situation. Tout se passe dans `data/cas.json` (un tableau), aucun code à toucher.

```json
{
  "id": "voisin-haie",
  "nom_admin": "Haie qui dépasse – voisins encore en contact",
  "personnages": [
    { "nom": "M. Payet", "sprite": "assets/pnj/payet.png" },
    { "nom": "Mme Hoarau" }
  ],
  "dialogue": [
    { "qui": "M. Payet", "texte": "Sa haie dépasse chez moi depuis deux ans." },
    { "qui": "Mme Hoarau", "texte": "Je veux bien la tailler, mais il ne m'a jamais rien demandé poliment." }
  ],
  "indices": ["trouble de voisinage", "les deux acceptent de se parler", "pas d'urgence"],
  "reponse": "conciliation",
  "explication": "Un conciliateur de justice peut les aider gratuitement…"
}
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | identifiant unique, sans espace (sert de clé technique) |
| `nom_admin` | non | nom qui caractérise le cas, **jamais affiché en jeu**, pour s'y retrouver (défaut : `id`) |
| `personnages` | oui | 1 PNJ = solo, 2 PNJ = duo (déduit automatiquement) |
| `personnages[].nom` | oui | nom affiché |
| `personnages[].sprite` | non | chemin de l'image (défaut : `assets/visiteur.svg`) |
| `dialogue` | oui | répliques dans l'ordre, affichées une à une en bulle au-dessus de celui qui parle ; `qui` doit être le `nom` d'un personnage du cas |
| `indices` | non | conseils de Papi, donnés un par appel au téléphone, dans l'ordre (le plus vague d'abord). Sans indice, le téléphone est masqué |
| `reponse` | oui | `id` d'un mode de `data/modes.json` : `negociation`, `conciliation`, `mediation`, `juge` |
| `explication` | oui | texte du feedback |

Les cas sont joués dans l'ordre du fichier. Les sprites peuvent aller dans `assets/pnj/`.

**Validation automatique** (`js/cas.js`) : au chargement, chaque cas est vérifié (champs manquants, `id` en double, `reponse` inconnue, réplique attribuée à un personnage absent…). Un cas invalide est **ignoré** et l'erreur est affichée dans la console du navigateur (F12), le reste du jeu continue de tourner.

L'ancien format du PROJECT.md (`"visiteurs": ["M. Payet", …]`) reste accepté.

### Préparé pour le futur espace admin

- Le jeu ne lit que ce JSON : l'admin n'aura qu'à écrire ce même format (dans le fichier, ou via une API qui renvoie le tableau — il suffira de changer l'URL dans `charger()` de `js/jeu.js`).
- `validerCas()` de `js/cas.js` peut être réutilisée telle quelle dans le formulaire admin pour valider avant enregistrement.
- Le tableau ci-dessus correspond directement aux champs du formulaire.

## Direction artistique et images

Le joueur voit la scène **à la 1re personne**, assis à son bureau : les clients se présentent face à lui et lui exposent leur cas. La scène est faite de 3 calques superposés :

```
assets/scene/fond.svg     arrière-plan : le mur du cabinet (fenêtre, étagères…)
sprites des clients       debout au centre, posés sur le bas de la scène
assets/scene/bureau.svg   premier plan : le bord du bureau, qui cache le bas des clients
```

Déroulé d'un client :

1. Le client arrive et parle en **bulles**, une réplique à la fois (clic sur la scène, Entrée ou Espace pour continuer). Le personnage qui ne parle pas est légèrement assombri.
2. Les tampons, sous la scène, s'activent une fois toutes les répliques entendues.
3. **Récap de la situation** (bouton en haut) : tout ce qui a été dit + les conseils de Papi déjà obtenus.
4. **Téléphone** sur le bureau (`assets/scene/telephone.svg`) : chaque appel à Papi (`assets/papi.svg`) donne l'indice suivant. Le nombre d'indices utilisés est rappelé dans le bilan final.

Pour remplacer les images provisoires, écraser ces fichiers (mêmes noms) ou modifier les chemins dans `index.html`. Conseils pour les vrais visuels :

- **Fond** : format large (environ 16:7), il est recadré pour remplir la scène.
- **Bureau** : bande horizontale, étirée sur toute la largeur et environ le quart bas de la scène.
- **Sprites clients** (`personnages[].sprite` dans `data/cas.json`) : PNG à fond transparent, personnage vu de face, cadré de la tête à la taille, en portrait (environ 2:3). Le bas est caché par le bureau ; le sprite est affiché sur toute la hauteur de la scène, nom en étiquette au-dessus de la tête. Sans sprite : `assets/visiteur.svg`.

## Textes provisoires

Tous les textes marqués `[Texte provisoire]` / `[indice provisoire]` / `[Explication provisoire]` sont à remplacer par l'équipe contenu, après validation par les professionnels du droit.

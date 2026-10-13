# Justice Au Choix — prototype

Jeu court (esprit *Papers, Please*) pour sensibiliser aux modes alternatifs de règlement des différends. Voir `PROJECT.md` pour le concept.

## Lancer le jeu

Aucune installation : HTML/CSS/JavaScript pur, plus un petit serveur en Python 3 standard (aucun paquet à installer) :

```bash
python3 server.py
```

- Jeu : http://localhost:8000
- Espace admin : http://localhost:8000/admin

Pour rendre le jeu accessible sur le réseau (borne, autre ordinateur), protégez l'admin par un mot de passe :

```bash
ADMIN_MOT_DE_PASSE=choisissez-un-mot-de-passe python3 server.py --hote 0.0.0.0 --port 8080
```

Le navigateur demande alors un identifiant (n'importe lequel) et ce mot de passe pour ouvrir `/admin`. Le jeu, lui, reste public.

`python3 -m http.server` marche encore pour jouer, mais l'admin ne pourra pas enregistrer : il proposera de télécharger `cas.json` à la place.

## Espace admin (`/admin`)

Pour ajouter ou modifier des situations sans toucher au code ni au JSON.

1. **＋** en haut de la liste crée une nouvelle situation.
2. On remplit les sections, dans l'ordre : titre (jamais affiché en jeu), orientation la plus adaptée, personnages, ouverture, questions, documents, conseils de Papi, explication.
3. Une carte en haut indique ce qui manque (« Réplique 2 : choisissez qui parle »…). Un clic sur un message amène au champ concerné. Dans la liste, chaque situation est marquée **Prête** ou **À compléter**.
4. **Tester** joue uniquement cette situation dans un nouvel onglet, même avant d'enregistrer.
5. **Enregistrer** (ou Ctrl+S) écrit `data/cas.json`. Les changements apparaissent à la prochaine partie.

Ce qu'il faut savoir :
- Une situation « À compléter » peut être enregistrée pour ne pas perdre le travail, mais le jeu ne la joue pas.
- **Ordre de jeu** : c'est l'ordre de la liste de gauche. Pour le changer, glissez une situation à sa nouvelle place (la poignée ≡ aide sur écran tactile), ou Alt + ↑ / ↓ au clavier. Un message permet d'annuler.
- **Images** : un clic sur la vignette d'un personnage (ronde) ou d'un document (rectangle) ouvre la fenêtre de choix.
  - Le bouton bleu **« Importer une image depuis l'ordinateur… »** ouvre le sélecteur de fichiers (PNG, JPEG ou WebP, 10 Mo maximum). On peut aussi glisser un fichier sur la fenêtre.
  - L'image est ajoutée dans `assets/characters/` (personnages) ou `assets/documents_jeu/` (documents). Une image existante n'est jamais écrasée : la nouvelle prend un nom terminé par `-2`, `-3`…
  - Pour un document, si le titre est vide, il est repris du nom du fichier.
- Renommer un personnage met à jour ses répliques et ses réponses.
- Supprimer un élément ou une situation peut s'annuler (bouton « Annuler » du message en bas).
- À chaque enregistrement, l'ancien fichier est copié dans `data/sauvegardes/` (30 dernières versions gardées, non versionnées par git). Pour revenir en arrière, recopiez l'une d'elles à la place de `data/cas.json`.

## Arborescence

```
server.py         serveur local : sert le jeu + l'API de l'espace admin
admin/            espace admin (/admin) : index.html, admin.css, admin.js
index.html        écrans du jeu (titre, visiteur, feedback, récap, manuel)
style.css         mise en page
js/jeu.js         boucle principale
js/cas.js         chargement + validation des cas
data/cas.json     les cas (personnages, ouverture, questions, documents, réponse, explication)
data/modes.json   les 4 orientations = feuilles du bureau + lignes du guide
data/livre.json   guide de la résolution amiable : ordre logique + « Bon à savoir » (facultatif)
Scripts/          scripts des cas rédigés par l'équipe contenu (source de data/)
assets/           images provisoires (SVG), à remplacer (scene/ = fond + bureau)
```

## Boucle de jeu

Chaque dossier dispose de **5 minutes**. Le chrono continue pendant les dialogues et la consultation du guide ou des documents. Un appel à Papi Papier coûte **20 secondes**.

À zéro, le dossier est compté comme non traité et l'explication apparaît avant de passer au suivant. Le chrono s'arrête dès la décision ; chaque nouveau dossier repart à cinq minutes. Le bilan indique les pénalités et les dossiers non traités.

```
Titre -> [Ouverture -> questions (facultatif) -> choix d'un tampon -> Feedback] x N cas -> Récap -> Rejouer
           ^ Guide de la résolution amiable, documents du client et Récap consultables à tout moment (Échap pour fermer)
```

## Retours et choix des joueurs

Les retours présentent la piste la plus adaptée au contexte, sans « mauvaise réponse », refus ou croix rouge. Le bilan reprend la proposition du joueur et l'explication de chaque dossier.

Après chaque dossier et dans le bilan, les pourcentages affichent les réponses réellement recueillies sur ce serveur, y compris le choix du joueur. Un dossier sans choix (temps écoulé) n'ajoute pas de vote ; les parties de test de l'admin sont exclues. Les arrondis totalisent 100 %. Sans données ou si le service est indisponible, un message remplace les pourcentages.

`GET /api/statistiques?cas_id=…` consulte les compteurs ; `POST /api/statistiques` reçoit `cas_id`, `choix` et un identifiant anonyme `participation`. Un envoi répété ne compte qu'une fois. Les compteurs persistent dans `.statistiques.sqlite3` (ignoré par Git et inaccessible via HTTP). Modifier une situation démarre de nouveaux compteurs pour sa nouvelle version. Les statistiques sont publiques même quand l'admin est protégé par mot de passe.

Vérification : `python3 -m unittest discover -s tests` et `node tests/feedback.test.cjs`.

## Guide et types de médiateurs

Le guide détaille la conciliation, la médiation et le contentieux, avec des sources officielles. Les explications des huit types de médiateurs se consultent dans le livre, via « Médiateur » ou « Les types de médiateurs ». Sur le bureau, un clic sur la feuille générique ouvre des papiers de proposition portant uniquement le nom des interlocuteurs. Choisir un papier remplace la feuille « Médiateur » par le type choisi, sans valider l'orientation. On peut encore changer de papier ; le tampon (ou Entrée sur la feuille au clavier) valide ensuite le choix. Le type précis apparaît dans le retour et le bilan. Chaque dossier repart avec la feuille générique. Les pourcentages restent regroupés par grande orientation.

Les fiches sont dans `data/livre.json` (`mediateurs`). Le coût, la durée et les pièces nécessaires varient selon le type de médiation. Le guide précise ces différences plutôt que d'indiquer une durée fixe ou un tarif unique.

Certains documents ont `a_demander: true` : ils sont absents de la pile jusqu'à ce que le joueur pose la question correspondante. La demande ajoute un échange au dialogue et remet la pièce au dossier. Dans l'admin, le champ « Transmission du document » choisit entre une pièce disponible au départ et une pièce à demander. Une nouvelle partie remet les pièces à leur état initial.

Vérification de ce parcours : `node tests/mediation.test.cjs`.

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
  "questions": [
    { "question": "Avez-vous essayé d'en parler ensemble ?", "qui": "Mme Hoarau", "reponse": "Ça n'a rien donné." },
    { "question": "Vous voulez rester bons voisins ?", "qui": ["M. Payet", "Mme Hoarau"], "reponse": "… Oui." }
  ],
  "documents": [
    { "titre": "Mot de M. Payet", "type": "note", "texte": "« Coupez vos branches. »" }
  ],
  "reponse": "conciliateur",
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
| `dialogue` | oui | « Ouverture » : répliques dans l'ordre, affichées une à une en bulle au-dessus de celui qui parle ; `qui` doit être le `nom` d'un personnage du cas |
| `questions` | non | questions que le joueur peut poser (boutons sous la scène, chacune une seule fois) |
| `questions[].qui` | oui | nom du personnage qui répond, ou liste de noms pour une réponse en chœur |
| `documents` | non | pièces du dossier, lisibles via le bouton « Dossier ». Sans document, le bouton est masqué |
| `documents[].image` | non | image du document, texte compris (ex. `assets/documents_jeu/cas4_facture_velo.png`) |
| `documents[].texte` | oui sans image | sans image : texte affiché avec un gabarit CSS. Avec image : transcription (texte alternatif) |
| `documents[].a_demander` | non | `true` si le joueur doit demander la pièce pour compléter le dossier ; modifiable dans l’admin |
| `documents[].proprietaire` | non | personnage qui a apporté le document (nom, ou liste de noms si partagé). La pile de droite n'affiche que les documents du personnage sur lequel le joueur a cliqué ; sans propriétaire, le document est visible pour tous |
| `documents[].type` | non | gabarit CSS si pas d'image : `sms`, `note` (défaut), `planning`, `annonce` |
| `indices` | non | conseils de Papi, donnés un par appel au téléphone, dans l'ordre (le plus vague d'abord). Sans indice, le téléphone est masqué |
| `reponse` | oui | `id` d'un mode de `data/modes.json` : `amiable`, `conciliateur`, `mediateur`, `tribunal` |
| `explication` | oui | texte du feedback |

Les cas sont joués dans l'ordre du fichier. Les sprites peuvent aller dans `assets/pnj/`.

**Validation automatique** (`js/cas.js`) : au chargement, chaque cas est vérifié (champs manquants, `id` en double, `reponse` inconnue, réplique attribuée à un personnage absent…). Un cas invalide est **ignoré** et l'erreur est affichée dans la console du navigateur (F12), le reste du jeu continue de tourner.

L'ancien format du PROJECT.md (`"visiteurs": ["M. Payet", …]`) reste accepté.

### Lien avec l'espace admin

- L'admin lit et écrit exactement ce format, via `server.py` (`PUT /api/cas`).
- Il réutilise `normaliserCas()` / `validerCas()` de `js/cas.js` : une situation « Prête » dans l'admin est forcément acceptée par le jeu.

## Direction artistique et images

Le joueur voit la scène **à la 1re personne**, assis à son bureau : les clients se présentent face à lui et lui exposent leur cas. La scène est faite de 3 calques superposés :

```
assets/scene/back.png     arrière-plan : le cabinet, avec le bord du bureau au premier plan
sprites des clients       debout au centre, posés derrière le bureau
assets/scene/back.png     2e copie découpée sur le bord du bureau, devant les clients (cache le bas du corps)
plateau du bureau         sous l'image : feuilles d'orientation, tampon, emplacements manuel / documents
assets/scene/tel.png      téléphone de Papi (affiché seulement si le cas a des indices)
```

Déroulé d'un client :

1. Le client arrive et parle en **bulles**, une réplique à la fois (clic sur la scène, Entrée ou Espace pour continuer). Le personnage qui ne parle pas est légèrement assombri.
2. **Décision au tampon** : 4 feuilles d'orientation (une par mode de `data/modes.json`) sont posées sur le bureau. Le joueur saisit le tampon (`assets/scene/tampon.png`) et le glisse sur la feuille de son choix (souris ou doigt). Chaque choix reçoit le même sceau « Orientation retenue », puis l’écran explique la piste la plus adaptée au contexte. Le tampon est grisé tant que l'ouverture n'est pas terminée. Au clavier : Tab jusqu'à une feuille puis Entrée.
   - **Bord gauche de l'écran** : le guide de la résolution amiable, fermé (`book_closed-Photoroom.png`). Un clic l'ouvre en grand (`book_open.png`) : tableau « Je vois… / J'envoie… » sur la page de gauche, détail des choix et « Bon à savoir » sur celle de droite.
   - **Bord droit de l'écran** : les documents du client, en pile de miniatures. Elle montre les documents du personnage sur lequel on clique (rien s'il n'en a pas). Un clic sur un document l'ouvre en grand ; ‹ › ou les flèches du clavier pour feuilleter.
   - Sous 1100 px de large, livre et documents passent sous la scène.
3. **Questions** : le joueur pose une question (bulle bleue), le ou les personnages répondent en bulle. Une question posée est barrée.
6. **Récap** (bouton en haut) : tout ce qui a été dit, questions comprises, + les conseils de Papi déjà obtenus.
7. **Téléphone** sur le bureau (`assets/scene/telephone.svg`) : chaque appel à Papi (`assets/papi.svg`) donne l'indice suivant. Le nombre d'indices utilisés est rappelé dans le bilan final.

Pour remplacer les images provisoires, écraser ces fichiers (mêmes noms) ou modifier les chemins dans `index.html`. Conseils pour les vrais visuels :

- **Fond** : format large (environ 16:7), il est recadré pour remplir la scène.
- **Bureau** : bande horizontale, étirée sur toute la largeur et environ le quart bas de la scène.
- **Sprites clients** (`personnages[].sprite` dans `data/cas.json`) : PNG à fond transparent, personnage vu de face, cadré de la tête à la taille, en portrait (environ 2:3). Le bas est caché par le bureau ; le sprite est affiché sur toute la hauteur de la scène, nom en étiquette au-dessus de la tête. Sans sprite : `assets/visiteur.svg`.

## Textes provisoires

Tous les textes marqués `[Texte provisoire]` / `[indice provisoire]` / `[Explication provisoire]` sont à remplacer par l'équipe contenu, après validation par les professionnels du droit.

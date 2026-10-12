# Justice Tech 2026 — Problématique 03 : Sensibiliser les citoyens

Hackathon Cour d'appel de Saint-Denis × Epitech La Réunion — 12 & 13 octobre 2026

## Le défi

Faire connaître au grand public les **modes alternatifs de règlement des différends** (MARD) : régler un conflit sans passer par un procès.

## Notre réponse : un jeu

Un jeu court, dans l'esprit de *Papers, Please* : comparer une situation à un manuel, puis trancher.

- Le joueur incarne un **avocat** qui reçoit des personnes, **seules ou en duo**.
- Chaque visiteur expose son problème (dialogue + indices).
- Le joueur consulte son **manuel** et **oriente** la personne vers le bon mode de résolution.
- Après chaque choix, un **écran de feedback** explique pourquoi c'était la bonne ou la mauvaise réponse.
- À la fin : un **récap** de ce que le joueur a appris.

> Le cœur pédagogique, c'est le feedback. Sans explication, c'est juste un quiz.

## Les réponses possibles (les « tampons »)

| Mode | En une ligne |
|---|---|
| Négociation directe | Les parties s'arrangent elles-mêmes |
| Conciliation | Un conciliateur de justice, gratuit, aide à trouver un accord |
| Médiation | Un médiateur aide les parties à renouer le dialogue et à construire une solution |
| Procédure participative | Les parties, chacune avec son avocat, négocient dans un cadre écrit |
| Arbitrage | Un arbitre privé tranche (rarement adapté aux particuliers, bon distracteur) |
| Juge nécessaire | L'amiable n'est pas adapté : il faut saisir la justice |

⚠️ **À faire valider par les professionnels du droit** pendant le créneau d'échange (mardi 10h–12h). Le droit de l'amiable a été réformé récemment.

## Les cas pièges (indispensables)

Ils montrent au jury qu'on ne fait pas une promo naïve de la médiation :

- **Violences conjugales** : la médiation est exclue.
- **Urgence** (danger, expulsion imminente) : il faut passer par le juge.
- **Une partie refuse tout dialogue** : la médiation suppose l'adhésion des deux.

Le format **duo** sert ça : le joueur voit si les deux personnes peuvent encore se parler.

## Format d'un cas

Les cas sont des données, séparées du code, pour que l'écriture et le dev avancent en parallèle.

```json
{
  "id": "voisin-haie",
  "visiteurs": ["M. Payet", "Mme Hoarau"],
  "type": "duo",
  "dialogue": [
    { "qui": "M. Payet", "texte": "Sa haie dépasse chez moi depuis deux ans." },
    { "qui": "Mme Hoarau", "texte": "Je veux bien la tailler, mais il ne m'a jamais rien demandé poliment." }
  ],
  "indices": ["trouble de voisinage", "les deux acceptent de se parler", "pas d'urgence"],
  "reponse": "conciliation",
  "explication": "Un conciliateur de justice peut les aider gratuitement à trouver un accord. Pour un conflit de voisinage, une tentative amiable est en principe obligatoire avant d'aller au tribunal."
}
```

**Objectif : 6 à 8 cas bien écrits**, dont au moins 2 pièges. Mieux vaut peu de cas solides que beaucoup de cas plats.

## Écrans du jeu (scope POC)

1. Titre / intro (qui je suis, ce que je fais)
2. Réception d'un visiteur (dialogue + indices)
3. Manuel consultable à tout moment
4. Choix du mode de résolution
5. Feedback (bonne / mauvaise réponse + explication)
6. Récap final (score + ce qu'on a appris)

Tout le reste (animations, sons, sauvegarde, niveaux…) est **bonus**, uniquement si le cœur tourne.

## Répartition proposée

- **Contenu (2 personnes)** : rédaction des cas et du manuel, validation avec les pros à 10h.
- **Dev (3 personnes)** : moteur du jeu (chargement des cas JSON, écrans, logique de choix/feedback), puis intégration graphique.
- Tout le monde : pitch en fin d'après-midi.

## Planning mardi 13

| Quand | Quoi |
|---|---|
| Matin | Dev du squelette jouable + rédaction des premiers cas |
| 10h – 12h | Échange avec les pros : faire valider les cas et le manuel |
| 12h – après-midi | Intégration de tous les cas, polish, préparation du pitch |
| Avant de partir | Démo testée de bout en bout, sur la machine de présentation |
| 17h30 | Pitch + démo à la Cour d'appel |

## Pitch : ce que le jury regarde

- **Pertinence** : on sensibilise vraiment aux MARD, cas pièges compris.
- **Faisabilité** : où vit ce jeu ? Borne dans la salle des pas perdus, lien sur les sites des Points-justice, ateliers en collège/lycée.
- **Prototype** : une démo de 2 cas en live, dont un piège.
- **Pitch** : compréhensible par un non-développeur. On parle du citoyen, pas de la stack.

## Questions ouvertes

- [ ] Stack technique (à trancher dès le début de matinée)
- [ ] Rôle du joueur : avocat, ou agent de Point-justice (plus proche de là où un citoyen s'oriente réellement) ? À demander aux pros.
- [ ] Durée du pitch (non précisée par les organisateurs : demander à Luan Sautron / Anthony Palasse)
- [ ] Heure d'arrivée à Epitech mardi matin

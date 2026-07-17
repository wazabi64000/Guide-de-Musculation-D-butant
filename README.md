# Guide de Musculation Débutant

PWA de suivi d'entraînement (HTML / CSS / JavaScript, sans framework).

## Lancer l'app

Les modules ES6 et le Service Worker nécessitent un serveur HTTP local :

```bash
python3 -m http.server 8080
```

Puis ouvrir [http://localhost:8080](http://localhost:8080).

## Fonctionnalités

- Programme 4 jours (Lundi, Mardi, Jeudi, Vendredi) issu du guide Word
- Séance avec minuteur circulaire, repos automatique
       - Musique exercice / repos / fin / countdown
      - Historique, statistiques, records (IndexedDB)
      - Mode sombre / clair, installable hors ligne (PWA)

## Images

Placez vos photos d'exercices dans `/images/` avec les noms indiqués dans `data/program.json` (ex. `chest-press.jpg`). Sans image, un fallback s'affiche.

## Musique

Fichiers attendus dans `/music/` :

- `exercise.mp3`
- `rest.mp3`
- `finish.mp3`
- `countdown.mp3`

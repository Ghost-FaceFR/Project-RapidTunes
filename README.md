<div align="center">

# RapidTunes

**Lecteur média et téléchargeur audio/vidéo pour Windows, propulsé par Tauri + React.**

![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)
![Plateforme](https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows&logoColor=white)
![Version](https://img.shields.io/badge/version-0.2.4-6C5CE7)

</div>

---

## Aperçu

RapidTunes réunit deux outils dans une seule application :

- **Lecteur média** : bibliothèque locale, playlists, file de lecture, mini lecteur, égaliseur, lecture plein écran.
- **Media DL** : téléchargement et conversion de médias depuis une URL, avec file d'attente et historique.

## Fonctionnalités

### Media DL
- Téléchargement audio/vidéo depuis une URL (vidéo ou playlist)
- Aperçu direct du média (miniature, titre, durée) dans la carte de file d'attente
- Formats : MP3, MP4, WAV, FLAC, AAC
- Qualités : 128 / 320 kbps, 720p / 1080p, et audio + vidéo combinés pour le MP4
- File d'attente (réorganisation par glisser-déposer, monter/descendre, annulation)
- Pause / reprise, annulation du téléchargement en cours
- Graphique de vitesse en temps réel, progression et estimation du temps restant
- Historique des téléchargements, ouverture de l'emplacement du fichier
- Limitation de débit

### Lecteur média
- Bibliothèque locale (ajout de dossiers, fichiers, URL)
- Playlists, file de lecture, lecture aléatoire, vitesse de lecture
- Panneau « Média sélectionné » avec pochette et propriétés
- Édition des tags, mini lecteur (`Ctrl+M`), lecture plein écran
- Égaliseur et visualisation audio (barres, ondes, cercles) avec couleur au choix : thème, palettes ou couleur personnalisée
- Liste des morceaux avec en-têtes de colonnes (titre, artiste, album, genre, durée)

### Mises à jour
- Vérification automatique au démarrage via les *Releases* GitHub
- Onglet « À propos » : recherche manuelle, téléchargement puis installation de la nouvelle version

### Interface
- Thèmes personnalisables
- Fenêtre sans bordure avec barre de titre personnalisée
- Interface en français

### CLI
- `rapidtunes-cli` : téléchargement unitaire ou en lot depuis le terminal

## Prérequis

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable)
- Dans le `PATH` :
  - [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)
  - [`ffmpeg`](https://ffmpeg.org)

## Démarrage rapide

```bash
git clone https://github.com/Ghost-FaceFR/Project-RapidTunes.git
cd Project-RapidTunes
npm install
npm run tauri:dev
```

### Lanceur Windows

Le fichier `rapidtunes.bat` est un lanceur unique. Sans argument, il affiche un menu interactif.

| Argument | Action |
| --- | --- |
| `dev` | Session développement (console + fenêtre) |
| `user` | Mode utilisateur (ouvre seulement le `.exe`) |
| `web` | Mode web debug (serveur Vite + logs, sans ouverture automatique du navigateur) |
| `desktop` | Alias de la session desktop debug |
| `build` | Compile l'exécutable et le copie dans `release\RapidTunes.exe` |
| `cmd` | Invite de commande debug avec les URLs localhost |
| `diag` | Diagnostic de l'environnement (Node.js, npm, Cargo, dépendances) |

En mode `web`, l'URL de debug est affichée dans la console. Ouvre-la manuellement dans le navigateur de ton choix.

## Build

```bash
npm run tauri:build      # package desktop
npm run build            # frontend seul
rapidtunes.bat build     # build Windows + copie de l'exe dans release\
```

L'exécutable est généré dans `src-tauri/target/release/rapidtunes.exe`.

## CLI

Téléchargement unitaire :

```bash
npm run cli -- download --url "https://..." --format mp3 --quality 320kbps --mode audio
```

Téléchargement en lot (voir `examples/batch.sample.json`) :

```bash
npm run cli -- batch --file "examples/batch.sample.json"
```

## Structure du projet

```
src/                  Interface React (JSX/CSS)
  components/         Composants (bibliothèque, visualiseur, etc.)
  services/           Appels vers le backend Tauri
  utils/              Validation et formatage
src-tauri/
  src/services/       Logique Rust (téléchargement, conversion)
  src/bin/            rapidtunes-cli
examples/             Exemples de fichiers batch
rapidtunes.bat        Lanceur Windows
```

## Publier une mise à jour

1. Augmenter la version dans `package.json`, `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`.
2. Compléter `CHANGELOG.md`.
3. Compiler : `powershell -File scripts/build-release.ps1` (produit dans `release\` l'installateur RapidTunes `RapidTunes_<version>_x64-setup.exe`, dont l'interface est dans `installer\`, et l'installateur NSIS classique `RapidTunes_<version>_x64-classic.exe`).
4. Créer une *Release* GitHub dont le tag est la version (ex. `v0.2.0`), dont le texte reprend la section du `CHANGELOG.md` (il alimente le journal des modifications de l'application), et y joindre les deux installateurs (`-setup.exe`, utilisé par la mise à jour automatique, et `-classic.exe`).

L'application compare le tag de la dernière release à sa version et propose la mise à jour si elle est plus récente.

## Notes techniques

- Le backend exécute `yt-dlp` et s'appuie sur `ffmpeg` pour les conversions.
- Le mode batch de la CLI est séquentiel.

## Auteur

© 2026 **Ghost Industry**. Tous droits réservés.

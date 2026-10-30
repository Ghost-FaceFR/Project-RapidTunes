# Journal des modifications

## 0.2.0 - 30 octobre 2026

### Nouveautés
- Installateur Windows (`RapidTunes_0.2.0_x64-setup.exe`) : installe l'application pour l'utilisateur courant, avec raccourcis, désinstallation et le composant WebView2 si le PC ne l'a pas.
- Installation automatique des composants requis (yt-dlp, ffmpeg, deno) au premier lancement : plus d'erreur « yt-dlp introuvable » sur un autre PC.
- Recherche de mises à jour dans Paramètres → Mises à jour, vérification au démarrage et téléchargement automatique optionnel.
- Notifications en surimpression pour les erreurs et les résultats, avec une barre de progression qui se vide pendant la durée d'affichage restante (le survol la met en pause).
- Champ unique « Lien ou recherche » dans Media DL : un lien est téléchargé, tout autre texte lance une recherche YouTube.
- Visualisation : 11 nouveaux thèmes de couleurs (Coucher de soleil, Néon, Cyberpunk, Glace, Menthe, Or, Lave, Aurore boréale, Bonbon, Matrix, Noir et gris).
- Les réglages de visualisation (style, couleurs, couleur personnalisée) sont dans le menu « Plus d'options » du lecteur.
- Paramètres vidéo : luminosité, contraste, saturation et mode d'affichage (ajuster, remplir, étirer).
- Raccourcis clavier affichés dans les infobulles (Espace, Échap, Ctrl+M, Ctrl+I).

### Améliorations
- Performances : la visualisation s'arrête en pause et quand la fenêtre est masquée, elle est limitée à 30 images par seconde, l'analyse audio est allégée et l'interface se redessine moins souvent.
- Le plein écran couvre tout l'écran, y compris la barre des tâches et la bordure Windows.
- Media DL : une seule carte pour le téléchargement en cours (pause, reprise et annulation incluses), espacements corrigés dans « À venir » et « Historique ».
- Paramètres : cartes d'emplacements repliables, boutons radio sans cadre, limite de vitesse regroupée dans une seule carte, options « Bouton « Réduire » » et « Bouton « Fermer » ».
- Menu de vitesse de lecture sur une seule ligne.
- Infobulles : plus de répétition du texte déjà visible, et elles restent dans la fenêtre.
- Menu contextuel natif du navigateur désactivé.
- Mentions « Ghost Industry » corrigées dans À propos et le README.

### Corrections
- Erreur « stream did not contain valid UTF-8 » pendant un téléchargement avec des titres accentués.
- Erreurs qui n'étaient affichées nulle part : elles apparaissent maintenant en notification.
- Le bouton « Paramètres vidéo » restait grisé même pendant une vidéo.
- Un filtre vidéo permanent alourdissait le GPU, il n'est appliqué que si un réglage change.

## 0.1.0

- Première version : téléchargement et conversion de médias, lecteur audio/vidéo avec égaliseur, médiathèque, playlists et file d'attente.

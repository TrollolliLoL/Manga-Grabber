📖 Spécifications Techniques : NatoManga Grabber
1. Vision du Produit
Objectif : Extension Chrome dédiée à l'archivage local des chapitres sur natomanga.com.
Approche : Capture chirurgicale basée sur la structure réelle du site, avec automatisation du scroll pour forcer le chargement des images en Lazy Loading.
2. Architecture Technique (Manifest V3)
Frontend : Popup HTML/CSS (Style SaaS/Tech).
Scripts :
content.js : Moteur de scroll et d'extraction dans le DOM.
popup.js : Pilotage et gestion des téléchargements via chrome.downloads.
Permissions : activeTab, downloads, scripting.
3. Analyse Site (Cible : Natomanga)
Conteneur Principal : div.container-chapter-reader
Sélecteur d'images : div.container-chapter-reader img
Lazy Loading : Présence de l'attribut loading="lazy".
Format : Principalement .webp.
Nommage dossier : Tiré du document.title (ex: "Kenja No Mago Chapter 1.2").
4. Workflow de l'Application
A. Phase de Capture (Content Script)
Turbo Scroll : Lancement d'un scroll automatique dès le clic sur "Start".
Paliers : 1000px.
Intervalle : 50ms (Scroll rapide pour "réveiller" les balises img).
Fin : Déclenchée quand window.innerHeight + window.scrollY >= document.body.offsetHeight.
Extraction & Validation :
Extraire l'URL (src ou data-src).
Validation cruciale : Vérifier que img.complete est vrai et img.naturalWidth > 0.
Si l'image est en erreur (onerror), attendre 1s avant une seconde tentative.
Ordre : Stocker les URLs dans un Array pour préserver l'ordre exact du DOM.
B. Phase de Téléchargement (Popup Logic)
Sanitization : Nettoyer le titre du manga pour supprimer les caractères interdits (/, :, ?, |, etc.) afin de créer un dossier valide.
Rangement : MangaScraper/[Nom_Manga_Chapitre]/[001..999].extension.
Throttling : Délai de 200ms entre chaque image pour éviter d'être bloqué par le serveur d'images.
5. Interface Utilisateur (Style SaaS Tech / ShadUI)
Thème : Dark Mode (Zinc #09090b, Bordures #27272a).
Composants :
Header : Badge "NatoManga Collector" + Indicateur d'état (LED).
Card : Affichage du chapitre détecté (Input stylisé en lecture seule).
Action : Gros bouton "Start Capture" (Blanc, texte Noir) / "Cancel".
Console Log : Zone JetBrains Mono affichant : [SCAN] Page 05 détectée...
Progress Bar : Fine ligne de 2px en haut de la console.
6. Contraintes & Sécurité
URL Check : L'extension ne doit s'activer que si l'URL contient natomanga.com.
Anti-Doublons : Utilisation d'un Set d'URLs pendant la collecte.
Micro-interactions : Pulsation de l'icône de l'extension pendant le travail.

🎨 Spécifications UI/UX (Style "SaaS Tech & Minimalist")
A. Identité Visuelle
Thème : Dark Mode uniquement (Inspiré par Vercel / Linear / Shadcn).
Palette de couleurs :
Fond (Background) : #09090b (Zinc très sombre).
Cartes/Conteneurs : #18181b avec une bordure fine #27272a.
Texte : #fafafa (Primaire), #a1a1aa (Secondaire).
Accent : #3b82f6 (Bleu Tech) ou #10b981 (Vert Émeraude) pour les actions positives.
Danger : #ef4444 (Rouge).
Typographie : Inter, Geist ou système Sans-Serif standard. Poids de police : 400 (Regular) et 600 (Semi-bold).
B. Composants & Layout (Style Shadcn)
Bords : Arrondis (Border-radius) de 8px.
Bordures : 1px solid très subtiles.
Boutons :
Primaire : Fond blanc, texte noir (effet haut de gamme).
Ghost/Secondary : Fond transparent, bordure grise, effet hover subtil.
Espacement : Utilisation d'une grille stricte (padding de 16px).
C. Structure de la Popup
Header : Petit badge "NatoManga Collector" + Icône de statut (LED verte/rouge).
Target Card : Une section affichant le nom du manga détecté et le chapitre (ex: "One Piece - Chapitre 1102") avec un style "Read-only input".
Control Center :
Gros bouton "Start Capture" avec une icône SVG "Scan".
Bouton secondaire "Settings" (roue crantée).
Log Console (Le "Tech Look") :
Une zone sombre en bas de la popup avec une police monospace (JetBrains Mono ou Consolas).
Affiche le flux en temps réel : [SCANNING] Image 04/52...
Barre de progression très fine (2px de haut) qui traverse le haut de la zone de log.
D. Micro-interactions
Hover : Les boutons doivent avoir une transition douce (150ms ease-in-out).
Animations : Une légère pulsation sur l'icône pendant le scan.
Feedback : Changement de couleur du bouton en "Terminé" (Vert) une fois le dossier téléchargé.
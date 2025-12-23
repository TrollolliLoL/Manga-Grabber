# 📋 MangaGrabber - TODO (Tickets Granulaires)

> **Projet** : Extension Chrome pour capturer et télécharger les images d'un chapitre manga  
> **Dernière MAJ** : 24/12/2024

---

## 🎯 PHASE 1 : Interface Utilisateur (Front-end)

### Sprint 1.1 - Fondations
- [x] **1.1.1** Créer `manifest.json` (Manifest V3, permissions minimales)
- [x] **1.1.2** Configurer les icônes (16, 32, 48, 128px)
- [x] **1.1.3** Créer `popup.html` (structure sémantique, aucun JS inline)

### Sprint 1.2 - Design System (CSS)
- [x] **1.2.1** Créer `popup.css` avec variables CSS (couleurs, typographie)
- [x] **1.2.2** Implémenter la palette Zinc (#09090b, #18181b, etc.)
- [x] **1.2.3** Configurer la typographie Inter (Google Fonts)
- [x] **1.2.4** Définir les classes utilitaires (spacing, border-radius)

### Sprint 1.3 - Composants UI
- [x] **1.3.1** Header : Badge "MangaGrabber" + LED de statut
- [x] **1.3.2** Bouton primaire "Lancer la capture" (style ShadUI blanc)
- [x] **1.3.3** Zone Console (police monospace, logs temps réel)
- [x] **1.3.4** Progress Bar fine (2px) au-dessus de la console

### Sprint 1.4 - Micro-interactions CSS
- [ ] **1.4.1** Transitions hover sur boutons (150ms ease-in-out)
- [ ] **1.4.2** Animation pulsation LED
- [ ] **1.4.3** États visuels (idle, scanning, complete, error)

---

## 🔧 PHASE 2 : Logique Content Script

### Sprint 2.1 - Turbo Scroll Engine
- [ ] **2.1.1** Créer `content.js` (injection dans l'onglet actif)
- [ ] **2.1.2** Fonction `turboScroll()` (paliers 1000px, intervalle 50ms)
- [ ] **2.1.3** Détection fin de page (innerHeight + scrollY >= offsetHeight)
- [ ] **2.1.4** Message vers popup : "scroll_complete"

### Sprint 2.2 - Extraction d'Images
- [ ] **2.2.1** Sélecteur DOM : `div.container-chapter-reader img`
- [ ] **2.2.2** Récupérer `src` ou `data-src` (fallback)
- [ ] **2.2.3** Validation : `img.complete && img.naturalWidth > 0`
- [ ] **2.2.4** Retry logic : attendre 1s si `onerror`
- [ ] **2.2.5** Anti-doublons via `Set`
- [ ] **2.2.6** Préserver l'ordre dans un `Array`

---

## 📥 PHASE 3 : Téléchargement & Rangement

### Sprint 3.1 - Communication Popup ↔ Content
- [ ] **3.1.1** Créer `popup.js`
- [ ] **3.1.2** `chrome.tabs.sendMessage` pour lancer le scan
- [ ] **3.1.3** Écouter la réponse avec les URLs collectées

### Sprint 3.2 - Téléchargement Séquentiel
- [ ] **3.2.1** Sanitization du titre (caractères interdits)
- [ ] **3.2.2** `chrome.downloads.download()` avec chemin formaté
- [ ] **3.2.3** Throttling 200ms entre chaque image
- [ ] **3.2.4** Nommage séquentiel : `001.webp`, `002.webp`, etc.
- [ ] **3.2.5** Gestion erreurs (try/catch + feedback utilisateur)

### Sprint 3.3 - UX Feedback
- [ ] **3.3.1** Mise à jour console en temps réel
- [ ] **3.3.2** Progress bar dynamique
- [ ] **3.3.3** État final : bouton "Terminé" (vert)

---

## 🔒 PHASE 4 : Sécurité & Polish

### Sprint 4.1 - Validations
- [ ] **4.1.1** URL Check : activer uniquement sur `natomanga.com`
- [ ] **4.1.2** Désactiver bouton si pas sur la bonne page
- [ ] **4.1.3** Gestion des onglets fermés pendant le scan

### Sprint 4.2 - Nettoyage Final
- [ ] **4.2.1** Supprimer tous les `console.log` de debug
- [ ] **4.2.2** Minification CSS (optionnel)
- [ ] **4.2.3** Tests manuels complets
- [ ] **4.2.4** Mise à jour JOURNAL.md avec limitations connues

---

## 📝 Légende
- `[ ]` À faire
- `[/]` En cours
- `[x]` Terminé

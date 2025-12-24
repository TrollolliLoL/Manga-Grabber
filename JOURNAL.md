# 📓 JOURNAL.md - MangaGrabber

> **Documentation technique et décisions d'architecture**  
> Mise à jour continue tout au long du développement

---

## 📅 24/12/2024 - Initialisation du Projet

### ✅ Fonctionnalités Implémentées
- [x] Structure projet Manifest V3
- [x] Interface popup HTML/CSS (Sprint 1)
- [x] Content script : turbo scroll + extraction images
- [x] Popup script : injection, téléchargement, feedback UI

### 🏗️ Choix Techniques

#### 1. Architecture Manifest V3
**Pourquoi ?** Chrome déprécie Manifest V2 en 2024. V3 est obligatoire pour les nouvelles extensions.

**Permissions choisies :**
| Permission | Raison |
|------------|--------|
| `activeTab` | Accès à l'onglet courant uniquement (plus sécurisé que `tabs`) |
| `downloads` | API pour télécharger les images localement |
| `scripting` | Injection dynamique du content script |

#### 2. Design System (CSS Custom Properties)
**Pourquoi des variables CSS ?**
- Maintenance simplifiée (changer une couleur = 1 seul endroit)
- Cohérence garantie sur tous les composants
- Prêt pour un futur Light Mode si nécessaire

**Palette retenue (Zinc):**
```css
--bg-primary: #09090b;    /* Fond principal */
--bg-card: #18181b;       /* Cartes/Conteneurs */
--border: #27272a;        /* Bordures subtiles */
--text-primary: #fafafa;  /* Texte principal */
--text-secondary: #a1a1aa;/* Texte secondaire */
--accent-blue: #3b82f6;   /* Actions positives */
--accent-green: #10b981;  /* Succès */
--accent-red: #ef4444;    /* Erreurs */
```

#### 3. Typographie
- **Inter** via Google Fonts (police sans-serif moderne, très lisible)
- **JetBrains Mono** pour la zone console (monospace, look développeur)
- Poids utilisés : 400 (regular), 500 (medium), 600 (semi-bold)

#### 4. Aucun JavaScript Inline
**Contrainte Manifest V3** : La Content Security Policy (CSP) interdit le JS inline.
- Tout le JavaScript sera dans des fichiers `.js` séparés
- Les événements seront attachés via `addEventListener` dans `popup.js`

---

## 🐛 Bugs Connus & Limitations

| ID | Description | Statut | Workaround |
|----|-------------|--------|------------|
| - | Aucun bug pour l'instant | - | - |

---

## 📌 Notes pour les Prochains Sprints

### Phase 2 - Content Script
- Le `turboScroll` utilise des paliers de **1000px** avec un délai de **50ms**
- Ce délai est un compromis : assez rapide pour ne pas ennuyer l'utilisateur, assez lent pour déclencher le lazy loading

### Phase 3 - Téléchargement
- Throttling de **200ms** entre chaque `chrome.downloads.download()`
- Raison : éviter le rate-limiting du serveur d'images natomanga

---

## 📚 Ressources Utiles
- [Chrome Extension Manifest V3 Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Shadcn/ui Design System](https://ui.shadcn.com/)

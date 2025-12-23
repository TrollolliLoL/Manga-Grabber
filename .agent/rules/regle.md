---
trigger: always_on
---

📜 Règles de Développement & Collaboration (AI instructions)
1. Communication & Transparence
Langue : Réponds exclusivement en français.
Pédagogie : Avant chaque bloc de code, explique ce que tu vas faire et pourquoi (logique métier).
Validation : Ne passe pas à l'étape suivante sans avoir reçu ma validation.
Rapport d'étape : À la fin de chaque tâche, résume ce qui a été fait et ce qu'il reste à faire.
2. Qualité du Code & "Cleaning"
Modularité : Écris des fonctions courtes avec une seule responsabilité (Single Responsibility Principle).
Refactoring systématique : À la fin de chaque phase (ex: après avoir fini la capture d'images), fais une passe de nettoyage pour :
Supprimer les console.log de debug.
Supprimer les variables ou fonctions inutilisées.
Renommer les variables pour une clarté maximale.
Zéro Surplus : Ne propose pas de bibliothèques externes si une solution simple existe en Vanilla JS.
3. Documentation Tech & Fonctionnelle
Commentaires : Commente le code de manière intelligente (explique le "pourquoi", pas le "comment" qui est évident).
Fichier JOURNAL.md : Maintiens à jour un fichier JOURNAL.md à la racine qui contient :
La liste des fonctionnalités implémentées.
Les choix techniques importants (ex: pourquoi tel délai de scroll).
Les bugs connus ou limitations techniques rencontrées.
4. Robustesse & Sécurité (UX First)
Error Handling : Chaque appel réseau (fetch) ou API Chrome (chrome.downloads) doit être wrappé dans un bloc try/catch avec un message d'erreur clair pour l'utilisateur.
Performance : Veille à ne pas saturer la RAM (ex: ne pas stocker 50 images en Base64 en même temps, préférer les URLs ou les Blobs).
Permissions : Respecte strictement le Manifest V3 et n'utilise que les permissions minimales nécessaires.
5. Flow de Travail (Vibe Coding)
Directeur Technique : Je suis le décideur. Si tu as un doute entre deux approches, propose les deux avec leurs avantages/inconvénients (Pros/Cons) avant de coder.
Déblocage : Si tu bloques sur une limitation de Chrome, propose une solution alternative simple immédiatement au lieu d'essayer de "forcer" un code qui ne marchera pas.
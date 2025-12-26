/**
 * app.js - MangaGrabber Reader
 * Logique de l'interface utilisateur
 */

// === État de l'application ===
let currentManga = null;
let currentChapter = null;
let chapters = [];
let currentChapterIndex = 0;
let isScrapingInProgress = false;
let chapterQueue = []; // URLs à scraper

// === Éléments DOM ===
const views = {
    library: document.getElementById('library-view'),
    chapters: document.getElementById('chapters-view'),
    reader: document.getElementById('reader-view')
};

const elements = {
    mangaGrid: document.getElementById('mangaGrid'),
    mangaCount: document.getElementById('mangaCount'),
    emptyState: document.getElementById('emptyState'),
    mangaTitle: document.getElementById('mangaTitle'),
    chapterList: document.getElementById('chapterList'),
    readerTitle: document.getElementById('readerTitle'),
    readerContent: document.getElementById('readerContent'),
    prevChapter: document.getElementById('prevChapter'),
    nextChapter: document.getElementById('nextChapter'),
    libraryPath: document.getElementById('libraryPath'),
    changePathBtn: document.getElementById('changePathBtn'),
    // Modal
    downloadModal: document.getElementById('downloadModal'),
    urlInput: document.getElementById('urlInput'),
    modalStatus: document.getElementById('modalStatus'),
    startDownload: document.getElementById('startDownload'),
    cancelDownload: document.getElementById('cancelDownload'),
    // Nouveaux éléments modal
    addUrlBtn: document.getElementById('addUrlBtn'),
    detectChaptersBtn: document.getElementById('detectChaptersBtn'),
    queueList: document.getElementById('queueList'),
    selectAll: document.getElementById('selectAll'),
    startBatchDownload: document.getElementById('startBatchDownload')
};

// === Navigation entre vues ===
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

// === Affichage du chemin ===
async function updatePathDisplay() {
    const path = await window.api.getLibraryPath();
    const shortPath = path.length > 50 ? '...' + path.slice(-47) : path;
    elements.libraryPath.textContent = shortPath;
    elements.libraryPath.title = path;
}

// === Changer le dossier library ===
async function changeLibraryPath() {
    const newPath = await window.api.selectLibraryFolder();
    if (newPath) {
        await updatePathDisplay();
        await loadLibrary();
    }
}

// === Modal de téléchargement ===
function openDownloadModal() {
    elements.downloadModal.classList.add('active');
    elements.urlInput.value = '';
    elements.modalStatus.textContent = '';
    elements.modalStatus.className = 'modal-status';
    elements.startDownload.disabled = false;
    elements.urlInput.focus();
    // Réinitialiser la queue
    chapterQueue = [];
    renderQueue();
    updateBatchButton();
}

function closeDownloadModal() {
    if (!isScrapingInProgress) {
        elements.downloadModal.classList.remove('active');
    }
}

async function startScraping() {
    const url = elements.urlInput.value.trim();

    if (!url) {
        elements.modalStatus.textContent = '❌ Veuillez entrer une URL';
        elements.modalStatus.className = 'modal-status error';
        return;
    }

    if (!url.startsWith('http')) {
        elements.modalStatus.textContent = '❌ URL invalide';
        elements.modalStatus.className = 'modal-status error';
        return;
    }

    isScrapingInProgress = true;
    elements.startDownload.disabled = true;
    elements.cancelDownload.disabled = true;
    elements.urlInput.disabled = true;
    elements.modalStatus.textContent = '🚀 Démarrage du scraping...';
    elements.modalStatus.className = 'modal-status';

    try {
        const result = await window.api.startScraping(url);

        if (result.success) {
            elements.modalStatus.textContent = `✅ Terminé ! ${result.imageCount} images téléchargées.`;
            elements.modalStatus.className = 'modal-status success';

            // Recharger la bibliothèque après succès
            setTimeout(async () => {
                closeDownloadModal();
                await loadLibrary();
            }, 2000);
        } else {
            elements.modalStatus.textContent = `❌ Erreur : ${result.error}`;
            elements.modalStatus.className = 'modal-status error';
        }
    } catch (error) {
        elements.modalStatus.textContent = `❌ Erreur : ${error.message}`;
        elements.modalStatus.className = 'modal-status error';
    } finally {
        isScrapingInProgress = false;
        elements.startDownload.disabled = false;
        elements.cancelDownload.disabled = false;
        elements.urlInput.disabled = false;
    }
}

// Écouter les mises à jour de progrès
window.api.onScrapingProgress((progress) => {
    elements.modalStatus.textContent = progress.message;
});

// === Gestion de la queue de chapitres ===

function getStatusIcon(status) {
    switch (status) {
        case 'downloading': return '🔄';
        case 'done': return '✅';
        case 'error': return '❌';
        default: return '⏳';
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'downloading': return 'status-downloading';
        case 'done': return 'status-done';
        case 'error': return 'status-error';
        default: return 'status-pending';
    }
}

function renderQueue() {
    if (chapterQueue.length === 0) {
        elements.queueList.innerHTML = '<div class="queue-empty">Ajoutez des URLs ou utilisez la détection automatique</div>';
        elements.selectAll.checked = false;
        return;
    }

    elements.queueList.innerHTML = chapterQueue.map((item, index) => `
        <div class="queue-item ${getStatusClass(item.status)}" data-index="${index}">
            <span class="queue-item-status">${getStatusIcon(item.status)}</span>
            <input type="checkbox" ${item.selected ? 'checked' : ''} ${item.status === 'downloading' || item.status === 'done' ? 'disabled' : ''} data-index="${index}">
            <span class="queue-item-num">#${index + 1}</span>
            <span class="queue-item-url" title="${item.url}">${item.url}</span>
            ${item.status !== 'downloading' && item.status !== 'done' ? `<button class="queue-item-remove" data-index="${index}">✕</button>` : ''}
        </div>
    `).join('');

    // Event listeners pour les checkboxes
    elements.queueList.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            chapterQueue[idx].selected = e.target.checked;
            updateBatchButton();
            updateSelectAll();
        });
    });

    // Event listeners pour les boutons de suppression
    elements.queueList.querySelectorAll('.queue-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            removeFromQueue(idx);
        });
    });
}

function addToQueue(url) {
    if (!url || !url.startsWith('http')) return false;
    if (chapterQueue.some(item => item.url === url)) return false; // Éviter les doublons

    chapterQueue.push({ url, selected: true, status: 'pending' });
    renderQueue();
    updateBatchButton();
    return true;
}

function removeFromQueue(index) {
    chapterQueue.splice(index, 1);
    renderQueue();
    updateBatchButton();
}

function updateBatchButton() {
    const selectedCount = chapterQueue.filter(item => item.selected).length;
    elements.startBatchDownload.textContent = `🚀 Scraper la sélection (${selectedCount})`;
    elements.startBatchDownload.disabled = selectedCount === 0 || isScrapingInProgress;
}

function updateSelectAll() {
    const allSelected = chapterQueue.length > 0 && chapterQueue.every(item => item.selected);
    elements.selectAll.checked = allSelected;
}

// Ajouter une URL manuellement
function addUrlManually() {
    const url = elements.urlInput.value.trim();
    if (addToQueue(url)) {
        elements.urlInput.value = '';
        elements.modalStatus.textContent = '✅ URL ajoutée à la liste';
        elements.modalStatus.className = 'modal-status success';
    } else {
        elements.modalStatus.textContent = '❌ URL invalide ou déjà dans la liste';
        elements.modalStatus.className = 'modal-status error';
    }
}

// Détecter les chapitres suivants
async function detectChapters() {
    const url = elements.urlInput.value.trim();

    if (!url || !url.startsWith('http')) {
        elements.modalStatus.textContent = '❌ Veuillez entrer une URL valide';
        elements.modalStatus.className = 'modal-status error';
        return;
    }

    isScrapingInProgress = true;
    elements.detectChaptersBtn.disabled = true;
    elements.addUrlBtn.disabled = true;
    elements.modalStatus.textContent = '🔎 Détection des chapitres...';
    elements.modalStatus.className = 'modal-status';

    try {
        const result = await window.api.detectChapters(url);

        if (result.success && result.urls.length > 0) {
            // Ajouter toutes les URLs détectées
            result.urls.forEach(detectedUrl => addToQueue(detectedUrl));
            elements.modalStatus.textContent = `✅ ${result.urls.length} chapitre(s) détecté(s)`;
            elements.modalStatus.className = 'modal-status success';
            elements.urlInput.value = '';
        } else {
            elements.modalStatus.textContent = '❌ Aucun chapitre suivant détecté';
            elements.modalStatus.className = 'modal-status error';
        }
    } catch (error) {
        elements.modalStatus.textContent = `❌ Erreur : ${error.message}`;
        elements.modalStatus.className = 'modal-status error';
    } finally {
        isScrapingInProgress = false;
        elements.detectChaptersBtn.disabled = false;
        elements.addUrlBtn.disabled = false;
        updateBatchButton();
    }
}

// Écouter le progrès de détection
window.api.onDetectProgress((progress) => {
    elements.modalStatus.textContent = progress.message;
});

// Scraper tous les chapitres sélectionnés
async function startBatchScraping() {
    const selectedUrls = chapterQueue.filter(item => item.selected).map(item => item.url);

    if (selectedUrls.length === 0) {
        elements.modalStatus.textContent = '❌ Aucun chapitre sélectionné';
        elements.modalStatus.className = 'modal-status error';
        return;
    }

    isScrapingInProgress = true;
    elements.startDownload.disabled = true;
    elements.startBatchDownload.disabled = true;
    elements.cancelDownload.disabled = true;
    elements.detectChaptersBtn.disabled = true;
    elements.addUrlBtn.disabled = true;
    elements.urlInput.disabled = true;

    try {
        const result = await window.api.scrapeBatch(selectedUrls);

        if (result.success) {
            elements.modalStatus.textContent = `✅ Terminé ! ${result.successCount}/${result.totalCount} chapitres téléchargés.`;
            elements.modalStatus.className = 'modal-status success';

            // Recharger la bibliothèque après succès
            setTimeout(async () => {
                closeDownloadModal();
                await loadLibrary();
            }, 2000);
        } else {
            elements.modalStatus.textContent = `❌ Erreur lors du téléchargement`;
            elements.modalStatus.className = 'modal-status error';
        }
    } catch (error) {
        elements.modalStatus.textContent = `❌ Erreur : ${error.message}`;
        elements.modalStatus.className = 'modal-status error';
    } finally {
        isScrapingInProgress = false;
        elements.startDownload.disabled = false;
        elements.startBatchDownload.disabled = false;
        elements.cancelDownload.disabled = false;
        elements.detectChaptersBtn.disabled = false;
        elements.addUrlBtn.disabled = false;
        elements.urlInput.disabled = false;
        updateBatchButton();
    }
}

// Écouter le progrès du batch et mettre à jour les statuts
window.api.onBatchProgress((progress) => {
    elements.modalStatus.textContent = progress.message;

    // Mettre à jour le statut du chapitre en cours
    if (progress.url && progress.current) {
        const chapterIndex = chapterQueue.findIndex(item => item.url === progress.url);
        if (chapterIndex !== -1) {
            if (progress.status === 'done') {
                chapterQueue[chapterIndex].status = 'done';
            } else if (progress.status === 'error') {
                chapterQueue[chapterIndex].status = 'error';
            } else {
                chapterQueue[chapterIndex].status = 'downloading';
            }
            renderQueue();
        }
    }

    // Quand tout est terminé
    if (progress.status === 'done' && progress.current === progress.total) {
        // Marquer les chapitres réussis/échoués
        renderQueue();
    }
});

// === Chargement de la bibliothèque ===
async function loadLibrary() {
    await updatePathDisplay();

    const mangas = await window.api.getMangas();

    elements.mangaCount.textContent = `${mangas.length} manga(s)`;

    if (mangas.length === 0) {
        elements.mangaGrid.style.display = 'none';
        elements.emptyState.classList.add('visible');
        return;
    }

    elements.emptyState.classList.remove('visible');
    elements.mangaGrid.style.display = 'grid';
    elements.mangaGrid.innerHTML = '';

    mangas.forEach(manga => {
        const card = document.createElement('div');
        card.className = 'manga-card';
        card.innerHTML = `
            <img class="manga-cover" 
                 src="${manga.thumbnail || ''}" 
                 alt="${manga.name}"
                 onerror="this.style.background='var(--bg-hover)'">
            <div class="manga-info">
                <div class="manga-name" title="${manga.name}">${manga.name}</div>
                <div class="manga-chapters">${manga.chapterCount} chapitre(s)</div>
            </div>
        `;

        card.addEventListener('click', () => openManga(manga.name));
        elements.mangaGrid.appendChild(card);
    });
}

// === Ouvrir un manga ===
async function openManga(mangaName) {
    currentManga = mangaName;
    chapters = await window.api.getChapters(mangaName);

    elements.mangaTitle.textContent = mangaName;
    elements.chapterList.innerHTML = '';

    chapters.forEach((chapter, index) => {
        const item = document.createElement('div');
        item.className = 'chapter-item';
        item.innerHTML = `<span class="chapter-name">${chapter}</span>`;

        item.addEventListener('click', () => openChapter(index));
        elements.chapterList.appendChild(item);
    });

    showView('chapters');
}

// === Ouvrir un chapitre ===
async function openChapter(index) {
    currentChapterIndex = index;
    currentChapter = chapters[index];

    const images = await window.api.getImages(currentManga, currentChapter);

    elements.readerTitle.textContent = `${currentManga} - ${currentChapter}`;
    elements.readerContent.innerHTML = '';

    images.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.loading = 'lazy';
        elements.readerContent.appendChild(img);
    });

    elements.readerContent.scrollTop = 0;
    updateNavButtons();
    showView('reader');
}

// === Navigation chapitres ===
function updateNavButtons() {
    elements.prevChapter.disabled = currentChapterIndex === 0;
    elements.nextChapter.disabled = currentChapterIndex === chapters.length - 1;
}

function goToPrevChapter() {
    if (currentChapterIndex > 0) openChapter(currentChapterIndex - 1);
}

function goToNextChapter() {
    if (currentChapterIndex < chapters.length - 1) openChapter(currentChapterIndex + 1);
}

// === Event Listeners ===
document.getElementById('backToLibrary').addEventListener('click', () => {
    showView('library');
    loadLibrary();
});

document.getElementById('backToChapters').addEventListener('click', () => {
    showView('chapters');
});

elements.prevChapter.addEventListener('click', goToPrevChapter);
elements.nextChapter.addEventListener('click', goToNextChapter);

elements.changePathBtn.addEventListener('click', changeLibraryPath);

// Boutons téléchargement
document.getElementById('downloadBtn').addEventListener('click', openDownloadModal);
document.getElementById('emptyDownloadBtn').addEventListener('click', openDownloadModal);
elements.cancelDownload.addEventListener('click', closeDownloadModal);
elements.startDownload.addEventListener('click', startScraping);

// Boutons multi-chapitres
elements.addUrlBtn.addEventListener('click', addUrlManually);
elements.detectChaptersBtn.addEventListener('click', detectChapters);
elements.startBatchDownload.addEventListener('click', startBatchScraping);
elements.selectAll.addEventListener('change', (e) => {
    chapterQueue.forEach(item => item.selected = e.target.checked);
    renderQueue();
    updateBatchButton();
});

// Fermer modal avec Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.downloadModal.classList.contains('active')) {
        closeDownloadModal();
    }

    if (views.reader.classList.contains('active')) {
        if (e.key === 'ArrowLeft') goToPrevChapter();
        if (e.key === 'ArrowRight') goToNextChapter();
        if (e.key === 'Escape') showView('chapters');
    }
});

// Enter pour valider le téléchargement
elements.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startScraping();
});

// === Initialisation ===
loadLibrary();

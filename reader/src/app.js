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
    cancelDownload: document.getElementById('cancelDownload')
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

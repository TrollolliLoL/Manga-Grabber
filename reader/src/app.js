/**
 * app.js - MangaGrabber Reader
 * Logique de l'interface utilisateur
 */

// === État de l'application ===
let currentManga = null;
let currentChapter = null;
let chapters = [];
let currentChapterIndex = 0;

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
    emptyChangePathBtn: document.getElementById('emptyChangePathBtn')
};

// === Navigation entre vues ===
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

// === Affichage du chemin ===
async function updatePathDisplay() {
    const path = await window.api.getLibraryPath();
    // Afficher seulement la fin du chemin pour ne pas surcharger
    const shortPath = path.length > 50 ? '...' + path.slice(-47) : path;
    elements.libraryPath.textContent = shortPath;
    elements.libraryPath.title = path; // Chemin complet au survol
}

// === Changer le dossier library ===
async function changeLibraryPath() {
    const newPath = await window.api.selectLibraryFolder();
    if (newPath) {
        await updatePathDisplay();
        await loadLibrary();
    }
}

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
elements.emptyChangePathBtn.addEventListener('click', changeLibraryPath);

// Raccourcis clavier
document.addEventListener('keydown', (e) => {
    if (views.reader.classList.contains('active')) {
        if (e.key === 'ArrowLeft') goToPrevChapter();
        if (e.key === 'ArrowRight') goToNextChapter();
        if (e.key === 'Escape') showView('chapters');
    }
});

// === Initialisation ===
loadLibrary();

/**
 * main.js - MangaGrabber Reader
 * Process principal Electron
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scrapeChapter, detectNextChapters } = require('./scraper');

// Chemin par défaut vers la library
const DOWNLOADS_PATH = path.join(os.homedir(), 'Downloads');
const DEFAULT_LIBRARY_PATH = path.join(DOWNLOADS_PATH, 'MangaGrabber', 'library');

// Fichier de config pour sauvegarder le chemin choisi
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let currentLibraryPath = DEFAULT_LIBRARY_PATH;
let mainWindow;

// === Gestion de la config ===
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            if (config.libraryPath && fs.existsSync(config.libraryPath)) {
                currentLibraryPath = config.libraryPath;
            }
        }
    } catch (error) {
        console.error('Erreur chargement config:', error);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ libraryPath: currentLibraryPath }, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde config:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#09090b',
        icon: path.join(__dirname, '..', 'extension', 'asset', 'icon128.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
    mainWindow.setMenuBarVisibility(false);
}

// === IPC Handlers ===

// Récupérer le chemin actuel de la library
ipcMain.handle('get-library-path', async () => {
    return currentLibraryPath;
});

// Changer le dossier library (ouvre un sélecteur de dossier)
ipcMain.handle('select-library-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Sélectionner le dossier Library',
        defaultPath: currentLibraryPath,
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        currentLibraryPath = result.filePaths[0];
        saveConfig();
        return currentLibraryPath;
    }

    return null;
});

// Réinitialiser au chemin par défaut
ipcMain.handle('reset-library-path', async () => {
    currentLibraryPath = DEFAULT_LIBRARY_PATH;
    saveConfig();
    return currentLibraryPath;
});

// Récupérer la liste des mangas
ipcMain.handle('get-mangas', async () => {
    try {
        if (!fs.existsSync(currentLibraryPath)) {
            fs.mkdirSync(currentLibraryPath, { recursive: true });
            return [];
        }

        const mangaFolders = fs.readdirSync(currentLibraryPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const mangaPath = path.join(currentLibraryPath, dirent.name);
                const chapters = getChapters(mangaPath);
                const thumbnail = getThumbnail(mangaPath, chapters);

                return {
                    name: dirent.name,
                    path: mangaPath,
                    chapterCount: chapters.length,
                    thumbnail: thumbnail
                };
            })
            .filter(manga => manga.chapterCount > 0);

        return mangaFolders;
    } catch (error) {
        console.error('Erreur lecture library:', error);
        return [];
    }
});

// Récupérer les chapitres d'un manga
ipcMain.handle('get-chapters', async (event, mangaName) => {
    try {
        const mangaPath = path.join(currentLibraryPath, mangaName);
        return getChapters(mangaPath);
    } catch (error) {
        console.error('Erreur lecture chapitres:', error);
        return [];
    }
});

// Récupérer les images d'un chapitre
ipcMain.handle('get-images', async (event, mangaName, chapterName) => {
    try {
        const chapterPath = path.join(currentLibraryPath, mangaName, chapterName);

        if (!fs.existsSync(chapterPath)) {
            return [];
        }

        const images = fs.readdirSync(chapterPath)
            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                return numA - numB;
            })
            .map(file => `file://${path.join(chapterPath, file)}`);

        return images;
    } catch (error) {
        console.error('Erreur lecture images:', error);
        return [];
    }
});

// Lancer le scraping Puppeteer
ipcMain.handle('start-scraping', async (event, url) => {
    try {
        const result = await scrapeChapter(url, currentLibraryPath, (progress) => {
            // Envoyer le progrès à l'interface
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('scraping-progress', progress);
            }
        });
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Détecter les chapitres suivants à partir d'une URL
ipcMain.handle('detect-chapters', async (event, startUrl) => {
    try {
        const result = await detectNextChapters(startUrl, 50, (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('detect-progress', progress);
            }
        });
        return result;
    } catch (error) {
        return { success: false, error: error.message, urls: [] };
    }
});

// Scraper plusieurs chapitres en batch
ipcMain.handle('scrape-batch', async (event, urls) => {
    const results = [];
    const total = urls.length;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        // Envoyer le progrès global
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('batch-progress', {
                status: 'scraping',
                message: `Scraping ${i + 1}/${total}...`,
                current: i + 1,
                total: total,
                url: url
            });
        }

        try {
            const result = await scrapeChapter(url, currentLibraryPath, (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('batch-progress', {
                        ...progress,
                        current: i + 1,
                        total: total
                    });
                }
            });
            results.push({ url, ...result });
        } catch (error) {
            results.push({ url, success: false, error: error.message });
        }

        // Délai de 2 secondes entre chaque chapitre (anti-ban)
        if (i < urls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    const successCount = results.filter(r => r.success).length;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('batch-progress', {
            status: 'done',
            message: `Terminé ! ${successCount}/${total} chapitres téléchargés.`,
            current: total,
            total: total
        });
    }

    return {
        success: true,
        results: results,
        successCount: successCount,
        totalCount: total
    };
});

// === Fonctions utilitaires ===

function getChapters(mangaPath) {
    if (!fs.existsSync(mangaPath)) return [];

    return fs.readdirSync(mangaPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort((a, b) => {
            const numA = parseFloat(a.match(/\d+(\.\d+)?/)?.[0] || '0');
            const numB = parseFloat(b.match(/\d+(\.\d+)?/)?.[0] || '0');
            return numA - numB;
        });
}

function getThumbnail(mangaPath, chapters) {
    if (chapters.length === 0) return null;

    const firstChapter = chapters[0];
    const chapterPath = path.join(mangaPath, firstChapter);

    try {
        const images = fs.readdirSync(chapterPath)
            .filter(file => /\.(jpg|jpeg|png|webp|gif)$/i.test(file))
            .sort();

        if (images.length > 0) {
            return `file://${path.join(chapterPath, images[0])}`;
        }
    } catch (error) {
        console.error('Erreur thumbnail:', error);
    }

    return null;
}

// === App lifecycle ===

app.whenReady().then(() => {
    loadConfig();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

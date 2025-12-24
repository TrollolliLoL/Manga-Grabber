/**
 * background.js - MangaGrabber Service Worker
 * Gère les téléchargements de manière persistante (même si popup fermée)
 */

// === État global ===
let captureState = {
    isCapturing: false,
    tabId: null,
    urls: [],
    mangaName: '',
    chapterNum: '',
    currentIndex: 0,
    successCount: 0,
    failedImages: [],
    logs: []
};

const CONFIG = {
    downloadDelayMs: 300,
    maxRetries: 3,
    retryDelayMs: 1000,
    baseFolder: 'MangaGrabber/library'  // Chemin vers library/
};

// === Utilitaires ===
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function addLog(tag, message) {
    captureState.logs.push({ tag, message, time: Date.now() });
    // Notifier la popup si elle est ouverte
    chrome.runtime.sendMessage({
        type: 'log',
        tag,
        message
    }).catch(() => { }); // Ignore si popup fermée
}

function getExtension(url) {
    try {
        const pathname = new URL(url).pathname;
        const ext = pathname.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext;
    } catch (e) { }
    return 'webp';
}

function downloadDataUrl(dataUrl, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            conflictAction: 'uniquify'
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(downloadId);
            }
        });
    });
}

/**
 * Télécharge une image avec retry
 */
async function downloadWithRetry(url, filename, imageNum, total) {
    let lastError = '';

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const fetchResult = await chrome.tabs.sendMessage(captureState.tabId, {
                action: 'fetchImage',
                url: url
            });

            if (!fetchResult.success) {
                throw new Error(fetchResult.error || 'Fetch échoué');
            }

            await downloadDataUrl(fetchResult.dataUrl, filename);
            return { success: true };

        } catch (error) {
            lastError = error.message;

            if (attempt < CONFIG.maxRetries) {
                addLog('RETRY', `Image ${imageNum}/${total} - Tentative ${attempt + 1}/${CONFIG.maxRetries}...`);
                await sleep(CONFIG.retryDelayMs);
            }
        }
    }

    return { success: false, error: lastError };
}

/**
 * Lance la capture
 */
async function startCapture(tabId) {
    if (captureState.isCapturing) {
        addLog('ERROR', 'Capture déjà en cours');
        return;
    }

    // Reset state
    captureState = {
        isCapturing: true,
        tabId: tabId,
        urls: [],
        mangaName: '',
        chapterNum: '',
        currentIndex: 0,
        successCount: 0,
        failedImages: [],
        logs: []
    };

    addLog('INFO', 'Démarrage de la capture...');
    notifyPopup();

    try {
        // 1. Injecter le content script
        addLog('INFO', 'Injection du script...');
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });

        // 2. Scanner la page
        addLog('SCAN', 'Scroll et détection des images...');
        notifyPopup();

        const scanResult = await chrome.tabs.sendMessage(tabId, { action: 'scan' });

        if (!scanResult.success) {
            throw new Error(scanResult.error || 'Échec du scan');
        }

        captureState.urls = scanResult.urls;
        captureState.mangaName = scanResult.mangaName;
        captureState.chapterNum = scanResult.chapterNum;

        addLog('OK', `${scanResult.count} images détectées`);
        addLog('INFO', `Manga : ${scanResult.mangaName}`);
        addLog('INFO', `Chapitre : ${scanResult.chapterNum}`);
        notifyPopup();

        if (scanResult.count === 0) {
            throw new Error('Aucune image trouvée');
        }

        // 3. Télécharger les images
        addLog('SCAN', 'Téléchargement en cours...');

        for (let i = 0; i < captureState.urls.length; i++) {
            captureState.currentIndex = i;

            const url = captureState.urls[i];
            const ext = getExtension(url);
            const num = String(i + 1).padStart(3, '0');
            // Nouveau chemin : library/MangaName/ChapterXXX/001.webp
            const filename = `${CONFIG.baseFolder}/${captureState.mangaName}/${captureState.chapterNum}/${num}.${ext}`;

            const result = await downloadWithRetry(url, filename, i + 1, captureState.urls.length);

            if (result.success) {
                captureState.successCount++;
                addLog('OK', `Image ${i + 1}/${captureState.urls.length} ✓`);
            } else {
                addLog('ERROR', `Image ${i + 1} : ${result.error}`);
                captureState.failedImages.push({ index: i, url, filename });
            }

            notifyPopup();

            if (i < captureState.urls.length - 1) {
                await sleep(CONFIG.downloadDelayMs);
            }
        }

        // 4. Terminé
        const failCount = captureState.failedImages.length;
        if (failCount === 0) {
            addLog('OK', `✓ Terminé ! ${captureState.successCount} images.`);
        } else {
            addLog('INFO', `Terminé : ${captureState.successCount}/${captureState.urls.length} images. ${failCount} échec(s).`);
        }

    } catch (error) {
        addLog('ERROR', error.message);
    } finally {
        captureState.isCapturing = false;
        notifyPopup();
    }
}

/**
 * Notifie la popup de l'état actuel
 */
function notifyPopup() {
    chrome.runtime.sendMessage({
        type: 'stateUpdate',
        state: {
            isCapturing: captureState.isCapturing,
            currentIndex: captureState.currentIndex,
            total: captureState.urls.length,
            successCount: captureState.successCount,
            failedCount: captureState.failedImages.length,
            logs: captureState.logs.slice(-20) // Derniers 20 logs
        }
    }).catch(() => { }); // Ignore si popup fermée
}

// === Listener pour messages de la popup ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.type === 'startCapture') {
        startCapture(request.tabId);
        sendResponse({ ok: true });
        return true;
    }

    if (request.type === 'getState') {
        sendResponse({
            isCapturing: captureState.isCapturing,
            currentIndex: captureState.currentIndex,
            total: captureState.urls.length,
            successCount: captureState.successCount,
            failedCount: captureState.failedImages.length,
            logs: captureState.logs.slice(-20)
        });
        return true;
    }

    return false;
});

console.log('[MangaGrabber] Service Worker chargé');

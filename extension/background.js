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
    batchSize: 10,          // Nombre d'images en parallèle
    delayBetweenBatches: 50, // Délai entre chaque batch (ms)
    maxRetries: 3,
    retryDelayMs: 500,
    baseFolder: 'MangaGrabber/library'
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
 * Télécharge une image avec retry (utilise Canvas en priorité)
 * VERSION DEBUG avec timing
 */
async function downloadWithRetry(index, url, filename, imageNum, total) {
    let lastError = '';
    const startTotal = Date.now();

    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            // Timing : envoi message au content script
            const t1 = Date.now();
            const fetchResult = await chrome.tabs.sendMessage(captureState.tabId, {
                action: 'captureImage',
                index: index
            });
            const t2 = Date.now();

            if (!fetchResult.success) {
                throw new Error(fetchResult.error || 'Capture échouée');
            }

            // Timing : téléchargement
            const t3 = Date.now();
            await downloadDataUrl(fetchResult.dataUrl, filename);
            const t4 = Date.now();

            console.log(`[TIMER-BG] Image ${imageNum}: message=${t2 - t1}ms, download=${t4 - t3}ms, total=${t4 - startTotal}ms`);

            return { success: true };

        } catch (error) {
            lastError = error.message;
            console.log(`[ERROR-BG] Image ${imageNum} attempt ${attempt}: ${error.message}`);

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

        // 3. Télécharger les images par batch
        addLog('SCAN', `Téléchargement par batch de ${CONFIG.batchSize}...`);

        const total = captureState.urls.length;

        // Traiter par batch
        for (let batchStart = 0; batchStart < total; batchStart += CONFIG.batchSize) {
            const batchEnd = Math.min(batchStart + CONFIG.batchSize, total);
            const batchPromises = [];

            // Préparer les promesses pour ce batch
            for (let i = batchStart; i < batchEnd; i++) {
                const url = captureState.urls[i];
                const ext = getExtension(url);
                const num = String(i + 1).padStart(3, '0');
                const filename = `${CONFIG.baseFolder}/${captureState.mangaName}/${captureState.chapterNum}/${num}.${ext}`;

                // Ajouter la promesse de téléchargement
                batchPromises.push(
                    downloadWithRetry(i, url, filename, i + 1, total)
                        .then(result => ({ index: i, result, filename }))
                );
            }

            // Exécuter le batch en parallèle
            const batchResults = await Promise.all(batchPromises);

            // Traiter les résultats
            for (const { index, result, filename } of batchResults) {
                captureState.currentIndex = index;

                if (result.success) {
                    captureState.successCount++;
                } else {
                    captureState.failedImages.push({ index, url: captureState.urls[index], filename });
                }
            }

            // Log du batch
            addLog('OK', `Batch ${Math.floor(batchStart / CONFIG.batchSize) + 1}/${Math.ceil(total / CONFIG.batchSize)} ✓ (${batchEnd}/${total})`);
            notifyPopup();

            // Petit délai entre les batches
            if (batchEnd < total) {
                await sleep(CONFIG.delayBetweenBatches);
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

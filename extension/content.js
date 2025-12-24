/**
 * content.js - MangaGrabber
 * Version Canvas Capture - Plus rapide, pas de fetch réseau
 */

const SCROLL_CONFIG = {
    stepPx: 500,
    intervalMs: 100,
    waitAfterMs: 2000
};

/**
 * Scroll jusqu'en bas de la page
 */
function turboScroll() {
    return new Promise((resolve) => {
        let scrollCount = 0;

        const scrollInterval = setInterval(() => {
            window.scrollBy(0, SCROLL_CONFIG.stepPx);
            scrollCount++;

            const isAtBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 10;

            if (isAtBottom) {
                clearInterval(scrollInterval);
                console.log(`[MangaGrabber] Scroll terminé après ${scrollCount} paliers`);
                window.scrollTo(0, 0);
                setTimeout(resolve, SCROLL_CONFIG.waitAfterMs);
            }
        }, SCROLL_CONFIG.intervalMs);
    });
}

/**
 * Trouve toutes les images manga sur la page
 */
function findMangaImages() {
    const selectors = [
        'div.container-chapter-reader img',
        '.reading-content img',
        '.chapter-content img',
        '.page-break img',
        '.wp-manga-chapter-img',
        '#content img',
        '.reader-area img',
        'img.wp-manga-chapter-img',
        'img[loading="lazy"]'
    ];

    let images = [];

    for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > images.length) {
            images = Array.from(found);
        }
    }

    // Fallback : grandes images
    if (images.length < 3) {
        images = Array.from(document.querySelectorAll('img')).filter(img => {
            return img.naturalWidth > 100 && img.naturalHeight > 100;
        });
    }

    // Filtrer les images de navigation/pub
    return images.filter(img => {
        if (!img.complete || img.naturalWidth === 0) return false;

        const src = img.src || '';
        const isNav = src.includes('logo') ||
            src.includes('icon') ||
            src.includes('avatar') ||
            src.includes('button') ||
            src.includes('banner') ||
            src.includes('/ad') ||
            src.includes('advertisement');

        return !isNav;
    });
}

/**
 * Capture une image via Canvas et retourne un Data URL
 * VERSION DEBUG avec timing
 */
function captureImageViaCanvas(img, index = 0) {
    return new Promise((resolve) => {
        const startTime = performance.now();

        try {
            // Étape 1 : Créer le canvas
            const t1 = performance.now();
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            // Étape 2 : Dessiner l'image
            const t2 = performance.now();
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Étape 3 : Convertir en Data URL
            const t3 = performance.now();
            const dataUrl = canvas.toDataURL('image/webp', 0.92);
            const t4 = performance.now();

            // Log timing détaillé
            console.log(`[TIMER] Image ${index + 1} (${img.naturalWidth}×${img.naturalHeight}): ` +
                `canvas=${(t2 - t1).toFixed(0)}ms, draw=${(t3 - t2).toFixed(0)}ms, ` +
                `toDataURL=${(t4 - t3).toFixed(0)}ms, TOTAL=${(t4 - startTime).toFixed(0)}ms`);

            resolve({ success: true, dataUrl });
        } catch (error) {
            console.error(`[ERROR] Canvas Image ${index + 1}: ${error.message}`);
            resolve({ success: false, error: 'CORS: ' + error.message, needsFetch: true });
        }
    });
}

/**
 * Fetch une image (fallback si canvas échoue)
 */
async function fetchImageAsDataUrl(url) {
    try {
        const response = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'image/webp,image/*,*/*;q=0.8' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({ success: true, dataUrl: reader.result });
            reader.onerror = () => resolve({ success: false, error: 'Erreur lecture' });
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Parse le titre de la page
 */
function parseTitle() {
    let title = document.title || 'Unknown Manga';
    const forbidden = /[<>:"/\\|?*]/g;
    title = title.replace(forbidden, '').trim();

    const chapterPatterns = [
        /(.+?)\s*[-–—]\s*[Cc]hapter\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[Cc]hapter\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[Cc]h\.?\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[-–—]\s*[Ee]pisode\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*#(\d+(?:\.\d+)?)/,
        /(.+?)\s*(\d+(?:\.\d+)?)\s*$/
    ];

    for (const pattern of chapterPatterns) {
        const match = title.match(pattern);
        if (match) {
            let mangaName = match[1].trim()
                .replace(/\s*[-–—]\s*$/, '')
                .replace(/\s+Read\s+Online.*$/i, '')
                .replace(/\s+Manga.*$/i, '')
                .trim();

            const numFloat = parseFloat(match[2]);
            const formatted = Number.isInteger(numFloat)
                ? String(Math.floor(numFloat)).padStart(3, '0')
                : numFloat.toFixed(1).padStart(5, '0');

            return {
                mangaName: mangaName || 'Unknown Manga',
                chapterNum: `Chapter ${formatted}`
            };
        }
    }

    return {
        mangaName: title.substring(0, 50) || 'Unknown Manga',
        chapterNum: 'Chapter 001'
    };
}

// === LISTENER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === 'scan') {
        (async () => {
            try {
                console.log('[MangaGrabber] === SCAN START ===');
                await turboScroll();

                const images = findMangaImages();
                const { mangaName, chapterNum } = parseTitle();

                console.log(`[MangaGrabber] ${images.length} images trouvées`);
                console.log(`[MangaGrabber] Manga: ${mangaName}, Chapter: ${chapterNum}`);

                // Retourner les URLs pour compatibilité, mais on va utiliser canvas
                const urls = images.map(img => img.src).filter(Boolean);

                sendResponse({
                    success: true,
                    urls: urls,
                    mangaName: mangaName,
                    chapterNum: chapterNum,
                    count: images.length,
                    useCanvas: true  // Flag pour indiquer qu'on peut utiliser canvas
                });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Nouvelle action : capturer une image via Canvas
    if (request.action === 'captureImage') {
        (async () => {
            const images = findMangaImages();
            const img = images[request.index];

            if (!img) {
                sendResponse({ success: false, error: 'Image non trouvée' });
                return;
            }

            // Essayer Canvas d'abord
            let result = await captureImageViaCanvas(img, request.index);

            // Si Canvas échoue (CORS), fallback sur fetch
            if (!result.success && result.needsFetch) {
                console.log(`[MangaGrabber] Canvas échoué, fallback fetch pour image ${request.index}`);
                result = await fetchImageAsDataUrl(img.src);
            }

            sendResponse(result);
        })();
        return true;
    }

    // Garder l'ancien fetchImage pour compatibilité
    if (request.action === 'fetchImage') {
        (async () => {
            const result = await fetchImageAsDataUrl(request.url);
            sendResponse(result);
        })();
        return true;
    }
});

console.log('[MangaGrabber] Content script chargé (Canvas mode)');

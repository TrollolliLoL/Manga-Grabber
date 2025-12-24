/**
 * content.js - MangaGrabber
 * Moteur de capture : Turbo Scroll + Extraction + Fetch images
 * VERSION DEBUG - Plus de logs pour identifier le problème
 */

const SCROLL_CONFIG = {
    stepPx: 500,       // Paliers plus petits
    intervalMs: 100,   // Plus lent pour laisser charger
    waitAfterMs: 2000  // Attente plus longue à la fin
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
                // Remonter en haut pour vérifier
                window.scrollTo(0, 0);
                setTimeout(resolve, SCROLL_CONFIG.waitAfterMs);
            }
        }, SCROLL_CONFIG.intervalMs);
    });
}

/**
 * Extrait TOUTES les images de la page avec debug
 */
function extractImageUrls() {
    // Log toutes les images trouvées
    const allImages = document.querySelectorAll('img');
    console.log(`[MangaGrabber] Total images sur la page: ${allImages.length}`);

    // Afficher les 5 premières pour debug
    Array.from(allImages).slice(0, 10).forEach((img, i) => {
        console.log(`[MangaGrabber] Image ${i}: ${img.src?.substring(0, 80)}... (${img.naturalWidth}x${img.naturalHeight})`);
    });

    // Sélecteurs spécifiques aux sites manga courants
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
    let usedSelector = '';

    // Essayer chaque sélecteur
    for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        console.log(`[MangaGrabber] Sélecteur "${selector}": ${found.length} images`);
        if (found.length > images.length) {
            images = Array.from(found);
            usedSelector = selector;
        }
    }

    // Si aucun sélecteur spécifique ne marche, prendre toutes les grandes images
    if (images.length < 3) {
        console.log('[MangaGrabber] Fallback: filtrage par taille');
        images = Array.from(allImages).filter(img => {
            // Accepter les images plus petites aussi
            return img.naturalWidth > 100 && img.naturalHeight > 100;
        });
    }

    console.log(`[MangaGrabber] Sélecteur utilisé: "${usedSelector}" - ${images.length} images`);

    // Extraire les URLs
    const urls = [];
    const seen = new Set();

    for (const img of images) {
        // Récupérer l'URL (plusieurs attributs possibles)
        let url = img.src ||
            img.dataset.src ||
            img.dataset.lazySrc ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-cfsrc');

        if (!url || seen.has(url)) continue;

        // Filtrer les images de navigation/UI/pubs
        const isNavImage = url.includes('logo') ||
            url.includes('icon') ||
            url.includes('avatar') ||
            url.includes('button') ||
            url.includes('banner') ||
            url.includes('/ad') ||
            url.includes('advertisement') ||
            url.includes('loading') ||
            url.includes('placeholder');

        if (isNavImage) {
            console.log(`[MangaGrabber] Ignoré (nav/ad): ${url.substring(0, 50)}`);
            continue;
        }

        seen.add(url);
        urls.push(url);
    }

    console.log(`[MangaGrabber] URLs finales: ${urls.length}`);
    urls.forEach((u, i) => console.log(`  ${i + 1}. ${u.substring(0, 80)}`));

    return urls;
}

/**
 * Parse le titre de la page pour extraire le nom du manga et le numéro de chapitre
 * @returns {{mangaName: string, chapterNum: string}}
 */
function parseTitle() {
    let title = document.title || 'Unknown Manga';

    // Nettoyer les caractères interdits
    const forbidden = /[<>:"/\\|?*]/g;
    title = title.replace(forbidden, '').trim();

    // Patterns courants pour détecter le chapitre
    // "Manga Name Chapter 123" ou "Manga Name Ch. 123" ou "Manga Name - Chapter 123"
    const chapterPatterns = [
        /(.+?)\s*[-–—]\s*[Cc]hapter\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[Cc]hapter\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[Cc]h\.?\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[-–—]\s*[Ee]pisode\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*#(\d+(?:\.\d+)?)/,
        /(.+?)\s*(\d+(?:\.\d+)?)\s*$/  // Numéro à la fin
    ];

    for (const pattern of chapterPatterns) {
        const match = title.match(pattern);
        if (match) {
            let mangaName = match[1].trim();
            let chapterNum = match[2];

            // Nettoyer le nom du manga (enlever suffixes courants)
            mangaName = mangaName
                .replace(/\s*[-–—]\s*$/, '')
                .replace(/\s+Read\s+Online.*$/i, '')
                .replace(/\s+Manga.*$/i, '')
                .trim();

            // Formater le numéro de chapitre avec padding
            const numFloat = parseFloat(chapterNum);
            const formatted = Number.isInteger(numFloat)
                ? String(Math.floor(numFloat)).padStart(3, '0')
                : numFloat.toFixed(1).padStart(5, '0');

            return {
                mangaName: mangaName || 'Unknown Manga',
                chapterNum: `Chapter ${formatted}`
            };
        }
    }

    // Fallback : utiliser le titre complet
    return {
        mangaName: title.substring(0, 50) || 'Unknown Manga',
        chapterNum: 'Chapter 001'
    };
}

/**
 * Fetch une image et la convertit en Data URL
 */
async function fetchImageAsDataUrl(url) {
    try {
        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        console.log(`[MangaGrabber] Blob: ${blob.size} bytes, type: ${blob.type}`);

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve({ success: true, dataUrl: reader.result });
            };
            reader.onerror = () => {
                resolve({ success: false, error: 'Erreur lecture blob' });
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`[MangaGrabber] Fetch error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// === LISTENER ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === 'scan') {
        (async () => {
            try {
                console.log('[MangaGrabber] === SCAN START ===');
                await turboScroll();
                const urls = extractImageUrls();
                const { mangaName, chapterNum } = parseTitle();
                console.log(`[MangaGrabber] Manga: ${mangaName}, Chapter: ${chapterNum}`);
                console.log('[MangaGrabber] === SCAN END ===');

                sendResponse({
                    success: true,
                    urls: urls,
                    mangaName: mangaName,
                    chapterNum: chapterNum,
                    count: urls.length
                });
            } catch (error) {
                console.error('[MangaGrabber] Scan error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (request.action === 'fetchImage') {
        (async () => {
            console.log(`[MangaGrabber] Fetching: ${request.url.substring(0, 50)}...`);
            const result = await fetchImageAsDataUrl(request.url);
            sendResponse(result);
        })();
        return true;
    }
});

console.log('[MangaGrabber] Content script chargé');

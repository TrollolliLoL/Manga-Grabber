/**
 * scraper.js - Module de scraping Puppeteer
 * Version améliorée : filtre par DOM + ordre correct
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Sélecteurs CSS pour trouver les images du reader (ordre de priorité)
const READER_SELECTORS = [
    '.container-chapter-reader img',
    '.reading-content img',
    '.chapter-content img',
    '.page-break img',
    '.wp-manga-chapter-img',
    '.reader-area img',
    '#content img',
    'img.wp-manga-chapter-img'
];

// Sélecteurs CSS pour le bouton "chapitre suivant"
const NEXT_CHAPTER_SELECTORS = [
    // Sélecteurs spécifiques aux sites populaires
    'a.next_page',
    'a.navi-change-chapter-btn-next',
    'a.next-chap',
    'a.btn-next',
    'a.next',
    'a.ch-next-btn',
    'a.next-chapter',
    'a.nextch',
    // Sélecteurs par classe parent
    '.nav-next a',
    '.next-chap a',
    '.chapter-nav-next a',
    '.nav-buttons .next a',
    '.chapter-navigation .next a',
    // Sélecteurs par attribut
    'a[rel="next"]',
    'a[title*="Next"]',
    'a[title*="Suivant"]',
    // Sélecteurs génériques
    '.rd_sd-button_item:last-child a',
    '.btn-chapter-nav:last-child',
    '.chapter-btn:last-child a'
];

/**
 * Scrape un chapitre manga depuis une URL
 */
async function scrapeChapter(url, libraryPath, onProgress = () => { }) {
    let browser = null;
    const capturedImages = new Map(); // URL -> buffer

    try {
        onProgress({ status: 'launching', message: 'Lancement du navigateur...' });

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // Intercepter les réponses réseau pour capturer les images
        page.on('response', async (response) => {
            const responseUrl = response.url();
            const contentType = response.headers()['content-type'] || '';

            if (contentType.includes('image/')) {
                try {
                    const buffer = await response.buffer();
                    if (buffer.length > 5000) { // > 5KB
                        capturedImages.set(responseUrl, {
                            buffer: buffer,
                            contentType: contentType
                        });
                    }
                } catch (e) {
                    // Ignorer les erreurs de buffer
                }
            }
        });

        onProgress({ status: 'loading', message: 'Chargement de la page...' });

        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Récupérer le titre
        const pageTitle = await page.title();
        const { mangaName, chapterNum } = parseTitle(pageTitle);

        onProgress({ status: 'scrolling', message: 'Scroll de la page...' });

        await autoScroll(page);

        // Attendre que les dernières images se chargent
        await new Promise(resolve => setTimeout(resolve, 3000));

        onProgress({ status: 'analyzing', message: 'Analyse du reader...' });

        // Récupérer les URLs des images du reader dans l'ordre du DOM
        const orderedUrls = await page.evaluate((selectors) => {
            for (const selector of selectors) {
                const imgs = document.querySelectorAll(selector);
                if (imgs.length >= 3) {
                    return Array.from(imgs)
                        .map(img => img.src || img.dataset.src || img.dataset.lazySrc)
                        .filter(src => src && src.startsWith('http'));
                }
            }

            // Fallback : grandes images
            return Array.from(document.querySelectorAll('img'))
                .filter(img => img.naturalWidth > 300 && img.naturalHeight > 300)
                .filter(img => {
                    const src = img.src || '';
                    return !src.includes('logo') && !src.includes('icon') &&
                        !src.includes('avatar') && !src.includes('banner') &&
                        !src.includes('/ad');
                })
                .map(img => img.src)
                .filter(Boolean);
        }, READER_SELECTORS);

        onProgress({ status: 'saving', message: `${orderedUrls.length} images du manga trouvées...` });

        // Créer le dossier
        const chapterPath = path.join(libraryPath, mangaName, chapterNum);
        fs.mkdirSync(chapterPath, { recursive: true });

        // Sauvegarder dans l'ordre du DOM
        let savedCount = 0;
        for (let i = 0; i < orderedUrls.length; i++) {
            const imgUrl = orderedUrls[i];
            const imgData = capturedImages.get(imgUrl);

            if (imgData) {
                const ext = getExtensionFromContentType(imgData.contentType);
                const filename = String(i + 1).padStart(3, '0') + '.' + ext;
                const filepath = path.join(chapterPath, filename);

                fs.writeFileSync(filepath, imgData.buffer);
                savedCount++;

                onProgress({
                    status: 'saving',
                    message: `Sauvegarde ${savedCount}/${orderedUrls.length}...`,
                    current: savedCount,
                    total: orderedUrls.length
                });
            }
        }

        await browser.close();

        return {
            success: true,
            imageCount: savedCount,
            mangaName: mangaName,
            chapterNum: chapterNum,
            path: chapterPath
        };

    } catch (error) {
        if (browser) await browser.close();
        throw error;
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 500;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    window.scrollTo(0, 0);
                    resolve();
                }
            }, 100);
        });
    });
}

function parseTitle(title) {
    const forbidden = /[<>:"/\\|?*]/g;
    title = (title || 'Unknown Manga').replace(forbidden, '').trim();

    const patterns = [
        /(.+?)\s*[-–—]\s*[Cc]hapter\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[Cc]hapter\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*[Cc]h\.?\s*(\d+(?:\.\d+)?)/i,
        /(.+?)\s*(\d+(?:\.\d+)?)\s*$/
    ];

    for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
            let mangaName = match[1].trim()
                .replace(/\s*[-–—]\s*$/, '')
                .replace(/\s+Read\s+Online.*$/i, '')
                .trim();

            const numFloat = parseFloat(match[2]);
            const formatted = Number.isInteger(numFloat)
                ? String(Math.floor(numFloat)).padStart(3, '0')
                : numFloat.toFixed(1);

            return {
                mangaName: mangaName || 'Unknown Manga',
                chapterNum: `Chapter ${formatted}`
            };
        }
    }

    return { mangaName: title.substring(0, 50), chapterNum: 'Chapter 001' };
}

function getExtensionFromContentType(contentType) {
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    return 'jpg';
}

/**
 * Détecte les chapitres à partir d'une URL de départ
 * Méthode 1: Extrait tous les chapitres depuis un <select> (rapide)
 * Méthode 2: Navigue via le bouton "next chapter" (fallback)
 */
async function detectNextChapters(startUrl, maxChapters = 50, onProgress = () => { }) {
    let browser = null;

    try {
        onProgress({ status: 'launching', message: 'Lancement du navigateur...' });

        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        onProgress({ status: 'detecting', message: 'Chargement de la page...' });

        await page.goto(startUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 1500));

        // === MÉTHODE 1: Extraire depuis un <select> (sites comme MangaNato) ===
        onProgress({ status: 'detecting', message: 'Recherche de la liste des chapitres...' });

        const selectResult = await page.evaluate((currentUrl) => {
            // Chercher un select avec les chapitres
            const selectors = [
                'select.navi-change-chapter',
                'select.chapter-select',
                'select#chapter-select',
                'select[name="chapter"]',
                '.chapter-selection select'
            ];

            for (const selector of selectors) {
                const select = document.querySelector(selector);
                if (select && select.options.length > 1) {
                    const urls = [];
                    let currentIndex = -1;

                    for (let i = 0; i < select.options.length; i++) {
                        const option = select.options[i];
                        // L'URL peut être dans data-c, value, ou data-url
                        const url = option.getAttribute('data-c') ||
                            option.value ||
                            option.getAttribute('data-url');

                        if (url && url.startsWith('http')) {
                            urls.push(url);
                            // Trouver l'index du chapitre actuel
                            if (url === currentUrl || currentUrl.includes(url) || url.includes(currentUrl.split('/').pop())) {
                                currentIndex = urls.length - 1;
                            }
                        }
                    }

                    if (urls.length > 0) {
                        console.log('[MangaGrabber] Found chapter select with', urls.length, 'chapters');
                        console.log('[MangaGrabber] Current chapter index:', currentIndex);
                        return {
                            success: true,
                            urls: urls,
                            currentIndex: currentIndex,
                            method: 'select'
                        };
                    }
                }
            }

            return { success: false };
        }, startUrl);

        if (selectResult.success) {
            await browser.close();

            let chaptersToReturn = selectResult.urls;

            // Si on a trouvé l'index actuel, on retourne seulement les chapitres suivants
            // Note: Les chapitres sont souvent triés du plus récent au plus ancien dans le select
            // Donc les "suivants" sont ceux AVANT dans la liste (index inférieur)
            if (selectResult.currentIndex !== -1) {
                // On garde le chapitre actuel + tous les suivants
                // Comme le select est souvent inversé, on prend tout ce qui est après l'index actuel
                chaptersToReturn = selectResult.urls.slice(selectResult.currentIndex);
            }

            // Limiter au max
            chaptersToReturn = chaptersToReturn.slice(0, maxChapters);

            onProgress({
                status: 'done',
                message: `${chaptersToReturn.length} chapitre(s) trouvé(s) (via liste)`,
                count: chaptersToReturn.length
            });

            return {
                success: true,
                urls: chaptersToReturn,
                count: chaptersToReturn.length,
                method: 'select'
            };
        }

        // === MÉTHODE 2: Navigation via "Next Chapter" (fallback) ===
        onProgress({ status: 'detecting', message: 'Navigation page par page...' });

        const detectedUrls = [startUrl];
        let currentUrl = startUrl;
        let chaptersFound = 1;

        while (chaptersFound < maxChapters) {
            onProgress({
                status: 'detecting',
                message: `Navigation... ${chaptersFound} chapitre(s) trouvé(s)`,
                count: chaptersFound
            });

            if (currentUrl !== startUrl) {
                await page.goto(currentUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Chercher le bouton "NEXT chapter" (pas PREV!)
            const nextUrl = await page.evaluate((selectors) => {
                // Sélecteurs spécifiques pour NEXT (pas prev)
                const nextSpecificSelectors = [
                    'a.navi-change-chapter-btn-next',
                    'a.next_page',
                    'a.btn-next',
                    'a.next-chap',
                    'a.next-chapter',
                    '.chapter-nav a:last-child',
                    'a[href*="chapter"]:has-text("next")'
                ];

                // D'abord les sélecteurs spécifiques
                for (const selector of nextSpecificSelectors) {
                    try {
                        const link = document.querySelector(selector);
                        if (link && link.href && link.href.startsWith('http') && link.href !== window.location.href) {
                            const text = (link.textContent || '').toLowerCase();
                            // Vérifier que ce n'est pas un bouton "prev"
                            if (!text.includes('prev') && !text.includes('précédent') && !text.includes('previous')) {
                                console.log('[MangaGrabber] Found NEXT via selector:', selector);
                                return link.href;
                            }
                        }
                    } catch (e) { }
                }

                // Chercher par texte "NEXT" explicitement
                const allLinks = document.querySelectorAll('a');
                for (const link of allLinks) {
                    const text = (link.textContent || '').trim().toLowerCase();
                    if ((text === 'next' || text === 'next chapter' || text.includes('next chap')) &&
                        !text.includes('prev')) {
                        if (link.href && link.href.startsWith('http') && link.href !== window.location.href) {
                            console.log('[MangaGrabber] Found NEXT via text:', text);
                            return link.href;
                        }
                    }
                }

                // Sélecteurs génériques (en vérifiant le texte)
                for (const selector of selectors) {
                    try {
                        const links = document.querySelectorAll(selector);
                        for (const link of links) {
                            if (link && link.href && link.href.startsWith('http') && link.href !== window.location.href) {
                                const text = (link.textContent || '').toLowerCase();
                                if (!text.includes('prev') && !text.includes('précédent')) {
                                    return link.href;
                                }
                            }
                        }
                    } catch (e) { }
                }

                return null;
            }, NEXT_CHAPTER_SELECTORS);

            if (!nextUrl || detectedUrls.includes(nextUrl)) {
                break;
            }

            detectedUrls.push(nextUrl);
            currentUrl = nextUrl;
            chaptersFound++;

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await browser.close();

        onProgress({
            status: 'done',
            message: `${detectedUrls.length} chapitre(s) détecté(s)`,
            count: detectedUrls.length
        });

        return {
            success: true,
            urls: detectedUrls,
            count: detectedUrls.length,
            method: 'navigation'
        };

    } catch (error) {
        if (browser) await browser.close();
        throw error;
    }
}

module.exports = { scrapeChapter, detectNextChapters };

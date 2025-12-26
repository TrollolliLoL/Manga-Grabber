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
    'a.next_page',
    'a.navi-change-chapter-btn-next',
    'a.next-chap',
    'a.btn-next',
    '.nav-next a',
    '.next-chap a',
    'a[rel="next"]',
    '.rd_sd-button_item:last-child a'
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
 * Détecte les chapitres suivants à partir d'une URL de départ
 * Navigue via le bouton "next chapter" jusqu'à la fin ou la limite
 */
async function detectNextChapters(startUrl, maxChapters = 50, onProgress = () => { }) {
    let browser = null;
    const detectedUrls = [startUrl];

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

        let currentUrl = startUrl;
        let chaptersFound = 1;

        while (chaptersFound < maxChapters) {
            onProgress({
                status: 'detecting',
                message: `Détection en cours... ${chaptersFound} chapitre(s) trouvé(s)`,
                count: chaptersFound
            });

            await page.goto(currentUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // Attendre un peu que la page se charge
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Chercher le bouton "next chapter"
            const nextUrl = await page.evaluate((selectors) => {
                for (const selector of selectors) {
                    const link = document.querySelector(selector);
                    if (link && link.href) {
                        // Vérifier que ce n'est pas un lien vers la même page ou un lien invalide
                        const href = link.href;
                        if (href.startsWith('http') && href !== window.location.href) {
                            return href;
                        }
                    }
                }
                return null;
            }, NEXT_CHAPTER_SELECTORS);

            if (!nextUrl || detectedUrls.includes(nextUrl)) {
                // Pas de chapitre suivant ou déjà détecté (boucle)
                break;
            }

            detectedUrls.push(nextUrl);
            currentUrl = nextUrl;
            chaptersFound++;

            // Petit délai pour ne pas surcharger le serveur
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
            count: detectedUrls.length
        };

    } catch (error) {
        if (browser) await browser.close();
        throw error;
    }
}

module.exports = { scrapeChapter, detectNextChapters };


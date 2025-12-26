/**
 * scraper.js - Module de scraping Puppeteer
 * Intercepte les images au niveau réseau pour contourner CORS
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

/**
 * Scrape un chapitre manga depuis une URL
 * @param {string} url - URL de la page du chapitre
 * @param {string} libraryPath - Chemin vers la library
 * @param {function} onProgress - Callback pour le progrès
 * @returns {Promise<{success: boolean, imageCount: number, mangaName: string, chapterNum: string}>}
 */
async function scrapeChapter(url, libraryPath, onProgress = () => { }) {
    let browser = null;
    const capturedImages = new Map(); // URL -> {buffer, index}
    let imageIndex = 0;

    try {
        onProgress({ status: 'launching', message: 'Lancement du navigateur...' });

        // Lancer le navigateur en mode headless
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        const page = await browser.newPage();

        // User-Agent réaliste
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Viewport large pour charger toutes les images
        await page.setViewport({ width: 1920, height: 1080 });

        // Intercepter les réponses réseau pour capturer les images
        page.on('response', async (response) => {
            const url = response.url();
            const contentType = response.headers()['content-type'] || '';

            // Filtrer les images (pas les icônes, logos, etc.)
            if (contentType.includes('image/') && !url.includes('logo') && !url.includes('icon') && !url.includes('avatar')) {
                try {
                    const buffer = await response.buffer();

                    // Ignorer les petites images (icônes, etc.)
                    if (buffer.length > 10000) { // > 10KB
                        capturedImages.set(url, {
                            buffer: buffer,
                            index: imageIndex++,
                            contentType: contentType
                        });
                        onProgress({
                            status: 'capturing',
                            message: `Image ${imageIndex} capturée...`,
                            count: imageIndex
                        });
                    }
                } catch (e) {
                    // Ignorer les erreurs de buffer (certaines images peuvent être en streaming)
                }
            }
        });

        onProgress({ status: 'loading', message: 'Chargement de la page...' });

        // Aller sur la page
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Récupérer le titre pour le nom du manga/chapitre
        const pageTitle = await page.title();
        const { mangaName, chapterNum } = parseTitle(pageTitle);

        onProgress({ status: 'scrolling', message: 'Scroll de la page...' });

        // Scroll lent pour déclencher le lazy loading
        await autoScroll(page, onProgress);

        // Attendre un peu que les dernières images se chargent
        await new Promise(resolve => setTimeout(resolve, 3000));

        onProgress({ status: 'saving', message: `Sauvegarde de ${capturedImages.size} images...` });

        // Créer le dossier de destination
        const chapterPath = path.join(libraryPath, mangaName, chapterNum);
        fs.mkdirSync(chapterPath, { recursive: true });

        // Sauvegarder les images dans l'ordre
        const sortedImages = Array.from(capturedImages.entries())
            .sort((a, b) => a[1].index - b[1].index);

        for (let i = 0; i < sortedImages.length; i++) {
            const [imgUrl, imgData] = sortedImages[i];
            const ext = getExtensionFromContentType(imgData.contentType);
            const filename = String(i + 1).padStart(3, '0') + '.' + ext;
            const filepath = path.join(chapterPath, filename);

            fs.writeFileSync(filepath, imgData.buffer);

            onProgress({
                status: 'saving',
                message: `Sauvegarde ${i + 1}/${sortedImages.length}...`,
                current: i + 1,
                total: sortedImages.length
            });
        }

        await browser.close();

        return {
            success: true,
            imageCount: sortedImages.length,
            mangaName: mangaName,
            chapterNum: chapterNum,
            path: chapterPath
        };

    } catch (error) {
        if (browser) await browser.close();
        throw error;
    }
}

/**
 * Scroll automatique de la page
 */
async function autoScroll(page, onProgress) {
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
                    // Remonter en haut
                    window.scrollTo(0, 0);
                    resolve();
                }
            }, 100);
        });
    });
}

/**
 * Parse le titre de la page pour extraire manga/chapitre
 */
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

/**
 * Obtenir l'extension depuis le content-type
 */
function getExtensionFromContentType(contentType) {
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    return 'jpg';
}

module.exports = { scrapeChapter };

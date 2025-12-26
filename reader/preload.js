/**
 * preload.js - Bridge sécurisé entre main et renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Library path
    getLibraryPath: () => ipcRenderer.invoke('get-library-path'),
    selectLibraryFolder: () => ipcRenderer.invoke('select-library-folder'),
    resetLibraryPath: () => ipcRenderer.invoke('reset-library-path'),

    // Mangas
    getMangas: () => ipcRenderer.invoke('get-mangas'),
    getChapters: (mangaName) => ipcRenderer.invoke('get-chapters', mangaName),
    getImages: (mangaName, chapterName) => ipcRenderer.invoke('get-images', mangaName, chapterName),

    // Scraping Puppeteer
    startScraping: (url) => ipcRenderer.invoke('start-scraping', url),
    onScrapingProgress: (callback) => ipcRenderer.on('scraping-progress', (event, data) => callback(data))
});

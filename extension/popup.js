/**
 * popup.js - MangaGrabber
 * Interface utilisateur - Communique avec le Service Worker
 */

// === Éléments DOM ===
const elements = {
    startBtn: null,
    console: null,
    progressFill: null,
    statusLed: null,
    statusText: null
};

function initElements() {
    elements.startBtn = document.getElementById('startBtn');
    elements.console = document.getElementById('console');
    elements.progressFill = document.getElementById('progressFill');
    elements.statusLed = document.getElementById('statusLed');
    elements.statusText = elements.statusLed?.querySelector('.status-text');
}

function log(tag, message) {
    const line = document.createElement('div');
    line.className = 'console-line';

    const tagClass = {
        'INFO': '',
        'SCAN': 'console-tag-scan',
        'OK': 'console-tag-ok',
        'ERROR': 'console-tag-error',
        'RETRY': 'console-tag-scan'
    }[tag] || '';

    line.innerHTML = `
    <span class="console-tag ${tagClass}">[${tag}]</span>
    <span class="console-msg">${message}</span>
  `;

    elements.console.appendChild(line);
    elements.console.scrollTop = elements.console.scrollHeight;
}

function clearLogs() {
    if (elements.console) {
        elements.console.innerHTML = '';
    }
}

function updateProgress(current, total) {
    if (elements.progressFill && total > 0) {
        const percent = (current / total) * 100;
        elements.progressFill.style.width = `${percent}%`;
    }
}

function setState(state) {
    const led = elements.statusLed?.querySelector('.led');
    if (!led) return;

    led.className = 'led';

    const states = {
        idle: { class: 'led-idle', text: 'Prêt' },
        scanning: { class: 'led-scanning', text: 'Capture...' },
        success: { class: 'led-success', text: 'Terminé' },
        error: { class: 'led-error', text: 'Erreur' }
    };

    const config = states[state] || states.idle;
    led.classList.add(config.class);

    if (elements.statusText) {
        elements.statusText.textContent = config.text;
    }
}

function updateButton(isCapturing) {
    if (!elements.startBtn) return;

    if (isCapturing) {
        elements.startBtn.querySelector('span:last-child').textContent = 'Capture en cours...';
        elements.startBtn.className = 'btn btn-primary';
        elements.startBtn.disabled = true;
    } else {
        elements.startBtn.querySelector('span:last-child').textContent = 'Lancer la capture';
        elements.startBtn.className = 'btn btn-primary';
        elements.startBtn.disabled = false;
    }
}

/**
 * Met à jour l'UI avec l'état reçu du service worker
 */
function updateUI(state) {
    if (!state) return;

    updateButton(state.isCapturing);
    updateProgress(state.currentIndex + 1, state.total);

    if (state.isCapturing) {
        setState('scanning');
    } else if (state.successCount > 0) {
        setState('success');
    }

    // Afficher les logs
    clearLogs();
    if (state.logs) {
        state.logs.forEach(l => log(l.tag, l.message));
    }
}

/**
 * Démarre la capture via le service worker
 */
async function startCapture() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            log('ERROR', 'Aucun onglet actif trouvé');
            return;
        }

        chrome.runtime.sendMessage({ type: 'startCapture', tabId: tab.id });
        updateButton(true);
        setState('scanning');
        clearLogs();
        log('INFO', 'Capture lancée...');

    } catch (error) {
        log('ERROR', error.message);
    }
}

/**
 * Récupère l'état depuis le service worker
 */
async function fetchState() {
    try {
        const state = await chrome.runtime.sendMessage({ type: 'getState' });
        updateUI(state);
    } catch (error) {
        // Service worker pas encore prêt
    }
}

// === Listener pour les messages du service worker ===
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'log') {
        log(message.tag, message.message);
    }
    if (message.type === 'stateUpdate') {
        updateUI(message.state);
    }
});

// === Initialisation ===
document.addEventListener('DOMContentLoaded', () => {
    initElements();

    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startCapture);
    }

    // Récupérer l'état actuel au cas où une capture est en cours
    fetchState();

    log('INFO', 'Prêt. Ouvrez un chapitre manga puis lancez la capture.');
});

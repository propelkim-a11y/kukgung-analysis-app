/**
 * ==========================================
 * js/app_core.js
 * ==========================================
 */
class BowAppCore {
    constructor() {
        this.dbName = 'BowArcheryDB';
        this.dbVersion = 1;
        this.db = null;
        this.state = { scale: 1, offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0, lastTouchDist: 0, isPanelOpen: true };
    }
    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('appCache')) db.createObjectStore('appCache');
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onerror = (e) => reject(e.target.error);
        });
    }
    async saveCache(key, value) {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction('appCache', 'readwrite');
            tx.objectStore('appCache').put(value, key);
            tx.oncomplete = () => resolve(true);
        });
    }
    async getCache(key) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const request = this.db.transaction('appCache', 'readonly').objectStore('appCache').get(key);
            request.onsuccess = () => resolve(request.result);
        });
    }
    async restoreLastSession(videoEl, canvasEl) {
        try {
            const videoBlob = await this.getCache('lastVideoBlob');
            if (videoBlob && videoEl) {
                videoEl.src = URL.createObjectURL(videoBlob);
                videoEl.load();
            }
            const savedLines = await this.getCache('lastLines');
            if (savedLines && window.bowAnalyzer) {
                window.bowAnalyzer.lines = savedLines;
                const savedTransform = await this.getCache('lastTransform');
                if (savedTransform) {
                    this.state.scale = savedTransform.scale;
                    this.state.offsetX = savedTransform.offsetX;
                    this.state.offsetY = savedTransform.offsetY;
                }
                window.bowAnalyzer.updateTransform(this.state.scale, this.state.offsetX, this.state.offsetY);
            }
        } catch (error) { console.error(error); }
    }
}
window.bowAppCore = new BowAppCore();


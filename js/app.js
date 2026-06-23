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
/**
 * ==========================================
 * js/app_gesture.js
 * ==========================================
 */
class BowAppGesture {
    constructor(coreInstance) {
        this.core = coreInstance;
        this.container = null;
        this.video = null;
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
    }
    init(containerEl, videoEl) {
        this.container = containerEl; this.video = videoEl;
        this.container.addEventListener('pointerdown', this.handlePointerDown);
        this.container.addEventListener('pointermove', this.handlePointerMove);
        this.container.addEventListener('pointerup', this.handlePointerUp);
        this.container.addEventListener('pointercancel', this.handlePointerUp);
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    }
    handlePointerDown(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        if (e.pointerType === 'touch' && e.touchType === 'direct' && window.isStylusActive) return;
        const state = this.core.state;
        state.isDragging = true;
        state.startX = e.clientX - state.offsetX; state.startY = e.clientY - state.offsetY;
    }
    handlePointerMove(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        const state = this.core.state;
        if (e.pointerType === 'touch' && e.targetTouches && e.targetTouches.length === 2) {
            state.isDragging = false;
            const currentDist = Math.hypot(e.targetTouches[0].clientX - e.targetTouches[1].clientX, e.targetTouches[0].clientY - e.targetTouches[1].clientY);
            if (state.lastTouchDist > 0) this.applyZoom(state.scale * (currentDist / state.lastTouchDist), e.clientX, e.clientY);
            state.lastTouchDist = currentDist;
            return;
        }
        if (!state.isDragging) return;
        state.offsetX = e.clientX - state.startX; state.offsetY = e.clientY - state.startY;
        this.applyTransform();
    }
    handlePointerUp() {
        const state = this.core.state; state.isDragging = false; state.lastTouchDist = 0;
        this.core.saveCache('lastTransform', { scale: state.scale, offsetX: state.offsetX, offsetY: state.offsetY });
    }
    handleWheel(e) {
        e.preventDefault();
        this.applyZoom(e.deltaY < 0 ? this.core.state.scale * 1.1 : this.core.state.scale * 0.9, e.clientX, e.clientY);
    }
    applyZoom(targetScale, clientX, clientY) {
        const state = this.core.state; const rect = this.container.getBoundingClientRect();
        const nextScale = Math.min(Math.max(targetScale, 1), 5); // 최대 5배율 제한 명세 준수
        const mX = clientX - rect.left; const mY = clientY - rect.top;
        state.offsetX = mX - (mX - state.offsetX) * (nextScale / state.scale);
        state.offsetY = mY - (mY - state.offsetY) * (nextScale / state.scale);
        state.scale = nextScale;
        this.applyTransform();
    }
    applyTransform() {
        const state = this.core.state;
        if (this.video) this.video.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        if (window.bowAnalyzer) window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
    }
}
window.bowAppGesture = new BowAppGesture(window.bowAppCore);
/**
 * ==========================================
 * js/app.js
 * ==========================================
 */
document.addEventListener('DOMContentLoaded', async () => {
    const core = window.bowAppCore; const gesture = window.bowAppGesture;
    await core.initDB();

    const videoViewport = document.getElementById('video-viewport');
    const mainVideo = document.getElementById('main-video');
    const cameraPreview = document.getElementById('camera-preview');
    const drawCanvas = document.getElementById('draw-canvas');
    const unifiedPanel = document.getElementById('unified-panel');
    const panelHandle = document.getElementById('panel-handle');
    const gyroHorizonLine = document.getElementById('gyro-horizon-line');
    
    const btnOpen = document.getElementById('btn-open');
    const btnCamera = document.getElementById('btn-camera');
    const btnMove = document.getElementById('btn-move');
    const btnDraw = document.getElementById('btn-draw');
    const btnReset = document.getElementById('btn-reset');
    const videoInput = document.getElementById('video-input');

    const btnFramePrev = document.getElementById('btn-frame-prev');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnFrameNext = document.getElementById('btn-frame-next');
    const angleReport = document.getElementById('angle-report');

    let mediaRecorder = null; let recordedChunks = []; let isRecording = false; let cameraStream = null;

    gesture.init(videoViewport, mainVideo);
    if (window.bowAnalyzer) window.bowAnalyzer.init(drawCanvas);
    await core.restoreLastSession(mainVideo, drawCanvas);
    gesture.applyTransform();

    mainVideo.addEventListener('loadedmetadata

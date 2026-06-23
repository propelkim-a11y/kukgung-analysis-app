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

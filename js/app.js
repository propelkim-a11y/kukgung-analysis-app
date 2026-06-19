import { DynamicLeveler } from './sensor.js';
import { ArcheryAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const leveler = new DynamicLeveler((isLevel, roll) => {
    if (!isRecording) {
        recordBtn.classList.toggle('ready', isLevel);
        phoneRollAtRecord = roll;
    }
});

const analyzer = new ArcheryAnalyzer();
const outputCanvas = document.getElementById('output-canvas');
const drawingCanvas = document.getElementById('drawing-canvas');
const drawCtx = drawingCanvas.getContext('2d');
const resManualAngle = document.getElementById('res-manual-angle');

// 수동 분석용 변수
let lines = [];
let isDrawing = false;
let currentLine = null;
let selectedLines = [];

// 확대/축소 및 이동 변수
let scale = 1;
let lastPinchDistance = 0;
const analysisBox = document.getElementById('manual-analysis-box');

// 1. 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // 권한 버튼 이벤트
    document.getElementById('btn-permission').addEventListener('click', async () => {
        const sensorGranted = await leveler.init();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true 
            });
            streamRef = stream;
            video.srcObject = stream;
            video.play();
            if (sensorGranted) document.getElementById('permission-overlay').classList.add('hidden');
        } catch (err) {
            alert('카메라 권한이 필요합니다.');
        }
    });

    // 모드 전환
    document.getElementById('btn-mode-shoot').addEventListener('click', () => switchMode('shoot'));
    document.getElementById('btn-mode-analyze').addEventListener('click', () => switchMode('analyze'));

    // 녹화 버튼
    recordBtn.addEventListener('click', () => {
        if (!isRecording) startRecording();
        else stopRecording();
    });

    // 파일 업로드
    document.getElementById('file-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadVideoForAnalysis(URL.createObjectURL(file));
    });

    // 드로잉 초기화
    document.getElementById('btn-clear-draw').addEventListener('click', () => {
        lines = [];
        selectedLines = [];
        drawAll();
    });

    // 비디오 컨트롤러
    const analysisVideo = document.createElement('video');
    analysisVideo.hidden = true;
    document.body.appendChild(analysisVideo);

    document.getElementById('btn-video-play').addEventListener('click', () => {
        if (analysisVideo.paused) analysisVideo.play();
        else analysisVideo.pause();
    });

    document.getElementById('btn-video-prev').addEventListener('click', () => {
        analysisVideo.currentTime = Math.max(0, analysisVideo.currentTime - 0.1);
    });

    document.getElementById('btn-video-next').addEventListener('click', () => {
        analysisVideo.currentTime = Math.min(analysisVideo.duration, analysisVideo.currentTime + 0.1);
    });

    analysisVideo.ontimeupdate = () => {
        if (!analysisVideo.paused || analysisVideo.currentTime > 0) {
            renderToCanvas(analysisVideo);
        }
    };

    window.analysisVideo = analysisVideo; // 전역 참조
}

function switchMode(mode) {
    const shootView = document.getElementById('camera-section');
    const analyzeView = document.getElementById('analysis-section');
    const uploadLabel = document.getElementById('upload-label');
    const recordBtn = document.getElementById('record-btn');

    if (mode === 'shoot') {
        shootView.classList.remove('hidden');
        analyzeView.classList.add('hidden');
        uploadLabel.classList.add('hidden');
        recordBtn.classList.remove('hidden');
        document.getElementById('btn-mode-shoot').classList.add('active');
        document.getElementById('btn-mode-analyze').classList.remove('active');
    } else {
        shootView.classList.add('hidden');
        analyzeView.classList.remove('hidden');
        uploadLabel.classList.remove('hidden');
        recordBtn.classList.add('hidden');
        document.getElementById('btn-mode-shoot').classList.remove('active');
        document.getElementById('btn-mode-analyze').classList.add('active');
    }
}

// 2. 녹화 로직
function startRecording() {
    recordedChunks = [];
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
    
    mediaRecorder = new MediaRecorder(streamRef, options);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kukgung_${Date.now()}.webm`;
        a.click();
        loadVideoForAnalysis(url);
    };

    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add('recording');
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording');
}

// 3. 분석 로직 (수동 드로잉 & 확대/축소)
function loadVideoForAnalysis(url) {
    const v = window.analysisVideo;
    v.src = url;
    v.onloadedmetadata = () => {
        drawingCanvas.width = outputCanvas.width = v.videoWidth;
        drawingCanvas.height = outputCanvas.height = v.videoHeight;
        v.currentTime = v.duration; // 마지막 프레임으로 이동
        switchMode('analyze');
        
        // 자동 보조선 생성 (센서 기반)
        setTimeout(() => {
            createAutoGuideLines();
            renderToCanvas(v);
        }, 500);
    };
}

function renderToCanvas(v) {
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(v, 0, 0, outputCanvas.width, outputCanvas.height);
    drawAll();
}

function createAutoGuideLines() {
    const w = drawingCanvas.width;
    const h = drawingCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    
    // 수평선 (노란색 점선)
    const rad = phoneRollAtRecord * (Math.PI / 180);
    lines.push({
        p1: { x: cx - Math.cos(rad) * w, y: cy - Math.sin(rad) * w },
        p2: { x: cx + Math.cos(rad) * w, y: cy + Math.sin(rad) * w },
        color: '#ffeb3b', isDash: true, label: '수평선'
    });
    
    // 수직선
    const vRad = rad + Math.PI / 2;
    lines.push({
        p1: { x: cx - Math.cos(vRad) * h, y: cy - Math.sin(vRad) * h },
        p2: { x: cx + Math.cos(vRad) * h, y: cy + Math.sin(vRad) * h },
        color: '#ffeb3b', isDash: true, label: '수직선'
    });
    drawAll();
}

// 4. 터치 이벤트 (드로잉 & 줌)
drawingCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        lastPinchDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        return;
    }
    
    const pos = getTouchPos(e.touches[0]);
    
    // 선 선택 확인
    const clickedLine = findLineAt(pos);
    if (clickedLine) {
        toggleSelect(clickedLine);
        return;
    }

    isDrawing = true;
    currentLine = { p1: pos, p2: pos, color: '#007aff', isDash: false };
});

drawingCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        const delta = dist / lastPinchDistance;
        scale = Math.min(Math.max(1, scale * delta), 4);
        applyZoom();
        lastPinchDistance = dist;
        return;
    }

    if (!isDrawing) return;
    currentLine.p2 = getTouchPos(e.touches[0]);
    drawAll();
});

drawingCanvas.addEventListener('touchend', () => {
    if (isDrawing) {
        lines.push(currentLine);
        isDrawing = false;
        currentLine = null;
    }
    drawAll();
});

function getTouchPos(touch) {
    const rect = drawingCanvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (drawingCanvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (drawingCanvas.height / rect.height);
    return { x, y };
}

function applyZoom() {
    const transform = `scale(${scale})`;
    outputCanvas.style.transform = transform;
    drawingCanvas.style.transform = transform;
}

function drawAll() {
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    lines.forEach(line => drawLine(line));
    if (currentLine) drawLine(currentLine);
}

function drawLine(line) {
    const isSelected = selectedLines.includes(line);
    drawCtx.beginPath();
    drawCtx.lineWidth = isSelected ? 8 : 4;
    drawCtx.strokeStyle = isSelected ? '#00e676' : line.color;
    if (line.isDash) drawCtx.setLineDash([10, 10]);
    else drawCtx.setLineDash([]);
    
    drawCtx.moveTo(line.p1.x, line.p1.y);
    drawCtx.lineTo(line.p2.x, line.p2.y);
    drawCtx.stroke();
}

function findLineAt(pos) {
    return lines.find(line => {
        const d = distToSegment(pos, line.p1, line.p2);
        return d < 30; // 터치 오차 범위
    });
}

function toggleSelect(line) {
    const idx = selectedLines.indexOf(line);
    if (idx > -1) selectedLines.splice(idx, 1);
    else {
        if (selectedLines.length >= 2) selectedLines.shift();
        selectedLines.push(line);
    }
    calculateManualAngle();
    drawAll();
}

function calculateManualAngle() {
    if (selectedLines.length < 2) {
        resManualAngle.innerText = "0°";
        return;
    }
    const l1 = selectedLines[0];
    const l2 = selectedLines[1];
    const a1 = Math.atan2(l1.p2.y - l1.p1.y, l1.p2.x - l1.p1.x);
    const a2 = Math.atan2(l2.p2.y - l2.p1.y, l2.p2.x - l2.p1.x);
    let angle = Math.abs((a1 - a2) * 180 / Math.PI);
    if (angle > 90) angle = 180 - angle;
    resManualAngle.innerText = `${angle.toFixed(1)}°`;
}

function distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

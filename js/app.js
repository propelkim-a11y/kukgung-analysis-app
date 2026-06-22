import { DynamicLeveler } from './sensor.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');

// 상태 로그 표시
let statusLog = document.getElementById('status-log');
if (!statusLog) {
    statusLog = document.createElement('div');
    statusLog.id = 'status-log';
    statusLog.style = 'position:fixed; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:5px; font-size:12px; z-index:9999; pointer-events:none; border-radius:4px;';
    document.body.appendChild(statusLog);
}

function log(msg) {
    console.log(msg);
    statusLog.innerText = msg;
}

const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (isLevel) {
        recordBtn.style.border = '6px solid #00ff00';
        recordBtn.style.boxShadow = '0 0 15px #00ff00';
    } else {
        recordBtn.style.border = '6px solid #ff4444';
        recordBtn.style.boxShadow = 'none';
    }
});

const outputCanvas = document.getElementById('output-canvas');
const drawingCanvas = document.getElementById('drawing-canvas');
const drawCtx = drawingCanvas.getContext('2d');
const resManualAngle = document.getElementById('res-manual-angle');

let lines = [];
let isDrawing = false;
let currentLine = null;
let selectedLines = [];
let scale = 1;
let lastPinchDistance = 0;

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    log("앱 준비 완료 - 권한 허용을 눌러주세요");

    document.getElementById('btn-permission').onclick = async () => {
        log("카메라 활성화 중...");
        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false 
            });
            video.srcObject = streamRef;
            await video.play();
            document.getElementById('permission-overlay').classList.add('hidden');
            
            // 버튼 시각화 강제 설정
            recordBtn.style.opacity = '1';
            recordBtn.style.display = 'block';
            recordBtn.style.backgroundColor = 'white';
            recordBtn.style.pointerEvents = 'auto';
            log("촬영 준비 완료");

            try { await leveler.init(); } catch(e) { log("센서 권한 필요"); }
        } catch (err) {
            log("에러: " + err.message);
        }
    };

    // [핵심 수정] 중복 클릭 방지를 위해 onclick 하나만 사용하고 딜레이 부여
    let lastClickTime = 0;
    recordBtn.onclick = (e) => {
        e.preventDefault();
        const now = Date.now();
        if (now - lastClickTime < 500) return; // 0.5초 이내 중복 클릭 무시
        lastClickTime = now;

        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    };

    // 분석 모드 관련
    document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
    document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');
    document.getElementById('file-upload').onchange = (e) => {
        const file = e.target.files[0];
        if (file) loadVideoForAnalysis(URL.createObjectURL(file));
    };
    document.getElementById('btn-clear-draw').onclick = () => {
        lines = []; selectedLines = []; drawAll(); resManualAngle.innerText = "0°";
    };

    const v = document.createElement('video');
    v.hidden = true; v.playsInline = true; v.muted = true;
    document.body.appendChild(v);
    window.analysisVideo = v;

    document.getElementById('btn-video-play').onclick = () => v.paused ? v.play() : v.pause();
    document.getElementById('btn-video-prev').onclick = () => v.currentTime -= 0.033; // 1프레임씩
    document.getElementById('btn-video-next').onclick = () => v.currentTime += 0.033;

    v.ontimeupdate = () => { if (!v.paused) renderToCanvas(v); };
    setupDrawingEvents();
}

function startRecording() {
    if (!streamRef) return;
    recordedChunks = [];
    
    // 모바일 호환성 최강 코덱 설정
    const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') 
                    ? { mimeType: 'video/webm;codecs=vp8' } 
                    : {};

    try {
        mediaRecorder = new MediaRecorder(streamRef, options);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        
        mediaRecorder.onstop = () => {
            log("저장 중...");
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            // 파일 다운로드
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            loadVideoForAnalysis(url);
            log("저장 완료! 분석 모드로 전환");
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.style.backgroundColor = '#ff0000'; // 녹화 중 빨간색
        recordBtn.innerHTML = '<span style="color:white; font-weight:bold;">STOP</span>';
        log("● 녹화 중... (다시 누르면 정지)");
    } catch (e) {
        log("녹화 시작 에러: " + e.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.style.backgroundColor = 'white';
        recordBtn.innerHTML = '';
        log("녹화 중지됨. 파일 처리 중...");
    }
}

function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
}

function loadVideoForAnalysis(url) {
    const v = window.analysisVideo;
    v.src = url;
    v.onloadedmetadata = () => {
        drawingCanvas.width = outputCanvas.width = v.videoWidth;
        drawingCanvas.height = outputCanvas.height = v.videoHeight;
        v.currentTime = 0.1;
        switchMode('analyze');
        setTimeout(() => { createAutoGuideLines(); renderToCanvas(v); }, 300);
    };
}

function renderToCanvas(v) {
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(v, 0, 0, outputCanvas.width, outputCanvas.height);
    drawAll();
}

function createAutoGuideLines() {
    const w = drawingCanvas.width, h = drawingCanvas.height;
    const cx = w / 2, cy = h / 2;
    const rad = phoneRollAtRecord * (Math.PI / 180);
    lines = [];
    // 수평선 (노란색 점선)
    lines.push({ p1: { x: cx - Math.cos(rad) * w, y: cy - Math.sin(rad) * w }, p2: { x: cx + Math.cos(rad) * w, y: cy + Math.sin(rad) * w }, color: '#ffeb3b', isDash: true });
    // 수직선
    lines.push({ p1: { x: cx - Math.cos(rad + Math.PI/2) * h, y: cy - Math.sin(rad + Math.PI/2) * h }, p2: { x: cx + Math.cos(rad + Math.PI/2) * h, y: cy + Math.sin(rad + Math.PI/2) * h }, color: '#ffeb3b', isDash: true });
    drawAll();
}

function setupDrawingEvents() {
    drawingCanvas.onmousedown = (e) => handleStart(e.clientX, e.clientY);
    window.onmousemove = (e) => handleMove(e.clientX, e.clientY);
    window.onmouseup = handleEnd;

    drawingCanvas.ontouchstart = (e) => {
        if (e.touches.length === 2) {
            lastPinchDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        } else {
            handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }
    };
    drawingCanvas.ontouchmove = (e) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            scale = Math.min(Math.max(1, scale * (dist / lastPinchDistance)), 4);
            applyZoom();
            lastPinchDistance = dist;
        } else {
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    };
    drawingCanvas.ontouchend = handleEnd;
}

function handleStart(clientX, clientY) {
    const pos = getRelativePos(clientX, clientY);
    const clickedLine = findLineAt(pos);
    if (clickedLine) { toggleSelect(clickedLine); return; }
    isDrawing = true;
    currentLine = { p1: pos, p2: pos, color: '#007aff', isDash: false };
}

function handleMove(clientX, clientY) {
    if (!isDrawing) return;
    currentLine.p2 = getRelativePos(clientX, clientY);
    drawAll();
}

function handleEnd() {
    if (isDrawing) { lines.push(currentLine); isDrawing = false; currentLine = null; }
    drawAll();
}

function getRelativePos(clientX, clientY) {
    const rect = drawingCanvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (drawingCanvas.width / rect.width);
    const y = (clientY - rect.top) * (drawingCanvas.height / rect.height);
    return { x, y };
}

function applyZoom() {
    const transform = `scale(${scale})`;
    outputCanvas.style.transform = drawingCanvas.style.transform = transform;
}

function drawAll() {
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    lines.forEach(line => drawLine(line));
    if (currentLine) drawLine(currentLine);
}

function drawLine(line) {
    const isSelected = selectedLines.includes(line);
    drawCtx.beginPath();
    drawCtx.lineWidth = isSelected ? 10 : 5;
    drawCtx.strokeStyle = isSelected ? '#00e676' : line.color;
    if (line.isDash) drawCtx.setLineDash([15, 15]); else drawCtx.setLineDash([]);
    drawCtx.moveTo(line.p1.x, line.p1.y); drawCtx.lineTo(line.p2.x, line.p2.y);
    drawCtx.stroke();
}

function findLineAt(pos) { return lines.find(line => distToSegment(pos, line.p1, line.p2) < 40); }

function toggleSelect(line) {
    const idx = selectedLines.indexOf(line);
    idx > -1 ? selectedLines.splice(idx, 1) : (selectedLines.length >= 2 && selectedLines.shift(), selectedLines.push(line));
    calculateManualAngle(); drawAll();
}

function calculateManualAngle() {
    if (selectedLines.length < 2) return;
    const l1 = selectedLines[0], l2 = selectedLines[1];
    const a1 = Math.atan2(l1.p2.y - l1.p1.y, l1.p2.x - l1.p1.x);
    const a2 = Math.atan2(l2.p2.y - l2.p1.y, l2.p2.x - l2.p1.x);
    let angle = Math.abs((a1 - a2) * 180 / Math.PI);
    if (angle > 90) angle = 180 - angle;
    resManualAngle.innerText = `${angle.toFixed(1)}°`;
}

function distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

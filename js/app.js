import { DynamicLeveler } from './sensor.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');

// 상태를 화면에 보여주기 위한 텍스트 엘리먼트 (없으면 생성)
let statusLog = document.getElementById('status-log');
if (!statusLog) {
    statusLog = document.createElement('div');
    statusLog.id = 'status-log';
    statusLog.style = 'position:fixed; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:5px; font-size:12px; z-index:9999; pointer-events:none;';
    document.body.appendChild(statusLog);
}

function log(msg) {
    console.log(msg);
    statusLog.innerText = msg;
}

const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    // 수평 여부에 따라 버튼 색상만 변경 (클릭은 항상 가능하게)
    if (isLevel) {
        recordBtn.style.border = '5px solid #00ff00'; // 수평 맞으면 초록 테두리
    } else {
        recordBtn.style.border = '5px solid #ff0000'; // 수평 안 맞으면 빨간 테두리
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
    log("앱 시작됨 - 권한 허용을 눌러주세요");

    document.getElementById('btn-permission').onclick = async () => {
        log("카메라 권한 요청 중...");
        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false 
            });
            video.srcObject = streamRef;
            await video.play();
            document.getElementById('permission-overlay').classList.add('hidden');
            
            // [중요] 촬영 버튼 강제 활성화 및 시각화
            recordBtn.style.opacity = '1';
            recordBtn.style.pointerEvents = 'auto';
            recordBtn.style.display = 'block';
            recordBtn.style.backgroundColor = 'white'; // 버튼이 보이도록 흰색 설정
            log("카메라 연결 성공 - 촬영 가능");

            try { await leveler.init(); log("센서 연결 성공"); } catch(e) { log("센서 미지원/거부"); }
        } catch (err) {
            log("카메라 에러: " + err.message);
            alert('카메라 시작 실패: ' + err.message);
        }
    };

    // 클릭 이벤트가 안 먹힐 경우를 대비해 touchstart도 연결
    const handleRecordClick = (e) => {
        if (e) e.preventDefault();
        log("촬영 버튼 클릭됨! 현재 상태: " + (isRecording ? "녹화중" : "대기중"));
        if (!isRecording) startRecording();
        else stopRecording();
    };

    recordBtn.onclick = handleRecordClick;
    recordBtn.ontouchstart = (e) => {
        if (!isRecording) handleRecordClick(e);
    };

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
    v.hidden = true;
    v.playsInline = true;
    v.muted = true;
    document.body.appendChild(v);
    window.analysisVideo = v;

    document.getElementById('btn-video-play').onclick = () => v.paused ? v.play() : v.pause();
    document.getElementById('btn-video-prev').onclick = () => v.currentTime -= 0.1;
    document.getElementById('btn-video-next').onclick = () => v.currentTime += 0.1;

    v.ontimeupdate = () => { if (!v.paused) renderToCanvas(v); };

    setupDrawingEvents();
}

function startRecording() {
    if (!streamRef) {
        log("에러: 스트림 없음");
        return;
    }
    
    recordedChunks = [];
    const mimeTypes = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    try {
        log("녹화 시작 시도 (" + selectedMime + ")");
        mediaRecorder = new MediaRecorder(streamRef, selectedMime ? { mimeType: selectedMime } : {});
        
        mediaRecorder.ondataavailable = e => { 
            if (e.data.size > 0) recordedChunks.push(e.data); 
        };
        
        mediaRecorder.onstop = () => {
            log("녹화 종료 - 파일 생성 중");
            const blob = new Blob(recordedChunks, { type: selectedMime || 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start(1000);
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.style.backgroundColor = 'red'; // 녹화 중일 때 빨간색으로 변경
        log("● 녹화 중...");
    } catch (e) {
        log("녹화 에러: " + e.message);
        alert('녹화 시작 에러: ' + e.message);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.style.backgroundColor = 'white';
        log("녹화 정지됨");
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
    lines.push({ p1: { x: cx - Math.cos(rad) * w, y: cy - Math.sin(rad) * w }, p2: { x: cx + Math.cos(rad) * w, y: cy + Math.sin(rad) * w }, color: '#ffeb3b', isDash: true });
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

// [최종 수정본] js/app.js - 촬영 기능 안정화 버전
import { DynamicLeveler } from './sensor.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const leveler = new DynamicLeveler((isLevel, roll) => {
    recordBtn.classList.toggle('ready', isLevel);
    phoneRollAtRecord = roll;
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
    document.getElementById('btn-permission').addEventListener('click', async () => {
        try {
            await leveler.init();
            // 안드로이드 최적화 권한 요청
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 } },
                audio: true 
            });
            video.srcObject = streamRef;
            video.play();
        } catch (err) {
            console.warn('카메라 권한 거부 또는 미지원');
            // 비디오만 다시 시도
            try {
                streamRef = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                video.srcObject = streamRef;
                video.play();
            } catch(e) { alert('카메라를 켤 수 없습니다.'); }
        }
        document.getElementById('permission-overlay').classList.add('hidden');
    });

    document.getElementById('btn-mode-shoot').addEventListener('click', () => switchMode('shoot'));
    document.getElementById('btn-mode-analyze').addEventListener('click', () => switchMode('analyze'));

    // 촬영 버튼 이벤트 (중복 클릭 방지 및 상태 체크)
    recordBtn.onclick = (e) => {
        e.preventDefault();
        if (!isRecording) startRecording();
        else stopRecording();
    };

    document.getElementById('file-upload').onchange = (e) => {
        const file = e.target.files[0];
        if (file) loadVideoForAnalysis(URL.createObjectURL(file));
    };

    document.getElementById('btn-clear-draw').onclick = () => {
        lines = []; selectedLines = []; drawAll(); resManualAngle.innerText = "0°";
    };

    const analysisVideo = document.createElement('video');
    analysisVideo.hidden = true;
    analysisVideo.playsInline = true;
    document.body.appendChild(analysisVideo);

    document.getElementById('btn-video-play').onclick = () => analysisVideo.paused ? analysisVideo.play() : analysisVideo.pause();
    document.getElementById('btn-video-prev').onclick = () => analysisVideo.currentTime -= 0.1;
    document.getElementById('btn-video-next').onclick = () => analysisVideo.currentTime += 0.1;

    analysisVideo.ontimeupdate = () => { if (!analysisVideo.paused) renderToCanvas(analysisVideo); };
    window.analysisVideo = analysisVideo;

    // 드로잉 이벤트 (PC/모바일 통합)
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

function startRecording() {
    if (!streamRef || !streamRef.active) {
        alert('카메라 연결이 불안정합니다. 페이지를 새로고침 해주세요.');
        return;
    }
    
    recordedChunks = [];
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const supportedType = types.find(t => MediaRecorder.isTypeSupported(t));

    try {
        mediaRecorder = new MediaRecorder(streamRef, supportedType ? { mimeType: supportedType } : {});
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.webm`;
            a.click();
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start(1000); // 1초 단위로 데이터 수집 (안정성)
        isRecording = true;
        recordBtn.classList.add('recording');
    } catch (err) {
        console.error('녹화 오류:', err);
        // 오디오 없이 재시도
        if (streamRef.getAudioTracks().length > 0) {
            const videoOnlyStream = new MediaStream(streamRef.getVideoTracks());
            streamRef = videoOnlyStream;
            startRecording();
        } else {
            alert('녹화를 시작할 수 없습니다: ' + err.message);
        }
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
    }
}

// ... (이하 분석 및 드로잉 로직은 동일)
function switchMode(mode) {
    const shootView = document.getElementById('camera-section');
    const analyzeView = document.getElementById('analysis-section');
    const uploadLabel = document.getElementById('upload-label');
    const rBtn = document.getElementById('record-btn');

    if (mode === 'shoot') {
        shootView.classList.remove('hidden');
        analyzeView.classList.add('hidden');
        uploadLabel.classList.add('hidden');
        rBtn.classList.remove('hidden');
    } else {
        shootView.classList.add('hidden');
        analyzeView.classList.remove('hidden');
        uploadLabel.classList.remove('hidden');
        rBtn.classList.add('hidden');
    }
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

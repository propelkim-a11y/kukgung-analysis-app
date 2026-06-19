/**
 * app.js
 * 수동 정밀 분석 툴 통합 버전
 */

import { DynamicLeveler } from './sensor.js';
import { ArcheryAnalyzer } from './analyzer.js';
import { ArcherySync } from './firebase-sync.js';

let currentPhoneRoll = 0;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let streamRef = null;

// 수동 분석 변수
let lines = [];
let isDrawing = false;
let startPoint = null;
let selectedLines = [];

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const drawCanvas = document.getElementById('drawing-canvas');
const drawCtx = drawCanvas.getContext('2d');

// 1. 수평 센서
const leveler = new DynamicLeveler((isLevel, currentRoll) => {
    currentPhoneRoll = currentRoll;
    recordBtn.disabled = false;
    if (isLevel) recordBtn.classList.add('ready');
    else recordBtn.classList.remove('ready');
});

// 2. 동기화 모듈
let sync = new ArcherySync(() => startRecording(), () => stopRecording());

// 3. 초기화 함수
function initApp() {
    const permissionBtn = document.getElementById('btn-permission');
    if (permissionBtn) {
        permissionBtn.addEventListener('click', async () => {
            await leveler.init().catch(e => console.warn("센서 미지원"));
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', width: 1280, height: 720 },
                    audio: true 
                }).catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }));
                
                streamRef = stream;
                video.srcObject = stream;
                video.play();
                document.getElementById('permission-overlay').classList.add('hidden');
                try { sync.init('1234'); } catch(e) {}
                recordBtn.disabled = false;
                recordBtn.classList.add('ready');
            } catch (err) {
                alert('카메라 권한이 필요합니다.');
            }
        });
    }

    // 모드 전환
    const camSection = document.getElementById('camera-section');
    const anaSection = document.getElementById('analysis-section');
    const uploadLabel = document.getElementById('upload-label');

    document.getElementById('btn-mode-shoot').addEventListener('click', (e) => toggleMode(e.target, camSection, recordBtn, uploadLabel));
    document.getElementById('btn-mode-analyze').addEventListener('click', (e) => toggleMode(e.target, anaSection, uploadLabel, recordBtn));

    function toggleMode(activeBtn, showSection, showElement, hideElement) {
        document.querySelectorAll('.mode-selector button').forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
        camSection.classList.add('hidden');
        anaSection.classList.add('hidden');
        showSection.classList.remove('hidden');
        showElement.classList.remove('hidden');
        hideElement.classList.add('hidden');
        if (showSection === anaSection) resizeDrawingCanvas();
    }

    // 분석 로직
    const analyzer = new ArcheryAnalyzer();
    document.getElementById('file-upload').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        
        const dummyVideo = document.createElement('video');
        dummyVideo.src = URL.createObjectURL(file);
        dummyVideo.muted = true;
        dummyVideo.playsInline = true;

        dummyVideo.onloadeddata = () => {
            dummyVideo.currentTime = Math.max(0, dummyVideo.duration - 0.5);
        };

        dummyVideo.onseeked = () => {
            analyzer.analyzeFrame(dummyVideo, currentPhoneRoll, (data) => {
                if (loadingSpinner) loadingSpinner.classList.add('hidden');
                renderCanvas(data ? data.results : {}, dummyVideo);
                if (data) {
                    document.getElementById('res-arrow-angle').innerText = `${data.arrow.toFixed(1)}°`;
                    document.getElementById('res-bow-arm').innerText = `${data.bowArm.toFixed(1)}°`;
                    document.getElementById('res-draw-arm').innerText = `${data.drawArm.toFixed(1)}°`;
                }
                document.getElementById('btn-mode-analyze').click();
            });
        };
    });

    initManualAnalysis();
}

// 4. 수동 분석 드로잉 로직
function initManualAnalysis() {
    const clearBtn = document.getElementById('btn-clear-draw');
    
    drawCanvas.addEventListener('touchstart', handleStart, {passive: false});
    drawCanvas.addEventListener('touchmove', handleMove, {passive: false});
    drawCanvas.addEventListener('touchend', handleEnd);

    clearBtn.addEventListener('click', () => {
        lines = [];
        selectedLines = [];
        redrawLines();
        document.getElementById('angle-display').innerText = "두 선을 선택하세요";
    });
}

function resizeDrawingCanvas() {
    const outputCanvas = document.getElementById('output-canvas');
    drawCanvas.width = outputCanvas.clientWidth;
    drawCanvas.height = outputCanvas.clientHeight;
    redrawLines();
}

function handleStart(e) {
    e.preventDefault();
    const rect = drawCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // 선 선택 로직 (이미 그려진 선 근처 클릭 시)
    const clickedLineIndex = findNearbyLine(x, y);
    if (clickedLineIndex !== -1) {
        toggleLineSelection(clickedLineIndex);
        return;
    }

    isDrawing = true;
    startPoint = {x, y};
}

function handleMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const rect = drawCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    redrawLines();
    drawTempLine(startPoint.x, startPoint.y, x, y);
}

function handleEnd(e) {
    if (!isDrawing) return;
    const rect = drawCanvas.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    lines.push({x1: startPoint.x, y1: startPoint.y, x2: x, y2: y, selected: false});
    isDrawing = false;
    redrawLines();
}

function drawTempLine(x1, y1, x2, y2) {
    drawCtx.beginPath();
    drawCtx.setLineDash([5, 5]);
    drawCtx.moveTo(x1, y1);
    drawCtx.lineTo(x2, y2);
    drawCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    drawCtx.lineWidth = 2;
    drawCtx.stroke();
    drawCtx.setLineDash([]);
}

function redrawLines() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    lines.forEach((line, index) => {
        drawCtx.beginPath();
        drawCtx.moveTo(line.x1, line.y1);
        drawCtx.lineTo(line.x2, line.y2);
        drawCtx.strokeStyle = line.selected ? "#00e676" : "rgba(255, 255, 255, 0.5)";
        drawCtx.lineWidth = line.selected ? 4 : 2;
        drawCtx.stroke();
        
        // 각도 텍스트 표시 (개별 선의 기울기)
        const angle = Math.atan2(line.y1 - line.y2, line.x2 - line.x1) * 180 / Math.PI;
        drawCtx.fillStyle = "white";
        drawCtx.font = "12px Arial";
        drawCtx.fillText(`${angle.toFixed(1)}°`, (line.x1 + line.x2)/2, (line.y1 + line.y2)/2);
    });
}

function findNearbyLine(x, y) {
    return lines.findIndex(line => {
        const d = distToSegment({x, y}, {x: line.x1, y: line.y1}, {x: line.x2, y: line.y2});
        return d < 20;
    });
}

function toggleLineSelection(index) {
    lines[index].selected = !lines[index].selected;
    selectedLines = lines.filter(l => l.selected);
    
    if (selectedLines.length > 2) {
        lines.forEach(l => l.selected = false);
        lines[index].selected = true;
        selectedLines = [lines[index]];
    }

    if (selectedLines.length === 2) {
        const angle = calculateAngleBetweenLines(selectedLines[0], selectedLines[1]);
        document.getElementById('angle-display').innerText = `사잇각: ${angle.toFixed(1)}°`;
    } else {
        document.getElementById('angle-display').innerText = "두 선을 선택하세요";
    }
    redrawLines();
}

function calculateAngleBetweenLines(l1, l2) {
    const a1 = Math.atan2(l1.y1 - l1.y2, l1.x2 - l1.x1);
    const a2 = Math.atan2(l2.y1 - l2.y2, l2.x2 - l2.x1);
    let angle = Math.abs(a1 - a2) * 180 / Math.PI;
    if (angle > 180) angle = 360 - angle;
    return angle;
}

function distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
}

// 5. 녹화 로직
function startRecording() {
    if (!streamRef || isRecording) return;
    recordedChunks = [];
    try {
        mediaRecorder = new MediaRecorder(streamRef, { mimeType: 'video/webm;codecs=vp9' });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            processVideo(blob);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `kukgung_${Date.now()}.webm`;
            a.click();
        };
        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
    } catch (e) { alert("녹화 시작 실패"); }
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;
    mediaRecorder.stop();
    recordBtn.classList.remove('recording');
}

function processVideo(blob) {
    const fileInput = document.getElementById('file-upload');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], "capture.webm", { type: "video/webm" }));
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change'));
}

function renderCanvas(results, sourceVideo) {
    const canvas = document.getElementById('output-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = sourceVideo.videoWidth;
    canvas.height = sourceVideo.videoHeight;
    ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
}

recordBtn.addEventListener('click', () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

initApp();

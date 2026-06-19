/**
 * app.js
 * 전체 흐름 제어, MediaRecorder 연동 및 MediaPipe 시각화 통합
 */

import { DynamicLeveler } from './sensor.js';
import { ArcheryAnalyzer } from './analyzer.js';
import { ArcherySync } from './firebase-sync.js';

let currentPhoneRoll = 0;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const loadingSpinner = document.getElementById('loading-spinner');

// 1. 수평 센서 콜백 바인딩
const leveler = new DynamicLeveler((isLevel, currentRoll) => {
    currentPhoneRoll = currentRoll;
    if (isLevel && !isRecording) {
        recordBtn.disabled = false;
        recordBtn.classList.add('ready');
    } else if (!isRecording) {
        recordBtn.disabled = true;
        recordBtn.classList.remove('ready');
    }
});

// 2. 동기화 모듈 초기화 (방 번호 '1234' 예시)
const sync = new ArcherySync(
    () => startRecording(false), // 외부 신호 수신 시 시작
    () => stopRecording(false)   // 외부 신호 수신 시 종료
);

// 3. 초기 권한 승인 버튼 이벤트
document.getElementById('btn-permission').addEventListener('click', async () => {
    const sensorGranted = await leveler.init();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        video.srcObject = stream;
        setupRecorder(stream);
        
        if (sensorGranted) {
            document.getElementById('permission-overlay').classList.add('hidden');
            sync.init('1234'); // 실제로는 사용자 입력값을 받을 수 있음
        }
    } catch (err) {
        alert('카메라 화면을 불러올 수 없습니다. 권한을 확인해주세요.');
    }
});

// 4. 뷰 모드 전환 토글 이벤트
const camSection = document.getElementById('camera-section');
const anaSection = document.getElementById('analysis-section');
const uploadLabel = document.getElementById('upload-label');

document.getElementById('btn-mode-shoot').addEventListener('click', (e) => {
    toggleMode(e.target, camSection, recordBtn, uploadLabel);
});

document.getElementById('btn-mode-analyze').addEventListener('click', (e) => {
    toggleMode(e.target, anaSection, uploadLabel, recordBtn);
});

function toggleMode(activeBtn, showSection, showElement, hideElement) {
    document.querySelectorAll('.mode-selector button').forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
    camSection.classList.add('hidden');
    anaSection.classList.add('hidden');
    showSection.classList.remove('hidden');
    showElement.classList.remove('hidden');
    hideElement.classList.add('hidden');
}

// 5. 녹화 로직
function setupRecorder(stream) {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        processVideo(blob);
        recordedChunks = [];
    };
}

recordBtn.addEventListener('click', () => {
    if (!isRecording) sync.sendSignal('START');
    else sync.sendSignal('STOP');
});

function startRecording(isLocal = true) {
    if (isRecording) return;
    isRecording = true;
    recordedChunks = [];
    mediaRecorder.start();
    recordBtn.classList.add('recording');
    console.log("녹화 시작");
}

function stopRecording(isLocal = true) {
    if (!isRecording) return;
    isRecording = false;
    mediaRecorder.stop();
    recordBtn.classList.remove('recording');
    console.log("녹화 종료");
}

function processVideo(blob) {
    // 녹화 종료 후 분석 모드로 자동 전환하거나 파일 업로드 유도
    const fileInput = document.getElementById('file-upload');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], "capture.webm", { type: "video/webm" }));
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change'));
}

// 6. 분석기 구동 및 파일 업로드 처리
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
        // 영상의 마지막(만작 상태 가정) 프레임을 추출해 정밀 분석 수행
        dummyVideo.currentTime = Math.max(0, dummyVideo.duration - 0.5);
    };

    dummyVideo.onseeked = () => {
        analyzer.analyzeFrame(dummyVideo, currentPhoneRoll, (data) => {
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
            if (!data) return;

            // UI 데이터 업데이트
            document.getElementById('res-arrow-angle').innerText = `${data.arrow.toFixed(1)}°`;
            document.getElementById('res-bow-arm').innerText = `${data.bowArm.toFixed(1)}°`;
            document.getElementById('res-draw-arm').innerText = `${data.drawArm.toFixed(1)}°`;

            // 국궁 교범 기반 피드백 (오뉘/촉 용어 반영)
            let feedback = "조준이 안정적입니다. ";
            if (data.drawArm < 140) feedback += "⚠️ 깍지 손 팔꿈치가 낮습니다. 어깨와 수평을 맞추세요. ";
            if (data.arrow > 15) feedback += "🏹 화살 촉(-)이 높습니다. 각도를 낮추세요.";
            else if (data.arrow < 5) feedback += "🏹 화살 오뉘(+)가 높습니다. 각도를 올리세요.";
            
            document.getElementById('feedback-text').innerText = feedback;
            
            // 결과 시각화
            renderCanvas(data.results, dummyVideo);
            
            // 분석 뷰로 이동
            document.getElementById('btn-mode-analyze').click();
        });
    };
});

function renderCanvas(results, sourceVideo) {
    const canvas = document.getElementById('output-canvas');
    const ctx = canvas.getContext('2d');
    
    // 비디오 비율에 맞춰 캔버스 크기 조정
    canvas.width = sourceVideo.videoWidth;
    canvas.height = sourceVideo.videoHeight;
    
    // 1. 원본 프레임 그리기
    ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
    
    if (!results.poseLandmarks) return;

    // 2. 관절 연결선 그리기
    const connections = [
        [11, 12], [11, 13], [13, 15], // 줌팔 (왼손잡이/오른손잡이 공통 구조)
        [12, 14], [14, 16],           // 깍지팔
        [11, 23], [12, 24], [23, 24]  // 몸통
    ];

    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.6)'; // 초록색 반투명

    connections.forEach(([i, j]) => {
        const start = results.poseLandmarks[i];
        const end = results.poseLandmarks[j];
        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.stroke();
    });

    // 3. 관절 포인트 그리기
    results.poseLandmarks.forEach((lm, index) => {
        if (index > 24) return;
        ctx.fillStyle = '#007aff';
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
    });
}

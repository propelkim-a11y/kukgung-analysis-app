/**
 * app.js
 * 촬영 우선 모드: 센서/동기화 오류에 상관없이 즉시 녹화 가능하도록 개편
 */

import { DynamicLeveler } from './sensor.js';
import { ArcheryAnalyzer } from './analyzer.js';
import { ArcherySync } from './firebase-sync.js';

let currentPhoneRoll = 0;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let streamRef = null;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const loadingSpinner = document.getElementById('loading-spinner');

// 1. 수평 센서 (단순 정보 기록용)
const leveler = new DynamicLeveler((isLevel, currentRoll) => {
    currentPhoneRoll = currentRoll;
    // 인터록 해제: 항상 촬영 가능하도록 버튼 활성화 유지
    recordBtn.disabled = false;
    if (isLevel) {
        recordBtn.classList.add('ready');
    } else {
        recordBtn.classList.remove('ready');
    }
});

// 2. 동기화 모듈 (실패해도 무시)
let sync = new ArcherySync(
    () => startRecording(),
    () => stopRecording()
);

// 3. 초기화 함수
function initApp() {
    const permissionBtn = document.getElementById('btn-permission');
    if (permissionBtn) {
        permissionBtn.addEventListener('click', async () => {
            // 센서 초기화 (실패해도 진행)
            await leveler.init().catch(e => console.warn("센서 미지원"));
            
            try {
                // 표준 카메라 요청
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', width: 1280, height: 720 },
                    audio: true 
                }).catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }));
                
                streamRef = stream;
                video.srcObject = stream;
                video.play();

                document.getElementById('permission-overlay').classList.add('hidden');
                
                // Supabase 초기화 (실패해도 진행)
                try { sync.init('1234'); } catch(e) {}
                
                // 버튼 강제 활성화
                recordBtn.disabled = false;
                recordBtn.classList.add('ready');
            } catch (err) {
                alert('카메라 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.');
            }
        });
    }

    // 모드 전환
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
                if (!data) return;
                document.getElementById('res-arrow-angle').innerText = `${data.arrow.toFixed(1)}°`;
                document.getElementById('res-bow-arm').innerText = `${data.bowArm.toFixed(1)}°`;
                document.getElementById('res-draw-arm').innerText = `${data.drawArm.toFixed(1)}°`;
                renderCanvas(data.results, dummyVideo);
                document.getElementById('btn-mode-analyze').click();
            });
        };
    });
}

// 4. 녹화 제어 (안정성 최우선)
function startRecording() {
    if (!streamRef || isRecording) return;
    
    recordedChunks = [];
    const options = { mimeType: 'video/webm;codecs=vp9' };
    const finalOptions = MediaRecorder.isTypeSupported(options.mimeType) ? options : {};

    try {
        mediaRecorder = new MediaRecorder(streamRef, finalOptions);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.webm`;
            a.click();
            alert('녹화가 완료되어 [다운로드] 폴더에 저장되었습니다.');
            processVideo(blob);
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        if (navigator.vibrate) navigator.vibrate(50); // 진동 피드백
    } catch (e) {
        console.error("녹화 시작 실패:", e);
        alert("녹화를 시작할 수 없습니다.");
    }
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
    if (!results.poseLandmarks) return;
    
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#00e676';
    // 간단한 시각화 로직...
}

// 5. 버튼 이벤트 (즉시 반응)
recordBtn.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
        // 동기화 시도 (배경에서 실행)
        try { sync.sendSignal('START'); } catch(e) {}
    } else {
        stopRecording();
        try { sync.sendSignal('STOP'); } catch(e) {}
    }
});

initApp();

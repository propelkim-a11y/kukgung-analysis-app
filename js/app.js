/**
 * app.js
 * 안드로이드(갤럭시) 최적화: 순차적 권한 요청 및 VP9 코덱 대응
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

// 2. 동기화 모듈 초기화
let sync;

// 3. 초기화 함수
function initApp() {
    sync = new ArcherySync(
        () => startRecording(false),
        () => stopRecording(false)
    );

    const permissionBtn = document.getElementById('btn-permission');
    if (permissionBtn) {
        permissionBtn.addEventListener('click', async () => {
            console.log("순차적 권한 요청 시작...");
            
            // 1단계: 센서 권한
            const sensorGranted = await leveler.init();
            
            try {
                // 2단계: 카메라 권한
                const videoStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
                });
                
                // 3단계: 오디오 권한 (순차적 요청으로 안정성 확보)
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioStream.getAudioTracks().forEach(track => videoStream.addTrack(track));
                } catch (audioErr) {
                    console.warn("오디오 권한 거부됨, 무음 녹화 진행:", audioErr);
                }

                video.srcObject = videoStream;
                setupRecorder(videoStream);
                
                if (sensorGranted) {
                    document.getElementById('permission-overlay').classList.add('hidden');
                    sync.init('1234');
                }
            } catch (err) {
                console.error("카메라 권한 에러:", err);
                alert('카메라를 시작할 수 없습니다. 크롬 설정에서 권한을 허용해 주세요.');
            }
        });
    }

    // 뷰 모드 전환 토글 이벤트
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

    // 분석기 구동
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

                let feedback = "조준이 안정적입니다. ";
                if (data.drawArm < 140) feedback += "⚠️ 깍지 손 팔꿈치가 낮습니다. 어깨와 수평을 맞추세요. ";
                if (data.arrow > 15) feedback += "🏹 화살 촉(-)이 높습니다. 각도를 낮추세요.";
                else if (data.arrow < 5) feedback += "🏹 화살 오뉘(+)가 높습니다. 각도를 올리세요.";
                
                document.getElementById('feedback-text').innerText = feedback;
                renderCanvas(data.results, dummyVideo);
                document.getElementById('btn-mode-analyze').click();
            });
        };
    });
}

// 4. 녹화 로직 (안드로이드 VP9 코덱 최적화)
function setupRecorder(stream) {
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    let selectedType = "";
    
    for (let type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            selectedType = type;
            break;
        }
    }
    
    console.log("선택된 녹화 코덱:", selectedType);
    mediaRecorder = new MediaRecorder(stream, { mimeType: selectedType });
    
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: selectedType });
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
}

function stopRecording(isLocal = true) {
    if (!isRecording) return;
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

    const connections = [
        [11, 12], [11, 13], [13, 15],
        [12, 14], [14, 16],
        [11, 23], [12, 24], [23, 24]
    ];

    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.6)';

    connections.forEach(([i, j]) => {
        const start = results.poseLandmarks[i];
        const end = results.poseLandmarks[j];
        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.stroke();
    });

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

// 초기화 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

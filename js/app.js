import { DynamicLeveler } from './sensor.js';

// 전역 변수 초기화
let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const statusLog = document.createElement('div');

// 1. 디버그 로그 설정 (화면 상단에 무조건 표시)
statusLog.style = 'position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.8); color:#0f0; font-size:11px; z-index:10000; padding:4px; word-break:break-all;';
document.body.appendChild(statusLog);
function log(m) { statusLog.innerText = m; console.log(m); }

// 2. 수평계 설정 (에러 방지용 try-catch)
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    recordBtn.style.border = isLevel ? '8px solid #00ff00' : '8px solid #ff0000';
});

document.addEventListener('DOMContentLoaded', () => {
    log("앱 로드됨. '권한 허용' 버튼을 눌러주세요.");
    
    // 권한 허용 버튼
    document.getElementById('btn-permission').onclick = async () => {
        log("카메라 요청 중...");
        try {
            // 카메라 설정 최적화 (가장 기본 설정으로)
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' }, 
                audio: false 
            });
            video.muted = true;
            video.setAttribute('playsinline', '');
            video.srcObject = streamRef;
            await video.play();
            
            document.getElementById('permission-overlay').style.display = 'none';
            recordBtn.style.display = 'block';
            recordBtn.style.opacity = '1';
            recordBtn.style.backgroundColor = 'white';
            
            log("카메라 ON. 촬영 버튼을 누르세요.");
            try { await leveler.init(); } catch(e) { log("센서 무시됨"); }
        } catch (err) {
            log("카메라 에러: " + err.message);
            alert("카메라를 켤 수 없습니다: " + err.message);
        }
    };

    // 촬영 버튼 (클릭/터치 통합 및 중복 방지)
    let busy = false;
    recordBtn.onclick = async (e) => {
        if (busy) return;
        busy = true;
        
        if (!isRecording) {
            await startRecording();
        } else {
            await stopRecording();
        }
        
        setTimeout(() => { busy = false; }, 1000); // 1초간 재클릭 방지
    };

    // 모드 전환 및 기타
    document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
    document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');
    document.getElementById('file-upload').onchange = (e) => {
        const file = e.target.files[0];
        if (file) loadVideoForAnalysis(URL.createObjectURL(file));
    };
});

async function startRecording() {
    log("녹화 시작 시도...");
    recordedChunks = [];
    
    // 지원 코덱 확인
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    
    try {
        mediaRecorder = new MediaRecorder(streamRef, { mimeType: mime });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            log("녹화 완료. 저장 중...");
            const blob = new Blob(recordedChunks, { type: mime });
            const url = URL.createObjectURL(blob);
            
            // 다운로드 링크 강제 생성 및 클릭
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.webm`;
            a.click();
            
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.style.backgroundColor = 'red';
        recordBtn.innerText = "STOP";
        log("● 녹화 중... (한 번 더 누르면 정지)");
    } catch (e) {
        log("녹화 시작 에러: " + e.message);
        isRecording = false;
    }
}

async function stopRecording() {
    log("녹화 정지 시도...");
    try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        recordBtn.style.backgroundColor = 'white';
        recordBtn.innerText = "";
    } catch (e) {
        log("정지 에러: " + e.message);
        isRecording = false;
    }
}

// [나머지 분석 로직 - 기존과 동일하지만 에러 방지 처리 추가]
function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
}

function loadVideoForAnalysis(url) {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    window.analysisVideo = v;
    
    v.onloadedmetadata = () => {
        const drawingCanvas = document.getElementById('drawing-canvas');
        const outputCanvas = document.getElementById('output-canvas');
        drawingCanvas.width = outputCanvas.width = v.videoWidth;
        drawingCanvas.height = outputCanvas.height = v.videoHeight;
        v.currentTime = 0.1;
        switchMode('analyze');
        renderToCanvas(v);
    };
}

function renderToCanvas(v) {
    const outputCanvas = document.getElementById('output-canvas');
    const ctx = outputCanvas.getContext('2d');
    ctx.drawImage(v, 0, 0, outputCanvas.width, outputCanvas.height);
}

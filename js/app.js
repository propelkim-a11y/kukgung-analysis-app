import { DynamicLeveler } from './sensor.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');

// 1. 상태 로그 (가장 상단에 배치)
let statusLog = document.getElementById('status-log');
if (!statusLog) {
    statusLog = document.createElement('div');
    statusLog.id = 'status-log';
    statusLog.style = 'position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.9); color:#0f0; font-size:12px; z-index:100000; padding:8px; font-weight:bold;';
    document.body.appendChild(statusLog);
}
function log(m) { statusLog.innerText = m; console.log(m); }

// 2. 수평계 (버튼 테두리로 표시)
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    recordBtn.style.border = isLevel ? '10px solid #00ff00' : '10px solid #ff0000';
});

// 3. 앱 초기화
async function initApp() {
    log("앱 로드 완료. '권한 허용'을 누르세요.");

    document.getElementById('btn-permission').onclick = async () => {
        log("카메라 요청 중...");
        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 } }, 
                audio: false 
            });
            video.srcObject = streamRef;
            await video.play();
            
            document.getElementById('permission-overlay').style.display = 'none';
            
            // [강력 조치] 버튼을 모든 요소의 위로 올리고 크기를 키움
            recordBtn.style.display = 'block';
            recordBtn.style.opacity = '1';
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.position = 'fixed';
            recordBtn.style.pointerEvents = 'auto';
            recordBtn.style.backgroundColor = 'white';
            
            log("카메라 ON! 이제 흰색 버튼을 누르세요.");
            try { await leveler.init(); } catch(e) { log("센서 무시됨"); }
        } catch (err) {
            log("에러: " + err.message);
        }
    };

    // [핵심] 모든 종류의 입력을 다 잡아냄
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        log("!!! 버튼 눌림 확인 !!!"); // 누르자마자 이 메시지가 떠야 함
        
        if (!isRecording) startRecording();
        else stopRecording();
    };

    // 클릭, 터치 모두 등록
    recordBtn.addEventListener('click', handleAction, { capture: true });
    recordBtn.addEventListener('touchstart', handleAction, { capture: true });
}

async function startRecording() {
    if (!streamRef) { log("에러: 카메라 없음"); return; }
    
    recordedChunks = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    
    try {
        log("녹화 준비 중...");
        mediaRecorder = new MediaRecorder(streamRef, { mimeType: mime });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            log("녹화 완료! 저장 중...");
            const blob = new Blob(recordedChunks, { type: mime });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.style.backgroundColor = 'red';
        recordBtn.innerText = "STOP";
        log("● 녹화 중... 다시 누르면 정지");
    } catch (e) {
        log("녹화 에러: " + e.message);
    }
}

async function stopRecording() {
    log("정지 요청됨...");
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.style.backgroundColor = 'white';
        recordBtn.innerText = "";
    }
}

// 분석 및 기타 로직
document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');
document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files[0];
    if (file) loadVideoForAnalysis(URL.createObjectURL(file));
};

function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
}

function loadVideoForAnalysis(url) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true;
    window.analysisVideo = v;
    v.onloadedmetadata = () => {
        const dc = document.getElementById('drawing-canvas');
        const oc = document.getElementById('output-canvas');
        dc.width = oc.width = v.videoWidth;
        dc.height = oc.height = v.videoHeight;
        v.currentTime = 0.1;
        switchMode('analyze');
        const ctx = oc.getContext('2d');
        ctx.drawImage(v, 0, 0, oc.width, oc.height);
    };
}

// 초기화 실행
initApp();

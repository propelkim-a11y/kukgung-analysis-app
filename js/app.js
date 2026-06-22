import { DynamicLeveler } from './sensor.js';
import { BowAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 
let poseDetector = null; 

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const bowAnalyzer = new BowAnalyzer();

// 1. 디버깅 전용 상단 실시간 모니터링 로그 바
let statusLog = document.getElementById('status-log');
if (!statusLog) {
    statusLog = document.createElement('div');
    statusLog.id = 'status-log';
    statusLog.style = 'position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.9); color:#0f0; font-size:11px; z-index:100000; padding:6px; font-weight:bold; pointer-events:none; word-break:break-all;';
    document.body.appendChild(statusLog);
}
function log(m) { statusLog.innerText = m; console.log(m); }

// 2. 하드웨어 수평 바인딩 콜백
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 3. 브라우저 엔진 인코더 검출
function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp8', 'video/mp4;codecs=avc1', 'video/webm', 'video/mp4'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

function checkMobile() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 4. 비디오 분석 모드 전용 경량화 AI 호출 엔진 기동
async function ensurePoseModelLoaded() {
    if (poseDetector) return; 
    
    log("📥 AI 관절 포인트 매핑 분석 인프라 준비 중...");
    if (typeof window.Pose === 'undefined') {
        log("⚠️ 라이브러리 준비 동기화 대기 중... 잠시 후 재시도하세요.");
        return;
    }

    // @ts-ignore
    poseDetector = new window.Pose({
        locateFile: (file) => `https://jsdelivr.net{file}`
    });

    poseDetector.setOptions({
        modelComplexity: 0, // Lite 무선 전송 모드로 강제 지정하여 네트워크 프리징 원천 봉쇄
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    poseDetector.onResults(() => { console.log("AI 좌표 동기화 성공"); });
    log("🚀 AI 관절 분석 모델 탑재 완료.");
}

// 5. 핵심 앱 스타터 초기화 구문
async function initApp() {
    window.isMobileDevice = checkMobile();
    log(`기기 감지 분석: ${window.isMobileDevice ? '스마트폰 모바일' : 'PC 데스크톱 익스텐션'}`);

    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none';
        document.getElementById('status-text').innerText = "PC 웹캠 상태 고정";
        document.getElementById('angle-text').innerText = "PC 모드";
        recordBtn.style.border = '5px solid #fff';
    }

    document.getElementById('btn-permission').onclick = async () => {
        log("미디어 스트림 노드 수집 중...");
        const videoConstraints = window.isMobileDevice 
            ? { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
            video.srcObject = streamRef;
            await video.play();
            
            document.getElementById('permission-overlay').style.display = 'none';
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            
            log("카메라 초기 연결 성공! 촬영을 시작할 수 있습니다.");
            
            if (window.isMobileDevice) {
                try { await leveler.init(); } catch(e) { log("센서 마운트 예외 통과"); }
            }
        } catch (err) {
            log(`접근 거부: ${err.message}\n로컬 더블클릭 구동이거나 비보안 프로토콜(HTTP) 주소일 수 있습니다.`);
        }
    };

    let lastTriggerTime = 0;
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const now = Date.now();
        if (now - lastTriggerTime < 300) return; 
        lastTriggerTime = now;

        if (!isRecording) startRecording();
        else stopRecording();
    };

    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });
}

async function startRecording() {
    if (!streamRef) return;
    recordedChunks = [];
    const mime = getSupportedMimeType();
    
    try {
        mediaRecorder = new MediaRecorder(streamRef, mime ? { mimeType: mime } : {});
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            log("스트림 디코더 빌드 변환 가동 중...");
            const blob = new Blob(recordedChunks, { type: mime || 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            const ext = mime.includes('webm') ? 'webm' : 'mp4';
            a.download = `kukgung_${Date.now()}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            activeVideoRoll = phoneRollAtRecord;
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start(1000); 
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.innerText = "STOP";
        log("● 자세 촬영 녹화 진행 중...");
    } catch (e) {
        log("미디어 레코더 기동 샌드박스 예외: " + e.message);
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerText = "";
    }
}

// 탭 모드 체인저 및 이벤트 바인딩
document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = async () => {
    switchMode('analyze');
    await ensurePoseModelLoaded();
};

document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        activeVideoRoll = 0; 
        loadVideoForAnalysis(URL.createObjectURL(file));
    }
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
        ensurePoseModelLoaded();
        
        // ⚡ 터치 분석 엔진 코어 기동 스위치 온
        bowAnalyzer.init();
        
        v.onseeked = () => {
            const ctx = oc.getContext('2d');
            ctx.drawImage(v, 0, 0, oc.width, oc.height);
            log(`분석 대상 프레임 배치 완료 ${window.isMobileDevice ? `(기울기 보정치: ${activeVideoRoll.toFixed(1)}°)` : '(PC 모드)'}`);
        };
    };
}

// ⏩ 프레임 미세 전후방 컨트롤러 추가 기능 연동 리스너
document.getElementById('btn-video-prev').onclick = () => {
    if(window.analysisVideo) window.analysisVideo.currentTime = Math.max(0, window.analysisVideo.currentTime - 0.1);
};
document.getElementById('btn-video-next').onclick = () => {
    if(window.analysisVideo) window.analysisVideo.currentTime = Math.min(window.analysisVideo.duration, window.analysisVideo.currentTime + 0.1);
};
document.getElementById('btn-video-play').onclick = () => {
    if(window.analysisVideo) {
        if(window.analysisVideo.paused) window.analysisVideo.play();
        else window.analysisVideo.pause();
    }
};
document.getElementById('btn-clear-draw').onclick = () => {
    if (bowAnalyzer) bowAnalyzer.clear();
};

// 물리 기동
initApp();

import { DynamicLeveler } from './sensor.js';
import { BowAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 
let bowAnalyzer = new BowAnalyzer();

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const statusText = document.getElementById('status-text');

const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

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

async function initApp() {
    window.isMobileDevice = checkMobile();

    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none';
        if (statusText) statusText.innerText = "PC 에뮬레이션 모드";
        document.getElementById('angle-text').innerText = "가상 고정";
        recordBtn.style.border = '5px solid #007aff';
        recordBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.2)';
    }

    document.getElementById('btn-permission').onclick = async () => {
        if (statusText) statusText.innerText = "카메라 장치 탐색 중...";
        
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
            if (statusText && window.isMobileDevice) statusText.innerText = "촬영 준비 완료";
            
            setTimeout(async () => {
                if (window.isMobileDevice) {
                    try { await leveler.init(); } catch(e) {}
                }
            }, 100);

        } catch (err) {
            // ⚡ [PC 하드웨어 무부재 긴급 구제 패치] 웹캠/수평계가 아예 없어도 무조건 허용 처리
            console.warn("실물 카메라 미감지: PC 분석 가상 테스트 모드로 진입합니다.");
            document.getElementById('permission-overlay').style.display = 'none';
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            
            if (statusText) statusText.innerText = "PC 수동 업로드 대기중";
            
            // 실물 기기가 없으므로 가상의 연습용 캔버스 도화지 백그라운드를 즉시 가마운트 유도
            loadDummyCanvasForPC();
        }
    };

    let lastTriggerTime = 0;
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const now = Date.now();
        if (now - lastTriggerTime < 300) return; 
        lastTriggerTime = now;

        // 웹캠이 있는 경우에만 실물 녹화 제어
        if (streamRef) {
            if (!isRecording) startRecording();
            else stopRecording();
        } else {
            // 웹캠이 없는 PC일 경우 셔터를 누르면 로컬 하드디스크의 동영상 수동 파일업로드 창을 즉시 오픈
            document.getElementById('file-upload').click();
        }
    };

    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });
}

// ⚡ 웹캠이 전혀 없는 데스크톱용 가상 정지 화면 백그라운드 강제 빌더
function loadDummyCanvasForPC() {
    const dc = document.getElementById('drawing-canvas');
    const oc = document.getElementById('output-canvas');
    
    // 일반적인 HD 비디오 해상도 규격을 가상 매핑
    dc.width = oc.width = 1280;
    dc.height = oc.height = 720;
    
    switchMode('analyze');
    bowAnalyzer.init();
    
    const ctx = oc.getContext('2d');
    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, oc.width, oc.height);
    
    // 안내 텍스트 렌더링
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏹 하단 [영상 파일 업로드 분석] 버튼을 눌러', oc.width / 2, oc.height / 2 - 20);
    ctx.fillText('보유하고 계신 국궁 동영상을 넣으면 각도 측정이 가능합니다.', oc.width / 2, oc.height / 2 + 30);
}

async function startRecording() {
    if (!streamRef) return;
    recordedChunks = [];
    const mime = getSupportedMimeType();
    
    try {
        mediaRecorder = new MediaRecorder(streamRef, mime ? { mimeType: mime } : {});
        mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
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
    } catch (e) {
        console.error(e);
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

document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');

document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files[0]; // 배열 버그 예외 노출 전면 고정
    if (file) {
        activeVideoRoll = 0; 
        loadVideoForAnalysis(URL.createObjectURL(file));
    }
};

function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
    
    document.getElementById('btn-mode-shoot').classList.toggle('active', mode === 'shoot');
    document.getElementById('btn-mode-analyze').classList.toggle('active', mode === 'analyze');

    const actionZone = document.querySelector('.action-zone');
    if (actionZone) {
        actionZone.classList.toggle('hidden', mode === 'analyze');
    }
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
        
        bowAnalyzer.init(); 
        
        v.onseeked = () => {
            const ctx = oc.getContext('2d');
            ctx.drawImage(v, 0, 0, oc.width, oc.height);
        };
    };
}

document.getElementById('btn-video-prev').onclick = () => { if(window.analysisVideo) window.analysisVideo.currentTime = Math.max(0, window.analysisVideo.currentTime - 0.1); };
document.getElementById('btn-video-next').onclick = () => { if(window.analysisVideo) window.analysisVideo.currentTime = Math.min(window.analysisVideo.duration, window.analysisVideo.currentTime + 0.1); };
document.getElementById('btn-video-play').onclick = () => { 
    if(window.analysisVideo) {
        if(window.analysisVideo.paused) window.analysisVideo.play();
        else window.analysisVideo.pause();
    }
};
document.getElementById('btn-clear-draw').onclick = () => { if (bowAnalyzer) bowAnalyzer.clear(); };

initApp();

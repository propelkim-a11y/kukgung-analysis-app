import { DynamicLeveler } from './sensor.js';
import { BowAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 

// 글로벌 인스턴스 마운트
let bowAnalyzer = new BowAnalyzer();

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const statusText = document.getElementById('status-text');

// 1. 수평계 클래스 인스턴스 연동
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 2. 범용 녹화 코덱 감지 구문
function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp8', 'video/mp4;codecs=avc1', 'video/webm', 'video/mp4'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

// 3. 접속 디바이스 환경 검사기
function checkMobile() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 4. 어플리케이션 초기화 구문
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
            console.warn("실물 카메라 미감지: PC 분석 전용 모드로 진입합니다.");
            document.getElementById('permission-overlay').style.display = 'none';
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            if (statusText) statusText.innerText = "수동 영상 분석 대기";
            loadDummyCanvasForPC();
        }
    };

    let lastTriggerTime = 0;
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const now = Date.now();
        if (now - lastTriggerTime < 300) return; 
        lastTriggerTime = now;

        if (streamRef) {
            if (!isRecording) startRecording();
            else stopRecording();
        } else {
            const fileInput = document.getElementById('file-upload');
            if (fileInput) fileInput.click();
        }
    };

    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });
}

// 5. 웹캠이 없는 PC용 가상 캔버스 안내 도화지 빌더
function loadDummyCanvasForPC() {
    const dc = document.getElementById('drawing-canvas');
    const oc = document.getElementById('output-canvas');
    const container = document.getElementById('manual-analysis-box');
    
    const rect = container.getBoundingClientRect();
    dc.width = oc.width = rect.width;
    dc.height = oc.height = rect.height;
    
    switchMode('analyze');
    bowAnalyzer.init();
    
    const ctx = oc.getContext('2d');
    ctx.fillStyle = '#111113';
    ctx.fillRect(0, 0, oc.width, oc.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏹 하단 [영상 파일 업로드 분석] 버튼을 눌러', oc.width / 2, oc.height / 2 - 20);
    ctx.fillText('보유하고 계신 국궁 동영상을 넣으면 자유로운 각도 측정이 가능합니다.', oc.width / 2, oc.height / 2 + 30);
}
// 6. 비디오 녹화 시작 구문
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

// 7. 비디오 녹화 중지 구문
async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerText = "";
    }
}

// 8. 모드 전환 리스너 매핑
document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');

// 9. 로컬 동영상 파일 인젝션 이벤트
const fileUploadInput = document.getElementById('file-upload');
if (fileUploadInput) {
    fileUploadInput.onchange = (e) => {
        const file = e.target.files;
        if (file && file[0]) {
            activeVideoRoll = 0; 
            loadVideoForAnalysis(URL.createObjectURL(file[0]));
        }
    };
}

// 10. 상하단 레이아웃 분리 모듈
function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
    
    document.getElementById('btn-mode-shoot').classList.toggle('active', mode === 'shoot');
    document.getElementById('btn-mode-analyze').classList.toggle('active', mode === 'analyze');

    const actionZone = document.querySelector('.action-zone');
    const headerElement = document.querySelector('.header');
    
    if (mode === 'analyze') {
        if (actionZone) actionZone.classList.add('hidden');
        if (headerElement) headerElement.classList.add('hidden'); 
    } else {
        if (actionZone) actionZone.classList.remove('hidden');
        if (headerElement) headerElement.classList.remove('hidden'); 
    }
}

// 11. 분석 화면 동적 데이터 마운트 로더 (전체화면 비율 패치 반영)
function loadVideoForAnalysis(url) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true;
    window.analysisVideo = v;
    
    v.onloadedmetadata = () => {
        const dc = document.getElementById('drawing-canvas');
        const oc = document.getElementById('output-canvas');
        const timeline = document.getElementById('video-timeline');
        const container = document.getElementById('manual-analysis-box');
        
        // ⚡ [전체화면 패치] 물리 컨테이너 화면을 꽉 채우도록 캔버스 크기 강제 동기화
        const rect = container.getBoundingClientRect();
        dc.width = oc.width = rect.width;
        dc.height = oc.height = rect.height;
        
        if (timeline) {
            timeline.min = 0;
            timeline.max = v.duration;
            timeline.value = 0;
            timeline.step = 0.01;
        }
        
        v.currentTime = 0.1; 
        switchMode('analyze');
        
        bowAnalyzer.init(); 
        
        v.onseeked = () => {
            renderFrame();
        };
        
        v.onplay = () => {
            const updateLoop = () => {
                if (!v.paused && !v.ended) {
                    renderFrame();
                    if (timeline) timeline.value = v.currentTime;
                    requestAnimationFrame(updateLoop);
                }
            };
            requestAnimationFrame(updateLoop);
        };
    };
}

// 12. 현재 비디오 프레임을 전체 크기에 고르게 투사하는 렌더링 함수
function renderFrame() {
    const v = window.analysisVideo;
    const oc = document.getElementById('output-canvas');
    if (!v || !oc) return;
    const ctx = oc.getContext('2d');
    ctx.clearRect(0, 0, oc.width, oc.height);
    
    // ⚡ [전체화면 패치] cover 스타일 연출을 위해 가로세로를 캔버스 규격에 완전히 맞춰서 드로잉
    ctx.drawImage(v, 0, 0, oc.width, oc.height);
}

// 13. 슬라이더 및 재생 제어 바인딩
const timelineSlider = document.getElementById('video-timeline');
if (timelineSlider) {
    timelineSlider.addEventListener('input', (e) => {
        if (window.analysisVideo) {
            window.analysisVideo.pause(); 
            window.analysisVideo.currentTime = parseFloat(e.target.value);
            document.getElementById('btn-video-play').innerText = "▶️ 재생";
        }
    });
}

document.getElementById('btn-video-prev').onclick = () => { 
    if(window.analysisVideo) {
        window.analysisVideo.pause();
        window.analysisVideo.currentTime = Math.max(0, window.analysisVideo.currentTime - 0.1);
        if (timelineSlider) timelineSlider.value = window.analysisVideo.currentTime;
        document.getElementById('btn-video-play').innerText = "▶️ 재생";
    }
};

document.getElementById('btn-video-next').onclick = () => { 
    if(window.analysisVideo) {
        window.analysisVideo.pause();
        window.analysisVideo.currentTime = Math.min(window.analysisVideo.duration, window.analysisVideo.currentTime + 0.1);
        if (timelineSlider) timelineSlider.value = window.analysisVideo.currentTime;
        document.getElementById('btn-video-play').innerText = "▶️ 재생";
    }
};

document.getElementById('btn-video-play').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        if(v.paused) {
            v.play();
            document.getElementById('btn-video-play').innerText = "⏸️ 정지";
        } else {
            v.pause();
            document.getElementById('btn-video-play').innerText = "▶️ 재생";
        }
    }
};

// 14. 드로잉 캔버스 초기화 리스너
document.getElementById('btn-clear-draw').onclick = () => { 
    if (bowAnalyzer) bowAnalyzer.clear(); 
};

initApp();

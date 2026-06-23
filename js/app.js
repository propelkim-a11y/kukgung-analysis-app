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

    // ⚡ [신설] 선 긋기 모드와 화면 이동/확대 제어 스위칭 리스너 결합
    document.getElementById('btn-tool-draw').onclick = () => {
        document.getElementById('btn-tool-draw').classList.add('active');
        document.getElementById('btn-tool-move').classList.remove('active');
        bowAnalyzer.setToolMode('draw');
    };

    document.getElementById('btn-tool-move').onclick = () => {
        document.getElementById('btn-tool-move').classList.add('active');
        document.getElementById('btn-tool-draw').classList.remove('active');
        bowAnalyzer.setToolMode('move');
    };
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
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏹 하단 [영상 업로드 분석] 버튼을 눌러', oc.width / 2, oc.height / 2 - 20);
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
            
            // 로컬 장치 원본 자동 보관 다운로더
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

// 10. 상하단 레이아웃 분리 모듈 (패널 대통합 버그 패치 버전)
function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
    
    document.getElementById('btn-mode-shoot').classList.toggle('active', mode === 'shoot');
    document.getElementById('btn-mode-analyze').classList.toggle('active', mode === 'analyze');

    // ⚡ [대통합 패치] 통합 제어 센터 내부의 분석 전용 컴포넌트 출력 전환 제어
    const analysisComponents = document.getElementById('analysis-components');
    const headerElement = document.querySelector('.header');
    const recordBtnContainer = document.querySelector('.action-zone');
    
    if (mode === 'analyze') {
        if (analysisComponents) analysisComponents.classList.remove('hidden');
        if (recordBtnContainer) recordBtnContainer.classList.add('hidden'); // 녹화 버튼 격리 숨김
        if (headerElement) headerElement.classList.add('hidden'); // 수평계 메시지 숨김
    } else {
        if (analysisComponents) analysisComponents.classList.add('hidden');
        if (recordBtnContainer) recordBtnContainer.classList.remove('hidden'); // 녹화 버튼 복구
        if (headerElement) headerElement.classList.remove('hidden'); // 수평계 메시지 복구
    }
}

// 11. 분석 화면 동적 데이터 마운트 로더
function loadVideoForAnalysis(url) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true;
    window.analysisVideo = v;
    
    v.onloadedmetadata = () => {
        const dc = document.getElementById('drawing-canvas');
        const oc = document.getElementById('output-canvas');
        const timeline = document.getElementById('video-timeline');
        const container = document.getElementById('manual-analysis-box');
        
        // 도화지 박스 정비례 크기로 캔버스 해상도 강제 맞춤 고정
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
        
        // 직선 그리드 피치 투 줌 마운트
        bowAnalyzer.init(); 
        
        v.onseeked = () => {
            if (bowAnalyzer) bowAnalyzer.draw();
        };
        
        v.onplay = () => {
            const updateLoop = () => {
                if (!v.paused && !v.ended) {
                    if (bowAnalyzer) bowAnalyzer.draw();
                    if (timeline) timeline.value = v.currentTime;
                    requestAnimationFrame(updateLoop);
                }
            };
            requestAnimationFrame(updateLoop);
        };
    };
}

// 12. 슬라이더 및 재생 제어 바인딩
const timelineSlider = document.getElementById('video-timeline');
if (timelineSlider) {
    timelineSlider.addEventListener('input', (e) => {
        const v = window.analysisVideo;
        if (v) {
            v.pause(); 
            v.currentTime = parseFloat(e.target.value);
            document.getElementById('btn-video-play').innerText = "▶️ 재생";
        }
    });
}

document.getElementById('btn-video-prev').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        v.pause();
        v.currentTime = Math.max(0, v.currentTime - 0.1);
        if (timelineSlider) timelineSlider.value = v.currentTime;
        document.getElementById('btn-video-play').innerText = "▶️ 재생";
    }
};

document.getElementById('btn-video-next').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        v.pause();
        v.currentTime = Math.min(v.duration, v.currentTime + 0.1);
        if (timelineSlider) timelineSlider.value = v.currentTime;
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

document.getElementById('btn-clear-draw').onclick = () => { 
    if (bowAnalyzer) bowAnalyzer.clear(); 
};

initApp();

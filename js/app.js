import { DynamicLeveler } from './sensor.js';
import { BowAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 

// 글로벌 분석 인스턴스 마운트
let bowAnalyzer = new BowAnalyzer();

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const statusText = document.getElementById('status-text');

// 1. 기기 실시간 자이로 수평계 연동
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 2. 사파리/크롬 모바일 환경 최적 코덱 선별기
function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp8', 'video/mp4;codecs=avc1', 'video/webm', 'video/mp4'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

// 3. 브라우저 접속 환경 모바일 검사 로직
function checkMobile() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 4. 어플리케이션 스타터 및 스위치 기동
async function initApp() {
    window.isMobileDevice = checkMobile();

    // PC 디바이스 환경 전용 예외 스킵 처리
    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none';
        if (statusText) statusText.innerText = "PC 에뮬레이션 분석 모드";
        document.getElementById('angle-text').innerText = "고정";
        recordBtn.style.border = '5px solid #007aff';
        recordBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.2)';
    }

    // 진입 권한 팝업 버튼 허용 클릭 리스너
    document.getElementById('btn-permission').onclick = async () => {
        if (statusText) statusText.innerText = "카메라 노드 연결 중...";
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
            document.getElementById('permission-overlay').style.display = 'none';
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            if (statusText) statusText.innerText = "수동 영상 파일 대기 중";
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

    // ⚡ [텍스트 연동 패치] 4대 버튼에 따른 동적 인터랙션 및 클래스 활성화 조율 리스너
    document.getElementById('btn-tool-move').onclick = () => {
        setActiveToolButton('btn-tool-move');
        bowAnalyzer.setToolMode('move');
    };

    document.getElementById('btn-tool-draw').onclick = () => {
        setActiveToolButton('btn-tool-draw');
        bowAnalyzer.setToolMode('draw');
    };
}

// ⚡ [신설] 하단 4대 텍스트 메뉴의 불빛(Active) 상태를 강제로 통제하는 토글 도구
function setActiveToolButton(activeId) {
    const txtButtons = [document.getElementById('upload-label'), document.getElementById('btn-tool-move'), document.getElementById('btn-tool-draw')];
    txtButtons.forEach(btn => {
        if (btn) {
            if (btn.id === activeId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
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

// 9. 파일 데이터 읽기 참조 연동
const fileUploadInput = document.getElementById('file-upload');
if (fileUploadInput) {
    fileUploadInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            activeVideoRoll = 0; 
            // ⚡ 파일 선택 시 자동으로 '열기' 버튼 하이라이트 활성화 연동
            setActiveToolButton('upload-label');
            bowAnalyzer.setToolMode('move'); // 업로드 직후엔 안전하게 이동/확대 기본화
            loadVideoForAnalysis(URL.createObjectURL(e.target.files[0]));
        }
    };
}

// 10. 상하단 레이아웃 분리 모듈
function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
    
    document.getElementById('btn-mode-shoot').classList.toggle('active', mode === 'shoot');
    document.getElementById('btn-mode-analyze').classList.toggle('active', mode === 'analyze');

    const analysisComponents = document.getElementById('analysis-components');
    const shootComponents = document.getElementById('shoot-components');
    const headerElement = document.querySelector('.header');
    
    if (mode === 'analyze') {
        if (analysisComponents) analysisComponents.classList.remove('hidden'); 
        if (shootComponents) shootComponents.classList.add('hidden'); 
        if (headerElement) headerElement.classList.add('hidden'); 
        
        // ⚡ [핵심 요구사항 반영] 분석하기 클릭 시 최초 세팅은 언제나 '열기' 단추가 활성화(Active) 상태가 되도록 제어
        setActiveToolButton('upload-label');
        bowAnalyzer.setToolMode('move'); // 열기 상태에 어울리는 안전한 기본 툴 세팅
    } else {
        if (analysisComponents) analysisComponents.add('hidden'); 
        if (shootComponents) shootComponents.classList.remove('hidden'); 
        if (headerElement) headerElement.classList.remove('hidden'); 
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

// 초당 30프레임 표준 1프레임 단위(0.033초) 미세 정밀 조작
const FRAME_TIME = 1 / 30; 

document.getElementById('btn-video-prev').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        v.pause();
        v.currentTime = Math.max(0, v.currentTime - FRAME_TIME); 
        if (timelineSlider) timelineSlider.value = v.currentTime;
        document.getElementById('btn-video-play').innerText = "▶️ 재생";
    }
};

document.getElementById('btn-video-next').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        v.pause();
        v.currentTime = Math.min(v.duration, v.currentTime + FRAME_TIME); 
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

initApp();

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

// ⚡ [신설] 대용량 비디오 파일 영구 기억용 IndexedDB 브릿지 유틸리티 클래스
const videoStore = {
    dbName: 'KukgungVideoDB',
    storeName: 'last_video_store',
    
    init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = () => resolve(null);
        });
    },
    async save(blob) {
        const db = await this.init();
        if (!db) return;
        return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.put(blob, 'saved_file');
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    },
    async load() {
        const db = await this.init();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get('saved_file');
            request.onsuccess = (e) => resolve(e.target.result || null);
            request.onerror = () => resolve(null);
        });
    }
};

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
            console.warn("카메라 장치 무부재: 우회 처리 진입");
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

    // 4대 버튼 인터랙션 리스너
    document.getElementById('btn-tool-move').onclick = () => {
        setActiveToolButton('btn-tool-move');
        bowAnalyzer.setToolMode('move');
    };

    document.getElementById('btn-tool-draw').onclick = () => {
        setActiveToolButton('btn-tool-draw');
        bowAnalyzer.setToolMode('draw');
    };

    // 하단 컨트롤 패널 터치 개폐 인터랙션 스위치
    const panel = document.getElementById('unified-control-center');
    const handle = document.getElementById('panel-handle');
    if (handle && panel) {
        handle.onclick = (e) => {
            e.preventDefault();
            panel.classList.toggle('collapsed'); 
        };
    }

    // ⚡ [신설 핵심 복원식] 앱이 켜지자마자 백그라운드 데이터베이스에서 지난번 분석용 비디오 자동 로드 검사 수행
    try {
        const savedBlob = await videoStore.load();
        if (savedBlob) {
            console.log("💾 지난 회차 마지막 분석 영상 복원 파이프라인 가동 성공.");
            activeVideoRoll = parseFloat(localStorage.getItem('saved_video_roll') || '0');
            loadVideoForAnalysis(URL.createObjectURL(savedBlob));
        }
    } catch (e) {
        console.warn("자동 복원 버퍼 유예", e);
    }
}

// 하단 4대 텍스트 메뉴의 불빛(Active) 상태 통제 도구
function setActiveToolButton(activeId) {
    const txtButtons = [document.getElementById('upload-label'), document.getElementById('btn-tool-move'), document.getElementById('btn-tool-draw')];
    txtButtons.forEach(btn => {
        if (btn) {
            if (btn.id === activeId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

// 가상 캔버스 안내 도화지 빌더
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
        mediaRecorder.onstop = async () => {
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
            
            // ⚡ [자동 복원 패치] 촬영된 비디오 데이터를 IndexedDB 및 로컬스토리지 백업 저장소에 실시간 캐싱 동기화
            try {
                await videoStore.save(blob);
                localStorage.setItem('saved_video_roll', activeVideoRoll.toString());
            } catch (err) { console.error("촬영 저장소 버퍼 실패", err); }

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

// 9. 파일 데이터 읽기 참조 연동 (수동 업로드 파트)
const fileUploadInput = document.getElementById('file-upload');
if (fileUploadInput) {
    fileUploadInput.onchange = async (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]; 
            activeVideoRoll = 0; 
            
            // ⚡ [자동 복원 패치] 사용자가 수동 업로드한 파일 블록도 다음 구동 시 자동 복제되도록 영구 보관소에 동기화
            try {
                await videoStore.save(file);
                localStorage.setItem('saved_video_roll', '0');
            } catch (err) { console.error("업로드 저장소 버퍼 실패", err); }

            setActiveToolButton('upload-label');
            bowAnalyzer.setToolMode('move'); 
            loadVideoForAnalysis(URL.createObjectURL(file));
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
    
    const panel = document.getElementById('unified-control-center');
    if (panel) panel.classList.remove('collapsed');

    if (mode === 'analyze') {
        if (analysisComponents) analysisComponents.classList.remove('hidden'); 
        if (shootComponents) shootComponents.classList.add('hidden'); 
        if (headerElement) headerElement.classList.add('hidden'); 
        
        setActiveToolButton('upload-label');
        bowAnalyzer.setToolMode('move'); 
    } else {
        if (analysisComponents) analysisComponents.classList.add('hidden'); 
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
            document.getElementById('btn-video-play').innerText = "재생";
        }
    });
}

// 초당 30프레임 표준 1프레임 단위(0.033초) 미세 정밀 조작
const FRAME_TIME = 1 / 30; 

// ⚡ [텍스트 전환 패치] 기민한 1프레임 정밀 역탐색 제어
document.getElementById('btn-video-prev').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        v.pause();
        v.currentTime = Math.max(0, v.currentTime - FRAME_TIME); 
        if (timelineSlider) timelineSlider.value = v.currentTime;
        document.getElementById('btn-video-play').innerText = "재생";
    }
};

// ⚡ [텍스트 전환 패치] 기민한 1프레임 정밀 정탐색 제어
document.getElementById('btn-video-next').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        v.pause();
        v.currentTime = Math.min(v.duration, v.currentTime + FRAME_TIME); 
        if (timelineSlider) timelineSlider.value = v.currentTime;
        document.getElementById('btn-video-play').innerText = "재생";
    }
};

// ⚡ [텍스트 전환 패치] 세련된 텍스트 전환 리스너
document.getElementById('btn-video-play').onclick = () => { 
    const v = window.analysisVideo;
    if(v) {
        if(v.paused) {
            v.play();
            document.getElementById('btn-video-play').innerText = "정지";
        } else {
            v.pause();
            document.getElementById('btn-video-play').innerText = "재생";
        }
    }
};

// 텍스트 버튼 초기화 클릭 이벤트 리스너 복구 보존
document.getElementById('btn-clear-draw').onclick = () => { 
    if (bowAnalyzer) bowAnalyzer.clear(); 
};

initApp();

/**
 * app.js (1번째 조각)
 * 국궁 자세 분석 어플리케이션 전체 인프라 동기화 및 라이프사이클 통제 메인 허브
 */
import { DynamicLeveler } from './sensor.js';
import { BowAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 

// 글로벌 분석 인스턴스 싱글톤 마운트
let bowAnalyzer = new BowAnalyzer();

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const statusText = document.getElementById('status-text');

// 기기 실시간 자이로 수평계 이벤트 연동 결속
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        // 규격 수평 오차 만족 상태에 따라 셔터 테두리 불빛 색상 치환 피드백
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

/**
 * 접속 디바이스 환경 범용 녹화 코덱 정밀 탐지기
 */
function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp8', 'video/mp4;codecs=avc1', 'video/webm', 'video/mp4'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

/**
 * 접속 유저 모바일/PC 물리 장치 에뮬레이션 상태 판별 검사기
 */
function checkMobile() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * [규격 6: 대용량 비디오 파일 영구 기억용 IndexedDB 인프라 데이터베이스 구축]
 * 브라우저 샌드박스 제한을 해제하고 대용량 캐시 유지가 가능한 영구 저장 스토리지 파이프라인
 */
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
/**
 * 어플리케이션 시스템 엔트리포인트 코어 초기화 명세
 */
async function initApp() {
    window.isMobileDevice = checkMobile();

    // PC 환경 접속 시 상용 수평계 UI 에뮬레이션 바이패스 처리
    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none';
        if (statusText) statusText.innerText = "PC 에뮬레이션 분석 모드";
        const angleTextHUD = document.getElementById('angle-text');
        if (angleTextHUD) angleTextHUD.innerText = "고정";
        if (recordBtn) {
            recordBtn.style.border = '5px solid #007aff';
            recordBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.2)';
        }
    }

    // 팝업 권한 허용 및 스트림 터널 개방 점화 구문
    const btnPermission = document.getElementById('btn-permission');
    if (btnPermission) {
        btnPermission.onclick = async () => {
            if (statusText) statusText.innerText = "카메라 노드 연결 중...";
            const videoConstraints = window.isMobileDevice 
                ? { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

            try {
                streamRef = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
                if (video) {
                    video.srcObject = streamRef;
                    await video.play();
                }
                
                const overlay = document.getElementById('permission-overlay');
                if (overlay) overlay.style.display = 'none';
                
                if (recordBtn) {
                    recordBtn.style.zIndex = '99999'; 
                    recordBtn.style.pointerEvents = 'auto';
                }
                if (statusText && window.isMobileDevice) statusText.innerText = "촬영 준비 완료";
                
                setTimeout(async () => {
                    if (window.isMobileDevice) {
                        try { await leveler.init(); } catch(e) { console.error(e); }
                    }
                }, 100);
            } catch (err) {
                const overlay = document.getElementById('permission-overlay');
                if (overlay) overlay.style.display = 'none';
                if (recordBtn) {
                    recordBtn.style.zIndex = '99999'; 
                    recordBtn.style.pointerEvents = 'auto';
                }
                if (statusText) statusText.innerText = "수동 영상 파일 대기 중";
                loadDummyCanvasForPC();
            }
        };
    }

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

    if (recordBtn) {
        recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
        recordBtn.addEventListener('click', handleAction, { capture: true });
    }

    const btnToolMove = document.getElementById('btn-tool-move');
    if (btnToolMove) {
        btnToolMove.onclick = () => {
            setActiveToolButton('btn-tool-move');
            bowAnalyzer.setToolMode('move');
        };
    }

    const btnToolDraw = document.getElementById('btn-tool-draw');
    if (btnToolDraw) {
        btnToolDraw.onclick = () => {
            setActiveToolButton('btn-tool-draw');
            bowAnalyzer.setToolMode('draw');
        };
    }

    // [규격 10] 하단 컨트롤 패널 터치 개폐 인터랙션 핸들 바인딩
    const panel = document.getElementById('unified-control-center');
    const handle = document.getElementById('panel-handle');
    if (handle && panel) {
        handle.onclick = (e) => {
            e.preventDefault();
            panel.classList.toggle('collapsed'); 
        };
    }

    // [규격 6] 앱 기동 즉시 지난번 최종 동영상이 보관소에 남아있다면 100% 자동 영구 복원 점화
    try {
        const savedBlob = await videoStore.load();
        if (savedBlob) {
            console.log("💾 이전 분석 비디오 자동 복구 파이프라인 무사 기동 완료.");
            activeVideoRoll = parseFloat(localStorage.getItem('saved_video_roll') || '0');
            loadVideoForAnalysis(URL.createObjectURL(savedBlob));
        }
    } catch (e) { console.warn("복원 유예", e); }
}
/**
 * 4대 메뉴 상단 단추 전용 가로폭 25% 라이트 활성화 체인저
 */
function setActiveToolButton(activeId) {
    const txtButtons = [
        document.getElementById('upload-label'), 
        document.getElementById('btn-tool-move'), 
        document.getElementById('btn-tool-draw')
    ];
    txtButtons.forEach(btn => {
        if (btn) {
            if (btn.id === activeId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

function loadDummyCanvasForPC() {
    const dc = document.getElementById('drawing-canvas');
    const oc = document.getElementById('output-canvas');
    const container = document.getElementById('manual-analysis-box');
    
    if (container && dc && oc) {
        const rect = container.getBoundingClientRect();
        dc.width = oc.width = rect.width;
        dc.height = oc.height = rect.height;
    }
    
    switchMode('analyze');
    bowAnalyzer.init();
}

/**
 * 비디오 카메라 캔버스 소스 실시간 인코딩 레코딩 개시 구문
 */
async function startRecording() {
    if (!streamRef) return;
    recordedChunks = [];
    const mime = getSupportedMimeType();
    
    try {
        mediaRecorder = new MediaRecorder(streamRef, mime ? { mimeType: mime } : {});
        mediaRecorder.ondataavailable = (e) => { 
            if (e.data && e.data.size > 0) recordedChunks.push(e.data); 
        };
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
            
            // ⚡ [자동 복원] 촬영된 비디오 데이터를 IndexedDB 및 로컬스토리지 백업 저장소에 실시간 캐싱 동기화
            try {
                await videoStore.save(blob);
                localStorage.setItem('saved_video_roll', activeVideoRoll.toString());
            } catch (err) { console.error("촬영 저장소 버퍼 실패", err); }

            loadVideoForAnalysis(url);
        };
        mediaRecorder.start(1000); 
        isRecording = true;
        if (recordBtn) recordBtn.classList.add('recording');
    } catch (e) {
        console.error(e);
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        if (recordBtn) recordBtn.classList.remove('recording');
    }
}

// 탭 스위치 전환 이벤트 결속
const btnModeShoot = document.getElementById('btn-mode-shoot');
if (btnModeShoot) btnModeShoot.onclick = () => switchMode('shoot');

const btnModeAnalyze = document.getElementById('btn-mode-analyze');
if (btnModeAnalyze) btnModeAnalyze.onclick = () => switchMode('analyze');

// 파일 수동 선택 로더 파이프라인
const fileUploadInput = document.getElementById('file-upload');
if (fileUploadInput) {
    fileUploadInput.onchange = async (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]; 
            activeVideoRoll = 0; 
            
            // ⚡ [자동 복원] 사용자가 수동 업로드한 파일 블록도 다음 구동 시 자동 복제되도록 영구 보관소에 동기화
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

/**
 * [규격 4] 촬영하기 / 분석하기 핵심 뷰포트 상태 전환 스위치 엔진
 */
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
        
        // 규격 4: 분석하기 최초 진입 제어 규칙 동기 가동
        setActiveToolButton('upload-label');
        bowAnalyzer.setToolMode('move'); 
    } else {
        if (analysisComponents) analysisComponents.classList.add('hidden'); 
        if (shootComponents) shootComponents.remove('hidden'); 
        if (headerElement) headerElement.classList.remove('hidden'); 
    }
}

/**
 * 비디오 파이프라인 마운트 핸들러 및 프레임 레이트 틱 루프 바인딩
 */
function loadVideoForAnalysis(url) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true;
    window.analysisVideo = v;
    
    v.onloadedmetadata = () => {
        const dc = document.getElementById('drawing-canvas');
        const oc = document.getElementById('output-canvas');
        const timeline = document.getElementById('video-timeline');
        const container = document.getElementById('manual-analysis-box');
        
        if (container && dc && oc) {
            const rect = container.getBoundingClientRect();
            dc.width = oc.width = rect.width;
            dc.height = oc.height = rect.height;
        }
        
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

// 비디오 프레임 재생 트랙 타임라인 인풋 동기화
const timelineSlider = document.getElementById('video-timeline');
if (timelineSlider) {
    timelineSlider.addEventListener('input', (e) => {
        const v = window.analysisVideo;
        if (v) {
            v.pause(); 
            v.currentTime = parseFloat(e.target.value);
            const btnPlay = document.getElementById('btn-video-play');
            if (btnPlay) btnPlay.innerText = "재생";
        }
    });
}

// [규격 5] 초당 30프레임 표준 정밀 규격 세팅 (1클릭 = 1프레임 = 약 0.033초)
const FRAME_TIME = 1 / 30; 

// 뒤로 미세 이동
const btnVideoPrev = document.getElementById('btn-video-prev');
if (btnVideoPrev) {
    btnVideoPrev.onclick = () => { 
        const v = window.analysisVideo;
        if (v) {
            v.pause();
            v.currentTime = Math.max(0, v.currentTime - FRAME_TIME); 
            if (timelineSlider) timelineSlider.value = v.currentTime;
            const btnPlay = document.getElementById('btn-video-play');
            if (btnPlay) btnPlay.innerText = "재생";
        }
    };
}

// 앞으로 미세 이동
const btnVideoNext = document.getElementById('btn-video-next');
if (btnVideoNext) {
    btnVideoNext.onclick = () => { 
        const v = window.analysisVideo;
        if (v) {
            v.pause();
            v.currentTime = Math.min(v.duration, v.currentTime + FRAME_TIME); 
            if (timelineSlider) timelineSlider.value = v.currentTime;
            const btnPlay = document.getElementById('btn-video-play');
            if (btnPlay) btnPlay.innerText = "재생";
        }
    };
}

// 재생 및 일시정지 토글 컨트롤러
const btnVideoPlay = document.getElementById('btn-video-play');
if (btnVideoPlay) {
    btnVideoPlay.onclick = () => { 
        const v = window.analysisVideo;
        if (v) {
            if (v.paused) {
                v.play();
                btnVideoPlay.innerText = "정지";
            } else {
                v.pause();
                btnVideoPlay.innerText = "재생";
            }
        }
    };
}

// [규격 10] 리셋 단추 연동 커맨더
const btnClearDraw = document.getElementById('btn-clear-draw');
if (btnClearDraw) {
    btnClearDraw.onclick = () => { 
        if (bowAnalyzer) bowAnalyzer.clear(); 
    };
}

// 전체 시스템 가동
initApp();

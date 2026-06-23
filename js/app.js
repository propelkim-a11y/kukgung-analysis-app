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

// 기기 실시간 자이로 수평계 연동
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 범용 녹화 코덱 감지 구문
function getSupportedMimeType() {
    const types = ['video/webm;codecs=vp8', 'video/mp4;codecs=avc1', 'video/webm', 'video/mp4'];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

// 접속 디바이스 환경 검사기
function checkMobile() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 대용량 비디오 파일 영구 기억용 IndexedDB 인프라 데이터베이스 구축 객체
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

// 어플리케이션 초기화 구문
async function initApp() {
    window.isMobileDevice = checkMobile();

    // 시작하자마자 첫 화면 모드를 촬영 모드로 초기 가두기 처리 (인터페이스 겹침 원천 차단)
    switchMode('shoot');

    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none';
        if (statusText) statusText.innerText = "PC 에뮬레이션 분석 모드";
        document.getElementById('angle-text').innerText = "고정";
        recordBtn.style.border = '5px solid #007aff';
        recordBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.2)';
    }

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

    document.getElementById('btn-tool-move').onclick = () => {
        setActiveToolButton('btn-tool-move');
        bowAnalyzer.setToolMode('move');
    };

    document.getElementById('btn-tool-draw').onclick = () => {
        setActiveToolButton('btn-tool-draw');
        bowAnalyzer.setToolMode('draw');
    };

    // 하단 컨트롤 패널 터치 개폐 인터랙션 핸들 바인딩
    const panel = document.getElementById('unified-control-center');
    const handle = document.getElementById('panel-handle');
    if (handle && panel) {
        handle.onclick = (e) => {
            e.preventDefault();
            panel.classList.toggle('collapsed'); 
        };
    }

    // 앱 기동 즉시 지난번 최종 동영상이 보관소에 남아있다면 자동 영구 복원 점화
    try {
        const savedBlob = await videoStore.load();
        if (savedBlob) {
            console.log("💾 이전 분석 비디오 자동 복구 파이프라인 무사 기동 완료.");
            activeVideoRoll = parseFloat(localStorage.getItem('saved_video_roll') || '0');
            loadVideoForAnalysis(URL.createObjectURL(savedBlob));
        }
    } catch (e) { console.warn("복원 유예", e); }
}

function setActiveToolButton(activeId) {
    const txtButtons = [document.getElementById('upload-label'), document.getElementById('btn-tool-move'), document.getElementById('btn-tool-draw')];
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
    
    const rect = container.getBoundingClientRect();
    dc.width = oc.width = rect.width;
    dc.height = oc.height = rect.height;
    
    switchMode('analyze');
    bowAnalyzer.init();
}

// 비디오 녹화 시작 구문
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
// 녹화 중지, 모드 전환, 파일 처리 및 비디오 분석 로직 처리
async function stopRecording() { /* ... */ } 
// [생략: 녹화 중지 기능 구현]

// 모드 전환 및 파일 업로드, 분석 비디오 로드, 재생 제어 로직 
// (switchMode, loadVideoForAnalysis, 제어 버튼 이벤트) 포함
// ...

initApp();

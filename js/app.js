import { DynamicLeveler } from './sensor.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');

// 1. 디버깅 전용 상단 실시간 로그 바
let statusLog = document.getElementById('status-log');
if (!statusLog) {
    statusLog = document.createElement('div');
    statusLog.id = 'status-log';
    statusLog.style = 'position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.9); color:#0f0; font-size:11px; z-index:100000; padding:6px; font-weight:bold; pointer-events:none; word-break:break-all;';
    document.body.appendChild(statusLog);
}
function log(m) { statusLog.innerText = m; console.log(m); }

// 2. 수평계 클래스 인스턴스 연동
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 3. 모바일(iOS Safari 포함) 녹화용 크로스브라우징 코덱 감지 구문
function getSupportedMimeType() {
    const types = [
        'video/mp4;codecs=avc1', 
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

// 4. 메인 어플리케이션 초기화 구문
async function initApp() {
    log("앱 엔진 로드 완료. '권한 허용'을 처리해 주세요.");

    document.getElementById('btn-permission').onclick = async () => {
        log("미디어 스트림 장치 승인 대기 중...");
        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, 
                audio: false 
            });
            video.srcObject = streamRef;
            await video.play();
            
            document.getElementById('permission-overlay').style.display = 'none';
            
            // 모바일 뷰 최적화 배치 강제 바인딩
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            
            log("카메라 스트림 연동 성공! 하단 버튼으로 녹화를 제어하세요.");
            
            try { 
                await leveler.init(); 
                log("기기 수평 자이로 센서 활성화 완료.");
            } catch(e) { 
                log("센서 마운트 실패: " + e.message); 
            }
        } catch (err) {
            log("장치 에러 상태: " + err.message);
        }
    };

    // 터치 입력 오버랩 스킵 기능(Debounce)이 적용된 인터랙션 스위치
    let lastTriggerTime = 0;
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        
        const now = Date.now();
        if (now - lastTriggerTime < 300) return; 
        lastTriggerTime = now;

        log("녹화 상태 트리거 감지");
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    };

    // 모바일 터치 및 데스크톱 환경 동시 호환성 확보용 이벤트 리스너 등록
    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });
}

async function startRecording() {
    if (!streamRef) { log("컴포넌트 오류: 활성화된 카메라 노드가 없습니다."); return; }
    
    recordedChunks = [];
    const mime = getSupportedMimeType();
    log(`사용 인코더 코덱: ${mime || '기본 디폴트값'}`);
    
    try {
        const options = mime ? { mimeType: mime } : {};
        mediaRecorder = new MediaRecorder(streamRef, options);
        
        mediaRecorder.ondataavailable = (e) => { 
            if (e.data && e.data.size > 0) recordedChunks.push(e.data); 
        };
        
        mediaRecorder.onstop = () => {
            log("스트림 파일 인코딩 및 컨텍스트 로딩 중...");
            const blob = new Blob(recordedChunks, { type: mime || 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            // 로컬 디바이스 영구 보관용 자동 클립 다운로더
            const a = document.createElement('a');
            a.href = url;
            a.download = `kukgung_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 캡처 시점의 물리 경사 수치를 싱크
            activeVideoRoll = phoneRollAtRecord;
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start(1000); 
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.innerText = "STOP";
        log("● 레코딩 중... 정지하려면 버튼을 터치하세요.");
    } catch (e) {
        log("레코딩 초기화 예외: " + e.message);
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        log("레코딩 중단 처리 중...");
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerText = "";
    }
}

// 상단 토글 및 로컬 비디오 인젝션 리스너
document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');
document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files;
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
        
        v.onseeked = () => {
            const ctx = oc.getContext('2d');
            ctx.drawImage(v, 0, 0, oc.width, oc.height);
            log(`분석 레이어 완료 (수평 보정값: ${activeVideoRoll.toFixed(1)}°)`);
        };
    };
}

// 인스턴스 기동
initApp();

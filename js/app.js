import { DynamicLeveler } from './sensor.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');

// 1. PC 및 모바일 공용 디버깅 상단 로그 바
let statusLog = document.getElementById('status-log');
if (!statusLog) {
    statusLog = document.createElement('div');
    statusLog.id = 'status-log';
    statusLog.style = 'position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.9); color:#0f0; font-size:11px; z-index:100000; padding:6px; font-weight:bold; pointer-events:none; word-break:break-all;';
    document.body.appendChild(statusLog);
}
function log(m) { statusLog.innerText = m; console.log(m); }

// 2. 모바일/PC 유연 변환 수평계 연동
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 3. PC/모바일 범용 최적 코덱 선별기
function getSupportedMimeType() {
    const types = [
        'video/webm;codecs=vp8', // 구글 크롬, PC 브라우저 표준 호환
        'video/mp4;codecs=avc1', // iOS, 모바일 사파리 최고 호환
        'video/webm',
        'video/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; 
}

// 4. 모바일 환경 여부 검사기
function checkMobile() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 5. 어플리케이션 엔진 구동 구문
async function initApp() {
    window.isMobileDevice = checkMobile();
    log(`기기 상태 확인: ${window.isMobileDevice ? '모바일 환경' : 'PC 데스크톱 환경'}`);

    // PC 환경일 경우 불필요한 UI 숨김 및 리프레시 처리
    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none'; // PC에서는 실시간 수평계 라인 숨김
        document.getElementById('status-text').innerText = "PC 모드 활성화";
        document.getElementById('angle-text').innerText = "고정";
        recordBtn.style.border = '5px solid #fff'; // PC 전용 상시 고정 버튼 스타일
    }

    document.getElementById('btn-permission').onclick = async () => {
        log("미디어 입력 장치(카메라/웹캠) 연결 대기 중...");
        
        // PC 환경과 모바일 환경 맞춤형 카메라 탐색 옵션 분기 처리
        const videoConstraints = window.isMobileDevice 
            ? { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } // 모바일 후면
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };        // PC 전면 웹캠

        try {
            streamRef = await navigator.mediaDevices.getUserMedia({ 
                video: videoConstraints, 
                audio: false 
            });
            video.srcObject = streamRef;
            await video.play();
            
            document.getElementById('permission-overlay').style.display = 'none';
            
            // 인터랙션 레이어 강제 복구
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            
            log("카메라 스트림 링크 연동 성공! 하단 셔터로 녹화를 제어하세요.");
            
            if (window.isMobileDevice) {
                try { 
                    await leveler.init(); 
                    log("모바일 자이로 수평 필터 기동 완료.");
                } catch(e) { log("센서 샌드박스 예외 스킵"); }
            }
        } catch (err) {
            log(`장치 접근 실패 (${err.name}): ${err.message}\n로컬 파일 더블클릭 실행이거나 HTTP 주소 접속일 수 있습니다. 깃허브 HTTPS 주소로 확인해 주세요.`);
        }
    };

    // 마우스 및 모바일 터치 오버랩 방지(Debounce) 인터랙션 핸들러
    let lastTriggerTime = 0;
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        
        const now = Date.now();
        if (now - lastTriggerTime < 300) return; 
        lastTriggerTime = now;

        log("레코딩 제어 신호 트리거됨");
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    };

    // 크로스 플랫폼 완벽 호환 이벤트 리스너 마운트
    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });
}

async function startRecording() {
    if (!streamRef) { log("컴포넌트 오류: 기동 가능한 카메라 스트림이 부재합니다."); return; }
    
    recordedChunks = [];
    const mime = getSupportedMimeType();
    log(`인코더 타겟 포맷: ${mime || '기본 디폴트 컨테이너'}`);
    
    try {
        const options = mime ? { mimeType: mime } : {};
        mediaRecorder = new MediaRecorder(streamRef, options);
        
        mediaRecorder.ondataavailable = (e) => { 
            if (e.data && e.data.size > 0) recordedChunks.push(e.data); 
        };
        
        mediaRecorder.onstop = () => {
            log("비디오 파싱 및 캔버스 마운팅 트랜스폼 중...");
            const blob = new Blob(recordedChunks, { type: mime || 'video/mp4' });
            const url = URL.createObjectURL(blob);
            
            // 영구 저장용 로컬 디바이스 자동 파일 클리퍼 작동
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
        log("● 비디오 레코딩 작동 중... 중단하려면 다시 터치/클릭하세요.");
    } catch (e) {
        log("비디오 스트림 인코더 빌드 예외 발생: " + e.message);
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        log("레코딩 스트림 마감 종료 명령 송신 중...");
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerText = "";
    }
}

// 레이아웃 변경 핸들러
document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');
document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files[0]; // 버그 패치: files 배열 단독 노드로 변경
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
            log(`분석 레이어 빌드 완료 ${window.isMobileDevice ? `(기준 수평값: ${activeVideoRoll.toFixed(1)}°)` : '(PC 모드 기준점 고정)'}`);
        };
    };
}

// 어플리케이션 스타터 기동
initApp();

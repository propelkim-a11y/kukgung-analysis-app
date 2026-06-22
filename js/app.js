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

// 1. 수평계 클래스 인스턴스 연동
const leveler = new DynamicLeveler((isLevel, roll) => {
    phoneRollAtRecord = roll;
    if (recordBtn && window.isMobileDevice) {
        recordBtn.style.borderColor = isLevel ? '#00ff00' : '#ff0000';
    }
});

// 2. PC 및 모바일 사파리 등 범용 최적 녹화 코덱 감지 구문
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

    // PC 환경일 경우 불필요한 스마트폰용 레이아웃 사전 우회 제어
    if (!window.isMobileDevice) {
        const lvContainer = document.getElementById('level-container');
        if (lvContainer) lvContainer.style.display = 'none';
        if (statusText) statusText.innerText = "PC 웹캠 분석 모드";
        document.getElementById('angle-text').innerText = "고정";
        recordBtn.style.border = '5px solid #fff';
    }

    // 권한 허용 및 시작하기 버튼 클릭 리스너
    document.getElementById('btn-permission').onclick = async () => {
        if (statusText) statusText.innerText = "카메라 켜는 중...";
        
        const videoConstraints = window.isMobileDevice 
            ? { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };

        try {
            // 미디어 스트림 직접 획득
            streamRef = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
            video.srcObject = streamRef;
            await video.play();
            
            // 승인 팝업 레이어 제거 및 녹화 셔터 상호작용 오픈
            document.getElementById('permission-overlay').style.display = 'none';
            recordBtn.style.zIndex = '99999'; 
            recordBtn.style.pointerEvents = 'auto';
            if (statusText && window.isMobileDevice) statusText.innerText = "촬영 준비 완료";
            
            // 시차(0.1초)를 두고 자이로 센서를 부착하여 카메라 초기 가동 렉 현상 전면 차단
            setTimeout(async () => {
                if (window.isMobileDevice) {
                    try { await leveler.init(); } catch(e) { console.warn("센서 초기화 유예"); }
                }
            }, 100);

        } catch (err) {
            console.error(err);
            alert("카메라 장치 승인에 실패했습니다. HTTPS 보안 주소 상태 및 브라우저 개별 권한 설정을 확인하세요.");
        }
    };

    // 터치 입력 및 클릭 오버랩 스킵 기능(Debounce) 인터랙션 핸들러
    let lastTriggerTime = 0;
    const handleAction = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const now = Date.now();
        if (now - lastTriggerTime < 300) return; 
        lastTriggerTime = now;

        if (!isRecording) startRecording();
        else stopRecording();
    };

    // 모바일 터치 및 마우스 클릭 크로스플랫폼 동시 마운트
    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });
}

// 5. 비디오 녹화 시작 구문
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
            
            // 보관 목적 로컬 영구 파일 클리퍼 자동 발동 및 즉각 소멸
            const a = document.createElement('a');
            a.href = url;
            const ext = mime.includes('webm') ? 'webm' : 'mp4';
            a.download = `kukgung_${Date.now()}.${ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 캡처 시점 수평 경사도를 인덱싱 데이터에 싱크
            activeVideoRoll = phoneRollAtRecord;
            loadVideoForAnalysis(url);
        };

        mediaRecorder.start(1000); // 안전화 저장을 위해 1초 단위 패킷 블록화
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.innerText = "STOP";
    } catch (e) {
        console.error("인코더 빌드 오류:", e);
    }
}

// 6. 비디오 녹화 중지 구문
async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerText = "";
    }
}

// 7. 모드 전환 상단 탭 이벤트 매핑
document.getElementById('btn-mode-shoot').onclick = () => switchMode('shoot');
document.getElementById('btn-mode-analyze').onclick = () => switchMode('analyze');

// 8. 기존 보유 중인 외부 영상 로컬 업로드 리스너
document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        activeVideoRoll = 0; // 외부 입젝션 클립은 강제 기준 각도 0도 빌드
        loadVideoForAnalysis(URL.createObjectURL(file));
    }
};

// 9. 뷰 섹션 체인지 모듈 (하단 푸터 그래픽 대충돌 버그 패치 버전)
function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
    
    document.getElementById('btn-mode-shoot').classList.toggle('active', mode === 'shoot');
    document.getElementById('btn-mode-analyze').classList.toggle('active', mode === 'analyze');

    // ⚡ [버그 해결] 결과보기 화면일 때는 하단의 큰 촬영 단추(녹화 버튼) 영역을 완전히 숨겨 글자 겹침을 원천 차단
    const actionZone = document.querySelector('.action-zone');
    if (actionZone) {
        actionZone.classList.toggle('hidden', mode === 'analyze');
    }
}

// 10. 촬영 완료본 또는 업로드본 분석 캔버스 로더
function loadVideoForAnalysis(url) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true;
    window.analysisVideo = v;
    
    v.onloadedmetadata = () => {
        const dc = document.getElementById('drawing-canvas');
        const oc = document.getElementById('output-canvas');
        
        // 비디오 해상도 정비례 싱크 매핑 (터치 빗나감 영구 수정 방지 수식 연동)
        dc.width = oc.width = v.videoWidth;
        dc.height = oc.height = v.videoHeight;
        
        v.currentTime = 0.1; 
        switchMode('analyze');
        
        bowAnalyzer.init(); // 📐 순수 벡터 수동 측정 분석엔진 점화
        
        v.onseeked = () => {
            const ctx = oc.getContext('2d');
            ctx.drawImage(v, 0, 0, oc.width, oc.height);
        };
    };
}

// 11. 결과보기 창 프레임 미세 정밀 조작 슬롯 바인딩 (-0.1초 / 재생 / +0.1초)
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

// 12. 드로잉 캔버스 초기화 리스너
document.getElementById('btn-clear-draw').onclick = () => { 
    if (bowAnalyzer) bowAnalyzer.clear(); 
};

// 인프라 실행 기동
initApp();

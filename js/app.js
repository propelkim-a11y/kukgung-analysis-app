import { DynamicLeveler } from './sensor.js';
import { BowAnalyzer } from './analyzer.js';

let streamRef = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let phoneRollAtRecord = 0;
let activeVideoRoll = 0; 
let bowAnalyzer = new BowAnalyzer();
let sliderLock = false; // 슬라이더 조작 시 중복 드로우 방지 락

const video = document.getElementById('video-preview');
const recordBtn = document.getElementById('record-btn');
const statusText = document.getElementById('status-text');
const videoSlider = document.getElementById('video-slider');
const playBtn = document.getElementById('btn-video-play');

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
        if (statusText) statusText.innerText = "PC 에뮬레이션 테스트 모드";
        document.getElementById('angle-text').innerText = "고정";
        recordBtn.style.border = '5px solid #007aff';
        recordBtn.style.backgroundColor = 'rgba(0, 122, 255, 0.2)';
    }

    document.getElementById('btn-permission').onclick = async () => {
        if (statusText) statusText.innerText = "카메라 시동 중...";
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
            if (statusText) statusText.innerText = "수동 업로드 전용 모드";
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
            document.getElementById('file-upload').click();
        }
    };

    recordBtn.addEventListener('touchstart', handleAction, { capture: true, passive: false });
    recordBtn.addEventListener('click', handleAction, { capture: true });

    // ⚡ 타임라인 슬라이더 제어 이벤트 바인딩
    if (videoSlider) {
        videoSlider.addEventListener('input', (e) => {
            if (!window.analysisVideo) return;
            sliderLock = true;
            const targetTime = (e.target.value / 100) * window.analysisVideo.duration;
            window.analysisVideo.currentTime = targetTime;
        });
        videoSlider.addEventListener('change', () => { sliderLock = false; });
    }
}

function loadDummyCanvasForPC() {
    const dc = document.getElementById('drawing-canvas');
    const oc = document.getElementById('output-canvas');
    dc.width = oc.width = 1280; dc.height = oc.height = 720;
    switchMode('analyze');
    bowAnalyzer.init();
    const ctx = oc.getContext('2d');
    ctx.fillStyle = '#151518'; ctx.fillRect(0, 0, oc.width, oc.height);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🏹 하단 [영상 파일 업로드] 버튼을 눌러', oc.width / 2, oc.height / 2 - 20);
    ctx.fillText('촬영된 국궁 동영상을 넣으면 정밀 각도 측정이 가능합니다.', oc.width / 2, oc.height / 2 + 30);
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
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            
            activeVideoRoll = phoneRollAtRecord;
            loadVideoForAnalysis(url);
        };
        mediaRecorder.start(1000); 
        isRecording = true;
        recordBtn.classList.add('recording');
    } catch (e) { console.error(e); }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
    }
}

// 상하단 탭 버튼 클릭 리스너 스위칭 구조
document.querySelectorAll('.btn-mode-shoot').forEach(btn => btn.onclick = () => switchMode('shoot'));
document.querySelectorAll('.btn-mode-analyze').forEach(btn => btn.onclick = () => switchMode('analyze'));

document.getElementById('file-upload').onchange = (e) => {
    const file = e.target.files[0];
    if (file) { activeVideoRoll = 0; loadVideoForAnalysis(URL.createObjectURL(file)); }
};

function switchMode(mode) {
    document.getElementById('camera-section').classList.toggle('hidden', mode !== 'shoot');
    document.getElementById('analysis-section').classList.toggle('hidden', mode !== 'analyze');
    
    // ⚡ 상단 카메라 수평 가이드 헤더 박스 노출 통제
    const camHeader = document.getElementById('camera-header');
    if (camHeader) camHeader.classList.toggle('hidden', mode === 'analyze');
}

function loadVideoForAnalysis(url) {
    if (window.analysisVideo) { window.analysisVideo.pause(); } // 이전 영상 버퍼 마감
    
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true; v.loop = false;
    window.analysisVideo = v;
    
    v.onloadedmetadata = () => {
        const dc = document.getElementById('drawing-canvas');
        const oc = document.getElementById('output-canvas');
        dc.width = oc.width = v.videoWidth;
        dc.height = oc.height = v.videoHeight;
        
        v.currentTime = 0.01; 
        switchMode('analyze');
        bowAnalyzer.init(); 
        
        // ⚡ 재생 위치 변화 시 슬라이더 바 위치 및 화면 드로우 실시간 동기화 (재생 정지 수리 부품)
        v.ontimeupdate = () => {
            if (videoSlider && !sliderLock) {
                videoSlider.value = (v.currentTime / v.duration) * 100;
            }
            const ctx = oc.getContext('2d');
            ctx.drawImage(v, 0, 0, oc.width, oc.height);
        };

        v.onplay = () => { if (playBtn) playBtn.innerText = "⏸ 일시정지"; };
        v.onpause = () => { if (playBtn) playBtn.innerText = "▶ 재생"; };
        v.onended = () => { if (playBtn) playBtn.innerText = "▶ 재생"; };
    };
}

// 미세조정 및 재생 제어 스위치 링크 바인딩
document.getElementById('btn-video-prev').onclick = () => { 
    if(window.analysisVideo) { window.analysisVideo.pause(); window.analysisVideo.currentTime = Math.max(0, window.analysisVideo.currentTime - 0.1); }
};
document.getElementById('btn-video-next').onclick = () => { 
    if(window.analysisVideo) { window.analysisVideo.pause(); window.analysisVideo.currentTime = Math.min(window.analysisVideo.duration, window.analysisVideo.currentTime + 0.1); }
};
document.getElementById('btn-video-play').onclick = () => { 
    if(window.analysisVideo) {
        if(window.analysisVideo.paused) window.analysisVideo.play();
        else window.analysisVideo.pause();
    }
};
document.getElementById('btn-clear-draw').onclick = () => { if (bowAnalyzer) bowAnalyzer.clear(); };

initApp();

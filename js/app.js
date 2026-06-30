/**
 * js/app.js
 * - (v21.4) - 국궁 자세 분석 시스템 초슬림 안정화 버전
 * 모든 실험적 코덱 탐색 및 복잡한 대기 로직을 제거하고 기본 구동에만 집중합니다.
 */

window.bowAppNodes = {};

// 1. 최소한의 노드 매핑 공정
function initNodes() {
    const ids = [
        'scene-record', 'scene-analyze', 'btn-go-analyze', 'btn-go-record',
        'camera-preview', 'btn-record-toggle', 'record-status',
        'gyro-horizon-line', 'gyro-vertical-line',
        'video-viewport', 'main-video', 'draw-canvas', 'unified-panel', 'panel-handle',
        'btn-open', 'btn-move', 'btn-draw', 'btn-capture', 'btn-reset', 'video-input', 'btn-download-video',
        'video-slider', 'btn-frame-prev', 'btn-play-pause', 'btn-frame-next', 'angle-report'
    ];
    ids.forEach(id => {
        const key = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        window.bowAppNodes[key] = document.getElementById(id);
    });
}

let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentRoll = 0;
let currentFrameTime = 1 / 60; // 기본 60fps 기준 타임 슬라이스
// 2. 가장 안전한 카메라 시작 (하드웨어 크래시 방지를 위해 제약 조건 최소화)
function safeStartCamera() {
    const nodes = window.bowAppNodes;
    if (cameraStream) stopCamera();

    const constraints = { 
        video: { facingMode: 'environment', frameRate: { ideal: 60 } }, 
        audio: false 
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            cameraStream = stream;
            nodes.cameraPreview.srcObject = stream;
            nodes.cameraPreview.setAttribute('autoplay', '');
            nodes.cameraPreview.setAttribute('muted', '');
            nodes.cameraPreview.setAttribute('playsinline', '');
            
            nodes.cameraPreview.play().catch(e => console.log("[시스템] 자동 재생 차단 감지"));
            console.log("[시스템] 카메라 연결 성공");
            
            if (nodes.recordStatus) {
                nodes.recordStatus.innerHTML = `대기 중`;
            }
            setTimeout(resizeCanvasToDisplay, 150);
        })
        .catch(err => {
            console.error(err);
            alert("카메라를 켤 수 없습니다. 권한 혹은 디바이스 연결을 확인해주세요.");
            if (nodes.recordStatus) nodes.recordStatus.innerText = "카메라 연결 실패";
        });
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    if (window.bowAppNodes.cameraPreview) window.bowAppNodes.cameraPreview.srcObject = null;
}

function resizeCanvasToDisplay() {
    const nodes = window.bowAppNodes;
    if (!nodes.drawCanvas) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    nodes.drawCanvas.width = width * dpr;
    nodes.drawCanvas.height = height * dpr;

    if (window.bowAnalyzer) {
        window.bowAnalyzer.canvas = nodes.drawCanvas;
        window.bowAnalyzer.ctx = nodes.drawCanvas.getContext('2d');
        window.bowAnalyzer.render();
    }
}
// 3. 녹화 종료 후 단순화된 미디어 포워딩 다운로더
function handleRecordingFinish(blob) {
    const nodes = window.bowAppNodes;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `kukgung_${timestamp}.webm`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
        URL.revokeObjectURL(nodes.mainVideo.src);
    }

    nodes.mainVideo.src = url;
    stopCamera();
    
    nodes.sceneRecord.classList.remove('active');
    nodes.sceneAnalyze.classList.add('active');
    setActiveMenu(nodes.btnMove);
    if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
}

// 녹화 시작/중지 최소 기능 토글러
window.bowAppNodes.btnRecordToggle?.addEventListener('click', () => {
    const nodes = window.bowAppNodes;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        recordedChunks = [];
        const stream = nodes.cameraPreview?.srcObject;
        if (!stream) return;

        try {
            // 복잡한 코덱 검사 없이 시스템 기본 포맷으로 네이티브 레코딩 가동
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
                handleRecordingFinish(videoBlob);
            };

            mediaRecorder.start(100);
            isRecording = true;
            nodes.btnRecordToggle.textContent = '녹화중지';
            nodes.btnRecordToggle.classList.add('recording');
            if (nodes.recordStatus) nodes.recordStatus.innerHTML = `<span style="color:red;">● 녹화 중</span>`;
        } catch (e) {
            console.error("[오류] 레코더 가동 실패:", e);
        }
    } else {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        isRecording = false;
        nodes.btnRecordToggle.textContent = '녹화시작';
        nodes.btnRecordToggle.classList.remove('recording');
        if (nodes.recordStatus) nodes.recordStatus.innerHTML = `대기 중`;
    }
});
window.bowAppNodes.btnReset?.addEventListener('click', () => {
    if (window.bowAnalyzer && typeof window.bowAnalyzer.clearLines === 'function') window.bowAnalyzer.clearLines();
    if (window.bowAppNodes.angleReport) {
        window.bowAppNodes.angleReport.innerHTML = `<div class="final-angle" style="font-size:20px; font-weight:bold; color:#00FF66;">0.0°</div>`;
    }
    setTimeout(resizeCanvasToDisplay, 100);
});

// 이미지 캡처 단순화 레이어
window.bowAppNodes.btnCapture?.addEventListener('click', () => {
    const nodes = window.bowAppNodes;
    if (!nodes.mainVideo || !nodes.drawCanvas) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = nodes.mainVideo.videoWidth || 1280;
    offscreen.height = nodes.mainVideo.videoHeight || 720;
    const ctx = offscreen.getContext('2d');

    ctx.drawImage(nodes.mainVideo, 0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(nodes.drawCanvas, 0, 0, offscreen.width, offscreen.height);

    const link = document.createElement('a');
    link.download = `kukgung_analysis_${Date.now()}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
});

window.bowAppNodes.mainVideo?.addEventListener('timeupdate', () => {
    const nodes = window.bowAppNodes;
    if (nodes.videoSlider && !isNaN(nodes.mainVideo.currentTime)) {
        nodes.videoSlider.value = nodes.mainVideo.currentTime;
    }
});

// 프리징 유발을 완전 차단하는 requestAnimationFrame 프레임 드랍 조작 처리
window.bowAppNodes.videoSlider?.addEventListener('input', () => {
    const nodes = window.bowAppNodes;
    if (!nodes.mainVideo.paused) nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    
    requestAnimationFrame(() => {
        nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
    });
});

window.bowAppNodes.btnPlayPause?.addEventListener('click', () => {
    const nodes = window.bowAppNodes;
    if (nodes.mainVideo.paused) {
        nodes.mainVideo.play();
        nodes.btnPlayPause.textContent = '일시정지';
    } else {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
    }
});
// 초정밀 1프레임 미세 조작 레이어
window.bowAppNodes.btnFrameOriginalPrev = window.bowAppNodes.btnFramePrev; 
window.bowAppNodes.btnFramePrev?.addEventListener('click', () => {
    const nodes = window.bowAppNodes;
    nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
});

window.bowAppNodes.btnFrameNext?.addEventListener('click', () => {
    const nodes = window.bowAppNodes;
    nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
});

// 수평계 데이터 오차 보정 핸들러 ㄷ자 결합
window.addEventListener('bowGyroUpdate', (e) => {
    const nodes = window.bowAppNodes;
    const { roll, isLevel } = e.detail;
    if (isNaN(roll)) return;
    currentRoll = roll;

    if (nodes.sceneRecord?.classList.contains('active')) {
        if (nodes.gyroHorizonLine) {
            nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
            nodes.gyroHorizonLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
        }
        if (nodes.gyroVerticalLine) {
            nodes.gyroVerticalLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
        }
    }
});

window.addEventListener('bowAngleUpdate', (e) => {
    const nodes = window.bowAppNodes;
    if (nodes.angleReport && e.detail.angle !== undefined) {
        nodes.angleReport.innerHTML = `<div style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>`;
    }
});
// 파일 탐색 인터페이스 단순화 및 비동기 파이프라인
window.bowAppNodes.btnOpen?.addEventListener('click', () => window.bowAppNodes.videoInput?.click());
window.bowAppNodes.videoInput?.addEventListener('change', (e) => {
    const nodes = window.bowAppNodes;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    nodes.mainVideo.src = URL.createObjectURL(files[0]);
    nodes.mainVideo.load();

    nodes.sceneRecord?.classList.remove('active');
    nodes.sceneAnalyze?.classList.add('active');
    if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
});

function setActiveMenu(activeBtn) {
    const nodes = window.bowAppNodes;
    [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => btn?.classList.remove('active'));
    activeBtn?.classList.add('active');
}

window.bowAppNodes.btnGoRecord?.addEventListener('click', () => {
    window.bowAppNodes.sceneAnalyze.classList.remove('active');
    window.bowAppNodes.sceneRecord.classList.add('active');
    safeStartCamera();
});

window.bowAppNodes.btnGoAnalyze?.addEventListener('click', () => {
    stopCamera();
    window.bowAppNodes.sceneRecord.classList.remove('active');
    window.bowAppNodes.sceneAnalyze.classList.add('active');
    setTimeout(resizeCanvasToDisplay, 100);
});

// 3. 페이지 로드 시 즉시 실행 (복잡한 순차 컴파일을 지양하는 안전 레이아웃 가동)
window.addEventListener('load', () => {
    initNodes();
    
    // 0.5초 뒤에 카메라 시작 (브라우저가 캔버스 스레드를 확보할 무력화 시간 안전 마진 적용)
    setTimeout(safeStartCamera, 500);

    // 최소한의 분석 화면 로직 통합
    const nodes = window.bowAppNodes;
    if (nodes.mainVideo) {
        nodes.mainVideo.onloadedmetadata = () => {
            if (nodes.videoSlider) {
                nodes.videoSlider.max = nodes.mainVideo.duration || 100;
                nodes.videoSlider.value = 0;
            }
            resizeCanvasToDisplay();
        };
    }
    
    window.addEventListener('resize', resizeCanvasToDisplay);
});

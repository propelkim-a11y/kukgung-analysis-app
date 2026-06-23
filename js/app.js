/**
 * js/app.js (Part 1/2)
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 상단 인프라부
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;

    // 1. 공용 DOM 핵심 노드 전역 인프라 매핑
    const nodes = window.bowAppNodes;
    nodes.sceneRecord = document.getElementById('scene-record');
    nodes.sceneAnalyze = document.getElementById('scene-analyze');
    nodes.btnGoAnalyze = document.getElementById('btn-go-analyze');
    nodes.btnGoRecord = document.getElementById('btn-go-record');

    nodes.cameraPreview = document.getElementById('camera-preview');
    nodes.btnRecordToggle = document.getElementById('btn-record-toggle');
    nodes.recordStatus = document.getElementById('record-status');
    nodes.gyroHorizonLine = document.getElementById('gyro-horizon-line');

    nodes.videoViewport = document.getElementById('video-viewport');
    nodes.mainVideo = document.getElementById('main-video');
    nodes.drawCanvas = document.getElementById('draw-canvas');
    nodes.unifiedPanel = document.getElementById('unified-panel');
    nodes.panelHandle = document.getElementById('panel-handle');
    
    nodes.btnOpen = document.getElementById('btn-open');
    nodes.btnMove = document.getElementById('btn-move');
    nodes.btnDraw = document.getElementById('btn-draw');
    nodes.btnReset = document.getElementById('btn-reset');
    nodes.videoInput = document.getElementById('video-input');

    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');

    // 💡 패치: 단일 대통합 하단 패널용 서브 레이어 노드 확보
    nodes.subRecord = document.getElementById('content-sub-record');
    nodes.subAnalyze = document.getElementById('content-sub-analyze');

    // 2. 화면 터치 해상도(Viewport)와 캔버스를 완벽 동기화하여 선 오차 즉시 박멸
    function resizeCanvasToDisplay() {
        const rect = nodes.videoViewport.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        nodes.drawCanvas.width = rect.width * dpr;
        nodes.drawCanvas.height = rect.height * dpr;
        
        if (window.bowAnalyzer) {
            window.bowAnalyzer.canvas = nodes.drawCanvas;
            window.bowAnalyzer.ctx = nodes.drawCanvas.getContext('2d');
            window.bowAnalyzer.render();
        }
    }
    window.addEventListener('resize', resizeCanvasToDisplay);
    resizeCanvasToDisplay();

    // 3. 제스처 및 드로잉 분석 모듈 초기 가동
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 4. 대용량 IndexedDB 캐시 인프라 로드 및 동기화
    core.initDB().then(async () => {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        resizeCanvasToDisplay();
        gesture.applyTransform();
    });

    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        nodes.videoSlider.max = nodes.mainVideo.duration;
        resizeCanvasToDisplay();
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    /**
     * 최초 화면 터치 시 브라우저 보안 샌드박스를 풀고 카메라와 자이로 즉시 가동
     */
    const triggerSensorUnlock = async () => {
        if (window.bowGyroSensor) {
            window.bowGyroSensor.start();
        }
        if (!cameraStream && nodes.sceneRecord.classList.contains('active')) {
            await startCamera();
        }
        window.removeEventListener('click', triggerSensorUnlock);
        window.removeEventListener('touchstart', triggerSensorUnlock);
    };
    window.addEventListener('click', triggerSensorUnlock);
    window.addEventListener('touchstart', triggerSensorUnlock);

    /**
     * 후면 카메라 스트리밍 구동부
     */
    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
            nodes.recordStatus.textContent = '카메라 및 수평계 연동 성공 - 거치대를 정렬하세요.';
        } catch (err) {
            nodes.recordStatus.textContent = '카메라 접근 권한이 차단되었습니다.';
            console.error(err);
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        nodes.cameraPreview.srcObject = null;
    }

    // 💡 패치: [촬영 화면 복귀 스위칭] 하단 패널 고정 후 알맹이 서브 레이어만 체인지
    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        
        nodes.subAnalyze.classList.remove('active');
        nodes.subRecord.classList.add('active');
        
        await startCamera();
        if (window.bowGyroSensor) window.bowGyroSensor.start();
    });

    // 💡 패치: [분석 화면 진입 스위칭] 하단 패널 고정 후 알맹이 서브 레이어만 체인지
    function transitToAnalyzeMode() {
        stopCamera();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        
        nodes.subRecord.classList.remove('active');
        nodes.subAnalyze.classList.add('active');
        
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        setTimeout(resizeCanvasToDisplay, 100);
    }

    nodes.btnGoAnalyze.addEventListener('click', transitToAnalyzeMode);
    /**
     * 실시간 카메라 프리뷰 기반 미디어 레코더 녹화 제어
     */
    nodes.btnRecordToggle.addEventListener('click', () => {
        if (window.bowGyroSensor) window.bowGyroSensor.start();
        if (!cameraStream) return;

        if (!isRecording) {
            recordedChunks = [];
            let options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };

            mediaRecorder = new MediaRecorder(cameraStream, options);
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };

            mediaRecorder.onstop = async () => {
                nodes.recordStatus.textContent = '영상을 캐시에 저장 중...';
                const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
                await core.saveCache('lastVideoBlob', videoBlob);

                const videoURL = URL.createObjectURL(videoBlob);
                nodes.mainVideo.src = videoURL;
                nodes.mainVideo.load();

                stopCamera();
                nodes.sceneRecord.classList.remove('active');
                nodes.sceneAnalyze.classList.add('active');
                
                setActiveMenu(nodes.btnOpen);
                if (window.bowAnalyzer) {
                    window.bowAnalyzer.clearLines();
                    window.bowAnalyzer.setMode('move');
                }
                setTimeout(resizeCanvasToDisplay, 100);
                
                nodes.btnRecordToggle.textContent = '녹화시작';
                nodes.btnRecordToggle.classList.remove('recording');
            };

            mediaRecorder.start();
            isRecording = true;
            nodes.btnRecordToggle.textContent = '녹화종료/분석';
            nodes.btnRecordToggle.classList.add('recording');
            nodes.recordStatus.textContent = '자세 촬영 중...';
        } else {
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    function setActiveMenu(activeBtn) {
        [nodes.btnOpen, nodes.btnMove, nodes.btnDraw].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    const FRAME_TIME = 1 / 30;

    nodes.mainVideo.addEventListener('timeupdate', () => {
        if (!isNaN(nodes.mainVideo.currentTime)) {
            nodes.videoSlider.value = nodes.mainVideo.currentTime;
        }
    });

    nodes.videoSlider.addEventListener('input', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = nodes.videoSlider.value;
    });

    nodes.btnPlayPause.addEventListener('click', () => {
        if (nodes.mainVideo.paused) {
            nodes.mainVideo.play();
            nodes.btnPlayPause.textContent = '일시정지';
        } else {
            nodes.mainVideo.pause();
            nodes.btnPlayPause.textContent = '재생';
        }
    });

    nodes.btnFramePrev.addEventListener('click', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - FRAME_TIME);
    });

    nodes.btnFrameNext.addEventListener('click', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + FRAME_TIME);
    });

    nodes.btnOpen.addEventListener('click', () => nodes.videoInput.click());

    nodes.videoInput.addEventListener('change', async (e) => {
        const file = e.target.files;
        if (!file || file.length === 0) return;

        await core.saveCache('lastVideoBlob', file[0]);
        const url = URL.createObjectURL(file[0]);
        nodes.mainVideo.src = url;
        nodes.mainVideo.load();

        setActiveMenu(nodes.btnOpen);
        if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
        setTimeout(resizeCanvasToDisplay, 100);
    });

    nodes.btnMove.addEventListener('click', () => {
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    });

    nodes.btnDraw.addEventListener('click', () => {
        setActiveMenu(nodes.btnDraw);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('draw');
    });

    nodes.btnReset.addEventListener('click', () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            core.saveCache('lastLines', []);
        }
        core.state.scale = 1;
        core.state.offsetX = 0;
        core.state.offsetY = 0;
        
        if (window.bowAppGesture) {
            window.bowAppGesture.applyTransform();
        }
        core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });
    });

    nodes.panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        if (core.state.isPanelOpen) {
            nodes.unifiedPanel.classList.remove('collapsed');
        } else {
            nodes.unifiedPanel.classList.add('collapsed');
        }
    });

    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `ANGLE: ${e.detail.angle}°`;
        if (window.bowAnalyzer) core.saveCache('lastLines', window.bowAnalyzer.lines);
    });

    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        
        if (nodes.gyroHorizonLine && nodes.sceneRecord.classList.contains('active')) {
            nodes.gyroHorizonLine.setAttribute('data-angle', `${Math.abs(roll).toFixed(1)}°`);
            nodes.gyroHorizonLine.style.transform = `translateY(-50%) rotate(${-roll}deg)`;
            
            if (isLevel) {
                nodes.gyroHorizonLine.classList.add('perfect-level');
            } else {
                nodes.gyroHorizonLine.classList.remove('perfect-level');
            }
        }
    });
});

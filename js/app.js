/**
 * js/app.js (Part 1 of 2)
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 통합본 (PC 프리징 완전 방어 버전)
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
    nodes.gyroVerticalLine = document.getElementById('gyro-vertical-line');

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

    // 2. 화면 터치 해상도(Viewport)와 캔버스를 완벽 동기화하여 선 오차 즉시 박멸
    function resizeCanvasToDisplay() {
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
        // 💡 실제 모바일 기기 환경(UserAgent 판정)일 때만 하드웨어 자이로 기동 시도
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor) {
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
            const isPC = !/Android|iPhone|iPad/i.test(navigator.userAgent);
            let videoConstraints = { facingMode: { ideal: "environment" }, width: 1280, height: 720 };
            if (isPC) {
                videoConstraints = { width: 1280, height: 720 };
            }

            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
            nodes.recordStatus.textContent = '카메라 장치 연동 완료';
        } catch (err) {
            nodes.recordStatus.textContent = '카메라 장치를 로드할 수 없습니다. 분석 모드에서 [열기] 단추를 눌러 비디오를 불러오세요.';
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

    // [촬영 화면 이탈 이동]
    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await startCamera();
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor) {
            window.bowGyroSensor.start();
        }
    });

    // [분석 화면 진입 이동 공통 함수]
    function transitToAnalyzeMode() {
        stopCamera();
        if (window.bowGyroSensor) window.bowGyroSensor.stop();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        setTimeout(resizeCanvasToDisplay, 100);
    }

    nodes.btnGoAnalyze.addEventListener('click', transitToAnalyzeMode);
/**
 * js/app.js (Part 2 of 2)
 */
    nodes.btnRecordToggle.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor) {
            window.bowGyroSensor.start();
        }
        if (!cameraStream) return;
        if (!isRecording) {
            recordedChunks = [];
            let options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm;codecs=vp8' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };

            try {
                mediaRecorder = new MediaRecorder(cameraStream, options);
            } catch (e) {
                mediaRecorder = new MediaRecorder(cameraStream);
            }

            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                nodes.recordStatus.textContent = '저장 중...';
                const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
                await core.saveCache('lastVideoBlob', videoBlob);
                const videoURL = URL.createObjectURL(videoBlob);
                nodes.mainVideo.src = videoURL;
                nodes.mainVideo.load();
                stopCamera();
                if (window.bowGyroSensor) window.bowGyroSensor.stop();
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
            nodes.recordStatus.textContent = '촬영 중...';
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
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const targetFile = files[0];
        await core.saveCache('lastVideoBlob', targetFile);
        const url = URL.createObjectURL(targetFile);
        nodes.mainVideo.src = url;
        nodes.mainVideo.load();
        if (window.bowGyroSensor) window.bowGyroSensor.stop();
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            window.bowAnalyzer.setMode('move');
        }
        setTimeout(resizeCanvasToDisplay, 100);
    });

    nodes.btnMove.addEventListener('click', () => {
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.setMode('move');
            window.bowAnalyzer.render();
        }
    });

    nodes.btnDraw.addEventListener('click', () => {
        setActiveMenu(nodes.btnDraw);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.setMode('draw');
            window.bowAnalyzer.render();
        }
    });

    nodes.btnReset.addEventListener('click', () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            core.saveCache('lastLines', []);
        }
        core.state.scale = 1;
        core.state.offsetX = 0;
        core.state.offsetY = 0;
        if (window.bowAppGesture) window.bowAppGesture.applyTransform();
        core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });
    });
    nodes.panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        if (core.state.isPanelOpen) nodes.unifiedPanel.classList.remove('collapsed');
        else nodes.unifiedPanel.classList.add('collapsed');
    });
    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `ANGLE: ${e.detail.angle}°`;
        if (window.bowAnalyzer) core.saveCache('lastLines', window.bowAnalyzer.lines);
    });
    window.addEventListener('bowGestureUndo', (e) => {
        core.saveCache('lastLines', e.detail.lines);
    });
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        
        // 💡 [PC 뻗음 최종 차단] 데이터가 숫자가 아닐 경우 브라우저 렌더러가 연산 과부하에 빠지지 않도록 원천 스킵
        if (isNaN(roll)) return;

        if (nodes.sceneRecord.classList.contains('active')) {
            if (nodes.gyroHorizonLine) {
                nodes.gyroHorizonLine.setAttribute('data-angle', `${Math.abs(roll).toFixed(1)}°`);
                nodes.gyroHorizonLine.style.transform = `translateY(-50%) rotate(${-roll}deg)`;
                if (isLevel) nodes.gyroHorizonLine.classList.add('perfect-level');
                else nodes.gyroHorizonLine.classList.remove('perfect-level');
            }
            if (nodes.gyroVerticalLine) {
                nodes.gyroVerticalLine.style.transform = `translateX(-50%) rotate(${-roll}deg)`;
                if (isLevel) nodes.gyroVerticalLine.classList.add('perfect-level');
                else nodes.gyroVerticalLine.classList.remove('perfect-level');
            }
        }
    });
});

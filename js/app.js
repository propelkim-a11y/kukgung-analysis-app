/**
 * js/app.js (Part 1 - 상단에 먼저 붙여넣기)
 * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러 (전체 파일 분할 1)
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

    // 2. 캔버스 해상도를 화면 기기 물리 크기와 강제 1:1 일치화 (선긋기 오차 박멸)
    function resizeCanvasToDisplay() {
        const rect = nodes.videoViewport.getBoundingClientRect();
        nodes.drawCanvas.width = rect.width;
        nodes.drawCanvas.height = rect.height;
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

    // 영상 로딩 완료 시 슬라이더 범위 제약 연계
    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        nodes.videoSlider.max = nodes.mainVideo.duration;
        resizeCanvasToDisplay();
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    /**
     * =================================================================
     *  💡 촬영 전 수평 조준용 자이로 센서 하드웨어 잠금 해제 루틴
     * =================================================================
     */
    const triggerSensorUnlock = () => {
        if (window.bowGyroSensor) {
            window.bowGyroSensor.start();
            nodes.recordStatus.textContent = '수평계 연동 성공 - 거치대를 정렬하세요.';
        }
        window.removeEventListener('click', triggerSensorUnlock);
        window.removeEventListener('touchstart', triggerSensorUnlock);
    };
    window.addEventListener('click', triggerSensorUnlock);
    window.addEventListener('touchstart', triggerSensorUnlock);

    /**
     * 하드웨어 후면 카메라 스트리밍 구동부
     */
    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
        } catch (err) {
            nodes.recordStatus.textContent = '카메라 장치 권한이 잠겨있습니다.';
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
        if (window.bowGyroSensor) window.bowGyroSensor.start();
    });

    // [분석 화면 진입 이동]
    nodes.btnGoAnalyze.addEventListener('click', () => {
        stopCamera();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        setTimeout(resizeCanvasToDisplay, 50);
    });

    // 초기 스트림 점화
    startCamera();

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
                setTimeout(resizeCanvasToDisplay, 50);
                
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
    /**
     * js/app.js (Part 2 - 첫 번째 박스 바로 아래에 빈칸 없이 이어 붙이세요)
     * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러 (전체 파일 분할 2)
     */

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

    /**
     * 4대 분석 버튼 기하학 액션
     */
    nodes.btnOpen.addEventListener('click', () => nodes.videoInput.click());

    nodes.videoInput.addEventListener('change', async (e) => {
        const file = e.target.files;
        if (!file) return;

        await core.saveCache('lastVideoBlob', file);
        const url = URL.createObjectURL(file);
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

    /**
     * 💡 초기화 버튼 클릭 시 줄긋기 초기화 + 비디오 배율 및 위치 상태까지 중앙 전면 복원 리셋
     */
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

    /**
     * 터치/클릭 시 완전 투명해지며 슬라이딩 개폐 처리되는 물리 핸들러
     */
    nodes.panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        if (core.state.isPanelOpen) {
            nodes.unifiedPanel.classList.remove('collapsed');
        } else {
            nodes.unifiedPanel.classList.add('collapsed');
        }
    });

    /**
     * 데이터 중계 파이프라인
     */
    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `📐 ${e.detail.angle}°`;
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

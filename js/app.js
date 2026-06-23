/**
 * js/app.js (Part 1 - 상단에 먼저 붙여넣기)
 * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러
 * - 촬영 모드 실시간 수평계 각도 표시 시스템 탑재
 * - 하단 컨트롤 패널 터치(Click) 시 아래로 부드럽게 완전 은닉 슬라이딩 개폐
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;

    // 공용 DOM 핵심 노드 전역 인프라 매핑
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

    // 💡 [선 오차 근본적 해결 1] 캔버스 해상도를 화면 기기 물리 크기와 강제 1:1 일치화
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

    // 제스처 모듈 구동 개시
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 캐시 인프라 로드 및 동기화
    core.initDB().then(async () => {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        resizeCanvasToDisplay();
        gesture.applyTransform();
    });

    // 영상 로딩 완료 시 슬라이더 최댓값 매핑
    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        nodes.videoSlider.max = nodes.mainVideo.duration;
        resizeCanvasToDisplay();
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    /**
     * 후면 카메라 스트리밍 제어 인터페이스
     */
    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
            nodes.recordStatus.textContent = '카메라 정렬 완료. 수평계를 조준하세요.';
        } catch (err) {
            nodes.recordStatus.textContent = '카메라 접근 권한이 잠겨있습니다.';
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

    // 화면 이동 버튼 제어 (대괄호 제거 반영)
    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await startCamera();
        if (window.bowGyroSensor) window.bowGyroSensor.start();
    });

    nodes.btnGoAnalyze.addEventListener('click', () => {
        stopCamera();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        setTimeout(resizeCanvasToDisplay, 50);
    });

    startCamera();

    /**
     * 미디어 레코더 캡처 루틴
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
                nodes.recordStatus.textContent = '영상을 캐시에 내보내는 중...';
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
     * - 💡 [선 오차 근본적 해결 2] 캔버스 물리 스케일 연산 필터 탑재 완료
     * - 대괄호 없는 미세조정 버튼 및 완전 투명 슬라이딩 터치 개폐 적용
     */

    const FRAME_TIME = 1 / 30; // 30fps 기준 프레임 타임

    // 비디오 실시간 타임라인 바 동기화
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

    /**
     * 대괄호가 없는 순정 서체 패밀리 룩 비디오 미세조정
     */
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
     * 4대 분석 버튼 명령 (대괄호 전면 제거)
     */
    nodes.btnOpen.addEventListener('click', () => nodes.videoInput.click());

    nodes.videoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
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

    nodes.btnReset.addEventListener('click', () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            core.saveCache('lastLines', []);
        }
    });

    /**
     * 💡 터치/클릭 시 완전 투명해지며 아래로 부드럽게 슬라이딩 개폐
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
     * 데이터 중계 리스너 파이프라인
     */
    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `📐 ${e.detail.angle}°`;
        if (window.bowAnalyzer) core.saveCache('lastLines', window.bowAnalyzer.lines);
    });

    /**
     * 💡 촬영 시 실시간 수평계 각도 표시 시스템 매핑
     */
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        
        if (nodes.gyroHorizonLine && nodes.sceneRecord.classList.contains('active')) {
            // 수평선 중앙에 실시간 각도 텍스트 표기 주입
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

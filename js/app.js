/**
 * js/app.js (Part 1 - 상단에 먼저 붙여넣기)
 * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러
 * - 💡 자이로 센서 물리 터치 기반 락 해제 처리 완료
 * - 촬영 / 분석 모드 오토 스위칭 샌드박스
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;

    // 공용 DOM 핵심 노드 전역 인프라 적층
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

    // 기하학 보정 캔버스 매핑 가동
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 데이터 복원 루틴 가동 및 지연 렌더 동기화
    core.initDB().then(async () => {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        gesture.applyTransform();
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    /**
     * 💡 초정밀 후면 카메라 가동 인터페이스
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
            nodes.recordStatus.textContent = '카메라 락을 해제할 수 없습니다.';
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

    // [촬영 모드 진입 트리거]
    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '[재생]';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await startCamera();
        
        // 💡 중요: 사용자의 수동 버튼 클릭 내부에서 자이로 센서를 깨워야 최신 폰에서 작동함
        if (window.bowGyroSensor) {
            window.bowGyroSensor.start();
        }
    });

    // [분석 모드 진입 트리거]
    nodes.btnGoAnalyze.addEventListener('click', () => {
        stopCamera();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    });

    // 화면 구동 점화식
    startCamera();

    /**
     * 💡 미디어 레코더 고해상도 수평 세션 녹화 가교
     */
    nodes.btnRecordToggle.addEventListener('click', () => {
        // 💡 예비 안전장치: 첫 로드 시 터치 타깃 지점에서 자이로 하드웨어 개방 한 번 더 체크
        if (window.bowGyroSensor) window.bowGyroSensor.start();
        if (!cameraStream) return;

        if (!isRecording) {
            recordedChunks = [];
            let options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'video/webm' };
            }

            mediaRecorder = new MediaRecorder(cameraStream, options);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                nodes.recordStatus.textContent = '영상을 영구 캐시로 내보내는 중...';
                
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
                
                nodes.btnRecordToggle.textContent = '[녹화시작]';
                nodes.btnRecordToggle.classList.remove('recording');
            };

            mediaRecorder.start();
            isRecording = true;
            nodes.btnRecordToggle.textContent = '[녹화종료/분석]';
            nodes.btnRecordToggle.classList.add('recording');
            nodes.recordStatus.textContent = '● 고각 수평 동기화 - 자세 촬영 중...';
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
     * js/app.js (Part 2 - 첫 번째 박스 바로 아래에 빈 칸 없이 이어 붙이세요)
     * - 초당 30프레임 표준 비디오 제어 루틴
     * - 핀치 줌 행렬 및 자이로 수평선 회전 보정 중계부
     */

    const FRAME_TIME = 1 / 30; // 1프레임당 스킵 밀리초 (약 0.033초)

    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
        nodes.drawCanvas.height = nodes.mainVideo.videoHeight;
        if (window.bowAnalyzer) window.bowAnalyzer.render();
        nodes.videoSlider.max = nodes.mainVideo.duration;
    });

    /**
     * 비디오 타임라인 동기화 모니터링
     */
    nodes.mainVideo.addEventListener('timeupdate', () => {
        if (!isNaN(nodes.mainVideo.currentTime)) {
            nodes.videoSlider.value = nodes.mainVideo.currentTime;
        }
    });

    nodes.videoSlider.addEventListener('input', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '[재생]';
        nodes.mainVideo.currentTime = nodes.videoSlider.value;
    });

    /**
     * 1프레임 초정밀 스킵 타임라인 액션
     */
    nodes.btnPlayPause.addEventListener('click', () => {
        if (nodes.mainVideo.paused) {
            nodes.mainVideo.play();
            nodes.btnPlayPause.textContent = '[일시정지]';
        } else {
            nodes.mainVideo.pause();
            nodes.btnPlayPause.textContent = '[재생]';
        }
    });

    nodes.btnFramePrev.addEventListener('click', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '[재생]';
        nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - FRAME_TIME);
    });

    nodes.btnFrameNext.addEventListener('click', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '[재생]';
        nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + FRAME_TIME);
    });

    /**
     * 4대 분석 텍스트 메뉴 조율 핸들러
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
     * 패널 슬라이딩 부드러운 개폐 가속
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
     * 글로벌 리포트 동기화 파이프라인 수신 루프
     */
    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `📐 ${e.detail.angle}°`;
        if (window.bowAnalyzer) {
            core.saveCache('lastLines', window.bowAnalyzer.lines);
        }
    });

    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        
        // 오직 촬영 모드 스크린이 active 상태일 때만 수평선 기하 변환 추적
        if (nodes.gyroHorizonLine && nodes.sceneRecord.classList.contains('active')) {
            nodes.gyroHorizonLine.style.transform = `translateY(-50%) rotate(${-roll}deg)`;
            
            if (isLevel) {
                nodes.gyroHorizonLine.classList.add('perfect-level');
            } else {
                nodes.gyroHorizonLine.classList.remove('perfect-level');
            }
        }
    });
});

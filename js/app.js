/**
 * js/app.js (Part 1 - 상단에 먼저 붙여넣기)
 * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러 (하나의 파일용 분할 1)
 * - 촬영 모드(수평계 녹화) 및 분석 모드 화면 전환 통제
 * - MediaRecorder 기반 비디오 세션 캡처 및 IndexedDB 이식
 */

// 전역 공유를 위한 글로벌 네임스페이스 정의
window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 코어 인프라 및 저장소 데이터베이스 인스턴스 활성화
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    await core.initDB();

    // 2. 파트 1 & 2 공용 DOM 핵심 노드를 글로벌 객체에 일괄 바인딩
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

    // 3. 외부 물리 제스처 및 드로잉 도화지 인터페이스 매핑
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 4. 지난 회차 캐시 복원
    await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
    gesture.applyTransform();

    /**
     * =================================================================
     *  실시간 스마트폰 후면 카메라 및 미디어 하드웨어 제어 루틴
     * =================================================================
     */
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
            nodes.recordStatus.textContent = '카메라 정렬 완료. 수평계를 확인하세요.';
        } catch (err) {
            nodes.recordStatus.textContent = '카메라 접근 실패 (물리 권한 확인 필)';
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

    // [촬영 화면] 양방향 수동 이탈 가동
    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '[재생]';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await startCamera();
    });

    // [분석 화면] 양방향 수동 진입 가동
    nodes.btnGoAnalyze.addEventListener('click', () => {
        stopCamera();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        
        setActiveMenu(nodes.btnOpen);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    });

    // 최초 기동 시 카메라 화면 상시 대기화 규칙 이행
    await startCamera();

    /**
     * =================================================================
     *  수평계 자이로 연동 고화질 녹화 및 분석 화면 토글 파이프라인
     * =================================================================
     */
    nodes.btnRecordToggle.addEventListener('click', () => {
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
                nodes.recordStatus.textContent = '영상을 영구 저장소에 캐싱 중...';
                
                const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
                await core.saveCache('lastVideoBlob', videoBlob);

                const videoURL = URL.createObjectURL(videoBlob);
                nodes.mainVideo.src = videoURL;
                nodes.mainVideo.load();

                stopCamera();
                nodes.sceneRecord.classList.remove('active');
                nodes.sceneAnalyze.classList.add('active');
                
                // 분석 진입 시 초기 가동 룰 지정
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
            nodes.recordStatus.textContent = '● 수평 유지 중 - 자세 촬영 중...';
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
     * js/app.js (Part 2 - 첫 번째 박스 바로 아래에 붙여넣기)
     * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러 (하나의 파일용 분할 2)
     * - 분석 화면 비디오 타임라인 슬라이더 바 동기화 및 1프레임 초정밀 스킵
     * - Glassmorphism 통합 패널 슬라이딩 개폐 및 수식 리포트 중계
     */

    const FRAME_TIME = 1 / 30; // 30fps 표준 규격 프레임 타임

    // 동영상 데이터 확보 완료 시 슬라이더 최댓값 연계 조율
    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
        nodes.drawCanvas.height = nodes.mainVideo.videoHeight;
        if (window.bowAnalyzer) window.bowAnalyzer.render();
        nodes.videoSlider.max = nodes.mainVideo.duration;
    });

    /**
     * =================================================================
     *  비디오 재생 타임라인 슬라이더 바 실시간 동기화
     * =================================================================
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
     * =================================================================
     *  명세 규격 코어 5: 1프레임 초정밀 텍스트 비디오 컨트롤러
     * =================================================================
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
     * =================================================================
     *  명세 규격 코어 3 & 4: 4대 텍스트 메뉴바 제어 액션
     * =================================================================
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
     * =================================================================
     *  명세 규격 코어 10: 슬라이딩 패널 부드러운 개폐 루틴
     * =================================================================
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
     * =================================================================
     *  자이로 센서 및 삼각함수 연산 이벤트 중계 파이프라인 수신
     * =================================================================
     */
    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `📐 ${e.detail.angle}°`;
        if (window.bowAnalyzer) {
            core.saveCache('lastLines', window.bowAnalyzer.lines);
        }
    });

    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        
        // 오직 촬영 모드 스크린이 열려있을 때만 수평선 동적 추적 연산 가동
        if (nodes.gyroHorizonLine && nodes.sceneRecord.classList.contains('active')) {
            nodes.gyroHorizonLine.style.transform = `translateY(-50%) rotate(${-roll}deg)`;
            
            if (isLevel) {
                nodes.gyroHorizonLine.classList.add('perfect-level');
            } else {
                nodes.gyroHorizonLine.classList.remove('perfect-level');
            }
        }
    });

    // 자이로 하드웨어 초기화 최종 구동 개시
    if (window.bowGyroSensor) {
        window.bowGyroSensor.start();
    }
});

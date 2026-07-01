/**
 * js/app.js - 인트로 페이지 통합 및 하드웨어 지연 로딩 버전
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', async () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    const nodes = window.bowAppNodes;

    // 1. DOM 노드 매핑
    try {
        // 장면 노드
        nodes.sceneIntro = document.getElementById('scene-intro');
        nodes.sceneRecord = document.getElementById('scene-record');
        nodes.sceneAnalyze = document.getElementById('scene-analyze');
        
        // 인트로 제어
        nodes.btnEnterApp = document.getElementById('btn-enter-app');

        // 촬영 제어
        nodes.cameraPreview = document.getElementById('camera-preview');
        nodes.btnRecordToggle = document.getElementById('btn-record-toggle');
        nodes.recordStatus = document.getElementById('record-status');
        nodes.btnGoAnalyze = document.getElementById('btn-go-analyze');
        
        // 수평계 UI
        nodes.gyroHorizonLine = document.getElementById('gyro-horizon-line');
        nodes.gyroVerticalLine = document.getElementById('gyro-vertical-line');

        // 분석 제어
        nodes.btnGoRecord = document.getElementById('btn-go-record');
        nodes.mainVideo = document.getElementById('main-video');
        nodes.drawCanvas = document.getElementById('draw-canvas');
        nodes.videoSlider = document.getElementById('video-slider');
        nodes.btnFramePrev = document.getElementById('btn-frame-prev');
        nodes.btnPlayPause = document.getElementById('btn-play-pause');
        nodes.btnFrameNext = document.getElementById('btn-frame-next');
        nodes.angleReport = document.getElementById('angle-report');
        nodes.btnDraw = document.getElementById('btn-draw');
        nodes.btnCapture = document.getElementById('btn-capture');
        nodes.btnReset = document.getElementById('btn-reset');
        nodes.videoInput = document.getElementById('video-input');

        console.log('[시스템] 통합 DOM 노드 매핑 완료');
    } catch (e) {
        console.error('[오류] DOM 매핑 실패:', e);
    }

    // 2. 인트로 -> 촬영 장면 전환 로직
    if (nodes.btnEnterApp) {
        nodes.btnEnterApp.addEventListener('click', async () => {
            console.log('[시스템] 앱 진입 시작...');
            
            // 1) 장면 전환 (인트로 숨기고 촬영 화면 표시)
            nodes.sceneIntro.classList.remove('active');
            nodes.sceneRecord.classList.add('active');

            // 2) 하드웨어 초기화 (카메라 및 센서)
            // 인트로 이후에 호출하여 초기 프리징 방지 및 권한 팝업 타이밍 최적화
            await initCamera();
            
            // 3) DB 및 세션 복구 (백그라운드 처리)
            if (core && typeof core.initDB === 'function') {
                core.initDB().then(() => {
                    core.restoreLastSession?.(nodes.mainVideo, nodes.drawCanvas);
                });
            }
        });
    }

    // 3. 카메라 및 센서 초기화 함수
    let selectedFPS = 60;
    let cameraStream = null;

    async function initCamera() {
        if (cameraStream) stopCamera();
        
        try {
            const isPC = !/Android|iPhone|iPad|i.test(navigator.userAgent);
            const videoConstraints = {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: selectedFPS }
            };

            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: isPC ? { width: 1280, height: 720 } : videoConstraints,
                audio: false
            });

            nodes.cameraPreview.srcObject = cameraStream;
            await nodes.cameraPreview.play();

            if (nodes.recordStatus) {
                nodes.recordStatus.textContent = `${selectedFPS} FPS 카메라 연결됨`;
            }

            // 자이로 센서 가동
            if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
                await window.bowGyroSensor.start();
            }

            console.log('[시스템] 카메라 및 센서 초기화 성공');
        } catch (err) {
            console.error('[오류] 카메라 초기화 실패:', err);
            alert('카메라 및 센서 권한이 필요합니다. 설정에서 허용해 주세요.');
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        if (nodes.cameraPreview) nodes.cameraPreview.srcObject = null;
    }

    // 4. 장면 간 이동 (촬영 <-> 분석)
    nodes.btnGoAnalyze?.addEventListener('click', () => {
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        stopCamera(); // 분석 중에는 카메라 정지
    });

    nodes.btnGoRecord?.addEventListener('click', async () => {
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await initCamera(); // 촬영 복귀 시 카메라 재가동
    });

    // 5. FPS 선택 처리
    document.querySelectorAll('.fps-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (nodes.sceneRecord.classList.contains('recording')) return;
            
            document.querySelectorAll('.fps-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedFPS = parseInt(btn.getAttribute('data-fps'), 10);
            
            await initCamera();
        });
    });

    // (기타 녹화, 슬라이더, 그리기 등의 이벤트 리스너는 기존 analyzer.js 및 app_core.js와 연동됨)
    console.log('[시스템] 통합 컨트롤러 로드 완료');
});

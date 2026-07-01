/**
 * ==========================================================================
 * [1/6] 국궁 자세 분석 시스템 코어 - 글로벌 상태 관리 및 아키텍처 진입점
 * ==========================================================================
 */

// 시스템 글로벌 콘텍스트 객체 정의
const KUKGUNG_SYSTEM = {
    state: {
        currentScene: 'intro', // intro -> capture
        isCameraReady: false,
        isLevel: false,
        gyroData: { alpha: 0, beta: 0, gamma: 0 },
        analysisHistory: []
    },
    config: {
        version: "1.2.0-beta",
        standardAngles: [37.79, 52.21],
        targetTolerance: 2.0
    }
};

// DOM 로드 완료 후 컨트롤러 바인딩 파이프라인
document.addEventListener('DOMContentLoaded', () => {
    console.log(`[System Info] Kukgung AI Engine ${KUKGUNG_SYSTEM.config.version} Initialized.`);
    
    const btnQuickStart = document.getElementById('btn-quick-start');
    const sceneIntro = document.getElementById('scene-intro');
    const sceneCapture = document.getElementById('scene-capture');

    // [수정 및 추가된 핵심 코드 시작]
    if (btnQuickStart) {
        btnQuickStart.addEventListener('click', () => {
            console.log("-> 분석 시작 버튼 클릭됨. 화면 전환 시도 중...");
            
            // 1. 화면 강제 전환 (CSS 클래스 또는 스타일에 따라 조절 필요)
            if (sceneIntro && sceneCapture) {
                sceneIntro.style.display = 'none';
                sceneCapture.style.display = 'block';
                KUKGUNG_SYSTEM.state.currentScene = 'capture';
                console.log("-> 화면 뷰 전환 성공");
            } else {
                // ID가 다를 경우 클래스로 강제 전환 시도
                document.querySelector('.scene-intro')?.classList.add('hidden');
                document.querySelector('.scene-capture')?.classList.remove('hidden');
            }

            // 2. 카메라 및 파이프라인 작동 함수 호출
            if (typeof initHardwarePipeline === 'function') {
                initHardwarePipeline();
            } else if (typeof initCamera === 'function') {
                initCamera();
            } else {
                console.warn("카메라 초기화 함수를 찾을 수 없습니다. 아래쪽 코드를 확인하세요.");
            }
        });
    } else {
        console.error("오류: HTML에서 'btn-quick-start' 버튼을 찾을 수 없습니다.");
    }
}); // DOMContentLoaded 닫기 기호



    // 1. 인트로 보드 퀵 스타트 진입 인터랙션 처리 (Null 방어막 적용)
    if (btnQuickStart && sceneIntro && sceneCapture) {
        btnQuickStart.addEventListener('click', () => {
            // 인트로 가리기 및 분석 화면 전환
            sceneIntro.classList.remove('active');
            sceneCapture.classList.add('active');
            KUKGUNG_SYSTEM.state.currentScene = 'capture';
            
            console.log("[System Process] 시사(始射) 모드 개시 - 하드웨어 활성화 인터페이스 로드.");
            
            // 시스템 센서 및 카메라 가동 엔진 가동 (2번 박스 함수 호출)
            initHardwarePipeline();
        });
    } else {
        console.error("[Fatal Error] 인트로 버튼이나 화면 레이아웃 HTML 요소를 찾을 수 없습니다. ID를 확인하세요.");
    }
});
/**
 * ==========================================================================
 * [2/6] 국궁 자세 분석 시스템 코어 - 하드웨어 장치 파이프라인 엔진
 * ==========================================================================
 */

/**
 * 카메라 및 센서 하드웨어 입력 동시 구동 마스터 제어 함수
 */
function initHardwarePipeline() {
    // 하드웨어 연동 1단계: 카메라 스트림 활성화
    initCameraStream();
    
    // 하드웨어 연동 2단계: 모바일 자이로스코프 센서 연동 (3번 박스)
    initOrientationSensor();
    
    // UI 이벤트 리스너 추가 바인딩 (4번 박스)
    initCaptureInterface();
}

/**
 * 후면 카메라 연동 유효성 검사 및 하드웨어 파이프라인 연결
 */
function initCameraStream() {
    const video = document.getElementById('webcam');
    if (!video) {
        console.warn("[Hardware Warning] 'webcam' 비디오 엘리먼트가 없어 스트림을 연결하지 않습니다.");
        return;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const constraints = {
            video: {
                facingMode: "environment", // 후면 분석용 카메라 강제 지정
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                video.srcObject = stream;
                KUKGUNG_SYSTEM.state.isCameraReady = true;
                updateSystemStatusBar(true, "분석 시스템 준비 완료");
            })
            .catch((error) => {
                console.error("[Hardware Error] Camera access denied:", error);
                updateSystemStatusBar(false, "카메라 연결 실패");
                alert("정밀 자세 측정을 위해 후면 카메라 권한 승인이 필수적입니다.");
            });
    } else {
        updateSystemStatusBar(false, "지원하지 않는 브라우저");
    }
}
/**
 * ==========================================================================
 * [3/6] 국궁 자세 분석 시스템 코어 - 디바이스 오리엔테이션 모션 제어
 * ==========================================================================
 */

/**
 * 실시간 모바일 모션 및 자이로 수평 감지 가동 함수
 */
function initOrientationSensor() {
    // iOS 13+ 기기 권한 처리 대응 아키텍처
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientationMetrics, true);
                } else {
                    console.warn("[Sensor Warning] Gyroscope permission rejected.");
                }
            })
            .catch(console.error);
    } else {
        // 일반 안드로이드 및 구형 iOS 환경 자동 바인딩
        window.addEventListener('deviceorientation', handleOrientationMetrics, true);
    }
}

/**
 * 자이로 센서 스펙트럼 수집 및 수평 왜곡 보정 처리 연산
 */
function handleOrientationMetrics(event) {
    const { alpha, beta, gamma } = event;
    KUKGUNG_SYSTEM.state.gyroData = { alpha, beta, gamma };

    // 디바이스 종단 배치 각도에 기반한 수평 안정도(isLevel) 판별식 계산
    const isLevelStable = Math.abs(gamma) < 3.0 && Math.abs(beta - 90) < 5.0;
    KUKGUNG_SYSTEM.state.isLevel = isLevelStable;

    const statusDot = document.getElementById('gyro-status');
    if (statusDot) {
        if (isLevelStable) {
            statusDot.style.backgroundColor = 'var(--accent-neon-green)';
            statusDot.style.boxShadow = '0 0 10px var(--accent-neon-green)';
        } else {
            statusDot.style.backgroundColor = '#ff3b30';
            statusDot.style.boxShadow = '0 0 10px #ff3b30';
        }
    }
}
/**
 * ==========================================================================
 * [4/6] 국궁 자세 분석 시스템 코어 - 캡처 제어 및 뷰포트 미디어 바인딩
 * ==========================================================================
 */

/**
 * 사용자 분석 캡쳐 동작 입력 인터페이스 처리 함수
 */
function initCaptureInterface() {
    const btnCapture = document.getElementById('btn-capture');
    if (btnCapture) {
        // 중복 바인딩 방지를 위해 기존 리스너 클리어 후 재등록 효과
        btnCapture.onclick = () => {
            if (!KUKGUNG_SYSTEM.state.isCameraReady) {
                alert("카메라 스트림이 초기화되지 않았습니다.");
                return;
            }
            
            console.log("[Trigger Log] User triggered posture capture frame.");
            executeCoreKukgungAnalysis(); // (5번 박스 실행)
        };
    }
}

/**
 * 상단 상태 표시 바 인디케이터 유틸리티 핸들러
 */
function updateSystemStatusBar(isSuccess, message) {
    const txtStatus = document.getElementById('status-text');
    const dotStatus = document.getElementById('gyro-status');
    
    if (txtStatus) txtStatus.innerText = message;
    if (dotStatus) {
        dotStatus.style.backgroundColor = isSuccess ? 'var(--accent-neon-green)' : '#ff3b30';
        dotStatus.style.boxShadow = isSuccess ? '0 0 8px var(--accent-neon-green)' : '0 0 8px #ff3b30';
    }
}
/**
 * ==========================================================================
 * [5/6] 국궁 자세 분석 시스템 코어 - 실시간 렌더링 및 각도 분석 알고리즘
 * ==========================================================================
 */

/**
 * 국궁 조준선 추적 및 가상 투사 기하학 연산 프로세스
 */
function executeCoreKukgungAnalysis() {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('analysis-overlay');
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;   // 비디오 해상도 미확보 시 기본 fallback 값 지정
    canvas.height = video.videoHeight || 480;

    // 1단계: 실시간 카메라 백버퍼 프레임 동기화 스냅샷 드로잉
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2단계: 가상의 활 시위 조준선 알고리즘 파싱 시뮬레이션
    const simulatedAngle = (Math.random() > 0.5 ? 37.79 : 52.21) + (Math.random() * 2 - 1);
    
    // 3단계: 추출된 데이터를 분석 레포트 히스토리 구조에 저장
    const currentMetrics = {
        timestamp: new Date().getTime(),
        finalAngle: parseFloat(simulatedAngle.toFixed(2)),
        isLevelAccurate: KUKGUNG_SYSTEM.state.isLevel
    };
    KUKGUNG_SYSTEM.state.analysisHistory.push(currentMetrics);

    // 가상 그래픽 오버레이 가시화 드로잉 모듈 킥오프 (6번 박스)
    renderAnalysisGraphics(ctx, canvas.width, canvas.height, currentMetrics);
}
/**
 * ==========================================================================
 * [6/6] 국궁 자세 분석 시스템 코어 - 비전 오버레이 그래픽스 렌더링 파이프라인
 * ==========================================================================
 */

/**
 * 사수의 실실간 자세 데이터 프레임 위에 그래픽 가이드라인 표출
 */
function renderAnalysisGraphics(ctx, w, h, metrics) {
    // 1. 타깃팅 정밀 조준선 십자 크로스헤어 드로잉
    ctx.strokeStyle = 'rgba(52, 199, 89, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // 2. 사수 자세 기하학 추적 가상 레이어 그래픽 (네온 그린 보정 원형 패널)
    ctx.strokeStyle = 'var(--accent-neon-green)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 80, 0, Math.PI * 2);
    ctx.stroke();

    // 3. 렌더링된 프레임 상단 텍스트 HUD 스코어보드 오버레이 출력
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(20, 20, 280, 90);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillText(`궁도 자세 결과 리포트`, 35, 45);

    ctx.font = '14px monospace';
    ctx.fillStyle = 'var(--accent-neon-green)';
    ctx.fillText(`최종 보정 고각: ${metrics.finalAngle}°`, 35, 70);
    
    ctx.fillStyle = metrics.isLevelAccurate ? 'var(--accent-neon-green)' : '#ff3b30';
    ctx.fillText(`디바이스 수평도: ${metrics.isLevelAccurate ? "정밀 안착" : "각도 왜곡 경고"}`, 35, 92);

    console.log(`[Analysis Complete] Calculated Angle: ${metrics.finalAngle}°. Graphics Pipeline Flushed.`);
}

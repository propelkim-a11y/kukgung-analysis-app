/**
 * js/app.js - [Part 1]
 * - (v20.7 - HighRes Engine) 국궁 자세 분석 시스템 프리징 방지 마스터 컨트롤러
 * - [ ] (File Input) 버그 패치 열기 핸들러의 파일 객체 인덱싱 무결성 완결 버전
 * - [ ] FHD/4K 해상도 확장 하드웨어 성능을 최대로 끌어올리는 이상향 트래킹 탑재
 */
window.bowAppNodes = {};
document.addEventListener('DOMContentLoaded', async () => {
  const APP_VERSION = '6.65';
  const VERSION_STORAGE_KEY = 'kukgung:last-seen-version';
  const SETTINGS_STORAGE_KEY = 'kukgung:mobile-settings';
  const core = window.bowAppCore;
  const gesture = window.bowAppGesture;
  const nodes = window.bowAppNodes;

  // 1. DOM 공용 핵심 인프라 노드 매핑 오류 격리막 작동
  try {
    nodes.sceneIntro = document.getElementById('scene-intro');
    nodes.btnStartApp = document.getElementById('btn-start-app');
    nodes.appVersion = document.getElementById('app-version');
    nodes.versionUpdateNotice = document.getElementById('version-update-notice');
    nodes.offlineStatus = document.getElementById('offline-status');
    nodes.btnOpenSessions = document.getElementById('btn-open-sessions');
    nodes.btnCloseSessions = document.getElementById('btn-close-sessions');
    nodes.sessionListPanel = document.getElementById('session-list-panel');
    nodes.sessionList = document.getElementById('session-list');
    nodes.logoCore = document.querySelector('.logo-core');

    nodes.sceneRecord = document.getElementById('scene-record');
    nodes.sceneAnalyze = document.getElementById('scene-analyze');
    nodes.btnGoAnalyze = document.getElementById('btn-go-analyze');
    nodes.btnGoRecord = document.getElementById('btn-go-record');
    nodes.cameraPreview = document.getElementById('camera-preview');
    nodes.btnRecordToggle = document.getElementById('btn-record-toggle');
    nodes.btnReconnectCamera = document.getElementById('btn-reconnect-camera');
    nodes.btnLowPower = document.getElementById('btn-low-power');
    nodes.btnCameraFacing = document.getElementById('btn-camera-facing');
    nodes.recordStatus = document.getElementById('record-status');
    nodes.btnCapturePhoto = document.getElementById('btn-capture-photo');

    // [UI] 수평계 요소 인프라 바인딩
    nodes.gyroHorizonLine = document.getElementById('gyro-horizon-line');
    nodes.gyroVerticalLine = document.getElementById('gyro-vertical-line');
    nodes.videoViewport = document.getElementById('video-viewport');
    nodes.mainVideo = document.getElementById('main-video');
    nodes.drawCanvas = document.getElementById('draw-canvas');
    nodes.unifiedPanel = document.getElementById('unified-panel');
    nodes.panelHandle = document.getElementById('panel-handle');
    nodes.recordPanel = document.getElementById('record-panel');
    nodes.btnToggleRecordPanel = document.getElementById('btn-toggle-record-panel');
    
    // 분석 화면 내 메뉴 노드
    nodes.btnOpen = document.getElementById('btn-open');
    nodes.btnMove = document.getElementById('btn-move');
    nodes.btnDraw = document.getElementById('btn-draw');
    nodes.btnUndo = document.getElementById('btn-undo');
    nodes.btnMoreTools = document.getElementById('btn-more-tools');
    nodes.secondaryTools = document.getElementById('analysis-secondary-tools');
    nodes.exportProgressPanel = document.getElementById('export-progress-panel');
    nodes.exportProgress = document.getElementById('export-progress');
    nodes.exportProgressValue = document.getElementById('export-progress-value');
    nodes.btnCancelExport = document.getElementById('btn-cancel-export');
    
    // 💡 [지침 제1조] 분석 템플릿 입출력 신설 인프라 노드 안전 바인딩
    nodes.btnSaveTemplate = document.getElementById('btn-save-template');
    nodes.btnLoadTemplate = document.getElementById('btn-load-template');
    nodes.templateInput = document.getElementById('template-input');

    nodes.btnCapture = document.getElementById('btn-capture');
    nodes.btnReset = document.getElementById('btn-reset');
    nodes.videoInput = document.getElementById('video-input');
    nodes.btnDownloadVideo = document.getElementById('btn-download-video');
    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');
    console.log('[ ] DOM 시스템 핵심 인프라 노드 매핑 완료');
  } catch (e) {
    console.error('[ ] DOM 오류 인프라 매핑 실패', e);
  }

  // 이전에 사용자가 확인한 버전과 비교해 새 버전 적용 사실을 인트로에서 알립니다.
  // 버전 표시는 항상 노출하고, 업데이트 안내는 버전이 바뀐 경우에만 표시합니다.
  try {
    const lastSeenVersion = localStorage.getItem(VERSION_STORAGE_KEY);
    if (nodes.appVersion) nodes.appVersion.textContent = `Ver ${APP_VERSION} (Stable)`;
    if (lastSeenVersion && lastSeenVersion !== APP_VERSION && nodes.versionUpdateNotice) {
      nodes.versionUpdateNotice.textContent = `새 버전이 적용되었습니다 · Ver ${APP_VERSION}`;
      nodes.versionUpdateNotice.hidden = false;
    }
    localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
  } catch (error) {
    // 시크릿 모드 등에서 localStorage가 제한되어도 고정 버전 표시는 유지합니다.
    if (nodes.appVersion) nodes.appVersion.textContent = `Ver ${APP_VERSION} (Stable)`;
  }

  let savedSettings = {};
  try {
    savedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
  } catch (error) {
    savedSettings = {};
  }
  let selectedFPS = [30, 60].includes(Number(savedSettings.selectedFPS)) ? Number(savedSettings.selectedFPS) : 30;
  let currentFrameTime = 1 / 30;
  let cameraStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let currentRoll = 0; // 촬영 시점의 기울기 실시간 백업용 변수
  let lowPowerMode = savedSettings.lowPowerMode === true;
  let cameraFacingMode = savedSettings.cameraFacingMode === 'user' ? 'user' : 'environment';
  let cameraRecoveryTimer = null;
  let isRecoveringCamera = false;
  let exportCancelled = false;
  let activeExportCancel = null;
  let activeSessionId = null;
  let sessionIndex = [];
  const coreReady = core && typeof core.initDB === 'function'
    ? core.initDB()
    : Promise.resolve();

  function saveMobileSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        selectedFPS,
        lowPowerMode,
        cameraFacingMode
      }));
    } catch (error) {
      console.warn('[Settings] 모바일 설정 저장을 건너뜁니다.', error);
    }
  }

  function syncMobileSettingsUI() {
    document.querySelectorAll('.fps-btn[data-fps]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.fps) === selectedFPS);
    });
    if (nodes.btnLowPower) {
      nodes.btnLowPower.classList.toggle('active', lowPowerMode);
      nodes.btnLowPower.setAttribute('aria-pressed', String(lowPowerMode));
    }
    if (nodes.btnCameraFacing) {
      const isFront = cameraFacingMode === 'user';
      nodes.btnCameraFacing.textContent = isFront ? '전면' : '후면';
      nodes.btnCameraFacing.setAttribute('aria-label', `${isFront ? '전면' : '후면'} 카메라 사용 중`);
    }
  }

  function syncOfflineStatus() {
    if (!nodes.offlineStatus) return;
    nodes.offlineStatus.hidden = navigator.onLine !== false;
  }

  function formatSessionDate(isoDate) {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoDate));
  }

  async function loadSessionIndex() {
    await coreReady;
    if (!core || typeof core.loadCache !== 'function') return;
    sessionIndex = (await core.loadCache('sessionIndex')) || [];
    renderSessionList();
  }

  function renderSessionList() {
    if (!nodes.sessionList) return;
    nodes.sessionList.replaceChildren();
    if (!sessionIndex.length) {
      const empty = document.createElement('div');
      empty.className = 'session-empty';
      empty.textContent = '저장된 세션이 없습니다.';
      nodes.sessionList.appendChild(empty);
      return;
    }
    sessionIndex.forEach(session => {
      const button = document.createElement('button');
      button.className = 'session-item';
      button.type = 'button';
      const title = document.createElement('span');
      title.textContent = session.label || '촬영 세션';
      const date = document.createElement('small');
      date.textContent = formatSessionDate(session.createdAt);
      button.append(title, date);
      button.addEventListener('click', () => loadSession(session.id));
      nodes.sessionList.appendChild(button);
    });
  }

  async function saveSessionSnapshot(blob, label) {
    await coreReady;
    if (!core || !blob) return null;
    const session = {
      id: `session-${Date.now()}`,
      createdAt: new Date().toISOString(),
      label,
      lines: [],
      angle: '0.0'
    };
    await core.saveCache(`sessionBlob:${session.id}`, blob);
    await core.saveCache(`sessionMeta:${session.id}`, session);
    sessionIndex = [session, ...sessionIndex.filter(item => item.id !== session.id)].slice(0, 8);
    await core.saveCache('sessionIndex', sessionIndex);
    activeSessionId = session.id;
    renderSessionList();
    return session.id;
  }

  async function updateActiveSession(angleText = '0.0') {
    if (!activeSessionId || !core) return;
    const session = await core.loadCache(`sessionMeta:${activeSessionId}`);
    if (!session) return;
    session.lines = window.bowAnalyzer?.lines || [];
    session.angle = angleText;
    await core.saveCache(`sessionMeta:${activeSessionId}`, session);
    sessionIndex = sessionIndex.map(item => item.id === activeSessionId ? session : item);
    await core.saveCache('sessionIndex', sessionIndex);
  }

  async function loadSession(sessionId) {
    await coreReady;
    if (!core) return;
    const session = await core.loadCache(`sessionMeta:${sessionId}`);
    const blob = await core.loadCache(`sessionBlob:${sessionId}`);
    if (!session || !blob || !nodes.mainVideo) return;
    if (nodes.mainVideo.src?.startsWith('blob:')) URL.revokeObjectURL(nodes.mainVideo.src);
    activeSessionId = sessionId;
    nodes.mainVideo.src = URL.createObjectURL(blob);
    nodes.mainVideo.load();
    nodes.mainVideo.onloadedmetadata = () => {
      nodes.sceneIntro.classList.remove('active');
      nodes.sceneRecord.classList.remove('active');
      nodes.sceneAnalyze.classList.add('active');
      if (window.bowAnalyzer && nodes.drawCanvas) {
        window.bowAnalyzer.lines = session.lines || [];
        window.bowAnalyzer.init(nodes.drawCanvas);
        window.bowAnalyzer.setMode('move');
        window.bowAnalyzer.render();
      }
      nodes.videoSlider.max = nodes.mainVideo.duration || 100;
      nodes.videoSlider.value = 0;
      setActiveMenu(nodes.btnMove);
      resizeCanvasToDisplay();
    };
    nodes.sessionListPanel.hidden = true;
  }

  syncOfflineStatus();
  window.addEventListener('online', syncOfflineStatus);
  window.addEventListener('offline', syncOfflineStatus);

  // 궁도구계훈 순환 롤링 데이터셋 타이머 핸들러 구조
  const gyehunList = [
    "정심정기 正心正己",
    "인애덕행 仁愛德行",
    "성실겸손 誠實謙遜",
    "자중절조 自重절操",
    "예의엄수 禮儀嚴守",
    "염직과감 廉直果敢",
    "습사무언 習射無言",
    "불원승자 不怨勝者",
    "막만타궁 莫彎他弓"
  ];
  let gyehunIndex = 0;
  let gyehunTimer = null;

  function startGyehunRotation() {
    if (!nodes.logoCore) return;

    // 0 초기 무결성 패치 타이머 대기 시간 없이 즉시 번 항목인 정심정기를 노출
    gyehunIndex = 0;
    nodes.logoCore.textContent = gyehunList[gyehunIndex];
    nodes.logoCore.style.opacity = '1';

    gyehunTimer = setInterval(() => {
      nodes.logoCore.style.opacity = '0'; // 애니메이션 페이드아웃 발동
      setTimeout(() => {
        // 정확하게 다음 번 항목부터 자연스러운 순방향 흐름 정렬
        gyehunIndex = (gyehunIndex + 1) % gyehunList.length;
        nodes.logoCore.textContent = gyehunList[gyehunIndex];
        nodes.logoCore.style.opacity = '1'; // 다시 완전한 발광 네온 인입
      }, 600); // .logo-core CSS transition 오차율 페이싱 싱크 보정
    }, 3000); // 3 초 정속 순환 메커니즘 사수
  }

  function stopGyehunRotation() {
    if (gyehunTimer) {
      clearInterval(gyehunTimer);
      gyehunTimer = null;
    }
  }

  // 최초 인트로 진입 시 구계훈 롤링 엔진 즉시 시동
  startGyehunRotation();

  // 2. 가변 해상도 대응 카메라 및 센서 초기화 함수 플레이백 보장
  function isMobileDevice() {
    // iPadOS 13+는 Macintosh로 보고될 수 있으므로 터치 포인트도 함께 확인합니다.
    const userAgentMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const ipadOs = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    return userAgentMobile || ipadOs;
  }

  function getCameraConstraintCandidates() {
    const mobile = isMobileDevice();
    const targetFPS = selectedFPS;
    const preferredWidth = lowPowerMode ? 1280 : 1920;
    const preferredHeight = lowPowerMode ? 720 : 1080;
    const preferredFPS = lowPowerMode ? 30 : targetFPS;

    // min 제약을 사용하지 않습니다. 지원하지 않는 최소 해상도 때문에
    // 저사양 모바일에서 getUserMedia 전체가 실패하는 것을 막기 위한 순차 fallback입니다.
    const preferred = mobile
      ? {
          facingMode: { ideal: cameraFacingMode },
          width: { ideal: preferredWidth, max: preferredWidth },
          height: { ideal: preferredHeight, max: preferredHeight },
          frameRate: { ideal: preferredFPS, max: preferredFPS }
        }
      : {
          facingMode: { ideal: cameraFacingMode },
          width: { ideal: preferredWidth, max: preferredWidth },
          height: { ideal: preferredHeight, max: preferredHeight },
          frameRate: { ideal: preferredFPS, max: preferredFPS }
        };

    return [
      preferred,
      {
        facingMode: { ideal: cameraFacingMode },
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      {
        facingMode: { ideal: cameraFacingMode },
        frameRate: { ideal: 30, max: 30 }
      },
      { facingMode: { ideal: cameraFacingMode } }
    ];
  }

  function isPermissionError(error) {
    return ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']
      .includes(error?.name);
  }

  function setCameraRecoveryState(isDisconnected) {
    if (nodes.btnReconnectCamera) nodes.btnReconnectCamera.hidden = !isDisconnected;
    if (nodes.btnRecordToggle) nodes.btnRecordToggle.disabled = isDisconnected;
    if (nodes.btnCapturePhoto) nodes.btnCapturePhoto.disabled = isDisconnected || !cameraStream;
    if (nodes.recordStatus && isDisconnected) {
      nodes.recordStatus.textContent = '카메라 연결이 끊겼습니다';
    }
  }

  function scheduleCameraRecovery(reason = '카메라 상태 변경') {
    if (!nodes.sceneRecord?.classList.contains('active') || isRecoveringCamera) return;
    clearTimeout(cameraRecoveryTimer);
    setCameraRecoveryState(true);
    cameraRecoveryTimer = setTimeout(async () => {
      isRecoveringCamera = true;
      if (nodes.recordStatus) nodes.recordStatus.textContent = `${reason} · 다시 연결 중`;
      try {
        await initCamera();
        if (cameraStream) setCameraRecoveryState(false);
      } finally {
        isRecoveringCamera = false;
      }
    }, 700);
  }

  async function initCamera() {
    if (cameraStream) stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('카메라를 지원하지 않는 브라우저입니다.');
      }

      let lastError = null;
      for (const videoConstraints of getCameraConstraintCandidates()) {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false
          });
          break;
        } catch (error) {
          lastError = error;
          // 사용자가 권한을 거부한 경우에는 같은 권한 요청을 반복하지 않습니다.
          if (isPermissionError(error)) break;
        }
      }

      if (!cameraStream) throw lastError || new Error('사용 가능한 카메라 설정을 찾지 못했습니다.');

      nodes.cameraPreview.srcObject = cameraStream;
      await nodes.cameraPreview.play();

      const cameraSettings = cameraStream.getVideoTracks()[0]?.getSettings?.() || {};
      const actualWidth = cameraSettings.width || '자동';
      const actualHeight = cameraSettings.height || '자동';
      const actualFPS = cameraSettings.frameRate || selectedFPS;

      if (nodes.recordStatus) {
        const modeLabel = lowPowerMode ? ' · 저전력' : '';
        nodes.recordStatus.textContent = `${actualWidth}×${actualHeight} · ${Math.round(actualFPS)} FPS${modeLabel} 카메라 연동 완료`;
      }
      const videoTrack = cameraStream.getVideoTracks()[0];
      videoTrack?.addEventListener('ended', () => scheduleCameraRecovery('카메라 트랙 종료'), { once: true });
      setCameraRecoveryState(false);
      if (nodes.btnCapturePhoto) nodes.btnCapturePhoto.disabled = false;
      console.log('[ ] 시스템 카메라 연동 및 자동 재생 성공');
      // 카메라 세션 개통 직후 수평계 센서 가동 시작 권한 처리 최적화
      let gyroStarted = false;
      if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
        gyroStarted = await window.bowGyroSensor.start();
      }
      if (!gyroStarted && nodes.recordStatus) {
        nodes.recordStatus.textContent += ' · 자이로 권한 대기';
      }
      setTimeout(resizeCanvasToDisplay, 150);
    } catch (err) {
      if (cameraStream) stopCamera();
      if (nodes.recordStatus) nodes.recordStatus.textContent = '카메라 연결 실패';
      setCameraRecoveryState(true);
      console.error('[ ] 오류 카메라 초기화 실패', err);

      if (isPermissionError(err)) {
        alert('카메라 권한이 필요합니다. 브라우저 설정에서 카메라 접근을 허용해 주세요.');
      } else {
        alert('이 기기에서 사용할 수 있는 카메라 해상도를 찾지 못했습니다. 다른 브라우저에서 다시 시도해 주세요.');
      }
    }
  }

  function stopCamera() {
    clearTimeout(cameraRecoveryTimer);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    if (nodes.cameraPreview) nodes.cameraPreview.srcObject = null;
    if (nodes.btnCapturePhoto) nodes.btnCapturePhoto.disabled = true;
    setCameraRecoveryState(false);
  }

  function resizeCanvasToDisplay() {
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

  async function captureCameraPhoto() {
    const video = nodes.cameraPreview;
    const button = nodes.btnCapturePhoto;
    if (!video || !cameraStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(video, 0, 0, width, height);
    if (button) button.disabled = true;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) throw new Error('사진 변환에 실패했습니다.');
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const link = document.createElement('a');
      link.download = `gungche_photo_${timestamp}.jpg`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (nodes.recordStatus) nodes.recordStatus.textContent = '사진 저장 완료';
    } catch (error) {
      console.error('[Photo] 사진 저장 실패', error);
      if (nodes.recordStatus) nodes.recordStatus.textContent = '사진 저장 실패';
    } finally {
      if (button) button.disabled = false;
    }
  }

  // 화면의 object-fit: cover 크롭을 원본 영상 좌표로 역변환합니다.
  // drawCanvas는 CSS transform(확대·이동) 전의 화면 좌표를 보유하므로,
  // 동일한 cover 비율과 crop offset을 적용해야 캡처 선이 영상과 정확히 겹칩니다.
  function drawOverlayAlignedToVideo(ctx, overlayCanvas, videoWidth, videoHeight) {
    if (!ctx || !overlayCanvas || !videoWidth || !videoHeight) return;
    const displayWidth = overlayCanvas.clientWidth || nodes.videoViewport?.clientWidth || window.innerWidth;
    const displayHeight = overlayCanvas.clientHeight || nodes.videoViewport?.clientHeight || window.innerHeight;
    if (!displayWidth || !displayHeight) return;

    const coverScale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight);
    const renderedWidth = videoWidth * coverScale;
    const renderedHeight = videoHeight * coverScale;
    const cropX = (displayWidth - renderedWidth) / 2;
    const cropY = (displayHeight - renderedHeight) / 2;

    ctx.save();
    ctx.translate(-cropX / coverScale, -cropY / coverScale);
    ctx.scale(1 / coverScale, 1 / coverScale);
    ctx.drawImage(overlayCanvas, 0, 0, displayWidth, displayHeight);
    ctx.restore();
  }
  // 3. 녹화 종료 후 자동 저장 및 분석 화면 프레임 레이어 바인딩 핸들러
  async function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `kukgung_${timestamp}.webm`;
    const url = URL.createObjectURL(blob);
    await saveSessionSnapshot(blob, '촬영 영상');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log(`[ ] 시스템 자동 저장 및 미디어 물리 다운로드 완료 ${fileName}`);

    if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
      URL.revokeObjectURL(nodes.mainVideo.src);
    }
    nodes.mainVideo.src = url;
    // 하단 기하학 트랙 좌표 밀림 방지 락온: 촬영 종료 시점 보정 롤 각도 박제
    nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord;
    nodes.mainVideo.onloadedmetadata = () => {
      const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
      currentFrameTime = 1 / detectedFPS;
      nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
      nodes.drawCanvas.height = nodes.mainVideo.videoHeight;
      if (isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
        nodes.videoSlider.max = nodes.mainVideo.duration;
        nodes.videoSlider.step = 0.0001;
      }
      stopCamera();
      if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
        window.bowGyroSensor.stop();
      }
      nodes.sceneRecord.classList.remove('active');
      nodes.sceneAnalyze.classList.add('active');
      setActiveMenu(nodes.btnMove);
      if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
      nodes.mainVideo.currentTime = 0.1;
      if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
        window.bowAnalyzer.render();
      }
      console.log('[ ] 시스템 분석 모드 자동 전환 및 비디오 로드 완료');
      setTimeout(resizeCanvasToDisplay, 100);
    };
  }

  // 데이터베이스 개통 및 최종 세션 복구 안정 장치
  if (core && typeof core.initDB === 'function') {
    coreReady.then(async () => {
      try {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        await loadSessionIndex();
      } catch (e) {
        console.warn('[System] 안전 부팅 복구 예외 대응 완료');
      }
      if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
        nodes.videoSlider.max = nodes.mainVideo.duration;
        nodes.videoSlider.step = 0.0001;
      }
    });
  }
  // 4. 미디어 레코더 구동 및 비디오 라인 리셋 로직
  nodes.btnRecordToggle?.addEventListener('click', () => {
    const isMobile = isMobileDevice();
    if (isMobile && window.bowGyroSensor && !window.bowGyroSensor.isActive && typeof window.bowGyroSensor.start === 'function') {
      window.bowGyroSensor.start();
    }
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      recordedChunks = [];
      const stream = nodes.cameraPreview?.srcObject;
      if (!stream) {
        alert('카메라 스트림을 찾을 수 없습니다.');
        return;
      }
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/mp4' };
        }
      }
      try {
        mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
          if (core && typeof core.saveCache === 'function') {
            await core.saveCache('lastVideoBlob', videoBlob);
            await core.saveCache('lastRecordedMime', mediaRecorder.mimeType);
          }
          await handleRecordingFinish(videoBlob, currentRoll);
          recordedChunks = [];
        };
        mediaRecorder.start();
        isRecording = true;
        nodes.btnRecordToggle.textContent = '녹화중지';
        nodes.btnRecordToggle.classList.add('recording');
        if (nodes.recordStatus) nodes.recordStatus.innerText = "● 녹화 중";
      } catch (e) {
        console.error('[ ] 오류 녹화 시동 실패', e);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      isRecording = false;
      nodes.btnRecordToggle.textContent = '녹화시작';
      nodes.btnRecordToggle.classList.remove('recording');
      if (nodes.recordStatus) nodes.recordStatus.innerText = "대기 중";
    }
  });
  nodes.btnCapturePhoto?.addEventListener('click', captureCameraPhoto);

  nodes.btnReset?.addEventListener('click', async () => {
    if (window.bowAnalyzer && typeof window.bowAnalyzer.clearLines === 'function') {
      window.bowAnalyzer.clearLines();
    }
    if (core && core.state) {
      core.state.scale = 1;
      core.state.offsetX = 0;
      core.state.offsetY = 0;
    }
    if (window.bowAppGesture && typeof window.bowAppGesture.applyTransform === 'function') {
      window.bowAppGesture.applyTransform();
    }
    if (core && typeof core.saveCache === 'function') {
      await core.saveCache('lastLines', []);
      await core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });
    }
    if (nodes.angleReport) {
      nodes.angleReport.innerHTML = `
        <div class="final-angle" style="font-size:20px; font-weight:bold; color:#00FF66;">0.0°</div>
        <div class="sub-info" style="font-size:11px; opacity:0.75; margin-top:2px;">(선분 초기화 완료)</div>`;
    }
    console.log('[ ] 시스템 분석 선분 및 화면 트랜스폼 리셋 완료');
    setTimeout(resizeCanvasToDisplay, 100);
  });

  nodes.btnUndo?.addEventListener('click', async () => {
    if (!window.bowAnalyzer || typeof window.bowAnalyzer.undoLastLine !== 'function') return;
    const undone = window.bowAnalyzer.undoLastLine();
    if (!undone) return;
    nodes.btnUndo.disabled = window.bowAnalyzer.lines.length === 0;
    if (core && typeof core.saveCache === 'function') {
      await core.saveCache('lastLines', window.bowAnalyzer.lines);
    }
  });

  // 5. 이미지 캡쳐 레이어 병합 및 고성능 프레임 탐색 엔진
  nodes.btnCapture?.addEventListener('click', () => {
    const video = nodes.mainVideo;
    const drawCanvas = nodes.drawCanvas;
    if (!video || !drawCanvas) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth || 1920;
    offscreen.height = video.videoHeight || 1080;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
    drawOverlayAlignedToVideo(ctx, drawCanvas, offscreen.width, offscreen.height);
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Arial";
    const angleText = nodes.angleReport?.innerText.split('\n') || "0.0°";
    ctx.fillText(`궁체 분석 결과 : 국궁 자세 분석 ${angleText}`, 20, offscreen.height - 30);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.download = `kukgung_analysis_${timestamp}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
    console.log('[ ] 시스템 분석 화면 고해상도 이미지 레이어 캡쳐 완료');
  });

  // 초고속 백그라운드 프레임 도약 저장 커널 명세
  nodes.btnDownloadVideo?.addEventListener('click', async () => {
    const video = nodes.mainVideo;
    const drawCanvas = nodes.drawCanvas;
    if (!video || !drawCanvas) {
      alert('분석할 동영상 데이터가 존재하지 않습니다.');
      return;
    }
    if (nodes.btnDownloadVideo.classList.contains('processing')) return;

    try {
      exportCancelled = false;
      nodes.btnDownloadVideo.classList.add('processing');
      const originalText = nodes.btnDownloadVideo.textContent;
      nodes.btnDownloadVideo.textContent = '고속인코딩중';
      nodes.btnDownloadVideo.style.color = '#FF9500';
      nodes.exportProgressPanel.hidden = false;
      nodes.exportProgress.value = 0;
      nodes.exportProgressValue.textContent = '0%';

      const wasPaused = video.paused;
      const originalTime = video.currentTime;
      video.pause();
      const encCanvas = document.createElement('canvas');
      // FHD 고해상도 고속 인코딩을 위해 캔버스 폴백 사양을 규격으로 상향
      encCanvas.width = video.videoWidth || 1920;
      encCanvas.height = video.videoHeight || 1080;
      const eCtx = encCanvas.getContext('2d');
      const fps = 30;
      const interval = 1 / fps;
      let targetTime = 0;
      const duration = video.duration || 5;

      const stream = encCanvas.captureStream(fps);
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp8' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/mp4' };
        }
      }

      const exporter = new MediaRecorder(stream, options);
      activeExportCancel = () => {
        exportCancelled = true;
        if (exporter.state !== 'inactive') exporter.stop();
      };
      let chunks = [];
      exporter.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };

      exporter.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        activeExportCancel = null;
        nodes.exportProgressPanel.hidden = true;
        if (exportCancelled) {
          nodes.btnDownloadVideo.classList.remove('processing');
          nodes.btnDownloadVideo.textContent = '영상 저장';
          nodes.btnDownloadVideo.style.color = '#34C759';
          video.currentTime = originalTime;
          if (!wasPaused) {
            video.play();
            if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '일시정지';
          }
          return;
        }
        const blob = new Blob(chunks, { type: options.mimeType });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ext = options.mimeType.includes('mp4') ? '.mp4' : '.webm';

        const a = document.createElement('a');
        a.download = `kukgung_fast_analysis_${timestamp}${ext}`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        video.currentTime = originalTime;
        if (!wasPaused) {
          video.play();
          if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '일시정지';
        }
        nodes.btnDownloadVideo.classList.remove('processing');
        nodes.btnDownloadVideo.textContent = originalText;
        nodes.btnDownloadVideo.style.color = '#34C759';
        nodes.exportProgress.value = 100;
        nodes.exportProgressValue.textContent = '100%';
        console.log('[ ] 시스템 백그라운드 고속 비디오 인코딩 처리 완료');
      };

      exporter.start();

      async function processNextFrame() {
        if (exportCancelled) return;
        if (targetTime > duration) {
          exporter.stop();
          return;
        }

        video.currentTime = targetTime;

        await new Promise((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });

        eCtx.clearRect(0, 0, encCanvas.width, encCanvas.height);
        eCtx.drawImage(video, 0, 0, encCanvas.width, encCanvas.height);
        drawOverlayAlignedToVideo(eCtx, drawCanvas, encCanvas.width, encCanvas.height);

        const angleTextElem = nodes.angleReport?.querySelector('.final-angle');
        const subTextElem = nodes.angleReport?.querySelector('.sub-info');
        const finalAngleText = angleTextElem ? angleTextElem.textContent : "0.0°";
        const subInfoText = subTextElem ? subTextElem.textContent : "분석 완료";

        eCtx.save();
        eCtx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        eCtx.shadowBlur = 12;
        eCtx.fillStyle = 'rgba(10, 10, 14, 0.75)';
        const pW = 260, pH = 80, pX = encCanvas.width - pW - 30, pY = 30;
        eCtx.beginPath();
        eCtx.roundRect(pX, pY, pW, pH, 12);
        eCtx.fill();

        eCtx.shadowColor = 'rgba(0, 255, 102, 0.6)';
        eCtx.shadowBlur = 8;
        eCtx.fillStyle = '#00FF66';
        eCtx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", tabular-nums';
        eCtx.fillText(finalAngleText, pX + 20, pY + 40);

        eCtx.shadowBlur = 0;
        eCtx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        eCtx.font = '500 12px -apple-system, BlinkMacSystemFont, "SF Pro Text"';
        eCtx.fillText(subInfoText, pX + 20, pY + 62);
        eCtx.restore();

        targetTime += interval;
        const progress = Math.min(100, Math.round((targetTime / duration) * 100));
        nodes.exportProgress.value = progress;
        nodes.exportProgressValue.textContent = `${progress}%`;
        setTimeout(processNextFrame, 0);
      }

      processNextFrame();

    } catch (err) {
      console.error('[ ] 오류 고속 비디오 인코딩 결함', err);
      activeExportCancel = null;
      nodes.exportProgressPanel.hidden = true;
      nodes.btnDownloadVideo.classList.remove('processing');
      nodes.btnDownloadVideo.textContent = '영상 저장';
      nodes.btnDownloadVideo.style.color = '#34C759';
      alert('초고속 인코딩 중 오류가 발생했습니다.');
    }
  });

  nodes.btnCancelExport?.addEventListener('click', () => {
    if (activeExportCancel) activeExportCancel();
  });

  const fpsButtons = document.querySelectorAll('.fps-btn[data-fps]');
  syncMobileSettingsUI();
  const cpuCores = navigator.hardwareConcurrency || 4;
  if (cpuCores <= 4) {
    fpsButtons.forEach(btn => {
      const fpsVal = parseInt(btn.getAttribute('data-fps'), 10);
      if (fpsVal >= 120) {
        btn.style.opacity = '0.25';
        btn.style.pointerEvents = 'none';
      }
    });
  }

  fpsButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (isRecording) return;
      fpsButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFPS = parseInt(btn.getAttribute('data-fps'), 10);
      saveMobileSettings();
      if (nodes.sceneRecord?.classList.contains('active')) {
        await initCamera();
      }
    });
  });

  nodes.btnLowPower?.addEventListener('click', async () => {
    if (isRecording || isRecoveringCamera) return;
    lowPowerMode = !lowPowerMode;
    saveMobileSettings();
    nodes.btnLowPower.setAttribute('aria-pressed', String(lowPowerMode));
    nodes.btnLowPower.classList.toggle('active', lowPowerMode);
    if (nodes.sceneRecord?.classList.contains('active')) await initCamera();
  });

  nodes.btnCameraFacing?.addEventListener('click', async () => {
    if (isRecording || isRecoveringCamera) return;
    cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    saveMobileSettings();
    syncMobileSettingsUI();
    if (nodes.sceneRecord?.classList.contains('active')) await initCamera();
  });

  nodes.btnMoreTools?.addEventListener('click', () => {
    const open = nodes.secondaryTools?.hidden;
    if (nodes.secondaryTools) nodes.secondaryTools.hidden = !open;
    nodes.btnMoreTools.setAttribute('aria-expanded', String(open));
    nodes.btnMoreTools.textContent = open ? '닫기' : '더보기';
  });

  nodes.btnReconnectCamera?.addEventListener('click', async () => {
    if (isRecoveringCamera) return;
    clearTimeout(cameraRecoveryTimer);
    isRecoveringCamera = true;
    if (nodes.recordStatus) nodes.recordStatus.textContent = '카메라 다시 연결 중';
    try {
      await initCamera();
    } finally {
      isRecoveringCamera = false;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && nodes.sceneRecord?.classList.contains('active')) {
      const track = cameraStream?.getVideoTracks?.()[0];
      if (!track || track.readyState !== 'live') scheduleCameraRecovery('앱 복귀');
    }
  });

  nodes.mainVideo?.addEventListener('loadedmetadata', () => {
    const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
    currentFrameTime = 1 / detectedFPS;
    if (nodes.videoSlider) {
      nodes.videoSlider.max = nodes.mainVideo.duration || 100;
      nodes.videoSlider.step = 0.0001;
    }
    resizeCanvasToDisplay();
  });

  nodes.mainVideo?.addEventListener('timeupdate', () => {
    if (nodes.videoSlider && !isNaN(nodes.mainVideo.currentTime)) {
      nodes.videoSlider.value = nodes.mainVideo.currentTime;
    }
  });

  nodes.videoSlider?.addEventListener('input', () => {
    nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
  });

  nodes.btnPlayPause?.addEventListener('click', () => {
    if (nodes.mainVideo.paused) {
      nodes.mainVideo.play();
      nodes.btnPlayPause.textContent = '일시정지';
    } else {
      nodes.mainVideo.pause();
      nodes.btnPlayPause.textContent = '재생';
    }
  });

  // 6. 초정밀 프레임 전 후진 롱프레스 터치 제어 및 자이로 수평계 복구 핵심 바인딩
  let longPressTimer = null;
  let repeatInterval = null;
  function startFrameRepeat(direction) {
    clearFrameRepeat();
    longPressTimer = setTimeout(() => {
      repeatInterval = setInterval(() => {
        nodes.mainVideo.pause();
        if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
        if (direction === 'next') {
          nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
        } else {
          nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
        }
      }, 600);
    }, 300);
  }

  function clearFrameRepeat() {
    if (longPressTimer) clearTimeout(longPressTimer);
    if (repeatInterval) clearInterval(repeatInterval);
    longPressTimer = null;
    repeatInterval = null;
  }

  nodes.btnFramePrev?.addEventListener('pointerdown', (e) => {
    e.preventDefault(); nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
    startFrameRepeat('prev');
  });

  nodes.btnFrameNext?.addEventListener('pointerdown', (e) => {
    e.preventDefault(); nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
    startFrameRepeat('next');
  });
  window.addEventListener('pointerup', clearFrameRepeat);
  window.addEventListener('pointercancel', clearFrameRepeat);
  
  // 자이로 실시간 오차 업데이트 및 동적 색상 매핑 제어 메커니즘
  window.addEventListener('bowGyroUpdate', (e) => {
    const { roll, isLevel } = e.detail;
    if (isNaN(roll)) return;

    currentRoll = roll; // 실시간 가변 롤값 변수 동기화
    if (core && core.state) core.state.currentRoll = roll;
    if (nodes.sceneRecord?.classList.contains('active')) {
      if (nodes.gyroHorizonLine) {
        nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
        nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);
        nodes.gyroHorizonLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
        nodes.gyroHorizonLine.classList.toggle('perfect-level', isLevel);
      }
      if (nodes.gyroVerticalLine) {
        nodes.gyroVerticalLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
        nodes.gyroVerticalLine.classList.toggle('perfect-level', isLevel);
      }
      if (nodes.btnRecordToggle && !isRecording) {
        nodes.btnRecordToggle.style.borderColor = isLevel ? '#00ff00' : '#ff4444';
      }
    }
  });

  window.addEventListener('bowAngleUpdate', (e) => {
    if (nodes.btnUndo && window.bowAnalyzer) {
      nodes.btnUndo.disabled = window.bowAnalyzer.lines.length === 0;
    }
    if (nodes.angleReport && e.detail.angle !== undefined) {
      nodes.angleReport.innerHTML = `
        <div class="final-angle" style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>
        <div class="sub-info" style="font-size:11px; color:#aaa; margin-top:2px;">(측정: ${e.detail.raw}° / 보정 ${e.detail.roll}°)</div>`;
    }
    if (window.bowAnalyzer && core) core.saveCache('lastLines', window.bowAnalyzer.lines);
    if (e.detail.angle !== undefined) void updateActiveSession(String(e.detail.angle));
  });

  // 기본 이벤트 내비게이션 파일 등록 바인더
  nodes.btnOpen?.addEventListener('click', () => nodes.videoInput?.click());

  // 💡 [지침 제1조] 분석 템플릿 제어 핸들러 신설 및 연속 변경 교체 무결성 확보 조치
  nodes.btnSaveTemplate?.addEventListener('click', () => {
    if (window.bowAnalyzer) window.bowAnalyzer.exportTemplate();
  });

  nodes.btnLoadTemplate?.addEventListener('click', () => {
    nodes.templateInput?.click();
  });

  nodes.templateInput?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (window.bowAnalyzer) {
      window.bowAnalyzer.importTemplate(files[0]);
    }
    // 💡 [지침 제2조] 연속 동일 파일 로딩 동작 및 충돌 방지를 위한 파일 버퍼 해제 리셋
    e.target.value = '';
  });

  // [변경] - files 변경 버그 완전 박멸 패치 단락 파일 변경 불러오기 시 배열 인덱싱 무결성 동기화 조치
  nodes.videoInput?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // files 0 배열 전체가 아닌 번째 물리 단일 파일 객체만을 엄밀하게 추출 격리
    const targetFile = files[0];
    await saveSessionSnapshot(targetFile, '불러온 영상');
    if (core && typeof core.saveCache === 'function') {
      await core.saveCache('lastVideoBlob', targetFile);
    }

    if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
      URL.revokeObjectURL(nodes.mainVideo.src);
    }

    // Blob URL 정상적으로 바인딩된 물리 임시 가상 개통 및 주입
    nodes.mainVideo.src = URL.createObjectURL(targetFile);
    nodes.mainVideo.load();

    if (window.bowAnalyzer && nodes.drawCanvas) {
      window.bowAnalyzer.init(nodes.drawCanvas);
    }

    nodes.mainVideo.addEventListener('loadeddata', () => {
      if (nodes.videoSlider) {
        nodes.videoSlider.max = nodes.mainVideo.duration;
        nodes.videoSlider.step = 0.0001;
      }
      resizeCanvasToDisplay();
    }, { once: true });

    setActiveMenu(nodes.btnOpen);
    if (window.bowAnalyzer && typeof window.bowAnalyzer.clearLines === 'function') {
      window.bowAnalyzer.clearLines();
      window.bowAnalyzer.setMode('move');
    }
    setTimeout(resizeCanvasToDisplay, 100);
  });

  nodes.btnMove?.addEventListener('click', () => {
    setActiveMenu(nodes.btnMove);
    if (window.bowAnalyzer) {
      window.bowAnalyzer.setMode('move');
      window.bowAnalyzer.render();
    }
  });

  nodes.btnDraw?.addEventListener('click', () => {
    setActiveMenu(nodes.btnDraw);
    if (window.bowAnalyzer) {
      window.bowAnalyzer.setMode('draw');
      window.bowAnalyzer.render();
    }
  });

  // 💡 [지침 제2조 방어책] 인트로 단계 등 특정 버튼이 미배치 상태(null)여도 스크립트 에러를 내지 않도록 완벽 필터 격리막 탑재
  function setActiveMenu(activeBtn) {
    const allButtons = [
      nodes.btnOpen, nodes.btnMove, nodes.btnDraw, 
      nodes.btnSaveTemplate, nodes.btnLoadTemplate, 
      nodes.btnCapture, nodes.btnReset, nodes.btnDownloadVideo
    ];
    
    allButtons.forEach(btn => {
      if (btn && btn.classList) {
        btn.classList.remove('active');
      }
    });
    
    if (activeBtn && activeBtn.classList) {
      activeBtn.classList.add('active');
    }
  }

  function setRecordPanelCollapsed(collapsed) {
    if (!nodes.recordPanel || !nodes.btnToggleRecordPanel) return;
    nodes.recordPanel.classList.toggle('record-panel-collapsed', collapsed);
    nodes.btnToggleRecordPanel.setAttribute('aria-expanded', String(!collapsed));
    nodes.btnToggleRecordPanel.setAttribute('aria-label', collapsed ? '촬영 패널 펼치기' : '촬영 패널 접기');
    const label = nodes.btnToggleRecordPanel.querySelector('.record-panel-toggle-label');
    if (label) label.textContent = collapsed ? '패널 펼치기' : '패널 접기';
  }

  nodes.btnToggleRecordPanel?.addEventListener('click', () => {
    setRecordPanelCollapsed(!nodes.recordPanel.classList.contains('record-panel-collapsed'));
  });

  nodes.btnGoRecord?.addEventListener('click', async () => {
    nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.sceneAnalyze.classList.remove('active');
    nodes.sceneRecord.classList.add('active');
    setRecordPanelCollapsed(false);
    await initCamera();
  });

  nodes.btnGoAnalyze?.addEventListener('click', () => {
    stopCamera();
    nodes.sceneRecord.classList.remove('active');
    nodes.sceneAnalyze.classList.add('active');
    setActiveMenu(nodes.btnMove);
    if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    setTimeout(resizeCanvasToDisplay, 100);
  });

  nodes.btnOpenSessions?.addEventListener('click', async () => {
    await loadSessionIndex();
    nodes.sessionListPanel.hidden = false;
  });

  nodes.btnCloseSessions?.addEventListener('click', () => {
    nodes.sessionListPanel.hidden = true;
  });

  nodes.panelHandle?.addEventListener('click', () => {
    if (!core || !core.state) return;
    core.state.isPanelOpen = !core.state.isPanelOpen;
    nodes.unifiedPanel?.classList.toggle('collapsed', !core.state.isPanelOpen);
  });

  // 인트로 라이프사이클 바인딩 앱 실행 초기화 구동 파이프라인
  nodes.btnStartApp?.addEventListener('click', async () => {
    stopGyehunRotation(); // 앱 진입 시 백그라운드 오버헤드 완벽 차단
    nodes.sceneIntro.classList.remove('active');
    nodes.sceneRecord.classList.add('active');
    setRecordPanelCollapsed(false);

    if (window.bowAnalyzer && nodes.drawCanvas) {
      window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 사용자가 인트로를 통과한 물리적 시점에 안전하게 카메라 커널 시동
    await initCamera();
    resizeCanvasToDisplay();
  });

  // 초기 레이아웃 동기화 및 바인딩 완료
  resizeCanvasToDisplay();
  let resizeFrame = null;
  const handleViewportChange = () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      resizeCanvasToDisplay();
    });
  };
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('orientationchange', handleViewportChange, { passive: true });
  window.screen?.orientation?.addEventListener?.('change', handleViewportChange, { passive: true });
  if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') {
    window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
  }
});

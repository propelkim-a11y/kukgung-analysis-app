/**
 * js/app.js - [Part 1]
 * - (v20.7) 국궁 자세 분석 시스템 프리징 방지 마스터 컨트롤러
 * - [업데이트] 분석 화면 비디오 및 캔버스 선분 그래픽 레이어 병합 저장 엔진 탑재 완결본
 */
window.bowAppNodes = {};
document.addEventListener('DOMContentLoaded', async () => {
  const core = window.bowAppCore;
  const gesture = window.bowAppGesture;
  const nodes = window.bowAppNodes;

  // 1. DOM 공용 핵심 인프라 노드 매핑 오류 격리막 작동
  try {
    nodes.sceneIntro = document.getElementById('scene-intro');
    nodes.btnStartApp = document.getElementById('btn-start-app');
    nodes.logoCore = document.querySelector('.logo-core');

    nodes.sceneRecord = document.getElementById('scene-record');
    nodes.sceneAnalyze = document.getElementById('scene-analyze');
    nodes.btnGoAnalyze = document.getElementById('btn-go-analyze');
    nodes.btnGoRecord = document.getElementById('btn-go-record');
    nodes.cameraPreview = document.getElementById('camera-preview');
    nodes.btnRecordToggle = document.getElementById('btn-record-toggle');
    nodes.recordStatus = document.getElementById('record-status');

    // [UI] 수평계 요소 인프라 바인딩
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
    nodes.btnCapture = document.getElementById('btn-capture');
    nodes.btnReset = document.getElementById('btn-reset');
    nodes.videoInput = document.getElementById('video-input');
    nodes.btnDownloadVideo = document.getElementById('btn-download-video');
    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');
    console.log('[시스템] DOM 핵심 인프라 노드 매핑 완료');
  } catch (e) {
    console.error('[오류] DOM 인프라 매핑 실패', e);
  }

  let selectedFPS = 30;
  let currentFrameTime = 1 / 30;
  let cameraStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let currentRoll = 0; // 촬영 시점의 기울기 실시간 백업용 변수

  // 궁도구계훈 순환 롤링 데이터셋 타이머 핸들러 구조
  const gyehunList = [
    "정심정기 (正心正己)",
    "인애덕행 (仁愛德行)",
    "성실겸손 (誠實謙遜)",
    "자중절조 ( 自重節操)",
    "예의엄수 (禮儀嚴守)",
    "염직과감 (廉直果敢)",
    "습사무언 (習射無言)",
    "불원승자 (不怨勝者)",
    "막만타궁 (莫彎他弓)"
  ];
  let gyehunIndex = 0;
  let gyehunTimer = null;

  function startGyehunRotation() {
    if (!nodes.logoCore) return;

    // 초기 무결성 패치 타이머 대기 시간 없이 즉시 0번 항목인 정심정기를 노출
    gyehunIndex = 0;
    nodes.logoCore.textContent = gyehunList[gyehunIndex];
    nodes.logoCore.style.opacity = '1';

    gyehunTimer = setInterval(() => {
      nodes.logoCore.style.opacity = '0'; // 애니메이션 페이드아웃 발동
      setTimeout(() => {
        // 정확하게 0번 다음인 1번 인애덕행 부터 자연스러운 순방향 흐름 정렬
        gyehunIndex = (gyehunIndex + 1) % gyehunList.length;
        nodes.logoCore.textContent = gyehunList[gyehunIndex];
        nodes.logoCore.style.opacity = '1'; // 다시 완전한 발광 네온 인입
      }, 600); // .logo-core CSS transition 오차율 페이싱 싱크 보정
    }, 3000); // 3초 정속 순환 메커니즘 사수
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
  async function initCamera() {
    if (cameraStream) stopCamera();
    try {
      const isPC = !/Android|iPhone|iPad/i.test(navigator.userAgent);
      let videoConstraints = {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: selectedFPS }
      };
      if (isPC) videoConstraints = { width: 1280, height: 720 };
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      nodes.cameraPreview.srcObject = cameraStream;
      await nodes.cameraPreview.play();
      if (nodes.recordStatus) {
        nodes.recordStatus.textContent = `${selectedFPS} FPS 카메라 연동 완료`;
      }
      console.log('[시스템] 카메라 연동 및 자동 재생 성공');
      // 카메라 세션 개통 직후 수평계 센서 가동 시작 권한 처리 최적화
      if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
        await window.bowGyroSensor.start();
      }
      setTimeout(resizeCanvasToDisplay, 150);
    } catch (err) {
      if (selectedFPS > 30) {
        selectedFPS = 30;
        const activeBtn = document.querySelector('.fps-btn[data-fps="30"]');
        if (activeBtn) {
          document.querySelectorAll('.fps-btn').forEach(b => b.classList.remove('active'));
          activeBtn.classList.add('active');
        }
        await initCamera();
      } else {
        if (nodes.recordStatus) nodes.recordStatus.textContent = '카메라 장치 로드 실패.';
        console.error('[오류] 카메라 초기화 실패', err);
        alert('카메라 및 센서 권한이 필요합니다. 설정에서 허용해 주세요.');
      }
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    if (nodes.cameraPreview) nodes.cameraPreview.srcObject = null;
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
  // 3. 녹화 종료 후 자동 저장 및 분석 화면 프레임 레이어 바인딩 핸들러
  function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `kukgung_${timestamp}.webm`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    console.log(`[시스템] 자동 저장 및 미디어 물리 다운로드 완료 ${fileName}`);

    if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
      URL.revokeObjectURL(nodes.mainVideo.src);
    }
    nodes.mainVideo.src = url;
    // 촬영을 종료한 바로 그 시점의 보정된 최종 롤 각도를 비디오 데이터셋에 박제
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
      console.log('[시스템] 분석 모드 자동 전환 및 비디오 로드 완료');
      setTimeout(resizeCanvasToDisplay, 100);
    };
  }

  // 데이터베이스 개통 및 최종 세션 복구 안정 장치
  if (core && typeof core.initDB === 'function') {
    core.initDB().then(async () => {
      try {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
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
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
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
          handleRecordingFinish(videoBlob, currentRoll);
          recordedChunks = [];
        };
        mediaRecorder.start();
        isRecording = true;
        nodes.btnRecordToggle.textContent = '녹화중지';
        nodes.btnRecordToggle.classList.add('recording');
        if (nodes.recordStatus) nodes.recordStatus.innerText = "● 녹화 중";
      } catch (e) {
        console.error('[오류] 녹화 시동 실패', e);
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
    console.log('[시스템] 분석 선분 및 화면 트랜스폼 리셋 완료');
    setTimeout(resizeCanvasToDisplay, 100);
  });
  // 5. 이미지 캡쳐 레이어 병합 및 고성능 프레임 탐색 엔진
  nodes.btnCapture?.addEventListener('click', () => {
    const video = nodes.mainVideo;
    const drawCanvas = nodes.drawCanvas;
    if (!video || !drawCanvas) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth || 1280;
    offscreen.height = video.videoHeight || 720;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
    ctx.drawImage(drawCanvas, 0, 0, offscreen.width, offscreen.height);
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Arial";
    const angleText = nodes.angleReport?.innerText.split('\n') || "0.0°";
    ctx.fillText(`국궁 자세 분석 : ${angleText}`, 20, offscreen.height - 30);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.download = `kukgung_analysis_${timestamp}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
    console.log('[시스템] 분석 화면 고해상도 이미지 레이어 캡쳐 완료');
  });

  // [제1조 지침 핵심 고도화] 분석화면 내 선분 드로잉 + 백그라운드 동영상 + 실시간 네온 앵글 리포트 통합 무결성 저장 시스템
  nodes.btnDownloadVideo?.addEventListener('click', async () => {
    const video = nodes.mainVideo;
    const drawCanvas = nodes.drawCanvas;
    if (!video || !drawCanvas) {
      alert('분석할 동영상 데이터가 존재하지 않습니다.');
      return;
    }

    try {
      // 1. 고해상도 오프스크린 픽셀 가속 병합용 가상 크리스탈 패널 생성
      const mergedCanvas = document.createElement('canvas');
      mergedCanvas.width = video.videoWidth || 1280;
      mergedCanvas.height = video.videoHeight || 720;
      const mCtx = mergedCanvas.getContext('2d');

      // 2. 물리 뷰포트 행렬 역산 스케일 데이터 추출
      const state = core?.state || { scale: 1, offsetX: 0, offsetY: 0 };
      
      // 3. 비디오 백그라운드 프레임 투사
      mCtx.save();
      mCtx.translate(state.offsetX, state.offsetY);
      mCtx.scale(state.scale, state.scale);
      mCtx.drawImage(video, 0, 0, mergedCanvas.width, mergedCanvas.height);
      mCtx.restore();

      // 4. 선분 드로잉 지오메트리 레이어 알파 블렌딩 병합
      mCtx.drawImage(drawCanvas, 0, 0, mergedCanvas.width, mergedCanvas.height);

      // 5. 우상단 프리미엄 나이티브 비주얼 네온 리포트 오버레이 인쇄 명세 구현
      const angleTextElem = nodes.angleReport?.querySelector('.final-angle');
      const subTextElem = nodes.angleReport?.querySelector('.sub-info');
      const finalAngleText = angleTextElem ? angleTextElem.textContent : "0.0°";
      const subInfoText = subTextElem ? subTextElem.textContent : "(분석 대기 중)";

      mCtx.save();
      mCtx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      mCtx.shadowBlur = 12;
      mCtx.fillStyle = 'rgba(10, 10, 14, 0.75)';
      
      // 우상단 카드 패널 마감 규격 배치
      const panelW = 260;
      const panelH = 80;
      const panelX = mergedCanvas.width - panelW - 30;
      const panelY = 30;
      
      mCtx.beginPath();
      mCtx.roundRect(panelX, panelY, panelW, panelH, 12);
      mCtx.fill();

      // 고정폭 폰트 가독성 시스템 적용 네온 발광 주입
      mCtx.shadowColor = 'rgba(0, 255, 102, 0.6)';
      mCtx.shadowBlur = 8;
      mCtx.fillStyle = '#00FF66';
      mCtx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "SF Pro Display", tabular-nums';
      mCtx.fillText(finalAngleText, panelX + 20, panelY + 40);

      mCtx.shadowBlur = 0;
      mCtx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      mCtx.font = '500 12px -apple-system, BlinkMacSystemFont, "SF Pro Text"';
      mCtx.fillText(subInfoText, panelX + 20, panelY + 62);
      mCtx.restore();

      // 6. 무결성 완성본 물리 레이어 이미지 다운로드 처리 파이프라인 트리거
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const extBtn = document.createElement('a');
      extBtn.download = `kukgung_merged_analysis_${timestamp}.png`;
      extBtn.href = mergedCanvas.toDataURL('image/png');
      document.body.appendChild(extBtn);
      extBtn.click();
      document.body.removeChild(extBtn);
      console.log('[시스템] 동영상 위 드로잉 및 고각 리포트 레이어 병합 완료');
    } catch (err) {
      console.error('[오류] 병합 레이어 저장 중 결함 발생', err);
      alert('저장 처리 중 오류가 발생했습니다.');
    }
  });

  const fpsButtons = document.querySelectorAll('.fps-btn');
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
      if (nodes.sceneRecord?.classList.contains('active')) {
        await initCamera();
      }
    });
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
      }, 60);
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
    if (nodes.angleReport && e.detail.angle !== undefined) {
      nodes.angleReport.innerHTML = `
        <div class="final-angle" style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>
        <div class="sub-info" style="font-size:11px; color:#aaa; margin-top:2px;">(측정: ${e.detail.raw}° / 보정 ${e.detail.roll}°)</div>`;
    }
    if (window.bowAnalyzer && core) core.saveCache('lastLines', window.bowAnalyzer.lines);
  });

  // 기본 이벤트 내비게이션 파일 등록 바인더
  nodes.btnOpen?.addEventListener('click', () => nodes.videoInput?.click());

  // 파일 변경 핸들러 터치 리스너 조기 바인딩 보완 단락
  nodes.videoInput?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetFile = files[0];
    if (core && typeof core.saveCache === 'function') {
      await core.saveCache('lastVideoBlob', targetFile);
    }

    if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
      URL.revokeObjectURL(nodes.mainVideo.src);
    }

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

  function setActiveMenu(activeBtn) {
    [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => btn?.classList.remove('active'));
    activeBtn?.classList.add('add');
  }

  nodes.btnGoRecord?.addEventListener('click', async () => {
    nodes.mainVideo.pause();
    if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
    nodes.sceneAnalyze.classList.remove('active');
    nodes.sceneRecord.classList.add('active');
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

    if (window.bowAnalyzer && nodes.drawCanvas) {
      window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 사용자가 인트로를 통과한 물리적 시점에 안전하게 카메라 커널 시동
    await initCamera();
    resizeCanvasToDisplay();
  });

  // 초기 레이아웃 동기화 및 바인딩 완료
  resizeCanvasToDisplay();
  window.addEventListener('resize', resizeCanvasToDisplay);
  if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') {
    window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
  }
});

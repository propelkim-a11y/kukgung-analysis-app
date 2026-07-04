/**
 * js/app.js - [Part 1]
 * - (v20.7 - HighRes Engine) 국궁 자세 분석 시스템 프리징 방지 마스터 컨트롤러
 * - [ ] (File Input) 버그 패치 열기 핸들러의 파일 객체 인덱싱 무결성 완결 버전
 * - [ ] FHD/4K 해상도 확장 하드웨어 성능을 최대로 끌어올리는 이상향 트래킹 탑재
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
    
    // 분석 화면 내 메뉴 노드
    nodes.btnOpen = document.getElementById('btn-open');
    nodes.btnMove = document.getElementById('btn-move');
    nodes.btnDraw = document.getElementById('btn-draw');
    
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

  let selectedFPS = 30;
  let currentFrameTime = 1 / 30;
  let cameraStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let currentRoll = 0; // 촬영 시점의 기울기 실시간 백업용 변수

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
  async function initCamera() {
    if (cameraStream) stopCamera();
    try {
      const isPC = !/Android|iPhone|iPad/i.test(navigator.userAgent);

      // 디바이스 지원 한계 해제 하드웨어가 내어줄 수 있는 최상의 해상도(UHD 4K/FHD)를 유연하게 타겟팅
      let videoConstraints = {
        facingMode: { ideal: "environment" },
        width: { ideal: 3840, min: 1280 },
        height: { ideal: 2160, min: 720 },
        frameRate: { ideal: selectedFPS }
      };
      if (isPC) videoConstraints = { width: 1920, height: 1080 };

      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      nodes.cameraPreview.srcObject = cameraStream;
      await nodes.cameraPreview.play();
      if (nodes.recordStatus) {
        nodes.recordStatus.textContent = `${selectedFPS} FPS 카메라 연동 완료`;
      }
      console.log('[ ] 시스템 카메라 연동 및 자동 재생 성공');
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
        if (nodes.recordStatus) nodes.recordStatus.textContent = '카메라 장치 로드 실패;';
        console.error('[ ] 오류 카메라 초기화 실패', err);
        alert('카메라 및 센서 권한이 필요합니다 설정에서 허용해 주세요');
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
    const isMobile = !/Android|iPhone|iPad/i.test(navigator.userAgent);
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
    ctx.drawImage(drawCanvas, 0, 0, offscreen.width, offscreen.height);
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
      nodes.btnDownloadVideo.classList.add('processing');
      const originalText = nodes.btnDownloadVideo.textContent;
      nodes.btnDownloadVideo.textContent = '고속인코딩중';
      nodes.btnDownloadVideo.style.color = '#FF9500';

      const wasPaused = video.paused;
      const originalTime = video.currentTime;
      video.pause();
      const encCanvas = document.createElement('canvas');
      // FHD 고해상도 고속 인코딩을 위해 캔버스 폴백 사양을 규격으로 상향
      encCanvas.width = video.videoWidth || 1920;
      encCanvas.height = video.videoHeight || 1080;
      const eCtx = encCanvas.getContext('2d');
      const state = core?.state || { scale: 1, offsetX: 0, offsetY: 0 };

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
      let chunks = [];
      exporter.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };

      exporter.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
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
        console.log('[ ] 시스템 백그라운드 고속 비디오 인코딩 처리 완료');
      };

      exporter.start();

      async function processNextFrame() {
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
        eCtx.save();
        eCtx.translate(state.offsetX, state.offsetY);
        eCtx.scale(state.scale, state.scale);
        eCtx.drawImage(video, 0, 0, encCanvas.width, encCanvas.height);
        eCtx.restore();

        eCtx.drawImage(drawCanvas, 0, 0, encCanvas.width, encCanvas.height);

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
        setTimeout(processNextFrame, 0);
      }

      processNextFrame();

    } catch (err) {
      console.error('[ ] 오류 고속 비디오 인코딩 결함', err);
      nodes.btnDownloadVideo.classList.remove('processing');
      nodes.btnDownloadVideo.textContent = '저장';
      nodes.btnDownloadVideo.style.color = '#34C759';
      alert('초고속 인코딩 중 오류가 발생했습니다.');
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
    if (nodes.angleReport && e.detail.angle !== undefined) {
      nodes.angleReport.innerHTML = `
        <div class="final-angle" style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>
        <div class="sub-info" style="font-size:11px; color:#aaa; margin-top:2px;">(측정: ${e.detail.raw}° / 보정 ${e.detail.roll}°)</div>`;
    }
    if (window.bowAnalyzer && core) core.saveCache('lastLines', window.bowAnalyzer.lines);
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

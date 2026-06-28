/**
 * js/app.js
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 통합 완결판 (v20.1)
 * [변경사항] 초기화(Reset) 버튼 클릭 시 비디오 스트림을 파괴하지 않고 선분 및 트랜스폼만 리셋하도록 최적화
 */

window.bowAppNodes = {};

window.addEventListener('load', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    const nodes = window.bowAppNodes;

    // 1. DOM 공용 핵심 인프라 노드 매핑
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
    nodes.btnCapture = document.getElementById('btn-capture');
    nodes.btnReset = document.getElementById('btn-reset');
    nodes.videoInput = document.getElementById('video-input');
    nodes.btnDownloadVideo = document.getElementById('btn-download-video');

    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');

    let selectedFPS = 30;
    let currentFrameTime = 1 / 30;
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    // 2. 화면 해상도(DPR) 동기화 및 캔버스 스케일링 보정
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

    // 하드웨어 모듈 순차 가동 및 바인딩
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }
    resizeCanvasToDisplay();
    gesture.applyTransform();
    // 3. 녹화 중지 시 자동 저장 및 분석 모드 즉시 연동 핸들러
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
        console.log(`[시스템] 자동 저장 완료: ${fileName}`);

        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }

        nodes.mainVideo.src = url;
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

    // DB 연동 및 백업 세션 복구 처리
    core.initDB().then(async () => {
        try {
            await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        } catch (e) {
            console.warn('[System] 안전 부팅 보호막 작동');
        }
        if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
            nodes.videoSlider.max = nodes.mainVideo.duration;
            nodes.videoSlider.step = 0.0001;
        }
    });
    // 5. 초기화 및 액션 버튼 이벤트 핸들러 바인딩
    // [수정 완결판] 비디오는 그대로 두고, 선분 정보와 화면 뷰포트 확대 비율(Gesture)만 리셋
    nodes.btnReset?.addEventListener('click', async () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines(); // 선분 배열 비우기 + 내부 렌더 갱신
        }

        // 뷰포트 크기 및 스케일 정보 원점(0) 초기화
        core.state.scale = 1;
        core.state.offsetX = 0;
        core.state.offsetY = 0;
        if (window.bowAppGesture) window.bowAppGesture.applyTransform();

        // IndexedDB 로컬 캐시 스토리지 청소 (비디오 캐시는 유지)
        await core.saveCache('lastLines', []);
        await core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });

        nodes.angleReport.innerHTML = `
            <div class="final-angle" style="font-size:20px; font-weight:bold; color:#00FF66;">0.0°</div>
            <div class="sub-info" style="font-size:11px; opacity:0.75; margin-top:2px;">(선분 초기화 완료)</div>
        `;
        console.log('[시스템] 분석 선분 및 화면 트랜스폼 리셋 완료 (영상 유지)');
        setTimeout(resizeCanvasToDisplay, 100);
    });

    nodes.btnRecordToggle?.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor?.start) window.bowGyroSensor.start();
        if (!cameraStream) return;

        if (!isRecording) {
            recordedChunks = [];
            let options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm;codecs=vp8' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };

            try {
                mediaRecorder = new MediaRecorder(cameraStream, options);
                mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = async () => {
                    const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                    await core.saveCache('lastVideoBlob', videoBlob);
                    await core.saveCache('lastRecordedMime', mediaRecorder.mimeType);
                    const currentRoll = core.state?.currentRoll || 0;
                    handleRecordingFinish(videoBlob, currentRoll);
                    recordedChunks = [];
                };

                mediaRecorder.start();
                isRecording = true;
                nodes.btnRecordToggle.textContent = ' 녹화중지 ';
                nodes.btnRecordToggle.classList.add('recording');
            } catch (e) { console.error('녹화 시작 에러:', e); }
        } else {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            isRecording = false;
            nodes.btnRecordToggle.textContent = ' 녹화시작 ';
            nodes.btnRecordToggle.classList.remove('recording');
        }
    });

    nodes.btnCapture?.addEventListener('click', () => {
        const video = nodes.mainVideo;
        const drawCanvas = nodes.drawCanvas;
        
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth;
        offscreen.height = video.videoHeight;
        const ctx = offscreen.getContext('2d');

        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        ctx.drawImage(drawCanvas, 0, 0, offscreen.width, offscreen.height);

        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        const angleText = nodes.angleReport?.innerText.split('\n') || "0.0°";
        ctx.fillText(`국궁 자세 분석: ${angleText}`, 20, offscreen.height - 30);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const a = document.createElement('a');
        a.href = offscreen.toDataURL('image/png');
        a.download = `kukgung_analysis_${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    });
    // 6. 비디오 타임라인 및 비디오 제어 컨트롤러 파트
    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
        currentFrameTime = 1 / detectedFPS;
        nodes.videoSlider.max = nodes.mainVideo.duration || 100;
        nodes.videoSlider.step = 0.0001;
        resizeCanvasToDisplay();
    });

    nodes.mainVideo.addEventListener('timeupdate', () => {
        if (!isNaN(nodes.mainVideo.currentTime)) nodes.videoSlider.value = nodes.mainVideo.currentTime;
    });

    nodes.videoSlider.addEventListener('input', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
    });

    nodes.btnPlayPause.addEventListener('click', () => {
        if (nodes.mainVideo.paused) { nodes.mainVideo.play(); nodes.btnPlayPause.textContent = ' 일시정지 '; }
        else { nodes.mainVideo.pause(); nodes.btnPlayPause.textContent = ' 재생 '; }
    });

    // 프레임 버튼 물리 롱프레스 제어
    let longPressTimer = null, repeatInterval = null;
    function startFrameRepeat(dir) {
        clearFrameRepeat();
        longPressTimer = setTimeout(() => {
            repeatInterval = setInterval(() => {
                nodes.mainVideo.pause();
                nodes.btnPlayPause.textContent = ' 재생 ';
                nodes.mainVideo.currentTime = dir === 'next' 
                    ? Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime)
                    : Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
            }, 60);
        }, 300);
    }
    function clearFrameRepeat() { clearInterval(repeatInterval); clearTimeout(longPressTimer); }

    nodes.btnFramePrev.addEventListener('pointerdown', (e) => {
        e.preventDefault(); nodes.mainVideo.pause(); nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
        startFrameRepeat('prev');
    });
    nodes.btnFrameNext.addEventListener('pointerdown', (e) => {
        e.preventDefault(); nodes.mainVideo.pause(); nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
        startFrameRepeat('next');
    });
    window.addEventListener('pointerup', clearFrameRepeat);

    // 7. 대관식 및 비디오 파일 강제 임포트 브릿지
    nodes.btnOpen.addEventListener('click', () => nodes.videoInput.click());
    nodes.videoInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const targetFile = files[0];
        await core.saveCache('lastVideoBlob', targetFile);
        nodes.mainVideo.src = URL.createObjectURL(targetFile);
        nodes.mainVideo.load();
        setActiveMenu(nodes.btnOpen);
        if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
    });

    nodes.btnMove.addEventListener('click', () => { setActiveMenu(nodes.btnMove); window.bowAnalyzer?.setMode('move'); });
    nodes.btnDraw.addEventListener('click', () => { setActiveMenu(nodes.btnDraw); window.bowAnalyzer?.setMode('draw'); });

    function setActiveMenu(activeBtn) {
        [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => btn?.classList.remove('active'));
        activeBtn?.classList.add('active');
    }

    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause(); nodes.sceneAnalyze.classList.remove('active'); nodes.sceneRecord.classList.add('active');
        await startCamera();
    });
    nodes.btnGoAnalyze.addEventListener('click', () => {
        stopCamera(); nodes.sceneRecord.classList.remove('active'); nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove); window.bowAnalyzer?.setMode('move');
    });

    nodes.panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        nodes.unifiedPanel.classList.toggle('collapsed', !core.state.isPanelOpen);
    });

    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;
        core.state.currentRoll = roll;
        if (nodes.sceneRecord.classList.contains('active') && nodes.gyroHorizonLine) {
            nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
            nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);
            nodes.gyroHorizonLine.classList.toggle('perfect-level', isLevel);
            if (nodes.gyroVerticalLine) nodes.gyroVerticalLine.classList.toggle('perfect-level', isLevel);
        }
    });
});

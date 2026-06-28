/**
 * js/app.js
 * - (v18.6 - window.load ) 국궁 자세 분석 시스템 마스터 컨트롤러 마스터 완결본 물리 렌더 안정 정렬판
 * - [업데이트] 녹화 중지 시 자동 파일 저장 및 결과 스크린샷 캡쳐 병합 레이어 처리 버전
 */

window.bowAppNodes = {};

// [💡 프리징 박멸 핵심] DOMContentLoaded의 성급한 하드웨어 접근을 차단하고
// 브라우저의 그래픽 가속 세션 및 미디어 인프라 렌더링이 100% 완료된 물리적 안전 타이밍에 시스템을 시동합니다.
window.addEventListener('load', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;

    // 1. DOM 공용 핵심 노드 전역 인프라 매핑
    const nodes = window.bowAppNodes;
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
    // [추가] 결과 캡쳐 버튼 DOM 매핑
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

    // 2. 화면 터치 해상도(Viewport)와 캔버스를 완벽 동기화하여 수평계 잘림 및 오차 즉시 박멸
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

    // 하드웨어 그래픽 가속 레이어가 안전하게 개통된 상태에서 코어 모듈을 순차 기동합니다
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    resizeCanvasToDisplay();
    gesture.applyTransform();

    /**
     * [추가 보강] 녹화 중지 시 자동 저장 및 분석 화면 연동 처리
     */
    function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `kukgung_${timestamp}.webm`;

        // 1. 자동 저장 (Blob 다운로드 앵커 생성 및 트리거)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        console.log(`[시스템] 자동 저장 완료: ${fileName}`);

        // 2. 분석 화면 즉시 로드 및 메모리 해제
        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }

        nodes.mainVideo.src = url;
        nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord; // 역보정용 데이터 전송
        
        nodes.mainVideo.onloadedmetadata = () => {
            // 원본 비디오 해상도 동기화 및 프레임 타임 연산
            const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
            currentFrameTime = 1 / detectedFPS;

            nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
            nodes.drawCanvas.height = nodes.mainVideo.videoHeight;
            
            if (isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }

            // 안전한 미디어 자원 반환 및 장면 전환 (Record -> Analyze)
            stopCamera();
            if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
                window.bowGyroSensor.stop();
            }
            nodes.sceneRecord.classList.remove('active');
            nodes.sceneAnalyze.classList.add('active');
            setActiveMenu(nodes.btnMove);
            if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
            
            // 물리 캔버스 버퍼 초기화 및 첫 프레임(0.1초 시점) 강제 렌더링
            nodes.mainVideo.currentTime = 0.1;
            if (window.bowAnalyzer) {
                window.bowAnalyzer.init(nodes.drawCanvas);
                window.bowAnalyzer.render();
            }
            
            console.log('[시스템] 분석 모드 자동 전환 및 비디오 로드 완료');
            setTimeout(resizeCanvasToDisplay, 100);
        };
    }

    // UI 인프라 결합이 완벽히 끝난 후 스토리지를 비동기로 가동하여 교착을 원천 배제합니다
    core.initDB().then(async () => {
        try {
            await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        } catch (e) {
            console.warn('[System] 시크릿 안전 부팅 보호막 가동 완료');
        }

        if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
            nodes.videoSlider.max = nodes.mainVideo.duration;
            nodes.videoSlider.step = 0.0001;
        }
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    const triggerSensorUnlock = async () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }
        if (!cameraStream && nodes.sceneRecord.classList.contains('active')) {
            await startCamera();
        }
        window.removeEventListener('click', triggerSensorUnlock);
        window.removeEventListener('touchstart', triggerSensorUnlock);
    };
    window.addEventListener('click', triggerSensorUnlock);
    window.addEventListener('touchstart', triggerSensorUnlock);
    async function startCamera() {
        if (cameraStream) stopCamera();
        try {
            const isPC = !/Android|iPhone|iPad/i.test(navigator.userAgent);
            let videoConstraints = {
                facingMode: { ideal: "environment" },
                width: 1280,
                height: 720,
                frameRate: { ideal: selectedFPS }
            };
            if (isPC) {
                videoConstraints = { width: 1280, height: 720 };
            }

            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
            nodes.recordStatus.textContent = `${selectedFPS} FPS 카메라 연동 완료`;
            setTimeout(resizeCanvasToDisplay, 150);
        } catch (err) {
            if (selectedFPS > 30) {
                selectedFPS = 30;
                const activeBtn = document.querySelector('.fps-btn[data-fps="30"]');
                if (activeBtn) {
                    document.querySelectorAll('.fps-btn').forEach(b => b.classList.remove('active'));
                    activeBtn.classList.add('active');
                }
                await startCamera();
            } else {
                nodes.recordStatus.textContent = '카메라 장치 로드 실패.';
            }
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
            if (nodes.sceneRecord.classList.contains('active')) {
                await startCamera();
            }
        });
    });

    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await startCamera();
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }
    });

    function transitToAnalyzeMode() {
        stopCamera();
        if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
            window.bowGyroSensor.stop();
        }
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        setTimeout(resizeCanvasToDisplay, 100);
    }

    nodes.btnGoAnalyze.addEventListener('click', transitToAnalyzeMode);
        // [기존 btnRecordToggle 이벤트 내부 보강 완료]
    nodes.btnRecordToggle.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }
        if (!cameraStream) return;

        if (!isRecording) {
            recordedChunks = [];
            let options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'video/webm;codecs=vp8' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: 'video/mp4' };
                }
            }

            try {
                mediaRecorder = new MediaRecorder(cameraStream, options);
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
                };

                // 로컬 캐싱과 새로 보강된 자동 저장 연동 핸들러 바인딩 완료
                mediaRecorder.onstop = async () => {
                    const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                    
                    // 기존 비동기 스토리지 캐시 백업 메커니즘 보존
                    await core.saveCache('lastVideoBlob', videoBlob);
                    await core.saveCache('lastRecordedMime', mediaRecorder.mimeType);

                    // 현재 자이로 실시간 롤(Roll) 각도 보정값 계산 파싱
                    const currentRoll = (core && core.state) ? (core.state.currentRoll || 0) : 0;
                    
                    // 보강된 핸들러로 실시간 물리 파일 다운로드 및 모드 자동 전환
                    handleRecordingFinish(videoBlob, currentRoll);

                    recordedChunks = []; // 버퍼 세션 클리어
                };

                mediaRecorder.start();
                isRecording = true;
                nodes.btnRecordToggle.textContent = ' 녹화중지 ';
                nodes.btnRecordToggle.classList.add('recording');
                nodes.recordStatus.textContent = ' 고해상도 프레임 캡처 진행 중 ...';
            } catch (e) {
                console.error(' 녹화 시동 오류 : ', e);
            }
        } else {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            isRecording = false;
            nodes.btnRecordToggle.textContent = ' 녹화시작 ';
            nodes.btnRecordToggle.classList.remove('recording');
        }
    });

    /**
     * [추가] 분석 화면 캡쳐 및 저장 기능
     * 비디오 프레임 + 분석 선분 레이어를 병합하여 이미지로 저장합니다.
     */
    function captureAnalysisScene() {
        const video = nodes.mainVideo;
        const drawCanvas = nodes.drawCanvas;
        
        // 1. 병합용 임시 캔버스 생성
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth;
        offscreen.height = video.videoHeight;
        const ctx = offscreen.getContext('2d');

        // 2. 비디오 프레임 그리기
        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

        // 3. 분석 선분 레이어 병합
        // drawCanvas가 화면 크기에 맞춰져 있을 수 있으므로 비디오 크기에 맞게 스케일링하여 그림
        ctx.drawImage(drawCanvas, 0, 0, offscreen.width, offscreen.height);

        // 4. 워터마크 또는 고각 정보 추가
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        const angleText = document.getElementById('angle-report')?.innerText || "";
        ctx.fillText(`국궁 자세 분석: ${angleText}`, 20, offscreen.height - 30);

        // 5. 이미지 저장 (다운로드)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const dataUrl = offscreen.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `kukgung_analysis_${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        console.log('[시스템] 분석 화면 캡쳐 완료');
    }

    function setActiveMenu(activeBtn) {
        // [수정] 배열 내에 nodes.btnCapture 토글 비활성화 조건 추가
        [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        if (activeBtn) activeBtn.classList.add('active');
    }

    // 버튼 이벤트 연결
    if (nodes.btnCapture) {
        nodes.btnCapture.addEventListener('click', captureAnalysisScene);
    }

    if (nodes.btnDownloadVideo) {
        nodes.btnDownloadVideo.addEventListener('click', async () => {
            try {
                const savedBlob = await core.loadCache('lastVideoBlob');
                if (!savedBlob) {
                    alert(' 추출할 촬영 비디오 데이터가 존재하지 않습니다 .');
                    return;
                }

                const actualMime = await core.loadCache('lastRecordedMime') || 'video/webm';
                let fileExtension = '.webm';

                if (actualMime.includes('mp4')) {
                    fileExtension = '.mp4';
                }

                const url = URL.createObjectURL(savedBlob);
                const a = document.createElement('a');
                a.href = url;

                const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
                a.download = `kukgung_analysis_${dateStr}${fileExtension}`;

                document.body.appendChild(a);
                a.click();

                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                alert(' 파일 내보내기 도중 오류가 발생했습니다 .');
                console.error(err);
            }
        });
    }
    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
        currentFrameTime = 1 / detectedFPS;

        if (!isFinite(nodes.mainVideo.duration) || nodes.mainVideo.duration === 0 || isNaN(nodes.mainVideo.duration)) {
            nodes.mainVideo.currentTime = 1e9;
            nodes.mainVideo.addEventListener('timeupdate', function recoverDuration() {
                if (nodes.mainVideo.duration && isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                    nodes.videoSlider.max = nodes.mainVideo.duration;
                    nodes.videoSlider.step = 0.0001;
                    nodes.mainVideo.currentTime = 0;
                    nodes.mainVideo.removeEventListener('timeupdate', recoverDuration);
                }
            });
        } else {
            nodes.videoSlider.max = nodes.mainVideo.duration;
            nodes.videoSlider.step = 0.0001;
        }

        resizeCanvasToDisplay();
    });

    nodes.mainVideo.addEventListener('timeupdate', () => {
        if (!isNaN(nodes.mainVideo.currentTime) && isFinite(nodes.mainVideo.duration)) {
            nodes.videoSlider.value = nodes.mainVideo.currentTime;
        }
    });

    nodes.videoSlider.addEventListener('input', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
    });

    nodes.btnPlayPause.addEventListener('click', () => {
        if (nodes.mainVideo.paused) {
            nodes.mainVideo.play();
            nodes.btnPlayPause.textContent = ' 일시정지 ';
        } else {
            nodes.mainVideo.pause();
            nodes.btnPlayPause.textContent = ' 재생 ';
        }
    });

    let longPressTimer = null;
    let repeatInterval = null;

    function startFrameRepeat(direction) {
        clearFrameRepeat();
        longPressTimer = setTimeout(() => {
            repeatInterval = setInterval(() => {
                nodes.mainVideo.pause();
                nodes.btnPlayPause.textContent = ' 재생 ';
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

    nodes.btnFramePrev.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
        startFrameRepeat('prev');
    });

    nodes.btnFrameNext.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
        startFrameRepeat('next');
    });

    window.addEventListener('pointerup', clearFrameRepeat);
    window.addEventListener('pointercancel', clearFrameRepeat);
    nodes.btnFramePrev.addEventListener('pointerleave', clearFrameRepeat);
    nodes.btnFrameNext.addEventListener('pointerleave', clearFrameRepeat);

    nodes.btnOpen.addEventListener('click', () => nodes.videoInput.click());

    nodes.videoInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const targetFile = files[0];

        await core.saveCache('lastVideoBlob', targetFile);
        const url = URL.createObjectURL(targetFile);
        nodes.mainVideo.src = url;
        nodes.mainVideo.load();

        nodes.mainVideo.addEventListener('loadeddata', () => {
            nodes.videoSlider.max = nodes.mainVideo.duration;
            nodes.videoSlider.step = 0.0001;
            resizeCanvasToDisplay();
        }, { once: true });

        if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
            window.bowGyroSensor.stop();
        }
        setActiveMenu(nodes.btnOpen);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            window.bowAnalyzer.setMode('move');
        }
        setTimeout(resizeCanvasToDisplay, 100);
    });

    nodes.btnMove.addEventListener('click', () => {
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.setMode('move');
            window.bowAnalyzer.render();
        }
    });

    nodes.btnDraw.addEventListener('click', () => {
        setActiveMenu(nodes.btnDraw);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.setMode('draw');
            window.bowAnalyzer.render();
        }
    });

    nodes.btnReset.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.mainVideo.removeAttribute('src');
        nodes.mainVideo.load();
        nodes.btnPlayPause.textContent = ' 재생 ';
        nodes.videoSlider.value = 0;
        nodes.videoSlider.max = 100;

        if (window.bowAnalyzer) window.bowAnalyzer.clearLines();

        core.state.scale = 1;
        core.state.offsetX = 0;
        core.state.offsetY = 0;
        if (window.bowAppGesture) window.bowAppGesture.applyTransform();

        await core.saveCache('lastLines', []);
        await core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });
        await core.saveCache('lastVideoBlob', null);
        await core.saveCache('lastRecordedMime', null);

        nodes.angleReport.textContent = "ANGLE 0.0°";
        alert('이전 분석 데이터가 완전히 초기화되었습니다. 즉시 다음 영상 작업을 진행할 수 있습니다.');
        setTimeout(resizeCanvasToDisplay, 100);
    });

    nodes.panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        if (core.state.isPanelOpen) nodes.unifiedPanel.classList.remove('collapsed');
        else nodes.unifiedPanel.classList.add('collapsed');
    });

    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `ANGLE ${e.detail.angle}°`;
        if (window.bowAnalyzer) core.saveCache('lastLines', window.bowAnalyzer.lines);
    });

    window.addEventListener('bowGestureUndo', (e) => {
        core.saveCache('lastLines', e.detail.lines);
    });

    // [?? 정중앙 정렬 복구 패치 완료] CSS 초기화 픽셀(`top: 50%; left: 50%;`)과 오차가 나지 않도록
    // translate 기준 중심축 보정값을 단단히 결합하여 수평계 라인이 반쪽으로 잘리거나 쏠리던 연산 밀림을 원천 제거했습니다.
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;
        
        // 보강용 전역 상태 실시간 갱신 결합
        if (core && core.state) {
            core.state.currentRoll = roll;
        }

        if (nodes.sceneRecord.classList.contains('active')) {
            if (nodes.gyroHorizonLine && nodes.gyroVerticalLine) {
                nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
                nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);

                if (isLevel) {
                    nodes.gyroHorizonLine.classList.add('perfect-level');
                    nodes.gyroVerticalLine.classList.add('perfect-level');
                } else {
                    nodes.gyroHorizonLine.classList.remove('perfect-level');
                    nodes.gyroVerticalLine.classList.remove('perfect-level');
                }
            }
        }
    });
});

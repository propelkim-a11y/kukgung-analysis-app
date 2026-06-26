/**
 * js/app.js - [Part 1]
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 마스터 완결본 
 * (v20.0 - 비동기 가상 병합 화면 캡처 스냅샷 엔진 탑재 버전)
 */

window.bowAppNodes = {};

// 💡 [프리징 박멸 핵심] DOMContentLoaded의 성급한 하드웨어 접근을 차단하고,
// 브라우저의 그래픽 가속 세션 및 미디어 인프라 렌더링이 100% 완료된 물리적 안전 타이밍에 시스템을 시동합니다.
window.addEventListener('load', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;

    // 1. 공용 DOM 핵심 노드 전역 인프라 매핑
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
    nodes.btnReset = document.getElementById('btn-reset');
    nodes.videoInput = document.getElementById('video-input');
    
    nodes.btnDownloadVideo = document.getElementById('btn-download-video');
    nodes.btnCapture = document.getElementById('btn-capture'); // 💡 캡처 노드 연결

    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');

    let selectedFPS = 30;

    // 2. 화면 터치 해상도(Viewport)와 캔버스를 완벽 동기화하여 수평계 잘림 및 오차 즉시 박멸
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
    window.addEventListener('resize', resizeCanvasToDisplay);

    // 하드웨어 그래픽 가속 레이어가 안전하게 개통된 상태에서 코어 모듈을 순차 기동합니다.
    if (gesture && typeof gesture.init === 'function') {
        gesture.init(nodes.videoViewport, nodes.mainVideo);
    }
    if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }
    
    resizeCanvasToDisplay();
    if (gesture && typeof gesture.applyTransform === 'function') {
        gesture.applyTransform();
    }

    // UI 인프라 결합이 완벽히 끝난 후 스토리지를 비동기로 가동하여 교착을 원천 배제합니다.
    if (core && typeof core.initDB === 'function') {
        core.initDB().then(async () => {
            try {
                if (typeof core.restoreLastSession === 'function') {
                    await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
                }
            } catch (e) {
                console.warn('[System] 시크릿 안전 부팅 보호막 가동 완료');
            }

            if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }
        });
    }

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    const triggerSensorUnlock = async () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }
        if (!cameraStream && nodes.sceneRecord && nodes.sceneRecord.classList.contains('active')) {
            await startCamera();
        }
        window.removeEventListener('click', triggerSensorUnlock);
        window.removeEventListener('touchstart', triggerSensorUnlock);
    };
    window.addEventListener('click', triggerSensorUnlock);
    window.addEventListener('touchstart', triggerSensorUnlock);
});
/**
 * js/app.js - [Part 2]
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 마스터 완결본 
 * (v20.0 - 비동기 가상 병합 화면 캡처 스냅샷 엔진 탑재 버전)
 */

    async function startCamera() {
        if (!nodes.cameraPreview) return;
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
            if (nodes.recordStatus) {
                nodes.recordStatus.textContent = `${selectedFPS} FPS 카메라 연동 완료`;
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
                await startCamera();
            } else {
                if (nodes.recordStatus) {
                    nodes.recordStatus.textContent = '카메라 장치 로드 실패.';
                }
            }
            console.error(err);
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        if (nodes.cameraPreview) {
            nodes.cameraPreview.srcObject = null;
        }
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
            if (nodes.sceneRecord && nodes.sceneRecord.classList.contains('active')) {
                await startCamera();
            }
        });
    });

    if (nodes.btnGoRecord) {
        nodes.btnGoRecord.addEventListener('click', async () => {
            if (nodes.mainVideo) nodes.mainVideo.pause();
            if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
            if (nodes.sceneAnalyze) nodes.sceneAnalyze.classList.remove('active');
            if (nodes.sceneRecord) nodes.sceneRecord.classList.add('active');
            await startCamera();
            const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
            if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
                window.bowGyroSensor.start();
            }
        });
    }

    function transitToAnalyzeMode() {
        stopCamera();
        if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
            window.bowGyroSensor.stop();
        }
        if (nodes.sceneRecord) nodes.sceneRecord.classList.remove('active');
        if (nodes.sceneAnalyze) nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        setTimeout(resizeCanvasToDisplay, 100);
    }

    if (nodes.btnGoAnalyze) {
        nodes.btnGoAnalyze.addEventListener('click', transitToAnalyzeMode);
    }
/**
 * js/app.js - [Part 3]
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 마스터 완결본 
 * (v20.0 - 비동기 가상 병합 화면 캡처 스냅샷 엔진 탑재 버전)
 */

    if (nodes.btnRecordToggle) {
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
                    mediaRecorder.onstop = async () => {
                        const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                        const videoURL = URL.createObjectURL(videoBlob);
                        if (nodes.mainVideo) nodes.mainVideo.src = videoURL;
                        
                        if (core && typeof core.saveCache === 'function') {
                            await core.saveCache('lastVideoBlob', videoBlob);
                            await core.saveCache('lastRecordedMime', mediaRecorder.mimeType);
                        }
                        
                        transitToAnalyzeMode();
                    };
                    
                    mediaRecorder.start();
                    isRecording = true;
                    nodes.btnRecordToggle.textContent = '녹화중지';
                    nodes.btnRecordToggle.classList.add('recording');
                    if (nodes.recordStatus) nodes.recordStatus.textContent = '고해상도 프레임 캡처 진행 중...';
                } catch (e) {
                    console.error('녹화 시동 오류:', e);
                }
            } else {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
                isRecording = false;
                nodes.btnRecordToggle.textContent = '녹화시작';
                nodes.btnRecordToggle.classList.remove('recording');
            }
        });
    }

    function setActiveMenu(activeBtn) {
        const menuButtons = [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, 
                            nodes.btnDownloadVideo, nodes.btnCapture, nodes.btnReset];
        menuButtons.forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        if (activeBtn) activeBtn.classList.add('active');
    }

    if (nodes.btnDownloadVideo) {
        nodes.btnDownloadVideo.addEventListener('click', async () => {
            try {
                if (!core || typeof core.loadCache !== 'function') return;
                const savedBlob = await core.loadCache('lastVideoBlob');
                if (!savedBlob) {
                    alert('추출할 촬영 비디오 데이터가 존재하지 않습니다.');
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
                alert('파일 내보내기 도중 오류가 발생했습니다.');
                console.error(err);
            }
        });
    }

    let currentFrameTime = 1 / 30; 
    
    if (nodes.mainVideo) {
        nodes.mainVideo.addEventListener('loadedmetadata', () => {
            const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
            currentFrameTime = 1 / detectedFPS;

            if (!isFinite(nodes.mainVideo.duration) || nodes.mainVideo.duration === 0 || isNaN(nodes.mainVideo.duration)) {
                nodes.mainVideo.currentTime = 1e9;
                nodes.mainVideo.addEventListener('timeupdate', function recoverDuration() {
                    if (nodes.mainVideo.duration && isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                        if (nodes.videoSlider) {
                            nodes.videoSlider.max = nodes.mainVideo.duration;
                            nodes.videoSlider.step = 0.0001;
                        }
                        nodes.mainVideo.currentTime = 0;
                        nodes.mainVideo.removeEventListener('timeupdate', recoverDuration);
                    }
                });
            } else {
                if (nodes.videoSlider) {
                    nodes.videoSlider.max = nodes.mainVideo.duration;
                    nodes.videoSlider.step = 0.0001;
                }
            }
            
            resizeCanvasToDisplay();
        });

        nodes.mainVideo.addEventListener('timeupdate', () => {
            if (nodes.videoSlider && !isNaN(nodes.mainVideo.currentTime) && isFinite(nodes.mainVideo.duration)) {
                nodes.videoSlider.value = nodes.mainVideo.currentTime;
            }
        });
    }
/**
 * js/app.js - [Part 4]
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 마스터 완결본 
 * (v20.0 - 비동기 가상 병합 화면 캡처 스냅샷 엔진 탑재 버전)
 */

    if (nodes.videoSlider) {
        nodes.videoSlider.addEventListener('input', () => {
            if (nodes.mainVideo) {
                nodes.mainVideo.pause();
                nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
            }
            if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
        });
    }
    
    if (nodes.btnPlayPause) {
        nodes.btnPlayPause.addEventListener('click', () => {
            if (!nodes.mainVideo) return;
            if (nodes.mainVideo.paused) {
                nodes.mainVideo.play();
                nodes.btnPlayPause.textContent = '일시정지';
            } else {
                nodes.mainVideo.pause();
                nodes.btnPlayPause.textContent = '재생';
            }
        });
    }

    let longPressTimer = null;
    let repeatInterval = null;

    function startFrameRepeat(direction) {
        clearFrameRepeat();
        longPressTimer = setTimeout(() => {
            repeatInterval = setInterval(() => {
                if (!nodes.mainVideo) return;
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
    
    if (nodes.btnFramePrev) {
        nodes.btnFramePrev.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (nodes.mainVideo) {
                nodes.mainVideo.pause();
                nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
            }
            if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
            startFrameRepeat('prev');
        });
        nodes.btnFramePrev.addEventListener('pointerleave', clearFrameRepeat);
    }
    
    if (nodes.btnFrameNext) {
        nodes.btnFrameNext.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (nodes.mainVideo) {
                nodes.mainVideo.pause();
                nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
            }
            if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
            startFrameRepeat('next');
        });
        nodes.btnFrameNext.addEventListener('pointerleave', clearFrameRepeat);
    }

    window.addEventListener('pointerup', clearFrameRepeat);
    window.addEventListener('pointercancel', clearFrameRepeat);
    
    if (nodes.btnOpen) {
        nodes.btnOpen.addEventListener('click', () => {
            if (nodes.videoInput) nodes.videoInput.click();
        });
    }
    
    if (nodes.videoInput) {
        nodes.videoInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const targetFile = files[0];
            
            if (core && typeof core.saveCache === 'function') {
                await core.saveCache('lastVideoBlob', targetFile);
            }
            const url = URL.createObjectURL(targetFile);
            if (nodes.mainVideo) {
                nodes.mainVideo.src = url;
                nodes.mainVideo.load();
                
                nodes.mainVideo.addEventListener('loadeddata', () => {
                    if (nodes.videoSlider) {
                        nodes.videoSlider.max = nodes.mainVideo.duration;
                        nodes.videoSlider.step = 0.0001;
                    }
                    resizeCanvasToDisplay();
                }, { once: true });
            }

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
    }

    if (nodes.btnMove) {
        nodes.btnMove.addEventListener('click', () => {
            setActiveMenu(nodes.btnMove);
            if (window.bowAnalyzer) {
                window.bowAnalyzer.setMode('move');
                window.bowAnalyzer.render();
            }
        });
    }

    if (nodes.btnDraw) {
        nodes.btnDraw.addEventListener('click', () => {
            setActiveMenu(nodes.btnDraw);
            if (window.bowAnalyzer) {
                window.bowAnalyzer.setMode('draw');
                window.bowAnalyzer.render();
            }
        });
    }

    // 💡 [단일 기능 보정] 가상 병합 레이어를 비동기로 가동하여 스냅샷 이미지 다운로드 파이프라인 개통
    if (nodes.btnCapture) {
        nodes.btnCapture.addEventListener('click', () => {
            if (!nodes.mainVideo || !nodes.drawCanvas) return;
            setActiveMenu(nodes.btnCapture);

            const vW = nodes.mainVideo.videoWidth;
            const vH = nodes.mainVideo.videoHeight;
            if (!vW || !vH) {
                alert('캡처할 비디오 소스 자원이 로드되지 않았습니다.');
                return;
            }

            // 하드웨어 코덱 가속 해상도와 1:1 결합하는 백그라운드 가상 병합 컨텍스트 선언
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = vW;
            snapCanvas.height = vH;
            const snapCtx = snapCanvas.getContext('2d');

            // 1단계: 비디오의 현재 프레임을 순수 해상도 그대로 덤프 드로우
            snapCtx.drawImage(nodes.mainVideo, 0, 0, vW, vH);

            // 2단계: 그 위에 실시간 가이드라인 레이어 스케일 팩터를 병합 동조
            const state = core.state || { scale: 1, offsetX: 0, offsetY: 0 };
            snapCtx.save();
            
            // 제스처 매트릭스 이동 변동치 비율 변환식 적용
            const scaleFactor = vW / nodes.drawCanvas.width;
            snapCtx.translate(state.offsetX * scaleFactor, state.offsetY * scaleFactor);
            snapCtx.scale(state.scale * scaleFactor, state.scale * scaleFactor);

            // 원본 선분 텍스처를 기하학 렌더러 소스에서 1:1 오버랩 병합
            if (window.bowAnalyzer) {
                const tempCanvas = window.bowAnalyzer.canvas;
                const tempCtx = window.bowAnalyzer.ctx;
                window.bowAnalyzer.canvas = snapCanvas;
                window.bowAnalyzer.ctx = snapCtx;
                
                // 가상 컨텍스트 영역으로 드로우 루프 강제 리다이렉트 주사
                window.bowAnalyzer.render();
                
                window.bowAnalyzer.canvas = tempCanvas;
                window.bowAnalyzer.ctx = tempCtx;
            }
            snapCtx.restore();

            // 3단계: 완성된 이미지 스트림을 PNG로 파일 내보내기 마감 처리
            try {
                const imgURL = snapCanvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = imgURL;
                const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
                a.download = `kukgung_snapshot_${dateStr}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch (err) {
                alert('보안 제약으로 인해 외부 비디오의 캡처 처리가 거부되었습니다.');
                console.error(err);
            }
        });
    }

    if (nodes.btnReset) {
        nodes.btnReset.addEventListener('click', async () => {
            if (nodes.mainVideo) {
                nodes.mainVideo.pause();
                nodes.mainVideo.removeAttribute('src');
                nodes.mainVideo.load();
            }
            if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
            if (nodes.videoSlider) {
                nodes.videoSlider.value = 0;
                nodes.videoSlider.max = 100;
            }

            if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
            
            if (core && core.state) {
                core.state.scale = 1;
                core.state.offsetX = 0;
                core.state.offsetY = 0;
            }
        });
    }
});

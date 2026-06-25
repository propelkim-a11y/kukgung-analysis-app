/**
 * js/app.js
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 마스터 완결본 (v17.8 - 첫 터치 수명 주기 분리 완결판)
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', () => {
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

    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');

    let selectedFPS = 30;

    // 2. 화면 터치 해상도(Viewport)와 캔버스를 완벽 동기화하여 선 오차 즉시 박멸
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

    // 💡 [치명적 타이밍 버그 해결] 가상 스토리지 마운트 완료 신호를 받은 뒤 순차 부팅 시동
    core.initDB().then(async () => {
        gesture.init(nodes.videoViewport, nodes.mainVideo);
        if (window.bowAnalyzer) {
            window.bowAnalyzer.init(nodes.drawCanvas);
        }

        try {
            await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        } catch (e) {
            console.warn('[System] 시크릿 안전 부팅 보호막 가동 완료');
        }

        resizeCanvasToDisplay();
        gesture.applyTransform();

        if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
            nodes.videoSlider.max = nodes.mainVideo.duration;
            nodes.videoSlider.step = 0.0001;
        }
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    // 💡 [박멸 핵심] 초기 화면이 열릴 때 하드웨어 센서와 카메라 장치를 절대 미리 호출하지 않고, 
    // 사용자가 모바일 화면을 최초로 직접 가볍게 톡 터치(혹은 클릭)하는 순간에만 완전히 안전한 독립 순서로 깨웁니다.
    const triggerSensorUnlock = async () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        
        // 1. 디바이스 자이로 모듈 순차 활성화
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }
        
        // 2. 촬영화면이 active 상태인 경우에만 카메라 스트림 격리 할당
        if (!cameraStream && nodes.sceneRecord.classList.contains('active')) {
            await startCamera();
        }
        
        // 3. 중복 트리거 누적 및 충돌 버그 원천 차단
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
        nodes.btnPlayPause.textContent = '재생';
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
                    nodes.mainVideo.src = videoURL;
                    
                    await core.saveCache('lastVideoBlob', videoBlob);
                    await core.saveCache('lastRecordedMime', mediaRecorder.mimeType);
                    
                    transitToAnalyzeMode();
                };
                
                mediaRecorder.start();
                isRecording = true;
                nodes.btnRecordToggle.textContent = '녹화중지';
                nodes.btnRecordToggle.classList.add('recording');
                nodes.recordStatus.textContent = '고해상도 프레임 캡처 진행 중...';
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
    function setActiveMenu(activeBtn) {
        [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnDownloadVideo].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        if (activeBtn) activeBtn.classList.add('active');
    }

    if (nodes.btnDownloadVideo) {
        nodes.btnDownloadVideo.addEventListener('click', async () => {
            try {
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
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
    });
    
    nodes.btnPlayPause.addEventListener('click', () => {
        if (nodes.mainVideo.paused) {
            nodes.mainVideo.play();
            nodes.btnPlayPause.textContent = '일시정지';
        } else {
            nodes.mainVideo.pause();
            nodes.btnPlayPause.textContent = '재생';
        }
    });

    let longPressTimer = null;
    let repeatInterval = null;

    function startFrameRepeat(direction) {
        clearFrameRepeat();
        longPressTimer = setTimeout(() => {
            repeatInterval = setInterval(() => {
                nodes.mainVideo.pause();
                nodes.btnPlayPause.textContent = '재생';
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
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
        startFrameRepeat('prev');
    });
    
    nodes.btnFrameNext.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
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
        const targetFile = files;
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
        nodes.btnPlayPause.textContent = '재생';
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
    
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;

        if (nodes.sceneRecord.classList.contains('active')) {
            if (nodes.gyroHorizonLine) {
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

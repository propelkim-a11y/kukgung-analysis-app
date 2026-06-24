/**
 * js/app.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 통합본 (녹화 Duration 타임스탬프 복원 판)
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
    resizeCanvasToDisplay();

    // 3. 제스처 및 드로잉 분석 모듈 초기 가동
    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    // 4. 대용량 IndexedDB 캐시 인프라 로드 및 동기화
    core.initDB().then(async () => {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
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
/**
 * js/app.js (Part 2 of 3)
 */
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
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm;codecs=vp8' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };

            try {
                mediaRecorder = new MediaRecorder(cameraStream, options);
            } catch (e) {
                mediaRecorder = new MediaRecorder(cameraStream);
            }

            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                nodes.recordStatus.textContent = '저장 중...';
                const videoBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
                await core.saveCache('lastVideoBlob', videoBlob);
                const videoURL = URL.createObjectURL(videoBlob);
                nodes.mainVideo.src = videoURL;
                nodes.mainVideo.load();
                stopCamera();
                if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
                    window.bowGyroSensor.stop();
                }
                nodes.sceneRecord.classList.remove('active');
                nodes.sceneAnalyze.classList.add('active');
                setActiveMenu(nodes.btnOpen);
                if (window.bowAnalyzer) {
                    window.bowAnalyzer.clearLines();
                    window.bowAnalyzer.setMode('move');
                }
                setTimeout(resizeCanvasToDisplay, 100);
                nodes.btnRecordToggle.textContent = '녹화시작';
                nodes.btnRecordToggle.classList.remove('recording');
            };
            
            mediaRecorder.start(1000);
            isRecording = true;
            nodes.btnRecordToggle.textContent = '녹화종료/분석';
            nodes.btnRecordToggle.classList.add('recording');
            nodes.recordStatus.textContent = '촬영 중...';
        } else {
            mediaRecorder.stop();
            isRecording = false;
        }
    });
/**
 * js/app.js (Part 3 of 3)
 */
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
                const url = URL.createObjectURL(savedBlob);
                const a = document.createElement('a');
                a.href = url;
                const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
                a.download = `kukgung_analysis_${dateStr}.webm`;
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
    
    // 💡 [WebM 타임스탬프 복원 엔진 주입] 실시간 인코딩 파일의 누락된 전체 시간을 완벽 사상
    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        const detectedFPS = nodes.mainVideo.videoFrameRate || selectedFPS;
        currentFrameTime = 1 / detectedFPS;

        // 촬영 원본 비디오 자체에 재생 시간이 누락되어(Infinity 등) 들어온 상태인지 정밀 스캔
        if (!isFinite(nodes.mainVideo.duration) || nodes.mainVideo.duration === 0 || isNaN(nodes.mainVideo.duration)) {
            // 브라우저 내부 타임라인 끝자락(1e9초 뒤)으로 가상 재생 시점을 초고속 강제 워프시킴
            nodes.mainVideo.currentTime = 1e9;
            
            // 끝부분을 밟는 즉시 브라우저 커널이 복원해낸 진짜 전체 영상 초(s) 정보를 슬라이더에 강제 박제
            nodes.mainVideo.addEventListener('timeupdate', function recoverDuration() {
                if (nodes.mainVideo.duration && isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                    nodes.videoSlider.max = nodes.mainVideo.duration;
                    nodes.videoSlider.step = 0.0001;
                    // 메타데이터 복원이 완료되었으므로 안전하게 0초(처음 시점)로 귀환하여 일시정지
                    nodes.mainVideo.currentTime = 0;
                    nodes.mainVideo.removeEventListener('timeupdate', recoverDuration);
                }
            });
        } else {
            // 이미 정보가 온전한 수동 [열기] 파일은 곧바로 전체 스케일 매핑 매칭
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
        const targetFile = files[0];
        await core.saveCache('lastVideoBlob', targetFile);
        const url = URL.createObjectURL(targetFile);
        nodes.mainVideo.src = url;
        nodes.mainVideo.load();
        
        nodes.mainVideo.addEventListener('loadeddata', () => {
            nodes.videoSlider.max = nodes.mainVideo.duration;
            nodes.videoSlider.step = 0.0001;
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

    nodes.btnReset.addEventListener('click', () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            core.saveCache('lastLines', []);
        }
        core.state.scale = 1;
        core.state.offsetX = 0;
        core.state.offsetY = 0;
        if (window.bowAppGesture) window.bowAppGesture.applyTransform();
        core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });
    });
    
    nodes.panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        if (core.state.isPanelOpen) nodes.unifiedPanel.classList.remove('collapsed');
        else nodes.unifiedPanel.classList.add('collapsed');
    });
    
    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `ANGLE: ${e.detail.angle}°`;
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
                nodes.gyroHorizonLine.setAttribute('data-angle', `${Math.abs(roll).toFixed(1)}°`);
                nodes.gyroHorizonLine.style.transform = `translateY(-50%) rotate(${-roll}deg)`;
                if (isLevel) nodes.gyroHorizonLine.classList.add('perfect-level');
                else nodes.gyroHorizonLine.classList.remove('perfect-level');
            }
            if (nodes.gyroVerticalLine) {
                nodes.gyroVerticalLine.style.transform = `translateX(-50%) rotate(${-roll}deg)`;
                if (isLevel) nodes.gyroVerticalLine.classList.add('perfect-level');
                else nodes.gyroVerticalLine.classList.remove('perfect-level');
            }
        }
    });
});

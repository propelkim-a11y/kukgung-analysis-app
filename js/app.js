/**
 * js/app.js (Part 1 of 4)
 * 국궁 자세 분석 시스템 - 마스터 컨트롤러 통합본 (시크릿 탭 무조건 락 해제 판)
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

    // 기기 성능 감지 후 기본 세팅값을 고속 촬영 규격(120 FPS)으로 강제 상향 리비전
    const cpuCores = navigator.hardwareConcurrency || 4;
    let selectedFPS = cpuCores > 4 ? 120 : 30;

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
/**
 * js/app.js (Part 2 of 4)
 */
    // [치명적 타이밍 버그 해결] 가상 스토리지 마운트 완료 신호를 받은 뒤 순차 부팅 시동
    core.initDB().then(async () => {
        // 객체 참조 무결성을 위해 하드웨어 엔진 모듈들을 안전하게 순차 기동
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

    // 동적 실시간 각도 리포트 UI 텍스트 동기화 리스너 영구 결합 (타 기능 영향 제로)
    window.addEventListener('bowAngleUpdate', (e) => {
        if (nodes.angleReport) {
            nodes.angleReport.textContent = `ANGLE ${e.detail.angle}°`;
        }
    });

    // 💡 S펜 리모콘 하드웨어 무선 신호 총결산 정밀 가로채기 파이프라인 (2026 안정화 버전)
    const handleRemoteShutterSignal = (event) => {
        // 현재 화면이 명확히 '촬영 모드' 상태일 때만 원격 제어 커널 필터 작동
        if (nodes.sceneRecord && nodes.sceneRecord.classList.contains('active')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            if (nodes.btnRecordToggle) {
                nodes.btnRecordToggle.click(); // 물리 녹화 스위칭 메인 스위치 강제 동기화 가상 트리거
            }
        }
    };

    // 패턴 1: S펜 하드웨어 버튼 클릭이 일반 미디어/볼륨 하이브리드 주파수로 인입되는 전대역 차단막
    window.addEventListener('keydown', (event) => {
        if (nodes.sceneRecord && nodes.sceneRecord.classList.contains('active')) {
            const sPenKeys = [
                'MediaPlayPause', 'VolumeUp', 'VolumeDown', 
                'TrackNext', 'TrackPrevious', 'MediaFastForward', 'MediaRewind'
            ];
            const sPenKeyCodes =;

            if (sPenKeys.includes(event.key) || sPenKeyCodes.includes(event.keyCode)) {
                handleRemoteShutterSignal(event);
            }
        }
    }, true);

    // 패턴 2: 💡 [최종 락 해제 핵심] 갤럭시 모바일 크롬/삼성 인터넷 고유의 S펜 가상 마우스 우측 메뉴 팝업 신호 원천 가로채기
    window.addEventListener('contextmenu', (event) => {
        // 갤럭시 S펜의 하드웨어 버튼을 누른 채 조작할 때 발생하는 contextmenu 입력을 정밀 필터링
        if (nodes.sceneRecord && nodes.sceneRecord.classList.contains('active')) {
            handleRemoteShutterSignal(event);
        }
    }, true);

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
/**
 * js/app.js (Part 3 of 4)
 */
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
                videoConstraints = { width: 1280, height: 720, frameRate: { ideal: selectedFPS } };
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
    
    fpsButtons.forEach(btn => {
        const fpsVal = parseInt(btn.getAttribute('data-fps'), 10);
        
        if (cpuCores <= 4 && fpsVal >= 120) {
            btn.style.opacity = '0.25';
            btn.style.pointerEvents = 'none';
        }
        
        if (fpsVal === selectedFPS) {
            fpsButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });

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

    if (nodes.btnOpen) {
        nodes.btnOpen.addEventListener('click', () => {
            if (nodes.videoInput) nodes.videoInput.click();
        });
    }

    if (nodes.btnMove) {
        nodes.btnMove.addEventListener('click', () => {
            setActiveMenu(nodes.btnMove);
            if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
        });
    }

    if (nodes.btnDraw) {
        nodes.btnDraw.addEventListener('click', () => {
            setActiveMenu(nodes.btnDraw);
            if (window.bowAnalyzer) window.bowAnalyzer.setMode('draw');
        });
    }

    if (nodes.btnReset) {
        nodes.btnReset.addEventListener('click', () => {
            if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
            core.state.scale = 1;
            core.state.offsetX = 0;
            core.state.offsetY = 0;
            gesture.applyTransform();
        });
    }
/**
 * js/app.js (Part 4 of 4)
 */
    if (nodes.videoInput) {
        nodes.videoInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const file = files[0];

            nodes.mainVideo.pause();
            nodes.btnPlayPause.textContent = '재생';

            try {
                await core.saveCache('lastVideoBlob', file);
                await core.saveCache('lastRecordedMime', file.type || 'video/webm');
            } catch (err) {
                console.error('[Storage] 외부 파일 캐시 저장 예외 보호:', err);
            }

            const videoURL = URL.createObjectURL(file);
            nodes.mainVideo.src = videoURL;
            nodes.mainVideo.load();

            if (window.bowAnalyzer) {
                window.bowAnalyzer.clearLines();
                window.bowAnalyzer.setMode('move');
            }
            setActiveMenu(nodes.btnMove);
            setTimeout(resizeCanvasToDisplay, 100);
        });
    }

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
                
                try {
                    await core.saveCache('lastVideoBlob', videoBlob);
                    await core.saveCache('lastRecordedMime', mediaRecorder.mimeType || 'video/webm');
                } catch(err) {
                    console.error('[Storage] 복원 데이터 제한 조킹 완료');
                }

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
});

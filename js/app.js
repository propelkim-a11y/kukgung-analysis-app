/**
 * js/app.js
 * - (v20.3) 국궁 자세 분석 시스템 프리징 방지 마스터 컨트롤러 + 수평계 복구 및 최종 안정화 통합본
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', async () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    const nodes = window.bowAppNodes;

    // 1. DOM 공용 핵심 인프라 노드 매핑 (오류 격리막 작동)
    try {
        nodes.sceneRecord = document.getElementById('scene-record');
        nodes.sceneAnalyze = document.getElementById('scene-analyze');
        nodes.btnGoAnalyze = document.getElementById('btn-go-analyze');
        nodes.btnGoRecord = document.getElementById('btn-go-record');

        nodes.cameraPreview = document.getElementById('camera-preview');
        nodes.btnRecordToggle = document.getElementById('btn-record-toggle');
        nodes.recordStatus = document.getElementById('record-status');
        
        // [수평계 UI 요소 인프라 바인딩]
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

        console.log('[시스템] DOM 노드 매핑 완료');
    } catch (e) {
        console.error('[오류] DOM 매핑 실패:', e);
    }

    let selectedFPS = 30;
    let currentFrameTime = 1 / 30;
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let currentRoll = 0; // [이식] 촬영 시점의 기울기 실시간 백업용 변수
    // 2. 가변 해상도/FPS 대응 카메라 및 센서 초기화 함수 (플레이백 보장)
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

            // [이식] 카메라 세션 개통 직후 수평계 센서 가동 시작 (권한 처리 최적화)
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
                console.error('[오류] 카메라 초기화 실패:', err);
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
        console.log(`[시스템] 자동 저장 및 미디어 물리 다운로드 완료: ${fileName}`);

        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }

        nodes.mainVideo.src = url;
        // [이식] 촬영을 종료한 바로 그 시점의 보정된 최종 롤 각도를 비디오 데이터셋에 박제
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
    // 4. 미디어 레코더 구동 및 비디오/라인 리셋 로직
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
                    
                    // [이식] 세션 상태의 오차율을 방지하기 위해 캡처 루프 직전 백업된 최신 currentRoll 전달
                    handleRecordingFinish(videoBlob, currentRoll);
                    recordedChunks = [];
                };

                mediaRecorder.start();
                isRecording = true;
                nodes.btnRecordToggle.textContent = '녹화중지';
                nodes.btnRecordToggle.classList.add('recording');
                if (nodes.recordStatus) nodes.recordStatus.innerText = "● 녹화 중";
            } catch (e) {
                console.error('[오류] 녹화 시동 실패:', e);
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
        const angleText = nodes.angleReport?.innerText.split('\n')[0] || "0.0°";
        ctx.fillText(`국궁 자세 분석: ${angleText}`, 20, offscreen.height - 30);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const link = document.createElement('a');
        link.download = `kukgung_analysis_${timestamp}.png`;
        link.href = offscreen.toDataURL('image/png');
        link.click();
        console.log('[시스템] 분석 화면 고해상도 이미지 레이어 캡쳐 완료');
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
    // 6. 초정밀 프레임 전/후진 롱프레스 터치 제어 및 자이로 수평계 복구 핵심 바인딩
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

    // [이식 및 복구] 자이로 실시간 오차 업데이트 및 동적 색상 매핑 제어 메커니즘 (ㄷ자 멈춤 완벽 복구)
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;
        
        currentRoll = roll; // 실시간 가변 롤값 변수 동기화
        if (core && core.state) core.state.currentRoll = roll;

        if (nodes.sceneRecord?.classList.contains('active')) {
            if (nodes.gyroHorizonLine) {
                nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
                nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);
                // 완벽 수평 상태에 따른 실시간 칼라 인디케이터 교체 (그린/레드 피드백)
                nodes.gyroHorizonLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
                nodes.gyroHorizonLine.classList.toggle('perfect-level', isLevel);
            }
            if (nodes.gyroVerticalLine) {
                nodes.gyroVerticalLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
                nodes.gyroVerticalLine.classList.toggle('perfect-level', isLevel);
            }
            // 녹화가 돌기 전 대기 상태일 때 보더 칼라 연동 제어
            if (nodes.btnRecordToggle && !isRecording) {
                nodes.btnRecordToggle.style.borderColor = isLevel ? '#00ff00' : '#ff4444';
            }
        }
    });

    window.addEventListener('bowAngleUpdate', (e) => {
        if (nodes.angleReport && e.detail.angle !== undefined) {
            nodes.angleReport.innerHTML = `
                <div style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>
                <div style="font-size:11px; color:#aaa; margin-top:2px;">(측정: ${e.detail.raw}° / 보정: ${e.detail.roll}°)</div>`;
        }
        if (window.bowAnalyzer && core) core.saveCache('lastLines', window.bowAnalyzer.lines);
    });

    // 기본 이벤트 내비게이션 파일 등록 바인더
    nodes.btnOpen?.addEventListener('click', () => nodes.videoInput?.click());
    nodes.videoInput?.addEventListener('change', async (e) => {
        const files = e.target.files; if (!files || files.length === 0) return;
        if (core && typeof core.saveCache === 'function') await core.saveCache('lastVideoBlob', files[0]);
        nodes.mainVideo.src = URL.createObjectURL(files[0]);
        nodes.mainVideo.load();
        nodes.mainVideo.addEventListener('loadeddata', () => {
            if (nodes.videoSlider) { nodes.videoSlider.max = nodes.mainVideo.duration; nodes.videoSlider.step = 0.0001; }
            resizeCanvasToDisplay();
        }, { once: true });
        setActiveMenu(nodes.btnOpen);
        if (window.bowAnalyzer && typeof window.bowAnalyzer.clearLines === 'function') { window.bowAnalyzer.clearLines(); window.bowAnalyzer.setMode('move'); }
        setTimeout(resizeCanvasToDisplay, 100);
    });

    nodes.btnMove?.addEventListener('click', () => { setActiveMenu(nodes.btnMove); if (window.bowAnalyzer) { window.bowAnalyzer.setMode('move'); window.bowAnalyzer.render(); } });
    nodes.btnDraw?.addEventListener('click', () => { setActiveMenu(nodes.btnDraw); if (window.bowAnalyzer) { window.bowAnalyzer.setMode('draw'); window.bowAnalyzer.render(); } });
    function setActiveMenu(activeBtn) { [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => btn?.classList.remove('active')); activeBtn?.classList.add('active'); }

    nodes.btnGoRecord?.addEventListener('click', async () => { nodes.mainVideo.pause(); if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생'; nodes.sceneAnalyze.classList.remove('active'); nodes.sceneRecord.classList.add('active'); await initCamera(); });
    nodes.btnGoAnalyze?.addEventListener('click', () => { stopCamera(); nodes.sceneRecord.classList.remove('active'); nodes.sceneAnalyze.classList.add('active'); setActiveMenu(nodes.btnMove); if (window.bowAnalyzer) window.bowAnalyzer.setMode('move'); setTimeout(resizeCanvasToDisplay, 100); });
    nodes.panelHandle?.addEventListener('click', () => { if (!core || !core.state) return; core.state.isPanelOpen = !core.state.isPanelOpen; nodes.unifiedPanel?.classList.toggle('collapsed', !core.state.isPanelOpen); });
    nodes.btnDownloadVideo?.addEventListener('click', async () => { try { const savedBlob = await core.loadCache('lastVideoBlob'); if (!savedBlob) { alert('추출할 촬영 비디오 데이터가 존재하지 않습니다.'); return; } const actualMime = await core.loadCache('lastRecordedMime') || 'video/webm'; const ext = actualMime.includes('mp4') ? '.mp4' : '.webm'; const url = URL.createObjectURL(savedBlob); const a = document.createElement('a'); a.href = url; a.download = `kukgung_video_${Date.now()}${ext}`; a.click(); URL.revokeObjectURL(url); } catch (err) { console.error(err); } });

    // 순차 비동기 시동 및 안정적 스크립트 엔진 컴파일 바인딩 완료
    await initCamera();
    resizeCanvasToDisplay();
    window.addEventListener('resize', resizeCanvasToDisplay);

    if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') window.bowAnalyzer.init(nodes.drawCanvas);
});

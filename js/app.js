/**
 * js/app.js
 * - (v21.1) 국궁 자세 분석 시스템 - [열기] 파일 로더 버그 해결 및 S펜 원격 제어 통합 완결판
 */

window.bowAppNodes = {};

// 초기화 런타임 레이어를 별도 분리하여 스크립트 상호 간섭 및 프리징 원천 방지
async function startSystem() {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    const nodes = window.bowAppNodes;

    // 1. DOM 노드 매핑 (v20.8 사양의 명시적 일대일 안전 매핑 공정 적용)
    try {
        const mapping = {
            'scene-record': 'sceneRecord',
            'scene-analyze': 'sceneAnalyze',
            'btn-go-analyze': 'btnGoAnalyze',
            'btn-go-record': 'btnGoRecord',
            'camera-preview': 'cameraPreview',
            'btn-record-toggle': 'btnRecordToggle',
            'record-status': 'recordStatus',
            'gyro-horizon-line': 'gyroHorizonLine',
            'gyro-vertical-line': 'gyroVerticalLine',
            'video-viewport': 'videoViewport',
            'main-video': 'mainVideo',
            'draw-canvas': 'drawCanvas',
            'unified-panel': 'unifiedPanel',
            'panel-handle': 'panelHandle',
            'btn-open': 'btnOpen',
            'btn-move': 'btnMove',
            'btn-draw': 'btnDraw',
            'btn-capture': 'btnCapture',
            'btn-reset': 'btnReset',
            'video-input': 'videoInput',
            'btn-download-video': 'btnDownloadVideo',
            'video-slider': 'videoSlider',
            'btn-frame-prev': 'btnFramePrev',
            'btn-play-pause': 'btnPlayPause',
            'btn-frame-next': 'btnFrameNext',
            'angle-report': 'angleReport'
        };
        
        for (const [id, key] of Object.entries(mapping)) {
            nodes[key] = document.getElementById(id);
        }

        console.log('[시스템] v21.1 파일 분석 연동형 DOM 인프라 바인딩 완료');
    } catch (e) {
        console.error('[오류] DOM 인프라 기계식 매핑 실패:', e);
    }

    let selectedFPS = 120;
    let currentFrameTime = 1 / 120;
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let currentRoll = 0;
    let actualFPS = 120;
    // 2. 가변 ideal 제약조건 기반 카메라 초기화 및 하드웨어 능력치 스크리닝
    async function initCamera() {
        if (cameraStream) stopCamera();
        console.log('[시스템] 안정성 최우선 미디어 파이프라인 카메라 가동...');
        
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    frameRate: { ideal: 120 },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (nodes.cameraPreview) {
                nodes.cameraPreview.srcObject = cameraStream;
                nodes.cameraPreview.muted = true;
                nodes.cameraPreview.setAttribute('playsinline', '');
                await nodes.cameraPreview.play();
            }
            
            const track = cameraStream.getVideoTracks()[0];
            const settings = track.getSettings();
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            
            actualFPS = settings.frameRate || 120;
            selectedFPS = typeof actualFPS === 'number' ? actualFPS : 120;

            if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
                await window.bowGyroSensor.start().catch(e => console.warn('센서 대기:', e));
            }
            
            if (nodes.recordStatus) {
                const maxFPS = capabilities.frameRate ? capabilities.frameRate.max : '미지원';
                nodes.recordStatus.innerHTML = `
                    <div style="font-size:11px; line-height:1.3; color:#fff; text-align:left;">
                        상태: <span style="color:#00ff00; font-weight:bold;">촬영 준비 완료</span> / 웹최대: <b style="color:#ffaa00;">${maxFPS} FPS</b><br>
                        해상도: <span style="color:#00e1ff;">${settings.width || 1280}x${settings.height || 720}</span>
                    </div>
                `;
            }
            
            currentFrameTime = 1 / (typeof actualFPS === 'number' ? actualFPS : 120);
            setTimeout(resizeCanvasToDisplay, 150);
        } catch (err) {
            console.error('[오류] 1단계 카메라 가동 실패, 2단계 폴백 진입:', err);
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (nodes.cameraPreview) {
                    nodes.cameraPreview.srcObject = cameraStream;
                    nodes.cameraPreview.muted = true;
                    nodes.cameraPreview.setAttribute('playsinline', '');
                    await nodes.cameraPreview.play();
                }
                if (nodes.recordStatus) nodes.recordStatus.innerText = "기본 해상도 모드로 우회 연결됨";
            } catch (fallbackErr) {
                console.error('[오류] 카메라 장치 로드 전면 무력화:', fallbackErr);
                if (nodes.recordStatus) nodes.recordStatus.innerHTML = `<b style="color:#ff4444;">카메라 권한을 허용해주세요.</b>`;
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
    // 3. [개선 완결] 외부 파일 업로드 및 실시간 촬영본 분석 모드 세션 정렬 인터페이스
    let loadedFileFrameRateTarget = 120; // 외부 파일 업로드 시 타깃 프레임을 기억할 내부 브릿지 변수

    function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const currentMimeType = mediaRecorder?.mimeType || 'video/webm';
        const ext = currentMimeType.includes('mp4') ? '.mp4' : '.webm';
        const fileName = `kukgung_${Date.now()}${ext}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        if (nodes.mainVideo) {
            if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
                URL.revokeObjectURL(nodes.mainVideo.src);
            }
            loadedFileFrameRateTarget = typeof actualFPS === 'number' ? actualFPS : selectedFPS;
            nodes.mainVideo.src = url;
            nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord;
            triggerVideoAnalysisSetup();
        }
    }

    // [버그 차단 핵심] 외부 로드와 촬영본 종료 시점에 가로세로 규격을 확실히 인지시킨 후 화면을 전환하는 공용 시퀀스
    function triggerVideoAnalysisSetup() {
        if (!nodes.mainVideo) return;
        
        nodes.mainVideo.onloadedmetadata = () => {
            // 순정 카메라 업로드 인지 락 우회 및 역산 타임 프레임 주기 계산
            let detectedFPS = nodes.mainVideo.videoFrameRate || loadedFileFrameRateTarget;
            currentFrameTime = 1 / detectedFPS;
            console.log(`[분석 커널] 타임라인 시계열 프레임 갱신 완료: ${detectedFPS} FPS`);

            // [화면 굳음 해결] 컨테이너 가용 크기를 연산하여 분석 뷰포트 배치 고정
            nodes.sceneRecord?.classList.remove('active');
            nodes.sceneAnalyze?.classList.add('active');

            if (nodes.drawCanvas) {
                nodes.drawCanvas.width = nodes.mainVideo.videoWidth || 1280;
                nodes.drawCanvas.height = nodes.mainVideo.videoHeight || 720;
            }

            if (isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }

            stopCamera();
            if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
                window.bowGyroSensor.stop();
            }
            
            setActiveMenu(nodes.btnMove);
            if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');

            nodes.mainVideo.currentTime = 0.1;
            
            // 제스처 모듈 원점 강제 초기화 트리거를 호출하여 비디오 겉돎 및 안 보임 버그 소거
            if (window.bowAppGesture && typeof window.bowAppGesture.applyTransform === 'function') {
                window.bowAppGesture.applyTransform();
            }

            if (window.bowAnalyzer) {
                window.bowAnalyzer.init(nodes.drawCanvas);
                window.bowAnalyzer.render();
            }
            
            setTimeout(resizeCanvasToDisplay, 100);
        };
    }

    if (core && typeof core.initDB === 'function') {
        core.initDB().then(async () => {
            try { await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas); } catch (e) {}
            if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }
        });
    }
    // 4. 500ms 단위 대용량 유입 버퍼 크래시 방어선 미디어 레코더 제어부
    nodes.btnRecordToggle?.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            recordedChunks = [];
            const stream = nodes.cameraPreview?.srcObject;
            if (!stream) return;

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
            
            mediaRecorder = new MediaRecorder(stream, { 
                mimeType,
                videoBitsPerSecond: 5000000 
            });
            
            mediaRecorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };
            
            mediaRecorder.onstop = async () => {
                const actualRecordedMime = mediaRecorder.mimeType || mimeType || 'video/webm';
                const videoBlob = new Blob(recordedChunks, { type: actualRecordedMime });

                if (core && typeof core.saveCache === 'function') {
                    await core.saveCache('lastVideoBlob', videoBlob);
                    await core.saveCache('lastRecordedMime', actualRecordedMime);
                }

                handleRecordingFinish(videoBlob, currentRoll);
                recordedChunks = [];
            };
            
            mediaRecorder.start(500); 
            isRecording = true;
            nodes.btnRecordToggle.classList.add('recording');
            if (nodes.recordStatus) nodes.recordStatus.innerHTML = `<span style="color:red; font-weight:bold;">● 녹화 중</span> <span style="font-size:10px;">(${actualFPS} FPS)</span>`;
        } else {
            mediaRecorder.stop();
            isRecording = false;
            nodes.btnRecordToggle.classList.remove('recording');
            if (nodes.recordStatus) nodes.recordStatus.innerText = "처리 중...";
        }
    });

    nodes.btnReset?.addEventListener('click', async () => {
        if (window.bowAnalyzer && typeof window.bowAnalyzer.clearLines === 'function') {
            window.bowAnalyzer.clearLines();
        }
        if (core && core.state) {
            core.state.scale = 1; core.state.offsetX = 0; core.state.offsetY = 0;
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
        setTimeout(resizeCanvasToDisplay, 100);
    });
    // 5. 프레임 이미지 캡쳐 오버레이 각인 및 플레이백 미디어 슬라이더 연동
    nodes.btnCapture?.addEventListener('click', () => {
        if (!nodes.mainVideo || !nodes.drawCanvas) return;
        
        const offscreen = document.createElement('canvas');
        offscreen.width = nodes.mainVideo.videoWidth || 1280;
        offscreen.height = nodes.mainVideo.videoHeight || 720;
        const ctx = offscreen.getContext('2d');
        
        ctx.drawImage(nodes.mainVideo, 0, 0, offscreen.width, offscreen.height);
        ctx.drawImage(nodes.drawCanvas, 0, 0, offscreen.width, offscreen.height);
        
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        const angleText = nodes.angleReport?.innerText.split('\n') || "0.0°";
        ctx.fillText(`국궁 자세 실시간 진단 분석: ${angleText}`, 20, offscreen.height - 30);
        
        const a = document.createElement('a');
        a.download = `kukgung_analysis_${Date.now()}.png`;
        a.href = offscreen.toDataURL('image/png');
        a.click();
    });

    const fpsButtons = document.querySelectorAll('.fps-btn');
    const cpuCores = navigator.hardwareConcurrency || 4;

    if (cpuCores <= 4) {
        fpsButtons.forEach(btn => {
            const fpsVal = parseInt(btn.getAttribute('data-fps'), 10);
            if (fpsVal >= 120) { btn.style.opacity = '0.25'; btn.style.pointerEvents = 'none'; }
        });
    }

    fpsButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            if (isRecording) return;
            fpsButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedFPS = parseInt(btn.getAttribute('data-fps'), 10);
            if (nodes.sceneRecord?.classList.contains('active')) await initCamera();
        });
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
    // 6. 초정밀 프레임 탐색 매크로, 자이로 수평계 복구 및 [열기 버그 정정 패치] 결합 레이어
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

    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;
        currentRoll = roll;
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
                <div style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>
                <div style="font-size:11px; color:#aaa; margin-top:2px;">(측정: ${e.detail.raw}° / 보정: ${e.detail.roll}°)</div>`;
        }
        if (window.bowAnalyzer && core) core.saveCache('lastLines', window.bowAnalyzer.lines);
    });

    // [버그 정정 완결] 외부 고화질 동영상 소스 열기(업로드) 커널 구조 전면 재정렬
    nodes.btnOpen?.addEventListener('click', () => nodes.videoInput?.click());
    nodes.videoInput?.addEventListener('change', async (e) => {
        const files = e.target.files; 
        if (!files || files.length === 0) return;
        
        if (core && typeof core.saveCache === 'function') await core.saveCache('lastVideoBlob', files[0]);
        
        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }
        
        const targetFile = files[0];
        const lowerName = targetFile.name.toLowerCase();
        
        // 순정 카메라 120/240fps 파일 감지 우회 마킹 플래그 주입
        if (lowerName.includes('120') || lowerName.includes('slow')) loadedFileFrameRateTarget = 120;
        else if (lowerName.includes('240')) loadedFileFrameRateTarget = 240;
        else loadedFileFrameRateTarget = 120; // 브라우저 60fps 강제 제약을 뚫기 위한 분석 엔진 스펙 업그레이드

        // 미디어 소스 주입 직후 트리거 래퍼로 진입하여 프리징 및 리사이즈 에러 완벽 해결
        nodes.mainVideo.src = URL.createObjectURL(targetFile);
        nodes.mainVideo.load();
        triggerVideoAnalysisSetup();
    });

    // [이식] S펜 블루투스 에어액션 무선 원격 제어 이벤트 훅 통합
    window.addEventListener('keydown', (e) => {
        if (e.key === 'MediaPlayPause' || e.code === 'MediaPlayPause' || e.key === 'AudioVolumeUp') {
            e.preventDefault(); e.stopPropagation();
            console.log('[S펜 원격 신호 감지] 블루투스 무선 트리거 가동');
            if (nodes.btnRecordToggle && nodes.sceneRecord?.classList.contains('active')) {
                nodes.btnRecordToggle.click();
            }
        }
    }, { capture: true, passive: false });

    nodes.btnMove?.addEventListener('click', () => { setActiveMenu(nodes.btnMove); if (window.bowAnalyzer) { window.bowAnalyzer.setMode('move'); window.bowAnalyzer.render(); } });
    nodes.btnDraw?.addEventListener('click', () => { setActiveMenu(nodes.btnDraw); if (window.bowAnalyzer) { window.bowAnalyzer.setMode('draw'); window.bowAnalyzer.render(); } });
    function setActiveMenu(activeBtn) { [nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => btn?.classList.remove('active')); activeBtn?.classList.add('active'); }

    nodes.btnGoRecord?.addEventListener('click', async () => { nodes.mainVideo.pause(); if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생'; nodes.sceneAnalyze.classList.remove('active'); nodes.sceneRecord.classList.add('active'); await initCamera(); });
    nodes.btnGoAnalyze?.addEventListener('click', () => { stopCamera(); nodes.sceneRecord.classList.remove('active'); nodes.sceneAnalyze.classList.add('active'); setActiveMenu(nodes.btnMove); if (window.bowAnalyzer) window.bowAnalyzer.setMode('move'); setTimeout(resizeCanvasToDisplay, 100); });
    nodes.panelHandle?.addEventListener('click', () => { if (!core || !core.state) return; core.state.isPanelOpen = !core.state.isPanelOpen; nodes.unifiedPanel?.classList.toggle('collapsed', !core.state.isPanelOpen); });
    nodes.btnDownloadVideo?.addEventListener('click', async () => { try { const savedBlob = await core.loadCache('lastVideoBlob'); if (!savedBlob) { alert('추출할 촬영 비디오 데이터가 존재하지 않습니다.'); return; } const actualMime = await core.loadCache('lastRecordedMime') || 'video/webm'; const ext = actualMime.includes('mp4') ? '.mp4' : '.webm'; const url = URL.createObjectURL(savedBlob); const a = document.createElement('a'); a.href = url; a.download = `kukgung_video_${Date.now()}${ext}`; a.click(); URL.revokeObjectURL(url); } catch (err) { console.error(err); } });

    await initCamera();
    resizeCanvasToDisplay();
    window.addEventListener('resize', resizeCanvasToDisplay);

    if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') window.bowAnalyzer.init(nodes.drawCanvas);
}

startSystem();

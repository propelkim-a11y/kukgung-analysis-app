/**
 * js/app.js
 * - (v20.8) 국궁 자세 분석 시스템 - 안정성 최우선 및 런타임 폴백 통합 마스터 컨트롤러 완결판
 */

window.bowAppNodes = {};

// [개선] 초기화 런타임 레이어를 완전 격리된 별도 함수로 분리하여 스크립트 프리징 및 상호 간섭 차단
async function startSystem() {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    const nodes = window.bowAppNodes;

    // 1. DOM 노드 매핑 (오류 격리 처리를 위해 명시적 맵 바인딩 공정 적용)
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

        console.log('[시스템] v20.8 모듈 분리형 인프라 DOM 명시적 매핑 완료');
    } catch (e) {
        console.error('[오류] DOM 인프라 기계식 맵 컴파일 실패:', e);
    }

    let selectedFPS = 120;
    let currentFrameTime = 1 / 120;
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let currentRoll = 0;
    let actualFPS = 120;
    // 2. [핵심] 프리징 없는 심플 카메라 초기화 및 다단계 하드웨어 권한 구출 폴백
    async function initCamera() {
        if (cameraStream) stopCamera();
        console.log('[시스템] 안정성 최우선 미디어 파이프라인 시동...');
        
        try {
            // [이식] 복잡한 강제 exact 제한 대신 브라우저 엔진이 가용한 범위 내에서 유연하게 조율하는 ideal 방식 적용
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
                
                // [이식] iOS 사파리 및 안드로이드 크롬 크로스 브라우징 자동 재생 차단 프리징을 무력화하는 핵심 속성 강제 주입
                nodes.cameraPreview.muted = true;
                nodes.cameraPreview.setAttribute('playsinline', '');
                
                try {
                    await nodes.cameraPreview.play();
                } catch (e) {
                    console.warn('[경고] 브라우저 미디어 보안 정책에 의한 자동 재생 잠금 발생, 사용자 상호작용 대기');
                }
            }
            
            const track = cameraStream.getVideoTracks()[0];
            const settings = track.getSettings();
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            
            actualFPS = settings.frameRate || 120;
            selectedFPS = typeof actualFPS === 'number' ? actualFPS : 120;

            if (window.bowGyroSensor) {
                await window.bowGyroSensor.start().catch(e => console.warn('[경고] 자이로 센서 시동 보류:', e));
            }
            
            // 실시간 능력치 진단 대시보드 텍스트 출력 레이어 유지 보수
            if (nodes.recordStatus) {
                const maxFPS = capabilities.frameRate ? capabilities.frameRate.max : '미지원';
                nodes.recordStatus.innerHTML = `
                    <div style="font-size:11px; line-height:1.3; color:#fff; text-align:left;">
                        상태: <span style="color:#00ff00; font-weight:bold;">촬영 준비 완료</span> / 
                        웹최대: <b style="color:#ffaa00;">${maxFPS} FPS</b><br>
                        해상도: <span style="color:#00e1ff;">${settings.width || 1280}x${settings.height || 720}</span>
                    </div>
                `;
            }
            
            currentFrameTime = 1 / (typeof actualFPS === 'number' ? actualFPS : 120);
            setTimeout(resizeCanvasToDisplay, 150);
        } catch (err) {
            console.error('[오류] 1단계 고성능 카메라 초기화 실패:', err);
            
            // [이식] 1단계 실패 시 시스템 먹통을 원천 해결하기 위해 표준 장치 범용 규격으로 우회하는 2단계 폴백 재시도 메커니즘
            try {
                console.log('[폴백] 2단계 디폴트 카메라 범용 컨스트레인트 우회 진입...');
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (nodes.cameraPreview) {
                    nodes.cameraPreview.srcObject = cameraStream;
                    nodes.cameraPreview.muted = true;
                    nodes.cameraPreview.setAttribute('playsinline', '');
                    await nodes.cameraPreview.play();
                }
                if (nodes.recordStatus) nodes.recordStatus.innerText = "기본 해상도 모드로 연결됨";
            } catch (fallbackErr) {
                console.error('[크래시] 2단계 폴백 카메라 장치 로드 최종 무력화됨:', fallbackErr);
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
    // 3. 녹화 완료 미디어 물리 다운로드 및 분석 레이어 시계열 정밀 세션 정렬 핸들러
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
        console.log(`[시스템] v20.8 안전 저장 및 다운로드 시퀀스 완료: ${fileName}`);

        if (nodes.mainVideo) {
            if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
                URL.revokeObjectURL(nodes.mainVideo.src);
            }
            nodes.mainVideo.src = url;
            nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord;
            
            nodes.mainVideo.onloadedmetadata = () => {
                // 초고속 파일 업로드에 대응하는 가변 프레임 레이트 역산 로직 연동 수렴
                let detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
                
                if (nodes.mainVideo.src && nodes.mainVideo.src.includes('120fps')) detectedFPS = 120;
                if (nodes.mainVideo.src && nodes.mainVideo.src.includes('240fps')) detectedFPS = 240;

                currentFrameTime = 1 / detectedFPS;
                console.log(`[분석 엔진] 역산 탐색 매크로 프레임 타임 튜닝 완료: ${detectedFPS} FPS`);

                nodes.sceneRecord?.classList.remove('active');
                nodes.sceneAnalyze?.classList.add('active');
                
                if (nodes.drawCanvas) {
                    nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
                    nodes.drawCanvas.height = nodes.mainVideo.videoHeight;
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
                if (window.bowAnalyzer) {
                    window.bowAnalyzer.init(nodes.drawCanvas);
                    window.bowAnalyzer.render();
                }
                
                setTimeout(resizeCanvasToDisplay, 100);
            };
        }
    }

    // 로컬 인덱스드 부트 세션 복구 예외 방어선 가동
    if (core && typeof core.initDB === 'function') {
        core.initDB().then(async () => {
            try {
                await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
            } catch (e) {
                console.warn('[System] 안전 부팅 시퀀스 복구 마킹 생략 처리');
            }
            if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }
        });
    }
    // 4. [수정] 500ms 단위 안전 수집 레코딩 스케줄러 및 인프라 초기화 이벤트 리스너
    nodes.btnRecordToggle?.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            recordedChunks = [];
            const stream = nodes.cameraPreview?.srcObject;
            if (!stream) return;

            // 기기 지원 최적 고성능 비디오 인코더 코덱 자동 판정 레이어 결합
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
            
            // [이식] 대용량 유입 데이터의 파편화 크래시 및 브라우저 프리징을 차단하기 위한 500ms 청크 타임 슬라이스 로직 명시 가동
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
    // 5. 그래픽 병합 캡쳐 각인 및 프론트엔드 플레이백 슬라이더 타임라인 연동 파트
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
        ctx.fillText(`국궁 안정 최우선 자세 분석: ${angleText}`, 20, offscreen.height - 30);
        
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
        let detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
        if (nodes.mainVideo.src && nodes.mainVideo.src.includes('120fps')) detectedFPS = 120;
        if (nodes.mainVideo.src && nodes.mainVideo.src.includes('240fps')) detectedFPS = 240;

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
    // 6. 초정밀 타임 60ms 간격 반복 탐색 매크로 및 실시간 자이로 크로스헤어 피드백 루프 결합
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

    // [이식] 실시간 수평계 및 수직 크로스헤어 ㄷ자 멈춤 교정 실시간 배경색 매핑 (그린/레드 변형 가동)
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

    // 외부 순정 대용량 고속 촬영 소스 파일 업로드 디코더 결합 아키텍처
    nodes.btnOpen?.addEventListener('click', () => nodes.videoInput?.click());
    nodes.videoInput?.addEventListener('change', async (e) => {
        const files = e.target.files; if (!files || files.length === 0) return;
        if (core && typeof core.saveCache === 'function') await core.saveCache('lastVideoBlob', files);
        
        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }
        
        nodes.mainVideo.src = URL.createObjectURL(files); nodes.mainVideo.load();
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

    // [이식] 순차 컴파일 및 비동기 부팅 시퀀스 안정 실행
    await initCamera();
    resizeCanvasToDisplay();
    window.addEventListener('resize', resizeCanvasToDisplay);

    if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') window.bowAnalyzer.init(nodes.drawCanvas);
}

// [이식] 시스템 모듈화 마스터 런타임 트리거 작동
startSystem();

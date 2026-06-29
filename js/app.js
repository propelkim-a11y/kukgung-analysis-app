/**
 * js/app.js
 * - (v20.7) 국궁 자세 분석 시스템 - S24 울트라 최적화 및 하드웨어 능력치 진단 마스터 컨트롤러 완결판
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', async () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    const nodes = window.bowAppNodes;

    // 1. DOM 공용 핵심 인프라 노드 매핑 (안전한 카멜케이스 자동 맵핑 공정 및 예외 격리막)
    try {
        const ids = [
            'scene-record', 'scene-analyze', 'btn-go-analyze', 'btn-go-record',
            'camera-preview', 'btn-record-toggle', 'record-status', 'gyro-horizon-line', 'gyro-vertical-line',
            'video-viewport', 'main-video', 'draw-canvas', 'unified-panel', 'panel-handle',
            'btn-open', 'btn-move', 'btn-draw', 'btn-capture', 'btn-reset', 'video-input', 'btn-download-video',
            'video-slider', 'btn-frame-prev', 'btn-play-pause', 'btn-frame-next', 'angle-report'
        ];
        ids.forEach(id => {
            const nodeKey = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            nodes[nodeKey] = document.getElementById(id);
        });

        console.log('[시스템] S24 울트라 진단 레이어 포함 DOM 카멜케이스 매핑 엔진 컴파일 완료');
    } catch (e) {
        console.error('[오류] DOM 인프라 기계식 자동 매핑 실패:', e);
    }

    let selectedFPS = 120;
    let currentFrameTime = 1 / 120;
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let currentRoll = 0;
    let actualFPS = 0; // 하드웨어가 실시간으로 확보한 최종 모니터링 프레임 레이트 변수
    // 2. [강력 보강] S24 울트라 고속 촬영 시도 및 하드웨어 능력치 진단 카메라 최적화 시동
    async function initCamera() {
        if (cameraStream) stopCamera();
        console.log('[진단] 하드웨어 능력치 확인 및 카메라 초기화 시작...');
        
        try {
            // [이식] 1. 브라우저가 지원하는 제약 조건 목록 스크리닝 확인
            const supported = navigator.mediaDevices.getSupportedConstraints();
            console.log('[진단] 지원 제약조건 목록:', supported);

            // [이식] 2. S24 울트라 고속 촬영 시도 (해상도를 480p로 낮추어 물리적 데이터 대역폭 집중 확보)
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    frameRate: { ideal: 120 } 
                },
                audio: false
            };

            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            nodes.cameraPreview.srcObject = cameraStream;
            
            const track = cameraStream.getVideoTracks()[0];
            const settings = track.getSettings();
            // 브라우저 핑거프린팅 방어 규격을 뚫고 실제 미디어 하드웨어 성능을 리드아웃하는 함수 호출
            const capabilities = track.getCapabilities ? track.getCapabilities() : {};
            
            actualFPS = settings.frameRate || "알 수 없음";
            selectedFPS = typeof actualFPS === 'number' ? actualFPS : 120;
            console.log(`[시스템] 카메라 480p 대역폭 우회 연결: ${actualFPS}fps`);
            
            // 모바일 및 iOS 사파리 환경 프리징 원천 방지 속성 강제 주입
            nodes.cameraPreview.setAttribute('autoplay', '');
            nodes.cameraPreview.setAttribute('muted', '');
            nodes.cameraPreview.setAttribute('playsinline', '');
            
            try {
                await nodes.cameraPreview.play();
            } catch (e) {
                console.warn('[경고] 브라우저 정책에 의한 자동 재생 차단 감지, 사용자 액션 대기');
            }

            if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
                await window.bowGyroSensor.start();
            }
            
            // [이식] 화면에 실제 작동 상태 및 하드웨어 최대 웹 FPS 스펙 상세 진단 결과 대시보드 표시
            if (nodes.recordStatus) {
                const maxFPS = capabilities.frameRate ? capabilities.frameRate.max : '미지원';
                nodes.recordStatus.innerHTML = `
                    <div style="font-size:11px; line-height:1.3; color:#fff; text-align:left; background:rgba(0,0,0,0.5); padding:4px 8px; border-radius:4px;">
                        현재: <b style="color:#00ff00;">${actualFPS} FPS</b> / 
                        기기최대(웹): <b style="color:#ffaa00;">${maxFPS}</b><br>
                        해상도: <span style="color:#00e1ff;">${settings.width}x${settings.height}</span>
                    </div>
                `;
            }
            
            currentFrameTime = 1 / (typeof actualFPS === 'number' ? actualFPS : 120);
            setTimeout(resizeCanvasToDisplay, 150);
        } catch (err) {
            console.error('[오류] 하드웨어 능력치 진단 및 카메라 초기화 실패:', err);
            if (nodes.recordStatus) {
                nodes.recordStatus.innerHTML = `<span style="color:#ff4444; font-size:11px;">카메라 초기화 실패 (권한 재설정 필요)</span>`;
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
    // 3. 녹화 및 외부 순정 120/240FPS 대용량 파일 분석 연동 인터페이스 핸들러
    function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fpsMark = typeof actualFPS === 'number' ? Math.round(actualFPS) : "120";
        const currentMimeType = mediaRecorder?.mimeType || 'video/webm';
        const ext = currentMimeType.includes('mp4') ? '.mp4' : '.webm';
        
        // 진단 런타임 성능 맞춤형 명명 규칙 물리 저장
        const fileName = `kukgung_${fpsMark}fps_${timestamp}${ext}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        console.log(`[시스템] v20.7 하드웨어 성능 반영 비디오 저장 완료: ${fileName}`);

        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }

        nodes.mainVideo.src = url;
        nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord;

        nodes.mainVideo.onloadedmetadata = () => {
            // [초고속 파일 파싱 최적화] 로드된 비디오의 실시간 메타 정보 혹은 진단 변수를 추적해 탐색 엔진 재정렬
            let detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
            
            // 순정 카메라 앱으로 찍은 120/240FPS 파일 업로드 시의 타임라인 오판 방지 필터 인터록 설정
            if (nodes.mainVideo.src && nodes.mainVideo.src.includes('120fps')) detectedFPS = 120;
            if (nodes.mainVideo.src && nodes.mainVideo.src.includes('240fps')) detectedFPS = 240;

            currentFrameTime = 1 / detectedFPS;
            console.log(`[시스템] 타임라인 시계열 프레임 간격 동기화 완료: ${detectedFPS} FPS`);

            nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
            nodes.drawCanvas.height = nodes.mainVideo.videoHeight;

            if (isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001; // 밀리초 단위 초정밀 탐색 스텝
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

            setTimeout(resizeCanvasToDisplay, 100);
        };
    }

    // 로컬 인덱스드 데이터베이스 자원 복구 인프라 세션 유지
    if (core && typeof core.initDB === 'function') {
        core.initDB().then(async () => {
            try {
                await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
            } catch (e) {
                console.warn('[System] v20.7 부팅 복구 레이어 필터 처리 완료');
            }
            if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }
        });
    }
    // 4. 동적 지원 코덱 감지 및 대용량 청크 파편 프리징 무력화 인코더 엔진
    nodes.btnRecordToggle?.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            recordedChunks = [];
            const stream = nodes.cameraPreview?.srcObject;
            if (!stream) {
                console.error('[오류] 레코더 트랙용 소스 스트림을 바인딩할 수 없습니다.');
                return;
            }

            // 디바이스 지원 고성능 코덱 순차 자동 선별 레이어
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
            
            // 480p로 집중된 데이터 파편을 열화 없이 보존하기 위한 6Mbps 인코딩 비트레이트 강제 주입
            const options = { 
                mimeType, 
                videoBitsPerSecond: 6000000 
            };

            try {
                mediaRecorder = new MediaRecorder(stream, options);
            } catch (e) {
                console.warn('[경고] 최적화 압축 코덱 인스턴스 생성 실패, 기기 기본값으로 우회 적용합니다.');
                mediaRecorder = new MediaRecorder(stream);
            }

            try {
                mediaRecorder.ondataavailable = (e) => {
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

                // 고속 유입 버퍼 크래시를 전면 차단하는 100ms 파티션 레코딩 시동
                mediaRecorder.start(100); 
                isRecording = true;
                nodes.btnRecordToggle.textContent = '녹화중지';
                nodes.btnRecordToggle.classList.add('recording');
                
                if (nodes.recordStatus) {
                    nodes.recordStatus.innerHTML = `
                        <div style="font-size:11px; line-height:1.3; color:#fff; text-align:left; background:rgba(255,0,0,0.6); padding:4px 8px; border-radius:4px;">
                            <span style="color:#fff; font-weight:bold;">● 녹화 진행 중</span> (${actualFPS} FPS)
                        </div>
                    `;
                }
            } catch (e) {
                console.error('[오류] 고속 레코더 가동 실패 크래시 방어 처리:', e);
            }
        } else {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            isRecording = false;
            nodes.btnRecordToggle.textContent = '녹화시작';
            nodes.btnRecordToggle.classList.remove('recording');
            
            // 진단 결과창 대기 상태 복구 복원
            await initCamera();
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
    // 5. 프레임 캡쳐 그래픽 병합 컴포넌트 및 플레이백 비디오 탐색 제어 파트
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
        const angleText = nodes.angleReport?.innerText.split('\n') || "0.0°";
        ctx.fillText(`국궁 S24U 능력치 진단 분석: ${angleText}`, 20, offscreen.height - 30);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const link = document.createElement('a');
        link.download = `kukgung_analysis_${timestamp}.png`;
        link.href = offscreen.toDataURL('image/png');
        link.click();
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
    // 6. 초정밀 타임 세션 프레임 매크로 매커니즘 및 자이로 수평계 동적 컬러 피드백 ㄷ자 루프 결합
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

    // 자이로 실시간 오차 가변 트랜스폼 회전 및 임계점 판정 피드백 컬러 필터 매핑 (ㄷ자 루프 완벽 복구)
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;
        
        currentRoll = roll;
        if (core && core.state) core.state.currentRoll = roll;

        if (nodes.sceneRecord?.classList.contains('active')) {
            if (nodes.gyroHorizonLine) {
                nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
                nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);
                
                // 완벽 수평 피드백 기준에 맞춰 실시간 변조되는 그린/레드 컬러 변형 액션
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

    // 외부 순정 동영상 소스 열기 업로드 아키텍처 결합 (120/240FPS 대응)
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

    // 비동기 비블로킹 순차 컴파일 및 실행 순서의 확실한 보장
    await initCamera();
    resizeCanvasToDisplay();
    window.addEventListener('resize', resizeCanvasToDisplay);

    if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') window.bowAnalyzer.init(nodes.drawCanvas);
});

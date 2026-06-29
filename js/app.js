/**
 * js/app.js
 * - (v20.5) 국궁 자세 분석 시스템 - 120fps 강제 최적화 및 모니터링 통합 마스터 컨트롤러 완결판
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

    let selectedFPS = 120;
    let currentFrameTime = 1 / 120;
    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let currentRoll = 0; 
    let actualFPS = 0; // [이식] 하드웨어가 실제로 확보한 프레임 레이트 모니터링 변수 수렴
    // 2. [강력 수정] 120fps 강제 요청 및 실제 값 모니터링 기하 구조 엔진
    async function initCamera() {
        if (cameraStream) stopCamera();
        
        // [이식] 지원하는 가장 높은 고속 촬영 성능을 하드웨어 레벨에서 정확히 차례대로 대조하는 시퀀스
        const fpsTargets =; 
        let success = false;

        for (const target of fpsTargets) {
            try {
                let videoConstraints = {
                    facingMode: { ideal: "environment" },
                    frameRate: { exact: target }, // [이식] ideal 대신 exact를 강제 매핑하여 최고 하드웨어 프레임 획득 유도
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                };

                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: videoConstraints,
                    audio: false
                });
                nodes.cameraPreview.srcObject = cameraStream;
                
                const track = cameraStream.getVideoTracks()[0];
                actualFPS = track.getSettings().frameRate || target; // 동적 확보된 리드아웃 FPS 백업
                console.log(`[시스템] 카메라 연결 성공: ${actualFPS}fps 확보`);
                
                await nodes.cameraPreview.play();
                if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
                    await window.bowGyroSensor.start();
                }
                success = true;
                selectedFPS = typeof actualFPS === 'number' ? actualFPS : target;
                break; // 프레임 확보 완결 시 즉각 루프 탈출
            } catch (e) {
                console.warn(`[경고] ${target}fps 요청 실패, 다음 단계 시도...`);
            }
        }

        if (!success) {
            try {
                // exact 제약이 완전 무력화될 때를 대비한 하이브리드 폴백 구조 연동
                cameraStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment', frameRate: { ideal: 120 } },
                    audio: false
                });
                nodes.cameraPreview.srcObject = cameraStream;
                actualFPS = cameraStream.getVideoTracks()[0].getSettings().frameRate || "알 수 없음";
                await nodes.cameraPreview.play();
            } catch (errFallback) {
                if (nodes.recordStatus) nodes.recordStatus.textContent = '카메라 장치 로드 최종 실패.';
                console.error('[오류] 고속 촬영 하드웨어 커넥션 최종 크래시:', errFallback);
                alert('고속 촬영 모드를 시작할 수 없습니다. 권한 혹은 기기 사양을 확인하세요.');
                return;
            }
        }

        // [이식] 현재 기기가 실제로 연동해 뿜어내고 있는 FPS 메타 정보를 프론트엔드 모니터링 UI 단에 출력
        if (nodes.recordStatus) {
            nodes.recordStatus.innerHTML = `대기 중 <span style="color:#00ff00; font-size:10px;">(현재 기기: ${actualFPS} FPS)</span>`;
        }
        
        currentFrameTime = 1 / (typeof actualFPS === 'number' ? actualFPS : 30);
        setTimeout(resizeCanvasToDisplay, 150);
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
    // 3. 녹화 종료 후 모니터링 기반 동적 타임라인 및 확장자 파일 다운로드 스크립트
    function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        
        // [이식] 실제 동작 모니터링 결과 계산된 정밀 프레임값을 파일 시스템 다운로드 네이밍에 실시간 투영
        const currentMimeType = mediaRecorder?.mimeType || 'video/webm';
        const isMp4Format = currentMimeType.includes('mp4');
        const ext = isMp4Format ? '.mp4' : '.webm';
        const fileName = `kukgung_${actualFPS}fps_${timestamp}${ext}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        console.log(`[시스템] 모니터링 연동 고속 다운로드 완료: ${fileName}`);

        if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
            URL.revokeObjectURL(nodes.mainVideo.src);
        }

        nodes.mainVideo.src = url;
        nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord;

        nodes.mainVideo.onloadedmetadata = () => {
            const detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
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

            console.log('[시스템] 고속 시계열 데이터 파싱 및 분석 레이어 빌드업 완료');
            setTimeout(resizeCanvasToDisplay, 100);
        };
    }

    // 로컬 인덱스드 세션 캐시 하드 부팅 디그레이데이션 방어선 복구 유지
    if (core && typeof core.initDB === 'function') {
        core.initDB().then(async () => {
            try {
                await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
            } catch (e) {
                console.warn('[System] 안전 모드 부트 예외 필터 처리 완료');
            }
            if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
                nodes.videoSlider.max = nodes.mainVideo.duration;
                nodes.videoSlider.step = 0.0001;
            }
        });
    }
    // 4. [수정] 녹화 설정 (기기별 최적 코덱 자동 선택 및 8Mbps 대역폭 부스팅 증폭 실행)
    nodes.btnRecordToggle?.addEventListener('click', () => {
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
            window.bowGyroSensor.start();
        }

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            recordedChunks = [];
            const stream = nodes.cameraPreview?.srcObject;
            if (!stream) {
                alert('초고속 레코더용 비디오 스트림 트랙을 탐색할 수 없습니다.');
                return;
            }

            // [이식] 하드웨어 다각화 파편화에 완벽 대응하는 최적 인코딩 가용 포맷 순차 검색 선별 레이어
            const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
            let selectedType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';

            // [이식] 120프레임 압축 무손실에 준하는 8Mbps 초고화질 대역폭 증폭 스펙 고정
            const options = {
                mimeType: selectedType,
                videoBitsPerSecond: 8000000 
            };

            try {
                if (selectedType) {
                    mediaRecorder = new MediaRecorder(stream, options);
                } else {
                    mediaRecorder = new MediaRecorder(stream);
                }
            } catch (e) {
                console.warn('[경고] 고품질 인코더 엔진 가동 실패, 디바이스 네이티브 기본 설정으로 컴파일합니다.');
                mediaRecorder = new MediaRecorder(stream);
            }

            try {
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    const actualRecordedType = mediaRecorder.mimeType || selectedType || 'video/webm';
                    const videoBlob = new Blob(recordedChunks, { type: actualRecordedType });

                    if (core && typeof core.saveCache === 'function') {
                        await core.saveCache('lastVideoBlob', videoBlob);
                        await core.saveCache('lastRecordedMime', actualRecordedType);
                    }
                    
                    handleRecordingFinish(videoBlob, currentRoll);
                    recordedChunks = [];
                };

                // 고속 이미지 데이터 파편 누락 프리징을 물리 제어하는 100ms 파티션 정밀 캡처 타임 가동
                mediaRecorder.start(100); 
                isRecording = true;
                nodes.btnRecordToggle.textContent = '녹화중지';
                nodes.btnRecordToggle.classList.add('recording');
                
                // [이식] 녹화 구동과 동시에 실시간 실제 촬영 프레임 숫자를 화면 상단 모니터링 엔진에 지속 각인
                if (nodes.recordStatus) {
                    nodes.recordStatus.innerHTML = `<span style="color:red;">● 녹화 중</span> <span style="font-size:10px;">(${actualFPS} FPS)</span>`;
                }
            } catch (e) {
                console.error('[오류] 8Mbps 초고화질 코어 미디어 레코더 시동 크래시:', e);
            }
        } else {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            isRecording = false;
            nodes.btnRecordToggle.textContent = '녹화시작';
            nodes.btnRecordToggle.classList.remove('recording');
            if (nodes.recordStatus) {
                nodes.recordStatus.innerHTML = `대기 중 <span style="color:#00ff00; font-size:10px;">(현재 기기: ${actualFPS} FPS)</span>`;
            }
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
    // 5. 프레임 캡쳐 그래픽 오버레이 엔진 및 비디오 플레이백 프론트엔드 연동 디바이스 인터페이스
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
        ctx.fillText(`국궁 강제 최적화 분석: ${angleText}`, 20, offscreen.height - 30);

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
        const detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
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
    // 6. 1/120초 역산 프레임 탐색 매크로 인프라 및 자이로 수평계 리얼타임 컬러 이펙트
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

    // 자이로 실시간 오차 복구 바인딩 피드백 컬러 필터 ㄷ자 루프 완벽 연동
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        if (isNaN(roll)) return;
        
        currentRoll = roll;
        if (core && core.state) core.state.currentRoll = roll;

        if (nodes.sceneRecord?.classList.contains('active')) {
            if (nodes.gyroHorizonLine) {
                nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
                nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);
                
                // 완벽 수평 상태 조건에 연동하는 실시간 칼라 다이나믹 매핑 (그린/레드 컬러 변형 액션)
                nodes.gyroHorizonLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
                nodes.gyroHorizonLine.classList.toggle('perfect-level', isLevel);
            }
            if (nodes.gyroVerticalLine) {
                nodes.gyroVerticalLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
                nodes.gyroVerticalLine.classList.toggle('perfect-level', isLevel);
            }
            // 녹화 준비 상태일 때 트리거 버튼 보더라인 하이라이트 동기화
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

    // 업로드 동영상 제어 아키텍처 결합
    nodes.btnOpen?.addEventListener('click', () => nodes.videoInput?.click());
    nodes.videoInput?.addEventListener('change', async (e) => {
        const files = e.target.files; if (!files || files.length === 0) return;
        if (core && typeof core.saveCache === 'function') await core.saveCache('lastVideoBlob', files);
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

    // 시스템 병렬 비동기 부팅 런타임 이그제큐션 트리거 작동
    await initCamera();
    resizeCanvasToDisplay();
    window.addEventListener('resize', resizeCanvasToDisplay);

    if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') window.bowAnalyzer.init(nodes.drawCanvas);
});

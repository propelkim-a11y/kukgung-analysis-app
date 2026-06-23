/**
 * js/app.js (Part 1 - 상단에 먼저 붙여넣기)
 * 국궁 자세 분석 시스템 - 통합 마스터 컨트롤러
 * - 💡 확대 및 선 오차 왜곡률 역산 엔진 패치 완료
 * - 괄호 탈거 및 촬영 수평계 각도 수치 변환
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', () => {
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;

    const nodes = window.bowAppNodes;
    nodes.sceneRecord = document.getElementById('scene-record');
    nodes.sceneAnalyze = document.getElementById('scene-analyze');
    nodes.btnGoAnalyze = document.getElementById('btn-go-analyze');
    nodes.btnGoRecord = document.getElementById('btn-go-record');

    nodes.cameraPreview = document.getElementById('camera-preview');
    nodes.btnRecordToggle = document.getElementById('btn-record-toggle');
    nodes.recordStatus = document.getElementById('record-status');
    nodes.gyroHorizonLine = document.getElementById('gyro-horizon-line');
    nodes.gyroNumericReport = document.getElementById('gyro-numeric-report'); // 💡 수치창 바인딩

    nodes.videoViewport = document.getElementById('video-viewport');
    nodes.mainVideo = document.getElementById('main-video');
    nodes.drawCanvas = document.getElementById('draw-canvas');
    nodes.unifiedPanel = document.getElementById('unified-panel');
    
    // 두 스크린 멀티 개폐 핸들 동시 지참
    nodes.recordHandle = document.querySelector('.record-handle');
    nodes.analyzeHandle = document.querySelector('.analyze-handle');
    
    nodes.btnOpen = document.getElementById('btn-open');
    nodes.btnMove = document.getElementById('btn-move');
    nodes.btnDraw = document.getElementById('btn-draw');
    nodes.btnReset = document.getElementById('btn-reset');
    nodes.videoInput = document.getElementById('video-input');

    nodes.videoSlider = document.getElementById('video-slider');
    nodes.btnFramePrev = document.getElementById('btn-frame-prev');
    nodes.btnPlayPause = document.getElementById('btn-play-pause');
    nodes.btnFrameNext = document.getElementById('btn-frame-next');
    nodes.angleReport = document.getElementById('angle-report');

    gesture.init(nodes.videoViewport, nodes.mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(nodes.drawCanvas);
    }

    core.initDB().then(async () => {
        await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
        gesture.applyTransform();
    });

    let cameraStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;

    async function startCamera() {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
                audio: false
            });
            nodes.cameraPreview.srcObject = cameraStream;
            nodes.recordStatus.textContent = '카메라 정렬 완료. 수평계를 조준하세요.';
        } catch (err) {
            nodes.recordStatus.textContent = '카메라 락 상태입니다.';
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

    nodes.btnGoRecord.addEventListener('click', async () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.sceneAnalyze.classList.remove('active');
        nodes.sceneRecord.classList.add('active');
        await startCamera();
        if (window.bowGyroSensor) window.bowGyroSensor.start();
    });

    nodes.btnGoAnalyze.addEventListener('click', () => {
        stopCamera();
        nodes.sceneRecord.classList.remove('active');
        nodes.sceneAnalyze.classList.add('active');
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    });

    startCamera();

    nodes.btnRecordToggle.addEventListener('click', () => {
        if (window.bowGyroSensor) window.bowGyroSensor.start();
        if (!cameraStream) return;

        if (!isRecording) {
            recordedChunks = [];
            let options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'video/webm' };
            }

            mediaRecorder = new MediaRecorder(cameraStream, options);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                nodes.recordStatus.textContent = '저장소 캐싱 중...';
                
                const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
                await core.saveCache('lastVideoBlob', videoBlob);

                const videoURL = URL.createObjectURL(videoBlob);
                nodes.mainVideo.src = videoURL;
                nodes.mainVideo.load();

                stopCamera();
                nodes.sceneRecord.classList.remove('active');
                nodes.sceneAnalyze.classList.add('active');
                
                setActiveMenu(nodes.btnOpen);
                if (window.bowAnalyzer) {
                    window.bowAnalyzer.clearLines();
                    window.bowAnalyzer.setMode('move');
                }
                
                nodes.btnRecordToggle.textContent = '녹화시작';
                nodes.btnRecordToggle.classList.remove('recording');
            };

            mediaRecorder.start();
            isRecording = true;
            nodes.btnRecordToggle.textContent = '녹화종료/분석';
            nodes.btnRecordToggle.classList.add('recording');
            nodes.recordStatus.textContent = '● 자세 촬영 중...';
        } else {
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    function setActiveMenu(activeBtn) {
        [nodes.btnOpen, nodes.btnMove, nodes.btnDraw].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }
    /**
     * js/app.js (Part 2 - 첫 번째 박스 바로 아래에 붙여넣으세요)
     * - 💡 중요: 캔버스 물리 스케일 팩터 비율 보정 인터페이스 탑재
     * - 터치 개폐 인터페이스 슬라이딩
     */

    const FRAME_TIME = 1 / 30;

    nodes.mainVideo.addEventListener('loadedmetadata', () => {
        // 💡 오차 해결을 위한 캔버스 크기 강제 동기화 보정 법칙
        nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
        nodes.drawCanvas.height = nodes.mainVideo.videoHeight;
        
        // 💡 펜 오차 극복 핵심: 비디오 고유 해상도와 화면 렌더링 영역 크기 비율 역산값 analyzer에 전달
        if (window.bowAnalyzer) {
            const rect = nodes.drawCanvas.getBoundingClientRect();
            window.bowAnalyzer.videoPixelRatioX = nodes.mainVideo.videoWidth / rect.width;
            window.bowAnalyzer.videoPixelRatioY = nodes.mainVideo.videoHeight / rect.height;
            window.bowAnalyzer.render();
        }
        nodes.videoSlider.max = nodes.mainVideo.duration;
    });

    nodes.mainVideo.addEventListener('timeupdate', () => {
        if (!isNaN(nodes.mainVideo.currentTime)) {
            nodes.videoSlider.value = nodes.mainVideo.currentTime;
        }
    });

    nodes.videoSlider.addEventListener('input', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = nodes.videoSlider.value;
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

    nodes.btnFramePrev.addEventListener('click', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - FRAME_TIME);
    });

    nodes.btnFrameNext.addEventListener('click', () => {
        nodes.mainVideo.pause();
        nodes.btnPlayPause.textContent = '재생';
        nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + FRAME_TIME);
    });

    nodes.btnOpen.addEventListener('click', () => nodes.videoInput.click());

    nodes.videoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        await core.saveCache('lastVideoBlob', file);
        const url = URL.createObjectURL(file);
        nodes.mainVideo.src = url;
        nodes.mainVideo.load();

        setActiveMenu(nodes.btnOpen);
        if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
    });

    nodes.btnMove.addEventListener('click', () => {
        setActiveMenu(nodes.btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    });

    nodes.btnDraw.addEventListener('click', () => {
        setActiveMenu(nodes.btnDraw);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('draw');
    });

    nodes.btnReset.addEventListener('click', () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            core.saveCache('lastLines', []);
        }
    });

    /**
     * 💡 요건 반영: 촬영/분석 통합 패널 터치 개폐 제어 핸들러
     */
    const togglePanel = () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        const targetPanel = sceneRecord.classList.contains('active') 
            ? document.querySelector('#scene-record .unified-panel-box')
            : document.querySelector('#scene-analyze .unified-panel-box');
        
        if (core.state.isPanelOpen) {
            targetPanel.classList.remove('collapsed');
        } else {
            targetPanel.classList.add('collapsed');
        }
    };

    nodes.recordHandle.addEventListener('click', togglePanel);
    nodes.analyzeHandle.addEventListener('click', togglePanel);

    window.addEventListener('bowAngleUpdate', (e) => {
        nodes.angleReport.textContent = `📐 ${e.detail.angle}°`;
        if (window.bowAnalyzer) {
            core.saveCache('lastLines', window.bowAnalyzer.lines);
        }
    });

    /**
     * 💡 요건 반영: 수평 가이드선 추적 및 정밀 각도 실시간 수치 표출
     */
    window.addEventListener('bowGyroUpdate', (e) => {
        const { roll, isLevel } = e.detail;
        
        if (nodes.gyroHorizonLine && nodes.sceneRecord.classList.contains('active')) {
            nodes.gyroHorizonLine.style.transform = `translateY(-50%) rotate(${-roll}deg)`;
            
            // 수평계 수치 텍스트 업데이트 (+/- 방향성 보존 표출)
            nodes.gyroNumericReport.textContent = `${roll > 0 ? '+' : ''}${roll}°`;
            
            if (isLevel) {
                nodes.gyroHorizonLine.classList.add('perfect-level');
                nodes.gyroNumericReport.classList.add('perfect-level');
            } else {
                nodes.gyroHorizonLine.classList.remove('perfect-level');
                nodes.gyroNumericReport.classList.remove('perfect-level');
            }
        }
    });
});

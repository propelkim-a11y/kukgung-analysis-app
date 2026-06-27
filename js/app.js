/**
 * js/app.js - [Part 1]
 * - 국궁 고각 분석 시스템 통합 제어 커널 완결판
 * - 락 프리 초기 롤백 복원 및 고정밀 캔버스 이미지 스냅샷 엔진 탑재 버전
 */

class BowAppController {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.stream = null;

        // 핵심 DOM 엘리먼트 바인딩
        this.cameraPreview = document.getElementById('camera-preview');
        this.mainVideo = document.getElementById('main-video');
        this.drawCanvas = document.getElementById('draw-canvas');
        this.btnRecordToggle = document.getElementById('btn-record-toggle');
        this.btnGoAnalyze = document.getElementById('btn-go-analyze');
        this.btnGoRecord = document.getElementById('btn-go-record');
        this.btnCapture = document.getElementById('btn-capture');
        this.videoInput = document.getElementById('video-input');
        this.btnOpen = document.getElementById('btn-open');
        this.btnMove = document.getElementById('btn-move');
        this.btnDraw = document.getElementById('btn-draw');
        this.btnReset = document.getElementById('btn-reset');
        this.videoSlider = document.getElementById('video-slider');
        this.btnPlayPause = document.getElementById('btn-play-pause');
        this.btnFramePrev = document.getElementById('btn-frame-prev');
        this.btnFrameNext = document.getElementById('btn-frame-next');
        this.recordStatus = document.getElementById('record-status');
        this.angleReport = document.getElementById('angle-report');
        this.unifiedPanel = document.getElementById('unified-panel');
        this.panelHandle = document.getElementById('panel-handle');

        this.isRecording = false;
        this.currentVideoBlob = null;
    }

    async init() {
        this.setupEventListeners();
        
        // 데이터베이스 부팅 및 복원 인터락 가동
        if (window.bowAppCore) {
            await window.bowAppCore.initDB();
            await window.bowAppCore.restoreLastSession(this.mainVideo, this.drawCanvas);
        }

        // 수평계 자이로 가동
        if (window.bowGyroSensor) {
            await window.bowGyroSensor.start();
        }

        // 제스처 모듈 바인딩
        if (window.bowAppGesture) {
            window.bowAppGesture.init(document.getElementById('video-viewport'), this.mainVideo);
        }

        // 분석 도화선 캔버스 래퍼 가동
        if (window.bowAnalyzer) {
            window.bowAnalyzer.init(this.drawCanvas);
        }
    }

    setupEventListeners() {
        // 카메라 기동 인터락
        this.cameraPreview.parentElement.addEventListener('click', () => this.startCamera());

        // 녹화 제어 토글
        this.btnRecordToggle.addEventListener('click', () => this.toggleRecording());

        // 씬 전환 라우팅
        this.btnGoAnalyze.addEventListener('click', () => this.switchScene('scene-analyze'));
        this.btnGoRecord.addEventListener('click', () => this.switchScene('scene-record'));

        // 비디오 파일 로더 인터락
        this.btnOpen.addEventListener('click', () => this.videoInput.click());
        this.videoInput.addEventListener('change', (e) => this.handleVideoUpload(e));

        // 모드 전환 단추 동기화
        this.btnMove.addEventListener('click', () => this.setActiveMode('move'));
        this.btnDraw.addEventListener('click', () => this.setActiveMode('draw'));
        this.btnReset.addEventListener('click', () => {
            if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
        });

        // 비디오 재생 코어 리스너
        this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
        this.mainVideo.addEventListener('timeupdate', () => this.updateSlider());
        this.videoSlider.addEventListener('input', (e) => this.seekVideo(e));

        this.btnFramePrev.addEventListener('click', () => this.stepFrame(-0.033));
        this.btnFrameNext.addEventListener('click', () => this.stepFrame(0.033));

        // 고각 선 정보 동시 병합 화면 캡처 인터락
        this.btnCapture.addEventListener('click', () => this.captureAnalysisScreen());

        // 패널 드래그 축소 제어
        if (this.panelHandle) {
            this.panelHandle.addEventListener('click', () => {
                this.unifiedPanel.classList.toggle('collapsed');
            });
        }

        // 각도 업데이트 전역 이벤트 바인딩
        window.addEventListener('bowAngleUpdate', (e) => {
            if (this.angleReport) {
                this.angleReport.innerText = `ANGLE ${e.detail.angle}°`;
            }
        });

        // 자이로 네온 발광 스위칭 인터락
        window.addEventListener('bowGyroUpdate', (e) => {
            const hLine = document.getElementById('gyro-horizon-line');
            const vLine = document.getElementById('gyro-vertical-line');
            if (!hLine || !vLine) return;

            hLine.style.transform = `translate(-50%, -50%) rotate(${e.detail.roll}deg)`;
            hLine.setAttribute('data-angle', `${e.detail.roll}°`);

            if (e.detail.isLevel) {
                hLine.classList.add('perfect-level');
                vLine.classList.add('perfect-level');
            } else {
                hLine.classList.remove('perfect-level');
                vLine.classList.remove('perfect-level');
            }
        });
    }

    async startCamera() {
        if (this.stream) return;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: true
            });
            this.cameraPreview.srcObject = this.stream;
            this.recordStatus.innerText = '카메라 커널 연결 성공. 녹화 준비 완료.';
        } catch (err) {
            this.recordStatus.innerText = '카메라 장치 하드웨어 개방 실패.';
            console.error(err);
        }
    }

    toggleRecording() {
        if (!this.stream) {
            this.startCamera().then(() => this.startRecordingProcess());
            return;
        }
        if (!this.isRecording) {
            this.startRecordingProcess();
        } else {
            this.stopRecordingProcess();
        }
    }

    startRecordingProcess() {
        this.recordedChunks = [];
        let options = { mimeType: 'video/webm;codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                this.currentVideoBlob = new Blob(this.recordedChunks, { type: options.mimeType || 'video/mp4' });
                const videoURL = URL.createObjectURL(this.currentVideoBlob);
                this.mainVideo.src = videoURL;
                this.recordStatus.innerText = '녹화본이 성공적으로 인코딩되어 분석 버퍼에 전송되었습니다.';
                this.switchScene('scene-analyze');
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.btnRecordToggle.innerText = '녹화종료';
            this.btnRecordToggle.classList.add('recording');
            this.recordStatus.innerText = '자세 오디오 및 영상 동시 기록중...';
        } catch (e) {
            console.error('레코더 아키텍처 가동 실패:', e);
        }
    }

    stopRecordingProcess() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.btnRecordToggle.innerText = '녹화시작';
            this.btnRecordToggle.classList.remove('recording');
        }
    }

    switchScene(sceneId) {
        document.querySelectorAll('.app-scene').forEach(scene => {
            scene.classList.remove('active');
        });
        document.getElementById(sceneId).classList.add('active');
        
        if (sceneId === 'scene-analyze' && this.mainVideo.src) {
            this.mainVideo.play().catch(() => {});
            this.btnPlayPause.innerText = '일시정지';
        } else {
            this.mainVideo.pause();
        }
    }

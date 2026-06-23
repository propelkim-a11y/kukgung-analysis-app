/**
 * js/app_core.js
 * 국궁 자세 분석 앱 - 코어 시스템 및 데이터 복원 엔진 (Part 1)
 */

class BowAppCore {
    constructor() {
        this.dbName = 'BowArcheryDB';
        this.dbVersion = 1;
        this.db = null;
        
        // 전역 상태 통합 관리 객체
        this.state = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            isDragging: false,
            startX: 0,
            startY: 0,
            lastTouchDist: 0,
            isPanelOpen: true
        };
    }

    /**
     * IndexedDB 초기화 및 오픈
     */
    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                // 비디오 및 선 데이터를 담을 오브젝트 스토어 생성
                if (!db.objectStoreNames.contains('appCache')) {
                    db.createObjectStore('appCache');
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('[Core] IndexedDB 가동 완료.');
                resolve(this.db);
            };

            request.onerror = (e) => {
                console.error('[Core] IndexedDB 에러:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    /**
     * 대용량 영구 저장소 데이터 캐싱 서브루틴
     */
    async saveCache(key, value) {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction('appCache', 'readwrite');
            const store = tx.objectStore('appCache');
            store.put(value, key);
            tx.oncomplete = () => resolve(true);
        });
    }

    /**
     * 영구 저장소로부터 마지막 데이터 로드
     */
    async getCache(key) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const tx = this.db.transaction('appCache', 'readonly');
            const store = tx.objectStore('appCache');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * 앱 기동 시 직전 회차 데이터 자동 영구 복원 비동기 루틴
     */
    async restoreLastSession(videoEl, canvasEl) {
        try {
            // 1. 마지막으로 불러왔던 비디오 파일(Blob) 복원
            const videoBlob = await this.getCache('lastVideoBlob');
            if (videoBlob && videoEl) {
                const videoURL = URL.createObjectURL(videoBlob);
                videoEl.src = videoURL;
                videoEl.load();
                console.log('[Core] 지난 회차 비디오 소스 복원 성공.');
            }

            // 2. 마지막으로 그렸던 조준선 배열 데이터 복원
            const savedLines = await this.getCache('lastLines');
            if (savedLines && window.bowAnalyzer) {
                window.bowAnalyzer.lines = savedLines;
                // 3. 직전 확대 상태 변환 행렬 캐시 로드 후 동기화
                const savedTransform = await this.getCache('lastTransform');
                if (savedTransform) {
                    this.state.scale = savedTransform.scale;
                    this.state.offsetX = savedTransform.offsetX;
                    this.state.offsetY = savedTransform.offsetY;
                }
                window.bowAnalyzer.updateTransform(this.state.scale, this.state.offsetX, this.state.offsetY);
                console.log('[Core] 지난 회차 조준선 기하학 데이터 및 변환행렬 복원 성공.');
            }
        } catch (error) {
            console.error('[Core] 세션 복원 중 예외 발생:', error);
        }
    }
}

window.bowAppCore = new BowAppCore();
/**
 * js/app_gesture.js
 * 국궁 자세 분석 앱 - 스타일러스 및 멀티 터치 제스처 처리기 (Part 2)
 */

class BowAppGesture {
    constructor(coreInstance) {
        this.core = coreInstance;
        this.container = null;
        this.video = null;

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
    }

    init(containerEl, videoEl) {
        this.container = containerEl;
        this.video = videoEl;
        this.setupGestureEvents();
    }

    setupGestureEvents() {
        if (!this.container) return;
        // Pointer Events API 바인딩
        this.container.addEventListener('pointerdown', this.handlePointerDown);
        this.container.addEventListener('pointermove', this.handlePointerMove);
        this.container.addEventListener('pointerup', this.handlePointerUp);
        this.container.addEventListener('pointercancel', this.handlePointerUp);
        // PC 마우스 휠 대응용 보조 리스너
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    handlePointerDown(e) {
        // 분석 툴 모드가 'draw(선긋기)'일 때는 터치 무시 및 analyzer.js 전담 유도
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

        // Palm Rejection: S펜/애플펜슬이 활성화된 상태에서 살이 먼저 닿아 들어오는 Direct 터치는 전면 차단
        if (e.pointerType === 'touch' && e.touchType === 'direct' && window.isStylusActive) return;

        const state = this.core.state;
        state.isDragging = true;
        state.startX = e.clientX - state.offsetX;
        state.startY = e.clientY - state.offsetY;
    }

    handlePointerMove(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        const state = this.core.state;

        // 멀티 터치 피치 줌 제스처 판정 (두 손가락 거리를 실시간 트래킹)
        if (e.pointerType === 'touch' && e.targetTouches && e.targetTouches.length === 2) {
            state.isDragging = false; // 확대 중에는 이동 드래그 억제
            const t1 = e.targetTouches[0];
            const t2 = e.targetTouches[1];
            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

            if (state.lastTouchDist > 0) {
                // 물리 픽셀 변화 비율을 스케일에 누적
                const factor = currentDist / state.lastTouchDist;
                this.applyZoom(state.scale * factor, e.clientX, e.clientY);
            }
            state.lastTouchDist = currentDist;
            return;
        }

        // 한 손가락 자유 드래그 이동 스크롤
        if (!state.isDragging) return;
        state.offsetX = e.clientX - state.startX;
        state.offsetY = e.clientY - state.startY;
        this.applyTransform();
    }

    handlePointerUp(e) {
        const state = this.core.state;
        state.isDragging = false;
        state.lastTouchDist = 0;
        
        // 조준선 좌표 오차가 없도록 변경 완료 시 변환 행렬 정보를 IndexedDB에 영구 박제
        this.core.saveCache('lastTransform', {
            scale: state.scale,
            offsetX: state.offsetX,
            offsetY: state.offsetY
        });
    }

    handleWheel(e) {
        e.preventDefault();
        const state = this.core.state;
        const zoomIntensity = 0.1;
        const nextScale = e.deltaY < 0 ? state.scale * (1 + zoomIntensity) : state.scale * (1 - zoomIntensity);
        this.applyZoom(nextScale, e.clientX, e.clientY);
    }

    /**
     * 최대 5배 제한 범위 안에서 화면 좌표계 정밀 줌 배율 처리
     */
    applyZoom(targetScale, clientX, clientY) {
        const state = this.core.state;
        const containerRect = this.container.getBoundingClientRect();
        
        // 확대/축소 임계 한계점 잠금 (최소 1배 ~ 명세 규격상 최대 5배 지정)
        const nextScale = Math.min(Math.max(targetScale, 1), 5);
        
        // 펜 마우스 포인터가 가리키는 고정 지점을 중심으로 확대 스케일 연산 원점 보정
        const mouseX = clientX - containerRect.left;
        const mouseY = clientY - containerRect.top;
        
        state.offsetX = mouseX - (mouseX - state.offsetX) * (nextScale / state.scale);
        state.offsetY = mouseY - (mouseY - state.offsetY) * (nextScale / state.scale);
        state.scale = nextScale;

        this.applyTransform();
    }

    /**
     * 물리 변환 값을 비디오 객체 껍데기와 삼각함수 연산부(analyzer)에 동시 정밀 주입
     */
    applyTransform() {
        const state = this.core.state;
        if (this.video) {
            this.video.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        }
        if (window.bowAnalyzer) {
            window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
        }
    }
}

window.bowAppGesture = new BowAppGesture(window.bowAppCore);
/**
 * js/app.js
 * 국궁 자세 분석 앱 - 메인 컨트롤러 및 비디오 프레임 분석 제어 (Part 3)
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 코어 인프라 획득 및 IndexedDB 데이터베이스 활성화
    const core = window.bowAppCore;
    const gesture = window.bowAppGesture;
    await core.initDB();

    // 2. DOM 핵심 노드 일괄 바인딩
    const videoViewport = document.getElementById('video-viewport');
    const mainVideo = document.getElementById('main-video');
    const drawCanvas = document.getElementById('draw-canvas');
    const unifiedPanel = document.getElementById('unified-panel');
    const panelHandle = document.getElementById('panel-handle');
    
    const btnOpen = document.getElementById('btn-open');
    const btnMove = document.getElementById('btn-move');
    const btnDraw = document.getElementById('btn-draw');
    const btnReset = document.getElementById('btn-reset');
    const videoInput = document.getElementById('video-input');

    const btnFramePrev = document.getElementById('btn-frame-prev');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnFrameNext = document.getElementById('btn-frame-next');
    const angleReport = document.getElementById('angle-report');

    // 3. 서브 모듈 이식 및 도화지 캔버스 매핑
    gesture.init(videoViewport, mainVideo);
    if (window.bowAnalyzer) {
        window.bowAnalyzer.init(drawCanvas);
    }

    // 4. 세션 세팅 복원 연동 실행
    await core.restoreLastSession(mainVideo, drawCanvas);
    gesture.applyTransform(); // 복원된 스케일 화면에 즉시 렌더링 투사

    // 캔버스 사이즈 비디오 물리 픽셀 크기와 칼같이 일치화
    mainVideo.addEventListener('loadedmetadata', () => {
        drawCanvas.width = mainVideo.videoWidth;
        drawCanvas.height = mainVideo.videoHeight;
        if (window.bowAnalyzer) window.bowAnalyzer.render();
    });

    /**
     * ==========================================
     *  명세 규격 코어 5: 초정밀 비디오 제어 루틴 (30fps)
     * ==========================================
     */
    const FRAME_TIME = 1 / 30; // 1프레임당 소요 시간 (약 0.033초)

    btnPlayPause.addEventListener('click', () => {
        if (mainVideo.paused) {
            mainVideo.play();
            btnPlayPause.textContent = '[일시정지]';
        } else {
            mainVideo.pause();
            btnPlayPause.textContent = '[재생]';
        }
    });

    btnFramePrev.addEventListener('click', () => {
        mainVideo.pause();
        btnPlayPause.textContent = '[재생]';
        // 정확히 딱 1프레임 뒤로 컷 이동
        mainVideo.currentTime = Math.max(0, mainVideo.currentTime - FRAME_TIME);
    });

    btnFrameNext.addEventListener('click', () => {
        mainVideo.pause();
        btnPlayPause.textContent = '[재생]';
        // 정확히 딱 1프레임 앞으로 컷 이동
        mainVideo.currentTime = Math.min(mainVideo.duration, mainVideo.currentTime + FRAME_TIME);
    });

    /**
     * ==========================================
     *  명세 규격 코어 3 & 4: 4대 텍스트 메뉴 제어
     * ==========================================
     */
    btnOpen.addEventListener('click', () => videoInput.click());
    
    videoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 대용량 캐시 스토어에 영상 복제 영구 바인딩
        core.saveCache('lastVideoBlob', file);

        const url = URL.createObjectURL(file);
        mainVideo.src = url;
        mainVideo.load();

        // 초기 진입 모드 활성화 규칙 강제 이행
        setActiveMenu(btnOpen);
        if (window.bowAnalyzer) window.bowAnalyzer.clearLines();
    });

    btnMove.addEventListener('click', () => {
        setActiveMenu(btnMove);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');
    });

    btnDraw.addEventListener('click', () => {
        setActiveMenu(btnDraw);
        if (window.bowAnalyzer) window.bowAnalyzer.setMode('draw');
    });

    btnReset.addEventListener('click', () => {
        if (window.bowAnalyzer) {
            window.bowAnalyzer.clearLines();
            core.saveCache('lastLines', []);
        }
    });

    function setActiveMenu(activeBtn) {
        [btnOpen, btnMove, btnDraw].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    /**
     * ==========================================
     *  명세 규격 코어 10: 슬라이딩 패널 개폐 루틴
     * ==========================================
     */
    panelHandle.addEventListener('click', () => {
        core.state.isPanelOpen = !core.state.isPanelOpen;
        if (core.state.isPanelOpen) {
            unifiedPanel.classList.remove('collapsed');
        } else {
            unifiedPanel.classList.add('collapsed');
        }
    });

    /**
     * ==========================================
     *  비동기 커스텀 수신 이벤트 파이프라인 정렬
     * ==========================================
     */
    // 삼각함수 고각 실시간 리포트 출력 단일 동기화
    window.addEventListener('bowAngleUpdate', (e) => {
        angleReport.textContent = `📐 ${e.detail.angle}°`;
        // 선이 추가될 때마다 배열 스냅샷을 IndexedDB에 실시간 캐싱
        if (window.bowAnalyzer) {
            core.saveCache('lastLines', window.bowAnalyzer.lines);
        }
    });

    // js/sensor.js의 실시간 자이로 데이터를 받아서 처리하는 공간
    window.addEventListener('bowGyroUpdate', (e) => {
        // 수평 상태(e.detail.isLevel)를 판단하여 격자 가이드선 색상을 변경하거나 
        // 텍스트 수평 수치를 안전하게 모니터링할 수 있는 확장 인터페이스 가교
        // 예: console.log(`Roll: ${e.detail.roll}, Level: ${e.detail.isLevel}`);
    });
    
    // 자이로 하드웨어 초기화 구동 개시
    if (window.bowGyroSensor) {
        window.bowGyroSensor.start();
    }
});

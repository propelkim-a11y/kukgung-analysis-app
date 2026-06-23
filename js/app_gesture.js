/**
 * js/app_gesture.js
 * 국궁 자세 분석 앱 - 스타일러스 및 멀티 터치 제스처 처리기 (6단계)
 * - 두 손가락 피치 줌(최대 5배) 및 한 손가락 화면 드래그 이동 스크롤
 * - 비디오와 분석 캔버스를 동시에 변환하여 선 분리 현상 완벽 박멸
 */

class BowAppGesture {
    constructor(coreInstance) {
        this.core = coreInstance;
        this.container = null;
        this.video = null;

        // 멀티 터치 포인터 동시 트래킹 캐시 고도화 구조체
        this.activePointers = new Map();
        this.initialDist = 0;
        this.initialScale = 1;

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
    }

    /**
     * 제스처 컨테이너 및 대상 비디오 바인딩
     */
    init(containerEl, videoEl) {
        this.container = containerEl;
        this.video = videoEl;
        this.setupGestureEvents();
    }

    setupGestureEvents() {
        if (!this.container) return;
        // 브라우저 자체 제스처(페이지 줌, 스크롤) 간섭 차단
        this.container.style.touchAction = 'none'; 
        
        this.container.addEventListener('pointerdown', this.handlePointerDown);
        this.container.addEventListener('pointermove', this.handlePointerMove);
        this.container.addEventListener('pointerup', this.handlePointerUp);
        this.container.addEventListener('pointercancel', this.handlePointerUp);
        
        // PC 마우스 개발 환경용 마우스 휠 리스너
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    handlePointerDown(e) {
        // [선긋기] 모인 경우 캔버스 펜 입력(analyzer.js)에 제어권을 양도하고 철수
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

        // Palm Rejection: 스타일러스 활성화 도중 살이 먼저 닿아 유입되는 Direct 터치 차단
        if (e.pointerType === 'touch' && e.touchType === 'direct' && window.isStylusActive) return;

        // 현재 들어온 포인터 ID와 위치 기록
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const state = this.core.state;

        if (this.activePointers.size === 1) {
            // 한 손가락 이동 드래그 준비
            state.isDragging = true;
            state.startX = e.clientX - state.offsetX;
            state.startY = e.clientY - state.offsetY;
        } else if (this.activePointers.size === 2) {
            // 두 손가락 핀치 줌 준비 (이동 스크롤 일시 정지)
            state.isDragging = false;
            const pointers = Array.from(this.activePointers.values());
            this.initialDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
            this.initialScale = state.scale;
        }
    }

    handlePointerMove(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        if (!this.activePointers.has(e.pointerId)) return;
        
        // 움직인 포인터 위치 업데이트
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const state = this.core.state;

        // 멀티 터치 피치 줌 제스처 정밀 연산
        if (this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values());
            const currentDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
            
            if (this.initialDist > 0) {
                const factor = currentDist / this.initialDist;
                // 두 손가락의 정중앙 좌표를 기준으로 줌인/줌아웃 확장 수행
                const midX = (pointers[0].clientX + pointers[1].clientX) / 2;
                const midY = (pointers[0].clientY + pointers[1].clientY) / 2;
                this.applyZoom(this.initialScale * factor, midX, midY);
            }
            return;
        }

        // 한 손가락 자유 드래그 이동 스크롤
        if (state.isDragging && this.activePointers.size === 1) {
            state.offsetX = e.clientX - state.startX;
            state.offsetY = e.clientY - state.startY;
            this.applyTransform();
        }
    }

    handlePointerUp(e) {
        this.activePointers.delete(e.pointerId);
        const state = this.core.state;
        
        if (this.activePointers.size < 2) {
            this.initialDist = 0;
        }
        if (this.activePointers.size === 0) {
            state.isDragging = false;
        }
        
        // 조준선 좌표가 어긋나지 않도록 변환행렬 값을 데이터베이스 캐시에 실시간 기록
        this.core.saveCache('lastTransform', {
            scale: state.scale,
            offsetX: state.offsetX,
            offsetY: state.offsetY
        });
    }

    handleWheel(e) {
        e.preventDefault();
        const state = this.core.state;
        const zoomIntensity = 0.08;
        const nextScale = e.deltaY < 0 ? state.scale * (1 + zoomIntensity) : state.scale * (1 - zoomIntensity);
        this.applyZoom(nextScale, e.clientX, e.clientY);
    }

    /**
     * 최대 5배 명세 한계값 제약 내에서 마우스/펜 포인터 좌표 중심 확대
     */
    applyZoom(targetScale, clientX, clientY) {
        const state = this.core.state;
        const containerRect = this.container.getBoundingClientRect();
        
        const nextScale = Math.min(Math.max(targetScale, 1), 5); // 1배 ~ 5배 제한 범위 Lock
        
        const mouseX = clientX - containerRect.left;
        const mouseY = clientY - containerRect.top;
        
        state.offsetX = mouseX - (mouseX - state.offsetX) * (nextScale / state.scale);
        state.offsetY = mouseY - (mouseY - state.offsetY) * (nextScale / state.scale);
        state.scale = nextScale;

        this.applyTransform();
    }

    /**
     * 💡 교정: 물리적 변환(CSS)을 비디오 노드와 분석 캔버스 도화지 레이어 전체에 동시에 전사
     * 이제 비디오가 커지면 선이 그려진 도화지도 완벽히 일치하는 스케일로 연동되어 움직입니다.
     */
    applyTransform() {
        const state = this.core.state;
        const transformCSS = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        
        // 1. 비디오 엘리먼트 확대/이동 변환
        if (this.video) {
            this.video.style.transform = transformCSS;
        }
        
        // 2. 캔버스 엘리먼트 자체를 물리적으로 동일하게 확대/이동 변환 (분리 현상 영구 차단)
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) {
            canvasEl.style.transform = transformCSS;
            canvasEl.style.transformOrigin = 'center center';
        }

        // 3. 분석기 기하학 좌표계 내부 행렬 동기화
        if (window.bowAnalyzer) {
            window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
        }
    }
}

window.bowAppGesture = new BowAppGesture(window.bowAppCore);

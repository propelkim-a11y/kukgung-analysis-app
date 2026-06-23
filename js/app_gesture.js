/**
 * js/app_gesture.js
 * 국궁 자세 분석 앱 - 스타일러스 및 멀티 터치 제스처 처리기 (6단계)
 * - 두 손가락 피치 줌(최대 5배) 및 한 손가락 화면 드래그 이동 스크롤
 * - 드로잉 모드와의 충돌을 차단하기 위한 간섭 필터 교정 완료
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
        // [선긋기] 모드인 경우 캔버스 펜 입력(analyzer.js)에 제어권을 양도하고 철수
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
     * 물리적 변환을 비디오 노드와 분석 캔버스 좌표계에 동시 전사
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

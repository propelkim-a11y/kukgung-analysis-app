/**
 * js/app_gesture.js
 * 국궁 자세 분석 앱 - 멀티 터치 제스처 처리기 (무한 루프 및 프리징 완전 박멸판)
 */

class BowAppGesture {
    constructor(coreInstance) {
        this.core = coreInstance;
        this.container = null;
        this.video = null;
        this.activePointers = new Map();
        this.initialDist = 0;
        this.initialScale = 1;
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
        this.container.style.touchAction = 'none'; 
        this.container.addEventListener('pointerdown', this.handlePointerDown);
        this.container.addEventListener('pointermove', this.handlePointerMove);
        this.container.addEventListener('pointerup', this.handlePointerUp);
        this.container.addEventListener('pointercancel', this.handlePointerUp);
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    }
    handlePointerDown(e) {
        // 선긋기 모드일 때는 제스처 엔진의 드래그 연산 상태를 즉시 무력화하고 양보
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') {
            this.activePointers.clear();
            this.core.state.isDragging = false;
            return;
        }
        if (e.pointerType === 'touch' && e.touchType === 'direct' && window.isStylusActive) return;
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const state = this.core.state;
        if (this.activePointers.size === 1) {
            state.isDragging = true;
            state.startX = e.clientX - state.offsetX;
            state.startY = e.clientY - state.offsetY;
        } else if (this.activePointers.size === 2) {
            state.isDragging = false;
            const pointers = Array.from(this.activePointers.values());
            this.initialDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
            this.initialScale = state.scale;
        }
    }
    handlePointerMove(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const state = this.core.state;
        if (this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values());
            const currentDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
            if (this.initialDist > 0) {
                const factor = currentDist / this.initialDist;
                this.applyZoom(this.initialScale * factor);
            }
            return;
        }
        if (state.isDragging && this.activePointers.size === 1) {
            state.offsetX = e.clientX - state.startX;
            state.offsetY = e.clientY - state.startY;
            this.applyTransform();
        }
    }
    handlePointerUp(e) {
        this.activePointers.delete(e.pointerId);
        const state = this.core.state;
        if (this.activePointers.size < 2) this.initialDist = 0;
        if (this.activePointers.size === 0) state.isDragging = false;
        this.core.saveCache('lastTransform', {
            scale: state.scale,
            offsetX: state.offsetX,
            offsetY: state.offsetY
        });
    }
    handleWheel(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        e.preventDefault();
        const state = this.core.state;
        const zoomIntensity = 0.08;
        const nextScale = e.deltaY < 0 ? state.scale * (1 + zoomIntensity) : state.scale * (1 - zoomIntensity);
        this.applyZoom(nextScale);
    }
    applyZoom(targetScale) {
        const state = this.core.state;
        const nextScale = Math.min(Math.max(targetScale, 1), 5);
        state.scale = nextScale;
        this.applyTransform();
    }
    // 💡 [무한 재귀 차단 패치 완료] 변환 행렬을 동기화할 때 캔버스 렌더러와 불필요한 연속 상호 무한 호출 루프를 완전히 분리 차단
    applyTransform() {
        const state = this.core.state;
        if (this.video) {
            this.video.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        }
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) {
            canvasEl.style.transform = 'none';
        }
        // 대리 변수 업데이트 방식으로 결함 추적 차단하여 무한 프리징 원천 봉쇄
        if (window.bowAnalyzer && window.bowAnalyzer.transform) {
            window.bowAnalyzer.transform.scale = state.scale;
            window.bowAnalyzer.transform.offsetX = state.offsetX;
            window.bowAnalyzer.transform.offsetY = state.offsetY;
            // 상호 재귀가 발생하지 않는 독립 렌더 파이프라인 단방향 주사
            window.bowAnalyzer.render();
        }
    }
}

window.bowAppGesture = new BowAppGesture(window.bowAppCore);

/**
 * js/app_gesture.js - 제스처 가로채기 완벽 차단 버전
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
        // 💡 [핵심 교정] 선긋기 모드일 때는 제스처 내부 상태를 완전히 무력화하고 리턴
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
        // 💡 [핵심 교정] 선긋기 모드일 때는 화면 밀림(Pan) 연산을 원천 봉쇄
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const state = this.core.state;
        if (this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values());
            const currentDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
            if (this.initialDist > 0) {
                const factor = currentDist / this.initialDist;
                const midX = (pointers[0].clientX + pointers[1].clientX) / 2;
                const midY = (pointers[0].clientY + pointers[1].clientY) / 2;
                this.applyZoom(this.initialScale * factor, midX, midY);
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
        this.applyZoom(nextScale, e.clientX, e.clientY);
    }
    applyZoom(targetScale, clientX, clientY) {
        const state = this.core.state;
        const containerRect = this.container.getBoundingClientRect();
        const nextScale = Math.min(Math.max(targetScale, 1), 5);
        const mouseX = clientX - containerRect.left;
        const mouseY = clientY - containerRect.top;
        state.offsetX = mouseX - (mouseX - state.offsetX) * (nextScale / state.scale);
        state.offsetY = mouseY - (mouseY - state.offsetY) * (nextScale / state.scale);
        state.scale = nextScale;
        this.applyTransform();
    }
    applyTransform() {
        const state = this.core.state;
        if (this.video) {
            this.video.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        }
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) canvasEl.style.transform = 'none';
        if (window.bowAnalyzer) {
            window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
        }
    }
}
window.bowAppGesture = new BowAppGesture(window.bowAppCore);

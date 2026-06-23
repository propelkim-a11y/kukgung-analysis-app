/**
 * ==========================================
 * js/app_gesture.js
 * ==========================================
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
        this.container = containerEl; this.video = videoEl;
        this.container.addEventListener('pointerdown', this.handlePointerDown);
        this.container.addEventListener('pointermove', this.handlePointerMove);
        this.container.addEventListener('pointerup', this.handlePointerUp);
        this.container.addEventListener('pointercancel', this.handlePointerUp);
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    }
    handlePointerDown(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        if (e.pointerType === 'touch' && e.touchType === 'direct' && window.isStylusActive) return;
        const state = this.core.state;
        state.isDragging = true;
        state.startX = e.clientX - state.offsetX; state.startY = e.clientY - state.offsetY;
    }
    handlePointerMove(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        const state = this.core.state;
        if (e.pointerType === 'touch' && e.targetTouches && e.targetTouches.length === 2) {
            state.isDragging = false;
            const currentDist = Math.hypot(e.targetTouches[0].clientX - e.targetTouches[1].clientX, e.targetTouches[0].clientY - e.targetTouches[1].clientY);
            if (state.lastTouchDist > 0) this.applyZoom(state.scale * (currentDist / state.lastTouchDist), e.clientX, e.clientY);
            state.lastTouchDist = currentDist;
            return;
        }
        if (!state.isDragging) return;
        state.offsetX = e.clientX - state.startX; state.offsetY = e.clientY - state.startY;
        this.applyTransform();
    }
    handlePointerUp() {
        const state = this.core.state; state.isDragging = false; state.lastTouchDist = 0;
        this.core.saveCache('lastTransform', { scale: state.scale, offsetX: state.offsetX, offsetY: state.offsetY });
    }
    handleWheel(e) {
        e.preventDefault();
        this.applyZoom(e.deltaY < 0 ? this.core.state.scale * 1.1 : this.core.state.scale * 0.9, e.clientX, e.clientY);
    }
    applyZoom(targetScale, clientX, clientY) {
        const state = this.core.state; const rect = this.container.getBoundingClientRect();
        const nextScale = Math.min(Math.max(targetScale, 1), 5); // 최대 5배율 제한 명세 준수
        const mX = clientX - rect.left; const mY = clientY - rect.top;
        state.offsetX = mX - (mX - state.offsetX) * (nextScale / state.scale);
        state.offsetY = mY - (mY - state.offsetY) * (nextScale / state.scale);
        state.scale = nextScale;
        this.applyTransform();
    }
    applyTransform() {
        const state = this.core.state;
        if (this.video) this.video.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        if (window.bowAnalyzer) window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
    }
}
window.bowAppGesture = new BowAppGesture(window.bowAppCore);


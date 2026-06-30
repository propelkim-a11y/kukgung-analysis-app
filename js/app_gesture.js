/**
 * js/app_gesture.js - [Part 1]
 * 국궁 자세 분석 앱 - 멀티 터치 제스처 처리기 (영상 내 좌표 완전 고정 완결판 v18.5)
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
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') {
            this.activePointers.clear();
            if (this.core && this.core.state) {
                this.core.state.isDragging = false;
            }
            return;
        }
        if (e.pointerType === 'touch' && e.touchType === 'direct' && window.isStylusActive) return;
        
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        
        if (this.activePointers.size === 1) {
            state.isDragging = true;
            state.startX = e.clientX - state.offsetX;
            state.startY = e.clientY - state.offsetY;
        } else if (this.activePointers.size === 2) {
            state.isDragging = false;
            const pointers = Array.from(this.activePointers.values());
            this.initialDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, 
                                          pointers[0].clientY - pointers[1].clientY);
            this.initialScale = state.scale;
        }
    }

    handlePointerMove(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        if (!this.activePointers.has(e.pointerId)) return;
        
        this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        
        if (this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values());
            const currentDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, 
                                           pointers[0].clientY - pointers[1].clientY);
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
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        
        if (this.activePointers.size < 2) this.initialDist = 0;
        if (this.activePointers.size === 0) state.isDragging = false;
        
        if (typeof this.core.saveCache === 'function') {
            this.core.saveCache('lastTransform', {
                scale: state.scale,
                offsetX: state.offsetX,
                offsetY: state.offsetY
            });
        }
    }

    handleWheel(e) {
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
        e.preventDefault();
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        const zoomIntensity = 0.08;
        const nextScale = e.deltaY < 0 ? state.scale * (1 + zoomIntensity) : state.scale * (1 - zoomIntensity);
        this.applyZoom(nextScale);
    }

    applyZoom(targetScale) {
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        const nextScale = Math.min(Math.max(targetScale, 1), 5);
        state.scale = nextScale;
        this.applyTransform();
    }

    // 💡 [동영상 좌표 락온 패치 마감]
    // 비디오와 캔버스 엘리먼트의 transform 배율 및 원점 축을 1:1 완벽히 동조시켜 영상 확대이동 시 좌표 겉돎 현상 박멸
    applyTransform() {
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        const transformStyle = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        
        if (this.video) {
            this.video.style.transformOrigin = 'top left';
            this.video.style.transform = transformStyle;
        }
        
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) {
            // 💡 [핵심 보정] 캔버스 엘리먼트 자체에도 비디오와 완벽히 똑같은 원점 및 CSS transform 주입
            canvasEl.style.transformOrigin = 'top left';
            canvasEl.style.transform = transformStyle;
        }
        
        // 캔버스 자체 스케일과 변형 상태 업데이트 파이프라인
        if (window.bowAnalyzer && window.bowAnalyzer.transform) {
            // 엘리먼트가 직접 같이 커지고 움직이므로 내부 좌표 렌더링 역산 배율을 물리 싱크에 맞게 1로 보정 유도
            window.bowAnalyzer.transform.scale = 1;
            window.bowAnalyzer.transform.offsetX = 0;
            window.bowAnalyzer.transform.offsetY = 0;
            
            // 상호 재귀가 발생하지 않는 독립 렌더 파이프라인 단방향 주사
            window.bowAnalyzer.render();
        }
    }
}

window.bowAppGesture = new BowAppGesture(window.bowAppCore);

/**
 * js/app_gesture.js - [Part 1]
 * 국궁 자세 분석 앱 - 멀티 터치 제스처 처리기 (확대 시 선분 위치 밀림 박멸 완결판 v18.0)
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
            this.initialDist = Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
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

    // 💡 [무한 재귀 차단 패치 및 매트릭스 싱크 축 정렬 완료]
    // 변환 행렬을 동기화할 때 캔버스 좌표계와 비디오의 변환 기준 중심축(Origin)을 좌상단으로 강제 통일하여 위치 밀림 완벽 박멸
    applyTransform() {
        if (!this.core || !this.core.state) return;
        const state = this.core.state;
        
        if (this.video) {
            // 💡 [핵심 보정] 비디오의 CSS 변환 기준 중심축을 좌상단(top left)으로 확고히 매핑
            this.video.style.transformOrigin = 'top left';
            this.video.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        }
        
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) {
            // 캔버스 자체의 엘리먼트 transform 변형을 방해 해제하여 비디오 좌표와 정렬 싱크 유지
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

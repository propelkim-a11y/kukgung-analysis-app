/**
 * js/app_gesture.js
 * 국궁 자세 분석 앱 - 스타일러스 및 멀티 터치 제스처 처리기 (6단계)
 * - 두 손가락 피치 줌(최대 5배) 및 한 손가락 화면 드래그 이동 스크롤
 * - 비디오, 선긋기 캔버스, 격자 그리드를 삼위일체로 묶어 이탈 및 격차 오류 영구 소거
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
        if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
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
        
        if (this.activePointers.size < 2) {
            this.initialDist = 0;
        }
        if (this.activePointers.size === 0) {
            state.isDragging = false;
        }
        
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

    /**
     * 💡 핵심 교정: 비디오뿐만 아니라 격자 그리드 레이어(.background-grid-layer)까지 
     * 동일한 CSS 변환 연산을 적용하여, 동영상을 키우면 격자선도 영상 픽셀에 고정된 채 함께 정밀 확대되도록 유기적 삼위일체 결합 수행
     */
    applyTransform() {
        const state = this.core.state;
        const transformCSS = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        
        // 1. 비디오 노드 변환
        if (this.video) {
            this.video.style.transform = transformCSS;
        }
        
        // 2. 격자 그리드 배경 레이어 동시 변환 (동영상 위의 바둑판 픽셀 일치화)
        const gridEl = this.container.querySelector('.background-grid-layer');
        if (gridEl) {
            gridEl.style.transform = transformCSS;
        }
        
        // 3. 드로잉 캔버스 도화지 축소 노정 고정 유지
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) {
            canvasEl.style.transform = 'none';
        }

        // 4. 분석기 기하학 좌표 엔진 동기화
        if (window.bowAnalyzer) {
            window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
        }
    }
}

window.bowAppGesture = new BowAppGesture(window.bowAppCore);

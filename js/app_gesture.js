/**
 * js/app_gesture.js
 * 국궁 자세 분석 앱 - 스타일러스 및 멀티 터치 제스처 처리기 (6단계)
 * - 두 손가락 피치 줌(최대 5배) 및 한 손가락 화면 드래그 이동 스크롤
 * - 비디오와 분석 캔버스의 Origin 축을 완전히 통일하여 선 분리 현상 영구 소거
 */

class BowAppGesture {
    constructor(coreInstance) {
        this.core = coreInstance;
        this.container = null;
        this.video = null;

        // 멀티 터치 포인터 동시 트래킹 캐시 구조체
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

        // 두 손가락 핀치 줌 연산
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

        // 한 손가락 드래그 스크롤
        if (state.isDragging && this.activePointers.size === 1) {
            state.offsetX = e.clientX - state.startX;
            state.offsetY = e.clientY - state.offsetY;
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
        
        // 💡 축 기준을 top left(0,0)와 부합하도록 정밀 역산식 교정
        state.offsetX = mouseX - (mouseX - state.offsetX) * (nextScale / state.scale);
        state.offsetY = mouseY - (mouseY - state.offsetY) * (nextScale / state.scale);
        state.scale = nextScale;

        this.applyTransform();
    }

    /**
     * 💡 핵심 패치: 비디오와 캔버스 레이어를 물리적(CSS)으로 동시에 완벽 일치 변환 처리
     * 이제 비디오 이미지 속 과녁이나 활의 픽셀 위에 그어진 선이 접착제처럼 결합하여 완벽하게 같이 움직입니다.
     */
    applyTransform() {
        const state = this.core.state;
        const transformCSS = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
        
        // 1. 비디오 노드 변환
        if (this.video) {
            this.video.style.transform = transformCSS;
        }
        
        // 2. 드로잉 캔버스 도화지 노드 완전 동시 변환 (동일 축, 동일 값 적용)
        const canvasEl = document.getElementById('draw-canvas');
        if (canvasEl) {
            canvasEl.style.transform = transformCSS;
        }

        // 3. 기하학 렌더러 내부 변환 행렬 동기화
        if (window.bowAnalyzer) {
            window.bowAnalyzer.updateTransform(state.scale, state.offsetX, state.offsetY);
        }
    }
}

window.bowAppGesture = new BowAppGesture(window.bowAppCore);

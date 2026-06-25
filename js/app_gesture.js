/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 제스처 줌 패닝 엔진 (상대 오프셋 완전 교정판)
 */

class BowAppGesture {
    constructor() {
        this.viewport = null;
        this.video = null;
        
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.baseOffsetX = 0;
        this.baseOffsetY = 0;

        this.touchStartDist = 0;
        this.touchStartScale = 1;
        this.lastTouchTime = 0;
        this.isTransformPending = false;
    }

    init(viewportElement, videoElement) {
        this.viewport = viewportElement;
        this.video = videoElement;
        this.bindEvents();
    }

    applyTransform() {
        if (!this.video || this.isTransformPending) return;
        this.isTransformPending = true;

        requestAnimationFrame(() => {
            if (!this.video) {
                this.isTransformPending = false;
                return;
            }
            this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
            this.video.style.transformOrigin = "0 0";

            if (window.bowAnalyzer && typeof window.bowAnalyzer.updateTransform === 'function') {
                window.bowAnalyzer.updateTransform(this.scale, this.offsetX, this.offsetY);
            }
            
            if (window.bowAppCore && typeof window.bowAppCore.saveCache === 'function') {
                window.bowAppCore.saveCache('lastTransform', {
                    scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY
                });
            }
            this.isTransformPending = false;
        });
    }
/**
 * js/app_gesture.js (Part 2 of 3)
 */
    bindEvents() {
        if (!this.viewport) return;

        this.viewport.addEventListener('pointerdown', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            const now = performance.now();
            if (now - this.lastTouchTime < 250) {
                this.resetTransform();
                this.lastTouchTime = now;
                return;
            }
            this.lastTouchTime = now;

            this.isDragging = true;
            
            // 💡 [순간이동 튐 버그 완전 청소] 화면 전체 기준이 아닌, 비디오 박스 영역 테두리 오프셋을 직접 차감 연산
            const rect = this.viewport.getBoundingClientRect();
            this.startX = e.clientX - rect.left;
            this.startY = e.clientY - rect.top;
            
            this.baseOffsetX = this.offsetX;
            this.baseOffsetY = this.offsetY;
            
            this.viewport.setPointerCapture(e.pointerId);
        });

        this.viewport.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            // 💡 터치 이동점에서도 박스 시작점을 정확히 빼주어 순수 변화량만 축출
            const rect = this.viewport.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            const deltaX = currentX - this.startX;
            const deltaY = currentY - this.startY;
            
            this.offsetX = this.baseOffsetX + deltaX;
            this.offsetY = this.baseOffsetY + deltaY;
            this.applyTransform();
        });

        const stopDrag = (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                try { this.viewport.releasePointerCapture(e.pointerId); } catch(err) {}
            }
        };

        this.viewport.addEventListener('pointerup', stopDrag);
        this.viewport.addEventListener('pointercancel', stopDrag);
        this.viewport.addEventListener('pointerleave', stopDrag);

        this.viewport.addEventListener('touchstart', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            if (e.touches.length === 2) {
                this.isDragging = false;
                this.touchStartDist = this.getDistance(e.touches);
                this.touchStartScale = this.scale;
                this.baseOffsetX = this.offsetX;
                this.baseOffsetY = this.offsetY;
            }
        }, { passive: true });

        this.viewport.addEventListener('touchmove', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = this.getDistance(e.touches);
                if (this.touchStartDist > 0) {
                    const factor = dist / this.touchStartDist;
                    const nextScale = Math.min(5, Math.max(0.8, this.touchStartScale * factor));
                    
                    // 두 손가락 핀치 제스처 시에도 박스 고유 좌표계 기준으로 정확히 중심점 사상
                    const rect = this.viewport.getBoundingClientRect();
                    const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
                    const centerY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
                    
                    this.offsetX = centerX - (centerX - this.baseOffsetX) * (nextScale / this.touchStartScale);
                    this.offsetY = centerY - (centerY - this.baseOffsetY) * (nextScale / this.touchStartScale);
                    
                    this.scale = nextScale;
                    this.applyTransform();
                }
            }
        }, { passive: false });
    }
/**
 * js/app_gesture.js (Part 3 of 3)
 */
    // 💡 [터치 객체 접근 에러 완전 종결] 안드로이드/iOS 하드웨어 다중 포인터 배열 인덱싱 표준 연산 공식
    getDistance(touches) {
        if (!touches || touches.length < 2) return 0;
        
        // 하드웨어 터치 리스트(TouchList)에서 0번과 1번 손가락 지점을 정확히 적출
        const p1 = touches.item(0);
        const p2 = touches.item(1);
        if (!p1 || !p2) return 0;
        
        const dx = p1.clientX - p2.clientX;
        const dy = p1.clientY - p2.clientY;
        return Math.hypot(dx, dy);
    }

    // 더블 탭 시 비디오 해상도 스케일과 선 축을 동시에 원점 복원
    resetTransform() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.applyTransform();
    }
}

// 전역 글로벌 제스처 인프라 공인 매핑 수립
window.bowAppGesture = new BowAppGesture();

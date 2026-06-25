/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 제스처 줌 패닝 엔진 (확대 후 패닝 무빙 보정판)
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
            
            // 💡 [원천 박멸] 터치하는 순간 뷰포트 테두리 여백을 완전히 걷어내고 순수 상대 픽셀만 추적
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

            const rect = this.viewport.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            // 내 손가락이 움직인 아날로그 물리 픽셀 거리 계산
            const deltaX = currentX - this.startX;
            const deltaY = currentY - this.startY;
            
            // 💡 [진종결 수식] 확대 공간 스케일 배율에 반비례하도록 델타 변위를 나누어 역산 적용!
            // 이 처리가 수립되어야만 확대 상태에서 손을 대거나 밀어도 껑충 뛰지 않고 자석처럼 손가락에 결합함
            this.offsetX = this.baseOffsetX + (deltaX / this.scale);
            this.offsetY = this.baseOffsetY + (deltaY / this.scale);
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
                    
                    const rect = this.viewport.getBoundingClientRect();
                    const centerX = ((e.touches.clientX + e.touches.clientX) / 2) - rect.left;
                    const centerY = ((e.touches.clientY + e.touches.clientY) / 2) - rect.top;
                    
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

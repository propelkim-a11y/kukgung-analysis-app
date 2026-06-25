/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 제스처 줌 패닝 엔진 (확대 후 이동 완전 무결점 판)
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

            // 비디오 엘리먼트 가속 매트릭스 주사
            this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
            
            // [영향성 체크 확인] 드로잉 엔진인 bowAnalyzer에 배율과 이동 좌표 실시간 강제 전송
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
            
            // 💡 [이동 튕김 완벽 해결] 복잡한 나누기 연산을 완전히 제거하고, 사용자의 물리 터치 시작 절대 좌표만 직계 획득
            this.startX = e.clientX;
            this.startY = e.clientY;
            
            // 드래그 직전의 화면 이동 오프셋 좌표를 로컬 스냅샷 변수로 백업 고정
            this.baseOffsetX = this.offsetX;
            this.baseOffsetY = this.offsetY;
            
            this.viewport.setPointerCapture(e.pointerId);
        });

        this.viewport.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            // 💡 [물리 선형 변화량 적용] 배율 충돌 없이 내 손가락이 움직인 순수 차이값(Delta)만 정확히 합산
            const deltaX = e.clientX - this.startX;
            const deltaY = e.clientY - this.startY;
            
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
                
                // 두 손가락 줌 작동 시에도 초기 오프셋을 안전하게 백업 고정
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
                    
                    // 두 손가락의 정중앙 물리 픽셀 좌표 추적
                    const rect = this.viewport.getBoundingClientRect();
                    const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
                    const centerY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
                    
                    // 핀치 줌 배율 변화에 따른 중심점 오프셋 연산 수식 결합
                    this.offsetX = centerX - ((centerX - this.baseOffsetX) * (nextScale / this.touchStartScale));
                    this.offsetY = centerY - ((centerY - this.baseOffsetY) * (nextScale / this.touchStartScale));
                    
                    this.scale = nextScale;
                    this.applyTransform();
                }
            }
        }, { passive: false });
    }
/**
 * js/app_gesture.js (Part 3 of 3)
 */
    // 💡 [2중 예외 방어] 모바일 표준 TouchList 0번, 1번 손가락 지점을 정확히 인덱싱하여 오차 폭발 차단
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

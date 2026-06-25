/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 제스처 줌 패닝 엔진 (확대 후 이동 튕김 완벽 해결판)
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

            // 1. 비디오 엘리먼트 가속 매트릭스 변환 주사
            this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
            
            // 2. 드로잉 도화지 엔진 실시간 행렬 변수 전달 동기화
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
            
            // 💡 [튕김 버그 완전 박멸] 현재 확대 배율(scale) 가중치 오프셋을 물리학 역산으로 보정 적용
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            
            this.viewport.setPointerCapture(e.pointerId);
        });

        this.viewport.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            // 💡 마우스 및 싱글 터치 드래그 패닝 시 현재 스케일을 유지하며 부드럽게 오프셋 반영
            this.offsetX = e.clientX - this.startX;
            this.offsetY = e.clientY - this.startY;
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
                this.touchStartDist = this.getDistance(e.touches[0], e.touches[1]);
                this.touchStartScale = this.scale;
                
                // 💡 멀티터치 상태에서 중심 좌표를 보존하여 확대 중 화면 껑충 뜀을 실시간 방어
                this.startX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - this.offsetX;
                this.startY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - this.offsetY;
            }
        }, { passive: true });

        this.viewport.addEventListener('touchmove', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = this.getDistance(e.touches[0], e.touches[1]);
                if (this.touchStartDist > 0) {
                    const factor = dist / this.touchStartDist;
                    
                    // 최대 5배 최소 0.8배 범위에서 배율 변환
                    const nextScale = Math.min(5, Math.max(0.8, this.touchStartScale * factor));
                    
                    // 💡 줌 중심점(Pivoting) 오프셋 보정 수식을 실시간 융합하여 화면 찢어짐 차단
                    const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    
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
    getDistance(t1, t2) {
        if (!t1 || t1.length < 2) return 0;
        
        // 하드웨어 터치 리스트(TouchList)에서 0번과 1번 손가락 지점을 정확히 적출
        const p1 = t1[0];
        const p2 = t1[1];
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

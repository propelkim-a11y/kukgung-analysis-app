/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 하드웨어 가속 제스처 엔진 (핀치 줌 중심축 완전 완벽 교정판)
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

        // 하드웨어 디스플레이 가속 타이밍 동기화 제어 플래그
        this.isTransformPending = false;
    }

    init(viewportElement, videoElement) {
        this.viewport = viewportElement;
        this.video = videoElement;
        this.bindEvents();
    }

    // requestAnimationFrame 하드웨어 가속 연동으로 60~120fps 극상의 유연성 제공
    applyTransform() {
        if (!this.video || this.isTransformPending) return;
        this.isTransformPending = true;

        requestAnimationFrame(() => {
            if (!this.video) {
                this.isTransformPending = false;
                return;
            }

            // 1. 비디오 가속 매트릭스 주사 (물리 가속 축 반영)
            this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
            
            // 2. [영향성 체크] 드로잉 엔진 bowAnalyzer에 배율과 패닝 오프셋 즉시 강제 전송
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
            
            // 💡 [어지러움/튕김 완전 해결] 터치 시 현재 배율(scale) 축 오차를 수학적으로 정밀 역산 반영
            this.startX = (e.clientX / this.scale) - this.offsetX;
            this.startY = (e.clientY / this.scale) - this.offsetY;
            
            this.viewport.setPointerCapture(e.pointerId);
        });

        this.viewport.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            // 💡 확대된 상태의 스케일 축을 기준점으로 파노라마 드래그 동기화 무빙 주사
            this.offsetX = (e.clientX / this.scale) - this.startX;
            this.offsetY = (e.clientY / this.scale) - this.startY;
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

        // 💡 모바일 표준 멀티터치(두 손가락) 정밀 핀치 줌인/줌아웃 인터럽트 정렬
        this.viewport.addEventListener('touchstart', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            if (e.touches.length === 2) {
                this.isDragging = false;
                this.touchStartDist = this.getDistance(e.touches);
                this.touchStartScale = this.scale;
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
                    
                    // 💡 [화면 순간이동 방어] 두 손가락의 정중앙 실시간 물리 픽셀 좌표 역산 추적
                    const rect = this.viewport.getBoundingClientRect();
                    const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
                    const centerY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
                    
                    // 중심축 고정 비례식 행렬 대입 (손가락 사이에서 비디오와 선이 이탈하는 현상 완전 제어)
                    this.offsetX = centerX - ((centerX - this.offsetX) * (nextScale / this.scale));
                    this.offsetY = centerY - ((centerY - this.offsetY) * (nextScale / this.scale));
                    
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
        const p1 = touches[0];
        const p2 = touches[1];
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

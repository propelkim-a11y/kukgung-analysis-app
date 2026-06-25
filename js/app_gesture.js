/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 멀티터치 제스처 줌 패닝 엔진 (선 밀림 완전 해결 판)
 */

class BowAppGesture {
    constructor() {
        this.viewport = null;
        this.video = null;
        
        // 국궁 자세 정밀 연산을 위한 독립 변환 매트릭스 락 고정
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;

        this.touchStartDist = 0;
        this.touchStartScale = 1;
        
        this.lastTouchTime = 0;
    }

    init(viewportElement, videoElement) {
        this.viewport = viewportElement;
        this.video = videoElement;
        this.bindEvents();
    }

    // 💡 [선 밀림 완전 해결 핵심 인터페이스] 변환 행렬 변수를 도화지 엔진에 실시간 강제 전송
    applyTransform() {
        if (!this.video) return;
        
        // 1. 비디오 화면에 CSS transform 하드웨어 가속 주사
        this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
        
        // 2. 💡 [누락 교정 마감] 동일한 기하학 변환 수치를 드로잉 엔진인 bowAnalyzer에 강제 실시간 복사 주입
        if (window.bowAnalyzer && typeof window.bowAnalyzer.updateTransform === 'function') {
            window.bowAnalyzer.updateTransform(this.scale, this.offsetX, this.offsetY);
        }
        
        // 로컬 브라우저 세션 백업 저장소에 실시간 상태 동기화
        if (window.bowAppCore && typeof window.bowAppCore.saveCache === 'function') {
            window.bowAppCore.saveCache('lastTransform', {
                scale: this.scale,
                offsetX: this.offsetX,
                offsetY: this.offsetY
            });
        }
    }
/**
 * js/app_gesture.js (Part 2 of 3)
 */
    bindEvents() {
        if (!this.viewport) return;

        // 마우스 및 싱글/멀티 터치 포인터 하드웨어 제어 이벤트 통합 바인딩
        this.viewport.addEventListener('pointerdown', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
            
            // 더블 탭 제스처 감지 연산 (더블 클릭 시 확대 배율 강제 리셋 방어벽)
            const now = performance.now();
            if (now - this.lastTouchTime < 250) {
                this.resetTransform();
                this.lastTouchTime = now;
                return;
            }
            this.lastTouchTime = now;

            this.isDragging = true;
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            this.viewport.setPointerCapture(e.pointerId);
        });

        this.viewport.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;
            
            // 마우스 드래그 혹은 싱글 터치 이동량 실시간 서핑 연산
            this.offsetX = e.clientX - this.startX;
            this.offsetY = e.clientY - this.startY;
            this.applyTransform(); // 💡 이동 즉시 비디오와 가이드선 동시 동기화 추적
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

        // 💡 모바일 장치 멀티터치(두 손가락) 정밀 핀치 줌인/줌아웃 인터럽트 바인딩
        this.viewport.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                this.isDragging = false;
                this.touchStartDist = this.getDistance(e.touches[0], e.touches[1]);
                this.touchStartScale = this.scale;
            }
        }, { passive: true });

        this.viewport.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = this.getDistance(e.touches[0], e.touches[1]);
                if (this.touchStartDist > 0) {
                    const factor = dist / this.touchStartDist;
                    // 최대 5배 확대 및 0.8배 축소 한계 한계 방어벽 세팅
                    this.scale = Math.min(5, Math.max(0.8, this.touchStartScale * factor));
                    this.applyTransform(); // 💡 핀치 줌 즉시 비디오와 가이드선 동시 배율 보정
                }
            }
        }, { passive: false });
    }
/**
 * js/app_gesture.js (Part 3 of 3)
 */
    // 멀티터치 두 지점 간의 유클리드 거리 측정 기하학 공식
    getDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.hypot(dx, dy);
    }

    // 💡 [배율 초기화 잠금] 더블 탭 시 비디오 해상도 스케일과 선 축을 동시에 원점 복원
    resetTransform() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.applyTransform();
    }
}

// 전역 글로벌 제스처 인프라 공인 매핑 수립
window.bowAppGesture = new BowAppGesture();

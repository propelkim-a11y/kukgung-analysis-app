/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 하드웨어 가속 제스처 엔진 (기하학 변환 행렬 대통합 버전)
 */

class BowAppGesture {
    constructor() {
        this.viewport = null;
        this.video = null;
        
        // 💡 [기하학 평형화] 변환 행렬의 정밀도를 네이티브 앱 수준으로 고정 수립
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        this.isDragging = false;
        
        // 드래그 및 핀치 줌 연산용 하드웨어 센서 터치 스냅샷 변수군
        this.startX = 0;
        this.startY = 0;
        this.baseOffsetX = 0;
        this.baseOffsetY = 0;

        this.touchStartDist = 0;
        this.touchStartScale = 1;
        this.lastTouchTime = 0;
    }

    init(viewportElement, videoElement) {
        this.viewport = viewportElement;
        this.video = videoElement;
        this.bindEvents();
    }

    // 💡 [매트릭스 대통합] 비디오 CSS 변환과 드로잉 캔버스 축을 1나노초의 오차도 없이 일체형으로 즉시 사상
    applyTransform() {
        if (!this.video) return;

        // 1. 하드웨어 가속 비디오 매트릭스 즉각 주사
        this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
        this.video.style.transformOrigin = "0 0"; // 기하학 중심축 연산 무결성을 위해 좌상단 원점 락 고정

        // 2. 💡 동기식 다이렉트 파이프라인을 가동하여 드로잉 엔진 bowAnalyzer 축 실시간 강제 재정렬
        if (window.bowAnalyzer && typeof window.bowAnalyzer.updateTransform === 'function') {
            window.bowAnalyzer.updateTransform(this.scale, this.offsetX, this.offsetY);
        }
        
        // 브라우저 샌드박스 안전 복원 세션 데이터베이스 캐시 스냅샷 영구 저장
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

        // 마우스 및 싱글 터치 포인터 이동 행렬 추적 바인딩
        this.viewport.addEventListener('pointerdown', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            // 더블 탭 감지 (배율 원점 강제 초기화 락 쉴드)
            const now = performance.now();
            if (now - this.lastTouchTime < 250) {
                this.resetTransform();
                this.lastTouchTime = now;
                return;
            }
            this.lastTouchTime = now;

            this.isDragging = true;
            
            // 💡 [원점 튕김 완전 해결] 손을 대는 순간 현재 물리 오프셋 상태를 기준축으로 완벽 동결
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.baseOffsetX = this.offsetX;
            this.baseOffsetY = this.offsetY;
            
            this.viewport.setPointerCapture(e.pointerId);
        });

        this.viewport.addEventListener('pointermove', (e) => {
            if (!this.isDragging) return;
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            // 내 손가락이 화면 위에서 움직인 물리적 순수 거리(Delta) 계산
            const deltaX = e.clientX - this.startX;
            const deltaY = e.clientY - this.startY;
            
            // 💡 [이동 뜀 완벽 해결] 확대배율 상관없이 내 손가락 속도와 화면 무빙 속도를 1:1 절대값으로 매칭
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

        // 💡 모바일 표준 멀티터치(두 손가락) 정밀 핀치 줌 중심점(Pivot) 대개조 부
        this.viewport.addEventListener('touchstart', (e) => {
            if (window.bowAnalyzer && window.bowAnalyzer.toolMode === 'draw') return;

            if (e.touches.length === 2) {
                this.isDragging = false;
                this.touchStartDist = this.getDistance(e.touches);
                this.touchStartScale = this.scale;
                
                // 핀치 줌이 일어나는 찰나의 베이스 좌표축 완벽 백업 동결
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
                    // 💡 [어지러움 완전 박멸] 두 손가락 정중앙의 실시간 픽셀 좌표를 절대 피벗 축으로 역산 추출
                    const centerX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
                    const centerY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
                    
                    // 💡 표준 3x3 기하학 변환 매트릭스 공식 주사 (손가락 사이에서 비디오와 선이 분리되는 오차 박멸)
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

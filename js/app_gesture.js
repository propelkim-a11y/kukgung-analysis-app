/**
 * js/app_gesture.js (Part 1 of 3)
 * 국궁 자세 분석 시스템 - 하드웨어 가속 프레임 잠금 제스처 엔진 (끊김 방지 완결판)
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

        // 💡 [버벅임 박멸 핵심 장치] 하드웨어 가속 타이밍 동기화 제어 플래그
        this.isTransformPending = false;
    }

    init(viewportElement, videoElement) {
        this.viewport = viewportElement;
        this.video = videoElement;
        this.bindEvents();
    }

    // 💡 [프레임 동기화 패치] requestAnimationFrame 연동으로 불필요한 무제한 렌더링 락 전면 차단
    applyTransform() {
        if (!this.video) return;
        
        // 이미 주사 대기중인 프레임 트랙이 있다면 중복 요청을 취소하고 예약 대기
        if (this.isTransformPending) return;
        this.isTransformPending = true;

        // 디스플레이 장치 디바이스의 실제 화면 갱신 주기에 맞춰 정확히 단 1번만 연사 실행
        requestAnimationFrame(() => {
            if (!this.video) {
                this.isTransformPending = false;
                return;
            }

            // 1. 비디오 엘리먼트 가속 매트릭스 주사
            this.video.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
            
            // 2. 드로잉 도화지 엔진 실시간 행렬 변수 전달 동기화
            if (window.bowAnalyzer && typeof window.bowAnalyzer.updateTransform === 'function') {
                window.bowAnalyzer.updateTransform(this.scale, this.offsetX, this.offsetY);
            }
            
            // 데이터베이스 영구 세션 임시 스냅샷 백업
            if (window.bowAppCore && typeof window.bowAppCore.saveCache === 'function') {
                window.bowAppCore.saveCache('lastTransform', {
                    scale: this.scale,
                    offsetX: this.offsetX,
                    offsetY: this.offsetY
                });
            }

            // 프레임 주사가 안전하게 종료되었으므로 다음 제스처 예약 락 해제
            this.isTransformPending = false;
        });
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
            this.applyTransform(); // 💡 하드웨어 프레임 락이 걸린 안전 동기화 호출
        });

        const stopDrag = (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                try { this.viewport.releasePointerCapture(e.pointerId); } catch(err) {}
            }
        };

        this.viewport.addEventListener('pointerup', stopStopDrag);
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
                    // 최대 5배 확대 및 0.8배 축소 한계 방어벽 세팅
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
        // 배열과 객체 참조를 안전하게 통제하기 위해 첫 번째와 두 번째 터치 지점을 명확히 인덱싱
        const p1 = t1[0];
        const p2 = t2[1] || t1[1];
        if (!p1 || !p2) return 0;
        
        const dx = p1.clientX - p2.clientX;
        const dy = p1.clientY - p2.clientY;
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

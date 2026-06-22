/**
 * analyzer.js
 * 캔버스 터치/클릭 드로잉 및 두 선 사이의 정밀 각도 분석 엔진
 */

export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        
        this.points = []; // 사용자가 클릭한 좌표 저장 (최대 4개 = 선 2개)
    }

    init() {
        if (!this.canvas || !this.ctx) {
            console.error("분석용 drawing-canvas를 찾을 수 없습니다.");
            return;
        }

        // 기존 마운트된 리스너 오버랩 방지를 위해 초기화 후 재등록
        this.canvas.replaceWith(this.canvas.cloneNode(true));
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas.getContext('2d');

        // 마우스 및 터치 이벤트 통합 바인딩 (PC/모바일 공용)
        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        this.canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        
        console.log("📐 국궁 자세 각도 분석기(analyzer.js) 장치 마운트 완료.");
    }

    // 캔버스 크기 대비 실제 해상도 좌표 보정 공식 (중요: 선 빗나감 방지)
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;

        // 모바일 터치 이벤트 좌표 대응
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        return {
            x: (clientX - rect.left) * (this.canvas.width / rect.width),
            y: (clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    handleStart(e) {
        if (e.cancelable) e.preventDefault(); // 모바일 스크롤 바인딩 차단
        
        const coord = this.getCanvasCoordinates(e);
        
        if (this.points.length >= 4) {
            // 이미 선이 2개 다 그려졌다면 클릭 시 초기화 후 다시 시작
            this.clear();
        }

        this.points.push(coord);
        this.draw();

        // 상태 안내 배지 텍스트 업데이트
        if (this.points.length === 1) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = "첫 번째 선의 끝점을 선택하세요.";
        } else if (this.points.length === 2) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = "두 번째 선의 시작점을 선택하세요.";
        } else if (this.points.length === 3) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = "두 번째 선의 끝점을 선택하세요.";
        } else if (this.points.length === 4) {
            this.calculateAngle();
        }
    }

    // 화면 선 그리기 프로세스
    draw() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 해상도 비례 선 두께 반응형 설정 (너무 얇게 나오는 현상 방지)
        this.ctx.lineWidth = Math.max(5, this.canvas.width * 0.006); 
        this.ctx.lineCap = 'round';

        // 1. 첫 번째 선 렌더링 (빨간색 - 기준선/시위 등)
        if (this.points.length >= 1) {
            this.drawMarker(this.points[0], '#ff3b30');
        }
        if (this.points.length >= 2) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#ff3b30';
            this.ctx.moveTo(this.points[0].x, this.points[0].y);
            this.ctx.lineTo(this.points[1].x, this.points[1].y);
            this.ctx.stroke();
            this.drawMarker(this.points[1], '#ff3b30');
        }

        // 2. 두 번째 선 렌더링 (파란색 - 팔 각도/화살 고각 등)
        if (this.points.length >= 3) {
            this.drawMarker(this.points[2], '#007aff');
        }
        if (this.points.length >= 4) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#007aff';
            this.ctx.moveTo(this.points[2].x, this.points[2].y);
            this.ctx.lineTo(this.points[3].x, this.points[3].y);
            this.ctx.stroke();
            this.drawMarker(this.points[3], '#007aff');
        }
    }

    // 터치 포인트 시각화 노드 마커
    drawMarker(pt, color) {
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, Math.max(10, this.canvas.width * 0.01), 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
    }

    // 삼각함수 내적 벡터를 이용한 두 직선의 예각 산출 수식
    calculateAngle() {
        if (this.points.length < 4) return;

        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2];
        const p4 = this.points[3];

        // 직선 벡터 추출
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const v2 = { x: p4.x - p3.x, y: p4.y - p3.y };

        // 벡터 내적과 크기 계산
        const dotProduct = v1.x * v2.x + v1.y * v2.y;
        const dist1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const dist2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (dist1 === 0 || dist2 === 0) return;

        let cosTheta = dotProduct / (dist1 * dist2);
        
        // 부동소수점 연산 오차 한계값 필터링
        cosTheta = Math.min(1.0, Math.max(-1.0, cosTheta));

        const angleRad = Math.acos(cosTheta);
        let angleDeg = angleRad * (180 / Math.PI);

        // 국궁 궁체 각도 분석 특성을 고려해 상호 예각(90도 이하) 기준으로 자동 매핑
        if (angleDeg > 90) {
            angleDeg = 180 - angleDeg; 
        }

        const finalAngle = Math.round(angleDeg);

        // 결과 UI 바인딩
        if (this.angleDisplay) this.angleDisplay.innerText = `${finalAngle}°`;
        if (this.badgeDisplay) this.badgeDisplay.innerText = "분석 완료! 🔄 화면 터치 시 초기화됩니다.";
    }

    clear() {
        this.points = [];
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.angleDisplay) this.angleDisplay.innerText = '0°';
        if (this.badgeDisplay) this.badgeDisplay.innerText = "두 선을 선택하세요.";
    }
}

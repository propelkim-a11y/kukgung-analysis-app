export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        
        // 무제한 선 긋기 추적용 좌표 배열
        this.points = []; 
        
        // 피치 투 줌(확대/축소) 및 이동 변수 선언
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.lastTouchDist = 0; 
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        this.canvas.replaceWith(this.canvas.cloneNode(true));
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas.getContext('2d');

        // PC 마우스 제스처 이벤트 매핑
        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
        window.addEventListener('mouseup', () => this.isDragging = false);

        // 모바일 터치 제스처 이벤트 매핑 (멀티터치 포함)
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', () => { this.isDragging = false; this.lastTouchDist = 0; });

        this.draw();
    }

    // 줌 배율(scale)과 드래그 이동 위치를 고려한 해상도 정밀 보정 공식 (선 빗나감 방지)
    getCanvasCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = (clientX - rect.left) * (this.canvas.width / rect.width);
        const screenY = (clientY - rect.top) * (this.canvas.height / rect.height);
        
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    handleStart(e) {
        if (e.button === 2 || e.ctrlKey) { // 마우스 우클릭 또는 Ctrl+클릭 시 화면 이동 드래그 가동
            this.isDragging = true;
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            return;
        }
        const coord = this.getCanvasCoordinates(e.clientX, e.clientY);
        this.points.push(coord);
        this.draw();
        this.calculateAngles();
    }

    handleMove(e) {
        if (!this.isDragging) return;
        this.offsetX = e.clientX - this.startX;
        this.offsetY = e.clientY - this.startY;
        this.draw();
    }

    handleTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 2) { // 손가락 2개 터치 시 피치 줌 작동
            this.lastTouchDist = this.getTouchDistance(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            // 확대된 상태에서 한 손가락 이동 터치 시 화면 스크롤 처리
            if (this.scale > 1.0) {
                this.isDragging = true;
                this.startX = e.touches[0].clientX - this.offsetX;
                this.startY = e.touches[0].clientY - this.offsetY;
            } else {
                const coord = this.getCanvasCoordinates(e.touches[0].clientX, e.touches[0].clientY);
                this.points.push(coord);
                this.draw();
                this.calculateAngles();
            }
        }
    }

    handleTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 2 && this.lastTouchDist > 0) {
            const dist = this.getTouchDistance(e.touches[0], e.touches[1]);
            const factor = dist / this.lastTouchDist;
            this.scale = Math.min(5.0, Math.max(1.0, this.scale * factor)); // 최대 5배 확대 한계점 설정
            this.lastTouchDist = dist;
            this.draw();
        } else if (e.touches.length === 1 && this.isDragging) {
            this.offsetX = e.touches[0].clientX - this.startX;
            this.offsetY = e.touches[0].clientY - this.startY;
            this.draw();
        }
    }

    getTouchDistance(t1, t2) {
        return Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
    }

    draw() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        // 피치 투 줌 행렬 변환 매트릭스 적용
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // 🔥 [요구사항 반영] 비디오 프레임이 바뀌어도 지워지지 않는 기본 상시 점선 십자선 그리드 가이드
        this.ctx.lineWidth = 1.5 / this.scale;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; 
        this.ctx.setLineDash([8 / this.scale, 8 / this.scale]); 
        
        // 가상 도화지 정중앙에 상시 크로스라인 투사
        this.ctx.beginPath(); this.ctx.moveTo(0, this.canvas.height / 2); this.ctx.lineTo(this.canvas.width, this.canvas.height / 2); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(this.canvas.width / 2, 0); this.ctx.lineTo(this.canvas.width / 2, this.canvas.height); this.ctx.stroke();
        this.ctx.setLineDash([]); 

        // 무제한 사용자 마크 렌더링 파이프라인
        this.ctx.lineCap = 'round';
        for (let i = 0; i < this.points.length; i++) {
            const isEvenPair = Math.floor(i / 2) % 2 === 0;
            const color = isEvenPair ? '#ff3b30' : '#007aff';
            
            // 🔥 [요구사항 반영] 조준 가시성 확보를 위해 동그라미 점 크기를 정밀하게 축소 보정
            this.ctx.beginPath();
            this.ctx.arc(this.points[i].x, this.points[i].y, 4 / this.scale, 0, Math.PI * 2);
            this.ctx.fillStyle = color; this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 1.2 / this.scale; this.ctx.stroke();

            // 점 2개당 1개의 개별 선으로 부드럽게 이음
            if (i % 2 === 1) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 3 / this.scale;
                this.ctx.moveTo(this.points[i-1].x, this.points[i-1].y);
                this.ctx.lineTo(this.points[i].x, this.points[i].y);
                this.ctx.stroke();
            }
        }
        this.ctx.restore();
    }

    // 🔥 [요구사항 반영] 선을 여러 개 그어도 가장 최신 선 2개를 추적해 사잇각 소수점 첫째 자리 연산 (.toFixed(1))
    calculateAngles() {
        const len = this.points.length;
        if (len < 4 || len % 2 !== 0) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = `분석 중... (그어진 선 개수: ${Math.floor(len / 2)}개)`;
            return;
        }

        const p1 = this.points[len - 4];
        const p2 = this.points[len - 3];
        const p3 = this.points[len - 2];
        const p4 = this.points[len - 1];

        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const v2 = { x: p4.x - p3.x, y: p4.y - p3.y };

        const dotProduct = v1.x * v2.x + v1.y * v2.y;
        const dist1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const dist2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (dist1 === 0 || dist2 === 0) return;
        let cosTheta = Math.min(1.0, Math.max(-1.0, dotProduct / (dist1 * dist2)));
        let angleDeg = Math.acos(cosTheta) * (180 / Math.PI);

        if (angleDeg > 90) angleDeg = 180 - angleDeg;

        // 소수점 첫째 자리 표기 출력 강제화 적용
        const finalAngle = angleDeg.toFixed(1);
        if (this.angleDisplay) this.angleDisplay.innerText = `${finalAngle}°`;
        if (this.badgeDisplay) this.badgeDisplay.innerText = "분석 완료! 선을 계속 이어서 그릴 수 있습니다.";
    }

    clear() {
        this.points = [];
        this.scale = 1.0; this.offsetX = 0; this.offsetY = 0; 
        this.draw();
        if (this.angleDisplay) this.angleDisplay.innerText = '0.0°';
        if (this.badgeDisplay) this.badgeDisplay.innerText = "두 선을 선택하세요.";
    }
}

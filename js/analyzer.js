export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        this.points = []; 
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        this.canvas.replaceWith(this.canvas.cloneNode(true));
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        this.canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
    }

    // 캔버스 박스 크기 비율을 대입하여 모바일 터치 선 어긋남 원천 방지 공식 적용
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;

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
        if (e.cancelable) e.preventDefault();
        const coord = this.getCanvasCoordinates(e);
        
        if (this.points.length >= 4) this.clear();

        this.points.push(coord);
        this.draw();

        if (this.points.length === 1 && this.badgeDisplay) this.badgeDisplay.innerText = "첫 번째 선의 끝점을 선택하세요.";
        else if (this.points.length === 2 && this.badgeDisplay) this.badgeDisplay.innerText = "두 번째 선의 시작점을 선택하세요.";
        else if (this.points.length === 3 && this.badgeDisplay) this.badgeDisplay.innerText = "두 번째 선의 끝점을 선택하세요.";
        else if (this.points.length === 4) this.calculateAngle();
    }

    draw() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.lineWidth = Math.max(6, this.canvas.width * 0.006); 
        this.ctx.lineCap = 'round';

        if (this.points.length >= 1) this.drawMarker(this.points[0], '#ff3b30');
        if (this.points.length >= 2) {
            this.ctx.beginPath(); this.ctx.strokeStyle = '#ff3b30';
            this.ctx.moveTo(this.points[0].x, this.points[0].y); this.ctx.lineTo(this.points[1].x, this.points[1].y); this.ctx.stroke();
            this.drawMarker(this.points[1], '#ff3b30');
        }
        if (this.points.length >= 3) this.drawMarker(this.points[2], '#007aff');
        if (this.points.length >= 4) {
            this.ctx.beginPath(); this.ctx.strokeStyle = '#007aff';
            this.ctx.moveTo(this.points[2].x, this.points[2].y); this.ctx.lineTo(this.points[3].x, this.points[3].y); this.ctx.stroke();
            this.drawMarker(this.points[3], '#007aff');
        }
    }

    drawMarker(pt, color) {
        this.ctx.beginPath(); this.ctx.arc(pt.x, pt.y, Math.max(12, this.canvas.width * 0.012), 0, Math.PI * 2);
        this.ctx.fillStyle = color; this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 3; this.ctx.stroke();
    }

    calculateAngle() {
        if (this.points.length < 4) return;
        const [p1, p2, p3, p4] = this.points;

        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const v2 = { x: p4.x - p3.x, y: p4.y - p3.y };

        const dotProduct = v1.x * v2.x + v1.y * v2.y;
        const dist1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const dist2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (dist1 === 0 || dist2 === 0) return;
        let cosTheta = Math.min(1.0, Math.max(-1.0, dotProduct / (dist1 * dist2)));
        let angleDeg = Math.acos(cosTheta) * (180 / Math.PI);

        if (angleDeg > 90) angleDeg = 180 - angleDeg;

        const finalAngle = Math.round(angleDeg);
        if (this.angleDisplay) this.angleDisplay.innerText = `${finalAngle}°`;
        if (this.badgeDisplay) this.badgeDisplay.innerText = "분석 완료! 🔄 화면 터치 시 초기화됩니다.";
    }

    clear() {
        this.points = [];
        if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.angleDisplay) this.angleDisplay.innerText = '0°';
        if (this.badgeDisplay) this.badgeDisplay.innerText = "두 선을 선택하세요.";
    }
}

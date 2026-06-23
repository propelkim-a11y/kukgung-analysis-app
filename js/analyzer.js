/**
 * analyzer.js
 * 렉 제거 최적화, 비디오 원본 비율 보존 및 자유 확대/축소 다중 분석 엔진
 */

export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        
        this.points = []; // 무제한 다중 선 긋기 좌표 배열
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.lastTouchDist = 0; 
        this.toolMode = 'draw'; 
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        // 기존 등록자 안전 제거 후 1회 재등록 (이벤트 꼬임 원천 차단)
        this.canvas.removeEventListener('mousedown', this.boundHandleStart);
        this.canvas.removeEventListener('mousemove', this.boundHandleMove);
        this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart);
        this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove);

        this.boundHandleStart = (e) => this.handleStart(e);
        this.boundHandleMove = (e) => this.handleMove(e);
        this.boundHandleTouchStart = (e) => this.handleTouchStart(e);
        this.boundHandleTouchMove = (e) => this.handleTouchMove(e);

        this.canvas.addEventListener('mousedown', this.boundHandleStart);
        this.canvas.addEventListener('mousemove', this.boundHandleMove);
        
        this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
        
        const endDrag = () => { this.isDragging = false; this.lastTouchDist = 0; };
        window.addEventListener('mouseup', endDrag);
        this.canvas.addEventListener('touchend', endDrag);

        this.draw();
    }

    setToolMode(mode) {
        this.toolMode = mode; 
        this.isDragging = false;
    }

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
        if (this.toolMode === 'move' || e.button === 2 || e.ctrlKey) { 
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
}
    handleTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        
        if (e.touches.length === 2) { 
            this.lastTouchDist = this.getTouchDistance(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            if (this.toolMode === 'move') { 
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
            this.scale = Math.min(5.0, Math.max(1.0, this.scale * factor)); 
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
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // 1. 백그라운드 영상 프레임 렌더링
        const v = window.analysisVideo;
        if (v && v.videoWidth > 0) {
            const vRatio = v.videoWidth / v.videoHeight;
            const cRatio = this.canvas.width / this.canvas.height;
            let drawW = this.canvas.width;
            let drawH = this.canvas.height;
            let drawX = 0;
            let drawY = 0;

            if (vRatio > cRatio) {
                drawH = this.canvas.width / vRatio;
                drawY = (this.canvas.height - drawH) / 2;
            } else {
                drawW = this.canvas.height * vRatio;
                drawX = (this.canvas.width - drawW) / 2;
            }
            this.ctx.drawImage(v, drawX, drawY, drawW, drawH);
        }

        // 2. 상시 고정 격자 십자가선 투사
        this.ctx.lineWidth = 1.5 / this.scale;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; 
        this.ctx.setLineDash([8 / this.scale, 8 / this.scale]); 
        
        this.ctx.beginPath(); this.ctx.moveTo(0, this.canvas.height / 2); this.ctx.lineTo(this.canvas.width, this.canvas.height / 2); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(this.canvas.width / 2, 0); this.ctx.lineTo(this.canvas.width / 2, this.canvas.height); this.ctx.stroke();
        this.ctx.setLineDash([]); 

        // 3. 사용자 무제한 다중 선 렌더 루프
        this.ctx.lineCap = 'round';
        for (let i = 0; i < this.points.length; i++) {
            const isEvenPair = Math.floor(i / 2) % 2 === 0;
            const color = isEvenPair ? '#ff3b30' : '#007aff'; 
            
            this.ctx.beginPath();
            this.ctx.arc(this.points[i].x, this.points[i].y, 4 / this.scale, 0, Math.PI * 2);
            this.ctx.fillStyle = color; this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 1.2 / this.scale; this.ctx.stroke();

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

    calculateAngles() {
        const len = this.points.length;
        if (len < 4 || len % 2 !== 0) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = `선 배치 상태: ${Math.floor(len / 2)}개 완료`;
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

        const finalAngle = angleDeg.toFixed(1);
        if (this.angleDisplay) this.angleDisplay.innerText = `${finalAngle}°`;
        if (this.badgeDisplay) this.badgeDisplay.innerText = "연산 성공! 선을 이어서 계속 작도 가능합니다.";
    }

    clear() {
        this.points = [];
        this.scale = 1.0; this.offsetX = 0; this.offsetY = 0; 
        this.draw();
        if (this.angleDisplay) this.angleDisplay.innerText = '0.0°';
        if (this.badgeDisplay) this.badgeDisplay.innerText = "분석 대기 중";
    }
}

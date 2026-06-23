/**
 * analyzer.js
 * 스타일러스 펜(S펜, 애플펜슬) 최적화, 정밀 격자 그리드 및 렉 제거 다중 분석 엔진
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
        
        // 스타일러스 펜 인식을 위한 포인터 상태 추적 맵
        this.activePointers = new Map();
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        this.canvas.removeEventListener('pointerdown', this.boundHandlePointerDown);
        this.canvas.removeEventListener('pointermove', this.boundHandlePointerMove);
        this.canvas.removeEventListener('pointerup', this.boundHandlePointerUp);
        this.canvas.removeEventListener('pointercancel', this.boundHandlePointerUp);

        this.boundHandlePointerDown = (e) => this.handlePointerDown(e);
        this.boundHandlePointerMove = (e) => this.handlePointerMove(e);
        this.boundHandlePointerUp = (e) => this.handlePointerUp(e);

        this.canvas.addEventListener('pointerdown', this.boundHandlePointerDown);
        this.canvas.addEventListener('pointermove', this.boundHandlePointerMove);
        this.canvas.addEventListener('pointerup', this.boundHandlePointerUp);
        this.canvas.addEventListener('pointercancel', this.boundHandlePointerUp);

        this.canvas.removeEventListener('wheel', this.boundHandleWheel);
        this.boundHandleWheel = (e) => this.handleWheel(e);
        this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false });

        this.draw();
    }

    setToolMode(mode) {
        this.toolMode = mode; 
        this.isDragging = false;
        this.activePointers.clear();
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

    handlePointerDown(e) {
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, e);

        const pointerType = e.pointerType; 
        
        if (this.activePointers.size === 2) {
            const pointers = Array.from(this.activePointers.values());
            this.lastTouchDist = this.getPointerDistance(pointers, pointers);
            return;
        }

        if (this.toolMode === 'move' || e.button === 2) { 
            this.isDragging = true;
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            return;
        }

        if (this.toolMode === 'draw') {
            if (pointerType === 'touch' && this.hasPenActive()) return;

            const coord = this.getCanvasCoordinates(e.clientX, e.clientY);
            this.points.push(coord);
            this.draw();
            this.calculateAngles();
        }
    }

    hasPenActive() {
        for (const p of this.activePointers.values()) {
            if (p.pointerType === 'pen') return true;
        }
        return false;
    }
    handlePointerMove(e) {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, e); 

        if (this.activePointers.size === 2 && this.lastTouchDist > 0) {
            const pointers = Array.from(this.activePointers.values());
            const dist = this.getPointerDistance(pointers, pointers);
            const factor = dist / this.lastTouchDist;
            this.scale = Math.min(5.0, Math.max(1.0, this.scale * factor)); 
            this.lastTouchDist = dist;
            this.draw();
            return;
        }

        if (this.isDragging) {
            this.offsetX = e.clientX - this.startX;
            this.offsetY = e.clientY - this.startY;
            this.draw();
        }
    }

    handlePointerUp(e) {
        this.activePointers.delete(e.pointerId);
        if (this.activePointers.size < 2) {
            this.lastTouchDist = 0;
        }
        this.isDragging = false;
    }

    handleWheel(e) {
        e.preventDefault();
        const zoomFactor = 1.1;
        if (e.deltaY < 0) {
            this.scale = Math.min(5.0, Math.scale * zoomFactor || this.scale * zoomFactor);
        } else {
            this.scale = Math.max(1.0, this.scale / zoomFactor);
        }
        this.draw();
    }

    getPointerDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.clientX - p1.clientX, 2) + Math.pow(p2.clientY - p1.clientY, 2));
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

        // ⚡ 2. [신설] 척추선 및 화살 수평 상태 계측용 '바둑판 정밀 격자 그리드(Grid)' 엔진 기동
        this.ctx.lineWidth = 1.0 / this.scale;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; // 방해되지 않는 은은한 그리드선
        
        // 가로선 촘촘하게 제도 (50픽셀 간격 바둑판)
        const gridSize = 50;
        this.ctx.beginPath();
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
        }
        // 세로선 촘촘하게 제도
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }
        this.ctx.stroke();

        // 3. 상시 고정 센터 십자 기준선 투사 (그리드보다 조금 더 진하게 연출)
        this.ctx.lineWidth = 1.5 / this.scale;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; 
        this.ctx.setLineDash([8 / this.scale, 8 / this.scale]); 
        
        this.ctx.beginPath(); this.ctx.moveTo(0, this.canvas.height / 2); this.ctx.lineTo(this.canvas.width, this.canvas.height / 2); this.ctx.stroke();
        this.ctx.beginPath(); this.ctx.moveTo(this.canvas.width / 2, 0); this.ctx.lineTo(this.canvas.width / 2, this.canvas.height); this.ctx.stroke();
        this.ctx.setLineDash([]); 

        // 4. 사용자 무제한 다중 선 렌더 루프
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

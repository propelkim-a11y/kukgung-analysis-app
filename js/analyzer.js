/**
 * js/analyzer.js
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템 (4단계)
 * - S펜 / 애플펜슬 Palm Rejection 및 포인터 분리
 * - 줌/이동 변환 행렬 역산 (확대 상태에서도 정확한 조준점 매핑)
 * - [디자인 시스템 패치] 선의 두께는 얇게 유지하되, 다크 모드 시인성을 확보한 투명 블루 그리드 사출
 */

class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        
        this.lines = []; 
        this.currentLine = null;

        this.transform = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };

        this.toolMode = 'move'; 

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
    }

    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.setupPointerEvents();
    }

    updateTransform(scale, offsetX, offsetY) {
        this.transform.scale = scale;
        this.transform.offsetX = offsetX;
        this.transform.offsetY = offsetY;
        this.render();
    }

    setMode(mode) {
        this.toolMode = mode;
    }

    clearLines() {
        this.lines = [];
        this.currentLine = null;
        this.render();
        this.broadcastAngle(0);
    }

    setupPointerEvents() {
        if (!this.canvas) return;
        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    }

    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const clientX = (event.clientX - rect.left) * scaleX;
        const clientY = (event.clientY - rect.top) * scaleY;

        const canvasX = (clientX - (this.transform.offsetX * scaleX)) / this.transform.scale;
        const canvasY = (clientY - (this.transform.offsetY * scaleY)) / this.transform.scale;

        return { x: canvasX, y: canvasY };
    }

    handlePointerDown(event) {
        if (this.toolMode !== 'draw') return;

        if (event.pointerType === 'touch' && event.touchType === 'direct' && window.isStylusActive) {
            return; 
        }
        if (event.pointerType === 'pen') {
            window.isStylusActive = true;
        }

        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);

        this.currentLine = {
            start: { x: coords.x, y: coords.y },
            end: { x: coords.x, y: coords.y }
        };
    }

    handlePointerMove(event) {
        if (this.toolMode !== 'draw' || !this.currentLine) return;

        const coords = this.getCanvasCoordinates(event);
        this.currentLine.end = { x: coords.x, y: coords.y };
        
        this.render();
        this.calculateAnglesInline();
    }

    handlePointerUp(event) {
        if (event.pointerType === 'pen') {
            setTimeout(() => { window.isStylusActive = false; }, 500);
        }

        if (this.toolMode !== 'draw' || !this.currentLine) return;

        const dist = Math.hypot(this.currentLine.end.x - this.currentLine.start.x, this.currentLine.end.y - this.currentLine.start.y);
        if (dist > 5) {
            this.lines.push(this.currentLine);
        }
        
        this.currentLine = null;
        this.render();
        this.calculateFinalAngle();
    }

    calculateAnglesInline() {
        if (this.lines.length === 0 && this.currentLine) {
            const angle = this.getLineAngle(this.currentLine);
            this.broadcastAngle(angle);
        } else if (this.lines.length >= 1 && this.currentLine) {
            const angle = this.getIntersectionAngle(this.lines[this.lines.length - 1], this.currentLine);
            this.broadcastAngle(angle);
        }
    }

    calculateFinalAngle() {
        if (this.lines.length >= 2) {
            const line1 = this.lines[this.lines.length - 2];
            const line2 = this.lines[this.lines.length - 1];
            const angle = this.getIntersectionAngle(line1, line2);
            this.broadcastAngle(angle);
        } else if (this.lines.length === 1) {
            const angle = this.getLineAngle(this.lines);
            this.broadcastAngle(angle);
        }
    }

    getLineAngle(line) {
        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;

        const dx = line.end.x - line.start.x;
        const dy = (line.end.y - line.start.y) * aspectCorrection;

        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle % 180;
    }

    getIntersectionAngle(line1, line2) {
        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;

        const angle1 = Math.atan2(-(line1.end.y - line1.start.y) * aspectCorrection, line1.end.x - line1.start.x);
        const angle2 = Math.atan2(-(line2.end.y - line2.start.y) * aspectCorrection, line2.end.x - line2.start.x);
        
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }

    broadcastAngle(angle) {
        const angleEvent = new CustomEvent('bowAngleUpdate', {
            detail: { angle: angle.toFixed(1) }
        });
        window.dispatchEvent(angleEvent);
    }

    /**
     * 💡 [디자인 시스템 피드백 보정] 
     * 선의 굵기(0.75px)는 얇게 유지하여 화면 왜곡을 방지하되,
     * 다크 블랙 배경 위에서 은은하고 세련되게 검출되는 애플 시그니처 딤 화이트 컬러 매핑
     */
    drawBackgroundGrid(scaleX, scaleY) {
        this.ctx.save();
        
        // 굵기는 아주 얇게 유지 (0.75px)
        this.ctx.lineWidth = (0.75 * scaleX) / this.transform.scale;
        
        // 💡 기존의 너무 낮았던 투명도(0.04)를 선명한 딤 화이트(0.14)로 조정하여 시인성 원천 확보
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'; 

        const gridSize = 50; // 50px 물리 규격 고정
        
        const widthBound = this.canvas.width * 5;
        const heightBound = this.canvas.height * 5;

        // 세로선 그리기
        for (let x = -widthBound; x <= widthBound; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, -heightBound);
            this.ctx.lineTo(x, heightBound);
            this.ctx.stroke();
        }

        // 가로선 그리기
        for (let y = -heightBound; y <= heightBound; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(-widthBound, y);
            this.ctx.lineTo(widthBound, y);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    render() {
        if (!this.ctx || !this.canvas) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        this.ctx.translate(this.transform.offsetX * scaleX, this.transform.offsetY * scaleY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        // 1단계: 동영상 위에 연동되는 50px 정밀 격자선 직접 렌더링
        this.drawBackgroundGrid(scaleX, scaleY);

        // 2단계: 기 확정된 조준선 그리기
        this.ctx.lineWidth = (2 * scaleX) / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';
        this.lines.forEach(line => this.drawSingleLine(line));

        // 3단계: 실시간 드래그 가이드라인 그리기
        if (this.currentLine) {
            this.ctx.strokeStyle = '#FFFF00';
            this.ctx.fillStyle = '#FFFF00';
            this.drawSingleLine(this.currentLine);
        }

        this.ctx.restore();
    }

    drawSingleLine(line) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;

        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x, line.start.y);
        this.ctx.lineTo(line.end.x, line.end.y);
        this.ctx.stroke();

        const radius = (4 * scaleX) / this.transform.scale;
        this.ctx.beginPath();
        this.ctx.arc(line.start.x, line.start.y, radius, 0, 2 * Math.PI);
        this.ctx.arc(line.end.x, line.end.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}

window.bowAnalyzer = new BowAnalyzer();

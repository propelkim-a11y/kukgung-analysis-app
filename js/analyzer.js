/**
 * js/analyzer.js
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템
 * - [교정 완수] 물리 화면 해상도 배율 동기화 패치로 선 짧아짐 버그 즉시 해결
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
        
        // CSS 크기와 캔버스 하드웨어 픽셀 간의 스케일 비율 계산 (짧게 그려지는 오류 핵심 패치)
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const clientX = (event.clientX - rect.left) * scaleX;
        const clientY = (event.clientY - rect.top) * scaleY;

        // 확대/이동 상태와 해상도 스케일을 전방위 결합하여 역산 수행
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
            const angle = this.getLineAngle(this.lines[0]);
            this.broadcastAngle(angle);
        }
    }

    getLineAngle(line) {
        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;
        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle % 180;
    }

    getIntersectionAngle(line1, line2) {
        const angle1 = Math.atan2(-(line1.end.y - line1.start.y), line1.end.x - line1.start.x);
        const angle2 = Math.atan2(-(line2.end.y - line2.start.y), line2.end.x - line2.start.x);
        
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

    render() {
        if (!this.ctx || !this.canvas) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        this.ctx.lineWidth = 2 / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';

        this.lines.forEach(line => this.drawSingleLine(line));

        if (this.currentLine) {
            this.ctx.strokeStyle = '#FFFF00';
            this.ctx.fillStyle = '#FFFF00';
            this.drawSingleLine(this.currentLine);
        }

        this.ctx.restore();
    }

    drawSingleLine(line) {
        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x, line.start.y);
        this.ctx.lineTo(line.end.x, line.end.y);
        this.ctx.stroke();

        const radius = 4 / this.transform.scale;
        this.ctx.beginPath();
        this.ctx.arc(line.start.x, line.start.y, radius, 0, 2 * Math.PI);
        this.ctx.arc(line.end.x, line.end.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}

window.bowAnalyzer = new BowAnalyzer();

/**
 * js/analyzer.js (Part 1 of 2)
 */
class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.lines = []; 
        this.currentLine = null;
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };
        this.toolMode = 'move'; 
        this.snapThreshold = 15; 
        this.isSnapped = false;
        this.lastTapTime = 0;
        this.tapThreshold = 300; 
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
    undoLastLine() {
        if (this.lines.length > 0) {
            this.lines.pop();
            this.render();
            if (this.lines.length >= 2) {
                this.calculateFinalAngle();
            } else if (this.lines.length === 1) {
                this.broadcastAngle(this.getLineAngle(this.lines[0]));
            } else {
                this.broadcastAngle(0);
            }
            return true;
        }
        return false;
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
        const dpr = window.devicePixelRatio || 1;
        const clientX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const clientY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        const canvasX = (clientX - (this.transform.offsetX * dpr)) / this.transform.scale;
        const canvasY = (clientY - (this.transform.offsetY * dpr)) / this.transform.scale;
        return { x: canvasX, y: canvasY };
    }
    handlePointerDown(event) {
        if (this.toolMode !== 'draw') return;
        if (event.pointerType === 'touch' && event.touchType === 'direct' && window.isStylusActive) return;
        if (event.pointerType === 'pen') window.isStylusActive = true;
        event.preventDefault();
        const currentTime = new Date().getTime();
        const tapLength = currentTime - this.lastTapTime;
        this.lastTapTime = currentTime;
        if (tapLength < this.tapThreshold && tapLength > 0) {
            this.currentLine = null;
            const hasUndone = this.undoLastLine();
            if (hasUndone) {
                const undoEvent = new CustomEvent('bowGestureUndo', { detail: { lines: this.lines } });
                window.dispatchEvent(undoEvent);
            }
            return; 
        }
        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);
        let startPt = { x: coords.x, y: coords.y };
        const snappedPt = this.findCloseEndpoint(coords.x, coords.y);
        if (snappedPt) startPt = snappedPt;
        this.currentLine = { start: startPt, end: { x: coords.x, y: coords.y } };
    }
/**
 * js/analyzer.js (Part 2 of 2)
 */
    handlePointerMove(event) {
        if (this.toolMode !== 'draw' || !this.currentLine) return;
        event.preventDefault();
        const coords = this.getCanvasCoordinates(event);
        let targetX = coords.x;
        let targetY = coords.y;
        this.isSnapped = false;
        const snapEndpoint = this.findCloseEndpoint(targetX, targetY);
        if (snapEndpoint) {
            targetX = snapEndpoint.x;
            targetY = snapEndpoint.y;
            this.isSnapped = true;
        } else {
            const adjustedThreshold = this.snapThreshold / this.transform.scale;
            const dx = targetX - this.currentLine.start.x;
            const dy = targetY - this.currentLine.start.y;
            if (Math.abs(dx) < adjustedThreshold) {
                targetX = this.currentLine.start.x;
                this.isSnapped = true;
            } else if (Math.abs(dy) < adjustedThreshold) {
                targetY = this.currentLine.start.y;
                this.isSnapped = true;
            }
        }
        this.currentLine.end = { x: targetX, y: targetY };
        this.render();
        this.calculateAnglesInline();
    }
    handlePointerUp(event) {
        if (event.pointerType === 'pen') {
            setTimeout(() => { window.isStylusActive = false; }, 500);
        }
        if (this.toolMode !== 'draw' || !this.currentLine) return;
        const dist = Math.hypot(this.currentLine.end.x - this.currentLine.start.x, this.currentLine.end.y - this.currentLine.start.y);
        if (dist > (8 / this.transform.scale)) {
            this.lines.push(this.currentLine);
        }
        this.currentLine = null;
        this.isSnapped = false;
        this.render();
        this.calculateFinalAngle();
    }
    findCloseEndpoint(x, y) {
        const adjustedThreshold = this.snapThreshold / this.transform.scale;
        for (let line of this.lines) {
            if (Math.hypot(line.start.x - x, line.start.y - y) < adjustedThreshold) return line.start;
            if (Math.hypot(line.end.x - x, line.end.y - y) < adjustedThreshold) return line.end;
        }
        return null;
    }
    calculateAnglesInline() {
        if (this.lines.length === 0 && this.currentLine) {
            this.broadcastAngle(this.getLineAngle(this.currentLine));
        } else if (this.lines.length >= 1 && this.currentLine) {
            this.broadcastAngle(this.getIntersectionAngle(this.lines[this.lines.length - 1], this.currentLine));
        }
    }
    calculateFinalAngle() {
        if (this.lines.length >= 2) {
            this.broadcastAngle(this.getIntersectionAngle(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1]));
        } else if (this.lines.length === 1) {
            this.broadcastAngle(this.getLineAngle(this.lines));
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
        const angle1 = Math.atan2(-(line1.end.y - line1.start.y) * aspectCorrection, line1.start.x - line1.end.x);
        const angle2 = Math.atan2(-(line2.end.y - line2.start.y) * aspectCorrection, line2.end.x - line2.start.x);
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }
    broadcastAngle(angle) {
        const angleEvent = new CustomEvent('bowAngleUpdate', { detail: { angle: angle.toFixed(1) } });
        window.dispatchEvent(angleEvent);
    }
    drawBackgroundGrid(scaleX) {
        this.ctx.save();
        const dpr = window.devicePixelRatio || 1;
        this.ctx.lineWidth = (0.75 * scaleX) / this.transform.scale;
        this.ctx.strokeStyle = 'rgba(0, 122, 255, 0.23)'; 
        const gridSize = 50; 
        const widthBound = this.canvas.width / this.transform.scale;
        const heightBound = this.canvas.height / this.transform.scale;
        const startX = Math.floor((-this.transform.offsetX * dpr / this.transform.scale) / gridSize) * gridSize - widthBound;
        const endX = startX + (widthBound * 3);
        const startY = Math.floor((-this.transform.offsetY * dpr / this.transform.scale) / gridSize) * gridSize - heightBound;
        const endY = startY + (heightBound * 3);
        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(x, startY); this.ctx.lineTo(x, endY); this.ctx.stroke();
        }
        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(startX, y); this.ctx.lineTo(endX, y); this.ctx.stroke();
        }
        this.ctx.restore();
    }
    drawInlineAngleArc(line1, line2, scaleX) {
        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;
        const a1 = Math.atan2((line1.start.y - line1.end.y) * aspectCorrection, line1.start.x - line1.end.x);
        const a2 = Math.atan2((line2.end.y - line2.start.y) * aspectCorrection, line2.end.x - line2.start.x);
        const deg = this.getIntersectionAngle(line1, line2);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        this.ctx.lineWidth = (1.5 * scaleX) / this.transform.scale;
        const radius = (35 * scaleX) / this.transform.scale;
        this.ctx.arc(line1.end.x, line1.end.y, radius, -a1, -a2, a1 > a2);
        this.ctx.stroke();
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `bold ${Math.max(12, (13 * scaleX) / this.transform.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Text"`;
        this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText(`${deg.toFixed(1)}°`, line1.end.x + (15 / this.transform.scale), line1.end.y - (15 / this.transform.scale));
        this.ctx.restore();
    }
    render() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const dpr = window.devicePixelRatio || 1;
        this.ctx.translate(this.transform.offsetX * dpr, this.transform.offsetY * dpr);
        this.ctx.scale(this.transform.scale, this.transform.scale);
        this.drawBackgroundGrid(scaleX);
        this.ctx.lineWidth = (2 * scaleX) / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF6Green';
        this.lines.forEach(line => this.drawSingleLine(line));
        if (this.lines.length >= 2) {
            this.drawInlineAngleArc(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1], scaleX);
        } else if (this.lines.length === 1 && this.currentLine) {
            this.drawInlineAngleArc(this.lines, this.currentLine, scaleX);
        }
        if (this.currentLine) {
            this.ctx.strokeStyle = this.isSnapped ? '#34C759' : '#FFFF00';
            this.ctx.fillStyle = this.isSnapped ? '#34C759' : '#FFFF00';
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

/**
 * js/analyzer.js (Part 1 of 3)
 * 국궁 고각 분석 시스템 - 락 프리 최종 완결판 (그리드 제거 및 회전 고정 본)
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

        this.editingLineIndex = -1;  
        this.editingVertexType = null; 

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
    }

    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        
        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    }

    updateTransform(scale, offsetX, offsetY) {
        this.transform.scale = scale;
        this.transform.offsetX = offsetX;
        this.transform.offsetY = offsetY;
        this.render();
    }

    setMode(mode) {
        this.toolMode = mode;
        this.render();
    }

    clearLines() {
        this.lines = [];
        this.currentLine = null;
        this.editingLineIndex = -1;
        this.editingVertexType = null;
        this.render();
        this.broadcastAngle(0);
    }

    undoLastLine() {
        if (this.lines.length > 0) {
            this.lines.pop();
            this.render();
            this.calculateFinalAngle();
            return true;
        }
        return false;
    }

    // 💡 [회전 오차 완벽 상쇄] object-fit: cover에 의해 잘려 나간 상하좌우 숨은 여백 오차 정밀 좌표 역산
    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const mainVideo = document.getElementById('main-video');
        
        const vW = (mainVideo && mainVideo.videoWidth) ? mainVideo.videoWidth : 1280;
        const vH = (mainVideo && mainVideo.videoHeight) ? mainVideo.videoHeight : 720;
        
        const screenRatio = rect.width / rect.height;
        const videoRatio = vW / vH;
        
        let scale = 1;
        let xOffset = 0;
        let yOffset = 0;

        if (screenRatio > videoRatio) {
            scale = rect.width / vW;
            yOffset = (rect.height - (vH * scale)) / 2;
        } else {
            scale = rect.height / vH;
            xOffset = (rect.width - (vW * scale)) / 2;
        }

        const canvasScale = this.canvas.width / rect.width;
        
        const clientX = (event.clientX - rect.left - xOffset) * canvasScale;
        const clientY = (event.clientY - rect.top - yOffset) * canvasScale;
        
        const canvasX = (clientX - (this.transform.offsetX * canvasScale)) / this.transform.scale;
        const canvasY = (clientY - (this.transform.offsetY * canvasScale)) / this.transform.scale;
        
        return { x: canvasX / scale, y: canvasY / scale };
    }
/**
 * js/analyzer.js (Part 2 of 3)
 */
    handlePointerDown(event) {
        if (this.toolMode !== 'draw') return;
        if (event.pointerType === 'pen') {
            window.isStylusActive = true;
        } else if (event.pointerType === 'touch' && window.isStylusActive) {
            return; 
        }
        event.preventDefault();
        const currentTime = new Date().getTime();
        const tapLength = currentTime - this.lastTapTime;
        this.lastTapTime = currentTime;
        if (tapLength < this.tapThreshold && tapLength > 0) {
            this.currentLine = null;
            this.editingLineIndex = -1;
            this.editingVertexType = null;
            const hasUndone = this.undoLastLine();
            if (hasUndone) {
                const undoEvent = new CustomEvent('bowGestureUndo', { detail: { lines: this.lines } });
                window.dispatchEvent(undoEvent);
            }
            return; 
        }
        
        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);
        const targetRadius = this.snapThreshold / this.transform.scale;
        this.editingLineIndex = -1;
        this.editingVertexType = null;

        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            if (Math.hypot(line.start.x - coords.x, line.start.y - coords.y) < targetRadius) {
                this.editingLineIndex = i;
                this.editingVertexType = 'start';
                break;
            }
            if (Math.hypot(line.end.x - coords.x, line.end.y - coords.y) < targetRadius) {
                this.editingLineIndex = i;
                this.editingVertexType = 'end';
                break;
            }
        }

        if (this.editingLineIndex === -1) {
            let startPt = { x: coords.x, y: coords.y };
            const snappedPt = this.findCloseEndpoint(coords.x, coords.y);
            if (snappedPt) startPt = snappedPt;
            this.currentLine = { start: startPt, end: { x: coords.x, y: coords.y } };
        }
    }

    handlePointerMove(event) {
        if (this.toolMode !== 'draw') return;
        event.preventDefault();
        const coords = this.getCanvasCoordinates(event);
        let targetX = coords.x;
        let targetY = coords.y;
        this.isSnapped = false;

        if (this.editingLineIndex !== -1 && this.editingVertexType) {
            const line = this.lines[this.editingLineIndex];
            const basePt = this.editingVertexType === 'start' ? line.end : line.start;
            const adjustedThreshold = this.snapThreshold / this.transform.scale;
            const dx = targetX - basePt.x;
            const dy = targetY - basePt.y;

            if (Math.abs(dx) < adjustedThreshold) {
                targetX = basePt.x;
                this.isSnapped = true;
            } else if (Math.abs(dy) < adjustedThreshold) {
                targetY = basePt.y;
                this.isSnapped = true;
            }

            if (this.editingVertexType === 'start') {
                line.start = { x: targetX, y: targetY };
            } else {
                line.end = { x: targetX, y: targetY };
            }

            this.render();
            if (this.lines.length >= 2) {
                this.broadcastAngle(this.getIntersectionAngle(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1]));
            } else if (this.lines.length === 1) {
                this.broadcastAngle(this.getLineAngle(this.lines));
            }
        } 
        else if (this.currentLine) {
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
    }

    handlePointerUp(event) {
        if (event.pointerType === 'pen') {
            setTimeout(() => { window.isStylusActive = false; }, 500);
        }
        if (this.toolMode !== 'draw') return;

        if (this.editingLineIndex !== -1 && this.editingVertexType) {
            this.editingLineIndex = -1;
            this.editingVertexType = null;
            this.render();
            this.calculateFinalAngle();
        } 
        else if (this.currentLine) {
            const dist = Math.hypot(this.currentLine.end.x - this.currentLine.start.x, this.currentLine.end.y - this.currentLine.start.y);
            if (dist > (8 / this.transform.scale)) {
                this.lines.push(this.currentLine);
            }
            this.currentLine = null;
            this.isSnapped = false;
            this.render();
            this.calculateFinalAngle();
        }
    }

    findCloseEndpoint(x, y) {
        const adjustedThreshold = this.snapThreshold / this.transform.scale;
        for (let line of this.lines) {
            if (Math.hypot(line.start.x - x, line.start.y - y) < adjustedThreshold) return line.start;
            if (Math.hypot(line.end.x - x, line.end.y - y) < adjustedThreshold) return line.end;
        }
        return null;
    }
/**
 * js/analyzer.js (Part 3 of 3)
 */
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
        } else {
            this.broadcastAngle(0);
        }
    }

    getLineAngle(line) {
        if (!line) return 0;
        const singleLine = Array.isArray(line) ? line : line;
        if (!singleLine || !singleLine.start || !singleLine.end) return 0;
        const dx = singleLine.end.x - singleLine.start.x;
        const dy = singleLine.end.y - singleLine.start.y;
        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle % 180;
    }

    getIntersectionAngle(line1, line2) {
        if (!line1 || !line2) return 0;
        const angle1 = Math.atan2(-(line1.end.y - line1.start.y), line1.end.x - line1.start.x);
        const angle2 = Math.atan2(-(line2.end.y - line2.start.y), line2.end.x - line2.start.x);
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }

    broadcastAngle(angle) {
        const angleEvent = new CustomEvent('bowAngleUpdate', { detail: { angle: angle.toFixed(1) } });
        window.dispatchEvent(angleEvent);
    }

    drawInlineAngleArc(line1, line2, scaleX, vScale) {
        if (!line1 || !line2) return;
        const a1 = Math.atan2((line1.start.y - line1.end.y), line1.start.x - line1.end.x);
        const a2 = Math.atan2((line2.end.y - line2.start.y), line2.end.x - line2.start.x);
        const deg = this.getIntersectionAngle(line1, line2);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        
        this.ctx.lineWidth = 1.5 * scaleX / this.transform.scale;
        const radius = 35 * scaleX / this.transform.scale;
        this.ctx.arc(line1.end.x * vScale, line1.end.y * vScale, radius, -a1, -a2, a1 > a2);
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `bold ${Math.max(12, (13 * scaleX) / this.transform.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Text"`;
        this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText(`${deg.toFixed(1)}°`, (line1.end.x * vScale) + (15 / this.transform.scale), (line1.end.y * vScale) - (15 / this.transform.scale));
        this.ctx.restore();
    }

    // 💡 [그리드 완전 제거 및 화면 회전 고정] 꼬임 현상을 유발하던 모눈종이 코드를 전면 걷어내고 영상 동기화에 집중
    render() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        const rect = this.canvas.getBoundingClientRect();
        const mainVideo = document.getElementById('main-video');
        
        const vW = (mainVideo && mainVideo.videoWidth) ? mainVideo.videoWidth : 1280;
        const vH = (mainVideo && mainVideo.videoHeight) ? mainVideo.videoHeight : 720;
        
        const screenRatio = rect.width / rect.height;
        const videoRatio = vW / vH;
        
        let vScale = 1;
        let xOffset = 0;
        let yOffset = 0;

        if (screenRatio > videoRatio) {
            vScale = rect.width / vW;
            yOffset = (rect.height - (vH * vScale)) / 2;
        } else {
            vScale = rect.height / vH;
            xOffset = (rect.width - (vW * vScale)) / 2;
        }

        const canvasScale = this.canvas.width / rect.width;
        
        // 💡 비디오 위치 크롭 여백과 줌 패닝 행렬을 단방향 파이프라인으로 일체화
        this.ctx.translate((this.transform.offsetX * canvasScale) + xOffset * canvasScale, (this.transform.offsetY * canvasScale) + yOffset * canvasScale);
        
        // 캔버스 자체 확대배율 주사
        this.ctx.scale(this.transform.scale, this.transform.scale);
        
        this.ctx.lineWidth = (2 * canvasScale) / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';
        
        // 개별 요소 그리기 단계 진입
        this.lines.forEach(line => this.drawSingleLine(line, canvasScale, vScale));
        if (this.lines.length >= 2) {
            this.drawInlineAngleArc(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1], canvasScale, vScale);
        } else if (this.lines.length === 1 && this.currentLine) {
            this.drawInlineAngleArc(this.lines[0], this.currentLine, canvasScale, vScale);
        }
        if (this.currentLine) {
            this.ctx.strokeStyle = this.isSnapped ? '#34C759' : '#FFFF00';
            this.ctx.fillStyle = this.isSnapped ? '#34C759' : '#FFFF00';
            this.drawSingleLine(this.currentLine, canvasScale, vScale);
        }
        this.ctx.restore();
    }

    drawSingleLine(line, canvasScale, vScale) {
        if (!line) return;
        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x * vScale, line.start.y * vScale);
        this.ctx.lineTo(line.end.x * vScale, line.end.y * vScale);
        this.ctx.stroke();

        const pinSize = (8 * canvasScale) / this.transform.scale;
        this.ctx.save();
        this.ctx.lineWidth = (1.0 * canvasScale) / this.transform.scale;

        this.ctx.beginPath();
        this.ctx.moveTo((line.start.x * vScale) - pinSize, line.start.y * vScale);
        this.ctx.lineTo((line.start.x * vScale) + pinSize, line.start.y * vScale);
        this.ctx.moveTo(line.start.x * vScale, (line.start.y * vScale) - pinSize);
        this.ctx.lineTo(line.start.x * vScale, (line.start.y * vScale) + pinSize);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo((line.end.x * vScale) - pinSize, line.end.y * vScale);
        this.ctx.lineTo((line.end.x * vScale) + pinSize, line.end.y * vScale);
        this.ctx.moveTo(line.end.x * vScale, (line.end.y * vScale) - pinSize);
        this.ctx.lineTo(line.end.x * vScale, (line.end.y * vScale) + pinSize);
        this.ctx.stroke();

        this.ctx.restore();
    }
}
window.bowAnalyzer = new BowAnalyzer();

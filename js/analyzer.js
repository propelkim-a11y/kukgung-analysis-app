/**
 * js/analyzer.js (Part 1 of 3)
 * 국궁 고각 분석 시스템 - 확대축소 1:1 축 동기화 최종 완전판
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

    // 제스처 모듈로부터 갱신된 변환 배율과 좌표를 실시간 전송받아 즉시 동기화
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

    // 💡 [원점 튕김 완전 해결 핵심부] 2중 스케일 참조 오차를 완전 제거한 절대 좌표 역산 수식
    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        
        // 브라우저 화면의 물리 터치 지점을 캔버스의 내부 실제 해상도 좌표계로 보정
        const clientX = event.clientX - rect.left;
        const clientY = event.clientY - rect.top;
        
        // 💡 [교정 마감] 제스처 엔진과 1:1로 일치하도록 오프셋을 먼저 빼고 배율을 나눔으로써 튕김 원천 차단
        const canvasX = (clientX - this.transform.offsetX) / this.transform.scale;
        const canvasY = (clientY - this.transform.offsetY) / this.transform.scale;
        
        // 도화지 해상도 비율 팩터를 최종 융합하여 정밀 좌표 반환
        const scaleFactor = this.canvas.width / rect.width;
        return { x: canvasX * scaleFactor, y: canvasY * scaleFactor };
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
            this.broadcastAngleInline();
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
    broadcastAngleInline() {
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

    drawInlineAngleArc(line1, line2, scaleX) {
        if (!line1 || !line2) return;
        const a1 = Math.atan2((line1.start.y - line1.end.y), line1.start.x - line1.end.x);
        const a2 = Math.atan2((line2.end.y - line2.start.y), line2.end.x - line2.start.x);
        const deg = this.getIntersectionAngle(line1, line2);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        
        // 전역 컨텍스트 스케일 하위에서 독립 선폭 매핑
        this.ctx.lineWidth = 1.5 * scaleX / this.transform.scale;
        const radius = 35 * scaleX / this.transform.scale;
        this.ctx.arc(line1.end.x, line1.end.y, radius, -a1, -a2, a1 > a2);
        this.ctx.stroke();
        
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `bold ${Math.max(12, (13 * scaleX) / this.transform.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Text"`;
        this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText(`${deg.toFixed(1)}°`, line1.end.x + (15 / this.transform.scale), line1.end.y - (15 / this.transform.scale));
        this.ctx.restore();
    }

    // 💡 [확대축소 선 이탈/튕김 완전 해결] 제스처 수치 그대로 캔버스 매트릭스 1:1 선형 동기화 사상
    render() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        
        const rect = this.canvas.getBoundingClientRect();
        const canvasScale = this.canvas.width / rect.width;
        
        // 💡 [2중 누적 오차 제거 마감] 기디 픽셀 해상도 팩터를 제스처 오프셋에 균일 주입하여 좌표 분리 박멸
        this.ctx.translate(this.transform.offsetX * canvasScale, this.transform.offsetY * canvasScale);
        this.ctx.scale(this.transform.scale, this.transform.scale);
        
        this.ctx.lineWidth = (2 * canvasScale) / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';
        
        this.lines.forEach(line => this.drawSingleLine(line, canvasScale));
        if (this.lines.length >= 2) {
            this.drawInlineAngleArc(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1], canvasScale);
        } else if (this.lines.length === 1 && this.currentLine) {
            this.drawInlineAngleArc(this.lines[0], this.currentLine, canvasScale);
        }
        if (this.currentLine) {
            this.ctx.strokeStyle = this.isSnapped ? '#34C759' : '#FFFF00';
            this.ctx.fillStyle = this.isSnapped ? '#34C759' : '#FFFF00';
            this.drawSingleLine(this.currentLine, canvasScale);
        }
        this.ctx.restore();
    }

    drawSingleLine(line, canvasScale) {
        if (!line) return;
        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x, line.start.y);
        this.ctx.lineTo(line.end.x, line.end.y);
        this.ctx.stroke();

        const pinSize = (8 * canvasScale) / this.transform.scale;
        this.ctx.save();
        this.ctx.lineWidth = (1.0 * canvasScale) / this.transform.scale;

        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x - pinSize, line.start.y);
        this.ctx.lineTo(line.start.x + pinSize, line.start.y);
        this.ctx.moveTo(line.start.x, line.start.y - pinSize);
        this.ctx.lineTo(line.start.x, line.start.y + pinSize);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(line.end.x - pinSize, line.end.y);
        this.ctx.lineTo(line.end.x + pinSize, line.end.y);
        this.ctx.moveTo(line.end.x, line.end.y - pinSize);
        this.ctx.lineTo(line.end.x, line.end.y + pinSize);
        this.ctx.stroke();

        this.ctx.restore();
    }
}
window.bowAnalyzer = new BowAnalyzer();

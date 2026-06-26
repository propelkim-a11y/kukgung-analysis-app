/**
 * js/analyzer.js
 * 국궁 고각 분석 시스템 - 락 프리 최종 완결판 (v19.0 - 선/정점 인터랙티브 미세 편집 완결 버전)
 */

class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.lines = []; 
        this.currentLine = null;
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };
        this.toolMode = 'move'; 
        this.snapThreshold = 18; // 💡 손가락 터치 타겟팅 정밀도를 위해 터치 반경 미세 확장
        this.isSnapped = false;
        this.lastTapTime = 0;
        this.tapThreshold = 300; 

        // 선/정점 편집 미세 수정을 위한 상태 변수
        this.editingLineIndex = -1;  
        this.editingVertexType = null; 
        this.movingLineIndex = -1;
        this.lastCoords = { x: 0, y: 0 };

        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
    }

    // 💡 [하드웨어 충돌 박멸] 리스너를 단 1번만 영구 결합하여 중복 누적 버그 차단
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
        this.movingLineIndex = -1;
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

    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasScaleX = this.canvas.width / rect.width;
        const canvasScaleY = this.canvas.height / rect.height;
        const cX = (event.clientX - rect.left) * canvasScaleX;
        const cY = (event.clientY - rect.top) * canvasScaleY;
        const canvasX = (cX - (this.transform.offsetX * canvasScaleX)) / this.transform.scale;
        const canvasY = (cY - (this.transform.offsetY * canvasScaleY)) / this.transform.scale;
        return { x: canvasX, y: canvasY };
    }

    // 💡 [기본 충실 수학 공식] 선 전체 이동 판정을 위한 점과 선분 사이의 최단거리 측정 함수
    getDistanceToLine(x, y, line) {
        const A = x - line.start.x;
        const B = y - line.start.y;
        const C = line.end.x - line.start.x;
        const D = line.end.y - line.start.y;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        let xx, yy;
        if (param < 0) {
            xx = line.start.x; yy = line.start.y;
        } else if (param > 1) {
            xx = line.end.x; yy = line.end.y;
        } else {
            xx = line.start.x + param * C;
            yy = line.start.y + param * D;
        }
        return Math.hypot(x - xx, y - yy);
    }
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
            this.movingLineIndex = -1;
            const hasUndone = this.undoLastLine();
            if (hasUndone) {
                const undoEvent = new CustomEvent('bowGestureUndo', { detail: { lines: this.lines } });
                window.dispatchEvent(undoEvent);
            }
            return; 
        }
        
        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);
        this.lastCoords = coords;
        const targetRadius = this.snapThreshold / this.transform.scale;
        
        this.editingLineIndex = -1;
        this.editingVertexType = null;
        this.movingLineIndex = -1;

        // 1순위: 정점(시작점/끝점) 터치 검사 (정점 편집 트리거)
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

        // 2순위: 정점을 안 잡았다면 선분 몸통 터치 검사 (선 전체 평행 이동 트리거)
        if (this.editingLineIndex === -1) {
            for (let i = 0; i < this.lines.length; i++) {
                if (this.getDistanceToLine(coords.x, coords.y, this.lines[i]) < targetRadius) {
                    this.movingLineIndex = i;
                    break;
                }
            }
        }

        // 3순위: 아무것도 잡지 않았다면 신규 선 드로잉 시작
        if (this.editingLineIndex === -1 && this.movingLineIndex === -1) {
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

        // 분기 A: 정점 개별 미세 편집 드래그 가동
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
            this.calculateFinalAngle();
        } 
        // 분기 B: 💡[기능 보강 핵심] 선 전체 몸통 통째로 평행 이동 드래그 가동
        else if (this.movingLineIndex !== -1) {
            const line = this.lines[this.movingLineIndex];
            const deltaX = coords.x - this.lastCoords.x;
            const deltaY = coords.y - this.lastCoords.y;

            line.start.x += deltaX;
            line.start.y += deltaY;
            line.end.x += deltaX;
            line.end.y += deltaY;

            this.lastCoords = coords;
            this.render();
            this.calculateFinalAngle();
        }
        // 분기 C: 순정 상태의 실시간 신규 가이드라인 드로우
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
        else if (this.movingLineIndex !== -1) {
            this.movingLineIndex = -1;
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
            if (Math.hypot(line.start.x - x, line.start.y - y) < adjustedThreshold) {
                return { x: line.start.x, y: line.start.y };
            }
            if (Math.hypot(line.end.x - x, line.end.y - y) < adjustedThreshold) {
                return { x: line.end.x, y: line.end.y };
            }
        }
        return null;
    }

    calculateAnglesInline() {
        if (!this.currentLine) return;
        if (this.lines.length === 0) {
            this.broadcastAngle(this.getLineAngle(this.currentLine));
        } else {
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
        const angle2 = Math.atan2(-(line2.dbVersion || line2.end.y - line2.start.y), line2.end.x - line2.start.x);
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }

    broadcastAngle(angle) {
        const angleEvent = new CustomEvent('bowAngleUpdate', { detail: { angle: Number(angle).toFixed(1) } });
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
        const canvasScaleY = this.canvas.height / rect.height;
        
        this.ctx.translate(this.transform.offsetX * scaleX, this.transform.offsetY * canvasScaleY);
        this.ctx.scale(this.transform.scale, this.transform.scale);
        
        this.ctx.lineWidth = (2 * scaleX) / this.transform.scale; 
        
        // 가이드라인 순회 드로우
        this.lines.forEach((line, idx) => {
            // 💡 [테크니컬 하이라이트] 현재 개별 정점을 수정 중이거나 선 전체를 밀고 있다면 오렌지 레이저 컬러 수사
            const isEditing = (idx === this.editingLineIndex || idx === this.movingLineIndex);
            this.ctx.strokeStyle = isEditing ? '#FF9500' : '#00FF66';
            this.ctx.fillStyle = isEditing ? '#FF9500' : '#00FF66';
            this.drawSingleLine(line);
        });

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
        if (!line) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;

        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x, line.start.y);
        this.ctx.lineTo(line.end.x, line.end.y);
        this.ctx.stroke();

        const pinSize = (8 * scaleX) / this.transform.scale;
        this.ctx.save();
        this.ctx.lineWidth = (1.0 * scaleX) / this.transform.scale;

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

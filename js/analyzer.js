/**
 * js/analyzer.js (Part 1/2)
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템 (4단계)
 * - 줌/이동 변환 행렬 역산 완벽 지원
 * - [각도 실시간 연동 교정] 편집 상태 드래그 중에도 각도가 실시간 변환되도록 연산 타겟 보정 완료
 */

class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        
        // 다중 선 데이터 구조 [{ start: {x, y}, end: {x, y} }, ...]
        this.lines = []; 
        this.currentLine = null;

        // 변환 상태 행렬
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };
        this.toolMode = 'move'; 

        // 편집 상태 트래킹 변수 인프라
        this.selectedLine = null;       // 현재 선택되어 수정 중인 선 객체
        this.editPart = null;           // 'start' (시작점 조절), 'end' (끝점 조절), 'body' (전체 이동)
        this.dragStartCoords = null;    // 이동 시작 시점의 마우스 월드 좌표
        this.originalLineState = null;  // 드래그 시작 전 본래 선 좌표 사본
        this.lastTapTime = 0;           // 더블 탭 삭제 연산을 위한 시간 캐시

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
        this.selectedLine = null;
        this.editPart = null;
        this.render();
    }

    clearLines() {
        this.lines = [];
        this.currentLine = null;
        this.selectedLine = null;
        this.editPart = null;
        this.render();
        this.broadcastAngle(0, 'ANGLE');
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
        if (event.pointerType === 'touch' && event.touchType === 'direct' && window.isStylusActive) return;
        if (event.pointerType === 'pen') window.isStylusActive = true;

        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);
        
        // 1단계: 더블 탭 개별 삭제 제스처 연산 수행
        const now = Date.now();
        if (now - this.lastTapTime < 250) {
            const hitLineIndex = this.findHitLineIndex(coords);
            if (hitLineIndex !== -1) {
                this.lines.splice(hitLineIndex, 1);
                this.selectedLine = null;
                this.editPart = null;
                this.render();
                this.calculateFinalAngle();
                this.currentLine = null;
                return;
            }
        }
        this.lastTapTime = now;

        // 2단계: 기존에 그어진 선들의 끝점(조절 팁)이나 몸통 적중 판정(Hit Test)
        const hitResult = this.hitTestLines(coords);

        if (hitResult) {
            this.selectedLine = hitResult.line;
            this.editPart = hitResult.part; // 'start', 'end', 'body'
            this.dragStartCoords = coords;
            this.originalLineState = {
                start: { x: hitResult.line.start.x, y: hitResult.line.start.y },
                end: { x: hitResult.line.end.x, y: hitResult.line.end.y }
            };
        } else {
            this.selectedLine = null;
            this.editPart = null;

            if (this.lines.length >= 2) {
                this.lines = [];
            }

            this.currentLine = {
                start: { x: coords.x, y: coords.y },
                end: { x: coords.x, y: coords.y }
            };
        }
        this.render();
    }
    handlePointerMove(event) {
        if (this.toolMode !== 'draw') return;
        const coords = this.getCanvasCoordinates(event);

        if (this.selectedLine && this.editPart && this.originalLineState) {
            const dx = coords.x - this.dragStartCoords.x;
            const dy = coords.y - this.dragStartCoords.y;

            if (this.editPart === 'start') {
                this.selectedLine.start.x = this.originalLineState.start.x + dx;
                this.selectedLine.start.y = this.originalLineState.start.y + dy;
            } else if (this.editPart === 'end') {
                this.selectedLine.end.x = this.originalLineState.end.x + dx;
                this.selectedLine.end.y = this.originalLineState.end.y + dy;
            } else if (this.editPart === 'body') {
                this.selectedLine.start.x = this.originalLineState.start.x + dx;
                this.selectedLine.start.y = this.originalLineState.start.y + dy;
                this.selectedLine.end.x = this.originalLineState.end.x + dx;
                this.selectedLine.end.y = this.originalLineState.end.y + dy;
            }
            this.render();
            this.calculateFinalAngle(); // 드래그 중인 가변 좌표 실시간 피드백 연동
            return;
        }

        if (this.currentLine) {
            this.currentLine.end = { x: coords.x, y: coords.y };
            this.render();
            this.calculateAnglesInline();
        }
    }

    handlePointerUp(event) {
        if (event.pointerType === 'pen') {
            setTimeout(() => { window.isStylusActive = false; }, 500);
        }
        if (this.toolMode !== 'draw') return;

        if (this.selectedLine) {
            this.editPart = null;
            this.dragStartCoords = null;
            this.originalLineState = null;
            this.calculateFinalAngle();
            this.render();
            return;
        }

        if (this.currentLine) {
            const dist = Math.hypot(this.currentLine.end.x - this.currentLine.start.x, this.currentLine.end.y - this.currentLine.start.y);
            if (dist > 5) {
                this.lines.push(this.currentLine);
            }
            this.currentLine = null;
            this.render();
            this.calculateFinalAngle();
        }
    }

    findHitLineIndex(coords) {
        const threshold = 20 / this.transform.scale;
        for (let i = 0; i < this.lines.length; i++) {
            const hit = this.checkHitLine(this.lines[i], coords, threshold);
            if (hit && hit.part === 'body') return i;
        }
        return -1;
    }

    hitTestLines(coords) {
        const threshold = 25 / this.transform.scale; 
        
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const result = this.checkHitLine(this.lines[i], coords, threshold);
            if (result) return { line: this.lines[i], part: result.part };
        }
        return null;
    }

    checkHitLine(line, coords, threshold) {
        const distToStart = Math.hypot(line.start.x - coords.x, line.start.y - coords.y);
        if (distToStart < threshold) return { part: 'start' };

        const distToEnd = Math.hypot(line.end.x - coords.x, line.end.y - coords.y);
        if (distToEnd < threshold) return { part: 'end' };

        const x0 = coords.x, y0 = coords.y;
        const x1 = line.start.x, y1 = line.start.y;
        const x2 = line.end.x, y2 = line.end.y;

        const lineLen = Math.hypot(x2 - x1, y2 - y1);
        if (lineLen === 0) return null;

        const u = ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / (lineLen * lineLen);
        if (u < 0 || u > 1) return null;

        const distance = Math.abs((x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1)) / lineLen;
        if (distance < threshold) return { part: 'body' };

        return null;
    }

    calculateAnglesInline() {
        if (this.lines.length === 0 && this.currentLine) {
            const angle = this.getLineAngle(this.currentLine);
            this.broadcastAngle(angle, 'ELEVATION');
        } else if (this.lines.length === 1 && this.currentLine) {
            const angle = this.getIntersectionAngle(this.lines[0], this.currentLine);
            this.broadcastAngle(angle, 'INTERSECT');
        }
    }

    calculateFinalAngle() {
        if (this.lines.length === 2) {
            const angle = this.getIntersectionAngle(this.lines[0], this.lines[1]);
            this.broadcastAngle(angle, 'INTERSECT');
        } else if (this.lines.length === 1) {
            const angle = this.getLineAngle(this.lines[0]);
            this.broadcastAngle(angle, 'ELEVATION');
        } else {
            this.broadcastAngle(0, 'ANGLE');
        }
    }

    getLineAngle(line) {
        if (!line) return 0;
        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;

        const dx = line.end.x - line.start.x;
        const dy = (line.end.y - line.start.y) * aspectCorrection;

        let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle % 180;
    }

    getIntersectionAngle(line1, line2) {
        if (!line1 || !line2) return 0;
        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;

        const angle1 = Math.atan2(-(line1.end.y - line1.start.y) * aspectCorrection, line1.end.x - line1.start.x);
        const angle2 = Math.atan2(-(line2.end.y - line2.start.y) * aspectCorrection, line2.end.x - line2.start.x);
        
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }

    broadcastAngle(angle, prefixText) {
        const angleEvent = new CustomEvent('bowAngleUpdate', {
            detail: { angle: `${prefixText} ${angle.toFixed(1)}°` }
        });
        window.dispatchEvent(angleEvent);
    }

    drawBackgroundGrid(scaleX, scaleY) {
        this.ctx.save();
        this.ctx.lineWidth = (0.75 * scaleX) / this.transform.scale;
        this.ctx.strokeStyle = 'rgba(0, 122, 255, 0.25)'; 

        const gridSize = 50; 
        const widthBound = this.canvas.width * 5;
        const heightBound = this.canvas.height * 5;

        for (let x = -widthBound; x <= widthBound; x += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(x, -heightBound); this.ctx.lineTo(x, heightBound); this.ctx.stroke();
        }
        for (let y = -heightBound; y <= heightBound; y += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(-widthBound, y); this.ctx.lineTo(widthBound, y); this.ctx.stroke();
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

        this.drawBackgroundGrid(scaleX, scaleY);

        this.ctx.lineWidth = (2 * scaleX) / this.transform.scale; 
        this.lines.forEach(line => {
            if (line === this.selectedLine) {
                this.ctx.strokeStyle = '#FFFF00';
                this.ctx.fillStyle = '#FFFF00';
            } else {
                this.ctx.strokeStyle = '#00FF66';
                this.ctx.fillStyle = '#00FF66';
            }
            this.drawSingleLine(line);
        });

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

        const radius = (6 * scaleX) / this.transform.scale;
        this.ctx.beginPath();
        this.ctx.arc(line.start.x, line.start.y, radius, 0, 2 * Math.PI);
        this.ctx.arc(line.end.x, line.end.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}

window.bowAnalyzer = new BowAnalyzer();

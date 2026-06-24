/**
 * js/analyzer.js (Part 1/3)
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템 (4단계)
 * - 줌/이동 변환 행렬 역산 완벽 지원
 * - [오작동 박멸 패치] 히트 테스트 범위를 실제 선 주변으로 엄격 격리하여 선긋기 락 현상 완전 해결
 */

class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        
        // 다중 선 데이터 구조
        this.lines = []; 
        this.currentLine = null;

        // 변환 상태 행렬
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };
        this.toolMode = 'move'; 

        // 편집 상태 트래킹 변수
        this.selectedLine = null;       
        this.editPart = null;           
        this.dragStartCoords = null;    
        this.originalLineState = null;  
        this.lastTapTime = 0;           

        // 3번 방안: 자석(스냅) 시스템 관련 튜닝 구조체
        this.snapAngles =; // 스냅 대상 목표 각도 세트
        this.snapThreshold = 1.2;               // 자석이 끌어당기는 오차 범위 (±1.2도)
        this.isCurrentlySnapped = false;       // 현재 정각에 붙어있는지 여부 리포트 플래그

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
        this.isCurrentlySnapped = false;
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
        
        // 1단계: 더블 탭 개별 삭제 제스처 연산
        const now = Date.now();
        if (now - this.lastTapTime < 250) {
            const hitLineIndex = this.findHitLineIndex(coords);
            if (hitLineIndex !== -1) {
                this.lines.splice(hitLineIndex, 1);
                this.selectedLine = null;
                this.editPart = null;
                this.isCurrentlySnapped = false;
                this.render();
                this.calculateFinalAngle();
                this.currentLine = null;
                return;
            }
        }
        this.lastTapTime = now;

        // 2단계: 기존에 그어진 선들의 적중 판정(Hit Test)
        const hitResult = this.hitTestLines(coords);

        if (hitResult) {
            this.selectedLine = hitResult.line;
            this.editPart = hitResult.part; 
            this.dragStartCoords = coords;
            this.originalLineState = {
                start: { x: hitResult.line.start.x, y: hitResult.line.start.y },
                end: { x: hitResult.line.end.x, y: hitResult.line.end.y }
            };
        } else {
            // 💡 교정: 빈 화면 터치 시 확실하게 기존 편집 상태를 탈출하고 신규 선긋기 개시 보장
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
    /**
     * js/analyzer.js (Part 2/3)
     */
    handlePointerMove(event) {
        if (this.toolMode !== 'draw') return;
        const coords = this.getCanvasCoordinates(event);

        // 💡 교정: 유실되기 쉬운 브라우저 고유 이벤트를 방지하고, 전역 제스처 포인터 맵 데이터의 개수만 안전하게 정밀 파싱
        const isMultiTouching = (window.bowAppGesture && window.bowAppGesture.activePointers && window.bowAppGesture.activePointers.size >= 2);

        if (this.selectedLine && this.editPart && this.originalLineState) {
            const dx = coords.x - this.dragStartCoords.x;
            const dy = coords.y - this.dragStartCoords.y;

            if (this.editPart === 'start') {
                this.selectedLine.start.x = this.originalLineState.start.x + dx;
                this.selectedLine.start.y = this.originalLineState.start.y + dy;
                this.applySmartSnap(this.selectedLine, 'start', isMultiTouching);
            } else if (this.editPart === 'end') {
                this.selectedLine.end.x = this.originalLineState.end.x + dx;
                this.selectedLine.end.y = this.originalLineState.end.y + dy;
                this.applySmartSnap(this.selectedLine, 'end', isMultiTouching);
            } else if (this.editPart === 'body') {
                this.selectedLine.start.x = this.originalLineState.start.x + dx;
                this.selectedLine.start.y = this.originalLineState.start.y + dy;
                this.selectedLine.end.x = this.originalLineState.end.x + dx;
                this.selectedLine.end.y = this.originalLineState.end.y + dy;
                this.isCurrentlySnapped = false; 
            }
            this.render();
            this.calculateFinalAngle(); 
            return;
        }

        if (this.currentLine) {
            this.currentLine.end = { x: coords.x, y: coords.y };
            this.applySmartSnap(this.currentLine, 'end', isMultiTouching);
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

    applySmartSnap(line, movingPart, isMultiTouching) {
        this.isCurrentlySnapped = false;
        if (isMultiTouching) return; 

        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;

        const dx = line.end.x - line.start.x;
        const dy = (line.end.y - line.start.y) * aspectCorrection;
        let rawAngle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (rawAngle < 0) rawAngle += 360;
        const baseAngle = rawAngle % 180;

        for (const targetAngle of this.snapAngles) {
            let diff = Math.abs(baseAngle - targetAngle);
            if (diff > 90) diff = 180 - diff;

            if (diff <= this.snapThreshold) {
                this.isCurrentlySnapped = true;
                const lineLength = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
                const targetRadian = (-targetAngle * Math.PI) / 180;
                
                if (movingPart === 'end') {
                    line.end.x = line.start.x + lineLength * Math.cos(targetRadian);
                    line.end.y = line.start.y + (lineLength * Math.sin(targetRadian)) / aspectCorrection;
                } else if (movingPart === 'start') {
                    line.start.x = line.end.x - lineLength * Math.cos(targetRadian);
                    line.start.y = line.end.y - (lineLength * Math.sin(targetRadian)) / aspectCorrection;
                }
                break;
            }
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
    /**
     * js/analyzer.js (Part 3/3)
     */
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
        // 💡 교정: 선분 유효 도메인(u) 조건이 참일 때만 물리 거리를 계산하여 빈 화면 제스처 빗나감 방어벽 확보
        if (u >= 0 && u <= 1) {
            const distance = Math.abs((x2 - x1) * (y1 - y0) - (x1 - x0) * (y2 - y1)) / lineLen;
            if (distance < threshold) return { part: 'body' };
        }

        return null;
    }

    calculateAnglesInline() {
        if (this.lines.length === 0 && this.currentLine) {
            const angle = this.getLineAngle(this.currentLine);
            this.broadcastAngle(angle, 'ELEVATION');
        } else if (this.lines.length === 1 && this.currentLine) {
            const angle = this.getIntersectionAngle(this.lines, this.currentLine);
            this.broadcastAngle(angle, 'INTERSECT');
        }
    }

    calculateFinalAngle() {
        if (this.lines.length === 2) {
            const angle = this.getIntersectionAngle(this.lines, this.lines);
            this.broadcastAngle(angle, 'INTERSECT');
        } else if (this.lines.length === 1) {
            const angle = this.getLineAngle(this.lines);
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
        
        // 💡 교정: 다중 배열 래퍼 해제 보정 연산 주입 (단일 객체 앵커 매핑)
        const l1 = Array.isArray(line1) ? line1[0] : line1;
        const l2 = Array.isArray(line2) ? line2[1] || line2 : line2;
        if (!l1 || !l2) return 0;

        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;

        const angle1 = Math.atan2(-(l1.end.y - l1.start.y) * aspectCorrection, l1.end.x - l1.start.x);
        const angle2 = Math.atan2(-(l2.end.y - l2.start.y) * aspectCorrection, l2.end.x - l2.start.x);
        
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }

    broadcastAngle(angle, prefixText) {
        let textOutput = `${prefixText} ${angle.toFixed(1)}°`;
        if (this.isCurrentlySnapped && angle > 0) {
            textOutput = `✅ ${prefixText} ${Math.round(angle)}.0° [TARGET]`;
        }
        const angleEvent = new CustomEvent('bowAngleUpdate', {
            detail: { angle: textOutput }
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

    drawLaserGuide(line, scaleX) {
        if (!this.isCurrentlySnapped) return;
        this.ctx.save();
        this.ctx.lineWidth = (0.5 * scaleX) / this.transform.scale;
        this.ctx.strokeStyle = 'rgba(0, 255, 102, 0.45)'; 
        this.ctx.setLineDash([(4 * scaleX) / this.transform.scale, (4 * scaleX) / this.transform.scale]); 

        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;

        const uX = dx / len;
        const uY = dy / len;

        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x - uX * 5000, line.start.y - uY * 5000);
        this.ctx.lineTo(line.end.x + uX * 5000, line.end.y + uY * 5000);
        this.ctx.stroke();
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
                this.ctx.strokeStyle = this.isCurrentlySnapped ? '#FFFFFF' : '#FFFF00';
                this.ctx.fillStyle = this.isCurrentlySnapped ? '#FFFFFF' : '#FFFF00';
                this.drawLaserGuide(line, scaleX);
            } else {
                this.ctx.strokeStyle = '#00FF66';
                this.ctx.fillStyle = '#00FF66';
            }
            this.drawSingleLine(line);
        });

        if (this.currentLine) {
            this.ctx.strokeStyle = this.isCurrentlySnapped ? '#FFFFFF' : '#FFFF00';
            this.ctx.fillStyle = this.isCurrentlySnapped ? '#FFFFFF' : '#FFFF00';
            this.drawLaserGuide(this.currentLine, scaleX);
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

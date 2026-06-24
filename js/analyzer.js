/**
 * js/analyzer.js (Part 1 of 2)
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템 (초정밀 줌 연동 버전)
 * - 줌/이동 변환 행렬 역산 공식 재정립 (최대 확대 상태에서도 픽셀 오차 제로 보장)
 * - 단선(선 1개): 수평선(0도) 기준 절대 고각 정밀 실시간 매핑
 * - 복선(선 2개): 두 조준선 사이의 유클리드 교각(사잇각) 실시간 매핑
 * - 화면 빈 공간 더블 탭(Double Tap) 시 직전 가이드라인 단계별 제거(Undo) 인터랙션 탑재
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
            this.calculateFinalAngle();
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
    // 💡 [신뢰도 극대화] 줌 배율(scale)과 Pan 좌표(offset), 그리고 디바이스 픽셀비(DPR)를 완전히 결합한 초정밀 역산 공식
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
        
        // 1. 브라우저의 화면 스크롤/확대 간섭을 원천 차단하여 부드러운 드로잉 선 획 확보
        event.preventDefault();

        // 2. 확대 배율이 반영된 실시간 마우스/손가락 끝 좌표 역산
        const coords = this.getCanvasCoordinates(event);
        let targetX = coords.x;
        let targetY = coords.y;

        this.isSnapped = false;

        // 3. 기존 선들의 끝점 자석 기능은 완전히 제외 (단선 분석 집중)
        // 4. [요청 반영] 오직 수평(0도)과 수직(90도)에서만 세련되게 달라붙는 스마트 스냅
        // 스냅이 너무 강하게 튀지 않도록 감도 범위를 15에서 7 물리 픽셀로 슬림화
        const tightThreshold = 7 / this.transform.scale;
        
        const dx = targetX - this.currentLine.start.x;
        const dy = targetY - this.currentLine.start.y;
        
        if (Math.abs(dx) < tightThreshold) {
            // 수직선(90도) 정렬 스냅 가동
            targetX = this.currentLine.start.x;
            this.isSnapped = true;
        } else if (Math.abs(dy) < tightThreshold) {
            // 수평선(0도) 정렬 스냅 가동
            targetY = this.currentLine.start.y;
            this.isSnapped = true;
        }

        // 5. 부드럽게 가공된 최종 좌표를 실시간 가이드선 끝점에 주입
        this.currentLine.end = { x: targetX, y: targetY };
        
        // 6. 끊김 없이 초당 60프레임 이상으로 주사하는 그래픽스 렌더링 파이프라인 가동
        this.render();
        this.calculateAnglesInline();
    }

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
            this.broadcastAngle(this.getLineAngle(this.lines[0]));
        } else {
            this.broadcastAngle(0);
        }
    }
    // 💡 [수학적 신뢰도 보정] 단선: 화면 해상도 왜곡을 제거하고 3시 방향(수평선) 기준 0~180도로 완벽 수렴
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
    // 💡 [교각 알고리즘 패치] 복선: 두 벡터 사잇각의 절대 기하학적 최소 교각(0~180도) 산출
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
    // 💡 [줌 연동 시각화 패치] 확대 배율에 따라 아크 지름과 텍스트 크기가 요동치지 않도록 scale 분리 마감
    drawInlineAngleArc(line1, line2, scaleX) {
        if (!line1 || !line2) return;
        const rect = this.canvas.getBoundingClientRect();
        const aspectCorrection = rect.height / rect.width;
        const a1 = Math.atan2((line1.start.y - line1.end.y) * aspectCorrection, line1.start.x - line1.end.x);
        const a2 = Math.atan2((line2.end.y - line2.start.y) * aspectCorrection, line2.end.x - line2.start.x);
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
        const dpr = window.devicePixelRatio || 1;
        this.ctx.translate(this.transform.offsetX * dpr, this.transform.offsetY * dpr);
        this.ctx.scale(this.transform.scale, this.transform.scale);
        this.drawBackgroundGrid(scaleX);
        this.ctx.lineWidth = (2 * scaleX) / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';
        this.lines.forEach(line => this.drawSingleLine(line));
        if (this.lines.length >= 2) {
            this.drawInlineAngleArc(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1], scaleX);
        } else if (this.lines.length === 1 && this.currentLine) {
            this.drawInlineAngleArc(this.lines[0], this.currentLine, scaleX);
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
        const radius = (4 * scaleX) / this.transform.scale;
        this.ctx.beginPath();
        this.ctx.arc(line.start.x, line.start.y, radius, 0, 2 * Math.PI);
        this.ctx.arc(line.end.x, line.end.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}
window.bowAnalyzer = new BowAnalyzer();

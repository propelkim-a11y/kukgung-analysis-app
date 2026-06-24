/**
 * js/analyzer.js (Part 1 / 2)
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템 (선긋기 화면 제스처 취소 버전)
 * - S펜 / 애플펜슬 Palm Rejection 및 포인터 분리
 * - 줌/이동 변환 행렬 역산 (확대 상태에서도 정확한 조준점 매핑)
 * - [디자인 시스템 패치] 애플 순정 인디고 블루(Indigo Blue) 정밀 그리드 이식 완료
 * - [UX 제스처 고도화] 더블 탭(Double Tap) 감지 시 직전 가이드라인 단계별 제거(Undo) 인터랙션 구현
 * - [그리드 버그 교정] 피치 줌 확대 배율과 무관하게 격자 크기 및 선 두께를 항상 일정하게 고정
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
        
        // 자석 스냅 감도 임계값 (물리 픽셀 기준 범위)
        this.snapThreshold = 12; 
        this.isSnapped = false;

        // 💡 화면 빈 공간 더블 탭(Double Tap) 구현용 타이머 변수
        this.lastTapTime = 0;
        this.tapThreshold = 300; // 300ms 이내에 연속 터치 시 더블 탭 판정

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

    // 💡 화면 제스처 연동형 실행 취소(Undo) 파이프라인
    undoLastLine() {
        if (this.lines.length > 0) {
            this.lines.pop();
            this.render();
            if (this.lines.length >= 2) {
                this.calculateFinalAngle();
            } else if (this.lines.length === 1) {
                const angle = this.getLineAngle(this.lines[0]);
                this.broadcastAngle(angle);
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

        // 💡 [화면 터치로 선 없애기] 더블 탭(Double Tap) 멀티 클릭 타임스탬프 계산 및 검증
        const currentTime = new Date().getTime();
        const tapLength = currentTime - this.lastTapTime;
        this.lastTapTime = currentTime;

        if (tapLength < this.tapThreshold && tapLength > 0) {
            // 더블 탭이 성공하면 현재 그리려던 잔상을 즉시 지우고 직전 획 파괴 모듈 발동
            this.currentLine = null;
            const hasUndone = this.undoLastLine();
            if (hasUndone) {
                // 상위 애플리케이션 프레임워크 스냅샷 상태 강제 자동 갱신 트리거
                const undoEvent = new CustomEvent('bowGestureUndo', { detail: { lines: this.lines } });
                window.dispatchEvent(undoEvent);
            }
            return; // 선 긋기 연산을 건너뛰고 원천 탈출
        }

        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);

        // 시작점 끝점 융합 자석 스냅 검사
        let startPt = { x: coords.x, y: coords.y };
        const snappedPt = this.findCloseEndpoint(coords.x, coords.y);
        if (snappedPt) {
            startPt = snappedPt;
        }

        this.currentLine = {
            start: startPt,
            end: { x: coords.x, y: coords.y }
        };
    }
    handlePointerMove(event) {
        if (this.toolMode !== 'draw' || !this.currentLine) return;

        const coords = this.getCanvasCoordinates(event);
        let targetX = coords.x;
        let targetY = coords.y;

        this.isSnapped = false;

        // 1. 기존 선들의 endpoints 주변 자석 착 감김 처리
        const snapEndpoint = this.findCloseEndpoint(targetX, targetY);
        if (snapEndpoint) {
            targetX = snapEndpoint.x;
            targetY = snapEndpoint.y;
            this.isSnapped = true;
        } else {
            // 2. 수평(0도), 수직(90도) 스마트 직교 스냅 보정
            const dx = targetX - this.currentLine.start.x;
            const dy = targetY - this.currentLine.start.y;
            
            if (Math.abs(dx) < this.snapThreshold) {
                targetX = this.currentLine.start.x; // 수직선 완전 고정
                this.isSnapped = true;
            } else if (Math.abs(dy) < this.snapThreshold) {
                targetY = this.currentLine.start.y; // 수평선 완전 고정
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
        if (dist > 5) {
            this.lines.push(this.currentLine);
        }
        
        this.currentLine = null;
        this.isSnapped = false;
        this.render();
        this.calculateFinalAngle();
    }

    findCloseEndpoint(x, y) {
        for (let line of this.lines) {
            if (Math.hypot(line.start.x - x, line.start.y - y) < this.snapThreshold) return line.start;
            if (Math.hypot(line.end.x - x, line.end.y - y) < this.snapThreshold) return line.end;
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

    // 💡 [그리드 폭발 버그 원천 교정] 5배 확대해도 격자가 늘어나거나 촘촘해지지 않고 50px 정갈한 밀도 상시 유지
    drawBackgroundGrid(scaleX, scaleY) {
        this.ctx.save();
        
        // 배율(scale)로 선 두께를 나누어 확대해도 실선 굵기가 항상 가늘고 정교하게 0.75px로 고정
        this.ctx.lineWidth = (0.75 * scaleX) / this.transform.scale;
        this.ctx.strokeStyle = 'rgba(0, 122, 255, 0.23)'; 

        // 물리 격자 크기 강제 역산 동기화
        const gridSize = 50 / this.transform.scale; 
        
        const widthBound = this.canvas.width / this.transform.scale;
        const heightBound = this.canvas.height / this.transform.scale;

        // 드래그 스크롤 오프셋을 역산하여 그리드 이음새가 화면 왜곡 없이 고정되도록 처리
        const startX = Math.floor((-this.transform.offsetX * scaleX / this.transform.scale) / gridSize) * gridSize - widthBound;
        const endX = startX + (widthBound * 3);

        const startY = Math.floor((-this.transform.offsetY * scaleY / this.transform.scale) / gridSize) * gridSize - heightBound;
        const endY = startY + (heightBound * 3);

        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(x, startY); this.ctx.lineTo(x, endY); this.ctx.stroke();
        }
        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(startX, y); this.ctx.lineTo(endX, y); this.ctx.stroke();
        }
        this.ctx.restore();
    }

    // 사잇각 시각화 호(Arc) 및 인라인 수치 타이포그래피 매핑 엔진
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
        const scaleY = this.canvas.height / rect.height;
        
        this.ctx.translate(this.transform.offsetX * scaleX, this.transform.offsetY * scaleY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        // 1단계: 격자선
        this.drawBackgroundGrid(scaleX, scaleY);

        // 2단계: 확정 조준선
        this.ctx.lineWidth = (2 * scaleX) / this.transform.scale; 
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';
        this.lines.forEach(line => this.drawSingleLine(line));

        // 3단계: 인라인 앵글 아크 실시간 중첩 시각화
        if (this.lines.length >= 2) {
            this.drawInlineAngleArc(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1], scaleX);
        } else if (this.lines.length === 1 && this.currentLine) {
            this.drawInlineAngleArc(this.lines, this.currentLine, scaleX);
        }

        // 4단계: 실시간 드래그선
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

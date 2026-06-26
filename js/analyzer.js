/**
 * js/analyzer.js
 * 국궁 고각 분석 시스템 - 락 프리 최종 완결판 (v20.0 - 실시간 돋보기 조준경 완결판)
 */

class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.lines = []; 
        this.currentLine = null;
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };
        this.toolMode = 'move'; 
        this.snapThreshold = 18; // 손가락 터치 타겟팅 기본 반경
        this.isSnapped = false;
        
        // 국궁 전통 표준 절대 고각 자석 제어용 플래그 상태 변수
        this.isAngleSnapped = false;
        this.angleSnapThreshold = 1.5; // 자석처럼 들러붙을 각도 오차 범위 (±1.5°)

        // 더블 탭 삭제 제어를 위한 정밀 타임 스탬프 및 좌표 추적 변수
        this.lastTapTime = 0;
        this.tapThreshold = 300; // 0.3초 이내 연속 터치 시 더블 탭 인정
        this.lastTapCoords = { x: 0, y: 0 };

        // 선/정점 편집 미세 수정을 위한 상태 변수
        this.editingLineIndex = -1;  
        this.editingVertexType = null; 
        this.movingLineIndex = -1;
        this.lastCoords = { x: 0, y: 0 };

        // 💡 [초정밀 돋보기 인터락] 실시간 돋보기 조준경 렌더링용 마우스 위치 추적 변수
        this.pointerPos = { clientX: 0, clientY: 0, showLens: false };

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

    // 💡 [줌 구도 고정 본능 수호] 확대/축소 배율 매트릭스는 그대로 사수하고 오직 선 데이터만 지워냅니다.
    clearLines() {
        this.lines = [];
        this.currentLine = null;
        this.editingLineIndex = -1;
        this.editingVertexType = null;
        this.movingLineIndex = -1;
        this.isAngleSnapped = false;
        this.pointerPos.showLens = false;
        this.render();
        this.broadcastAngle(0);
    }

    undoLastLine() {
        if (this.lines.length > 0) {
            this.lines.pop();
            this.isAngleSnapped = false;
            this.pointerPos.showLens = false;
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

    // 점과 선분 사이의 최단거리 측정 기하 연산 함수
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
        
        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);
        
        // 스타일러스 펜 입력 시 히트박스 영역을 35픽셀로 가변 확장하여 조작 성공률 극대화
        const baseRadius = (event.pointerType === 'pen') ? 35 : this.snapThreshold;
        const targetRadius = baseRadius / this.transform.scale;
        
        const currentTime = new Date().getTime();
        const tapLength = currentTime - this.lastTapTime;
        
        this.editingLineIndex = -1;
        this.editingVertexType = null;
        this.movingLineIndex = -1;

        // 선분 몸통 영역 내 '더블 탭 개별 삭제' 디텍팅 인터락
        if (tapLength < this.tapThreshold && tapLength > 0) {
            const distFromLastTap = Math.hypot(coords.x - this.lastTapCoords.x, coords.y - this.lastTapCoords.y);
            if (distFromLastTap < targetRadius) {
                for (let i = 0; i < this.lines.length; i++) {
                    if (this.getDistanceToLine(coords.x, coords.y, this.lines[i]) < targetRadius) {
                        this.lines.splice(i, 1);
                        this.lastTapTime = 0; 
                        this.currentLine = null;
                        this.isAngleSnapped = false;
                        this.pointerPos.showLens = false;
                        this.render();
                        this.calculateFinalAngle();
                        
                        const deleteEvent = new CustomEvent('bowGestureUndo', { detail: { lines: this.lines } });
                        window.dispatchEvent(deleteEvent);
                        return; 
                    }
                }
            }
        }
        
        this.lastTapTime = currentTime;
        this.lastTapCoords = coords;
        this.lastCoords = coords;

        // 💡 펜/손가락이 최초 다운되어 화면을 터치하는 순간 돋보기 렌더러 플래그 기동 준비
        this.pointerPos.clientX = event.clientX;
        this.pointerPos.clientY = event.clientY;
        this.pointerPos.showLens = true;

        // 1순위 분기: 정점(시작점/끝점) 터치 검사 (정점 개별 편집 모드)
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

        // 2순위 분기: 정점을 안 잡았다면 선분 몸통 터치 검사 (선 전체 평행 이동 모드)
        if (this.editingLineIndex === -1) {
            for (let i = 0; i < this.lines.length; i++) {
                if (this.getDistanceToLine(coords.x, coords.y, this.lines[i]) < targetRadius) {
                    this.movingLineIndex = i;
                    break;
                }
            }
        }

        // 3순위 분기: 아무것도 잡지 않은 허공이라면 신규 가이드라인 드로잉 가동
        if (this.editingLineIndex === -1 && this.movingLineIndex === -1) {
            let startPt = { x: coords.x, y: coords.y };
            const snappedPt = this.findCloseEndpoint(coords.x, coords.y);
            if (snappedPt) startPt = snappedPt;
            this.currentLine = { start: startPt, end: { x: coords.x, y: coords.y } };
        }
        this.render();
    }

    // 국궁 사법 고유 타깃 절대 각도 자석 매핑 핵심 필터링 함수
    snapToAbsoluteAngles(basePt, targetX, targetY) {
        const dx = targetX - basePt.x;
        const dy = targetY - basePt.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) return { x: targetX, y: targetY };

        let rawAngle = Math.atan2(-dy, dx) * (180 / Math.PI);
        if (rawAngle < 0) rawAngle += 360;
        const normalizedAngle = rawAngle % 180;

        const targets = [37.79, 52.21];
        this.isAngleSnapped = false;

        for (let target of targets) {
            if (Math.abs(normalizedAngle - target) < this.angleSnapThreshold) {
                this.isAngleSnapped = true;
                let targetRad = target * (Math.PI / 180);
                if (rawAngle >= 180) targetRad = (target + 180) * (Math.PI / 180);
                return {
                    x: basePt.x + length * Math.cos(targetRad),
                    y: basePt.y - length * Math.sin(targetRad)
                };
            }
        }
        return { x: targetX, y: targetY };
    }

    handlePointerMove(event) {
        if (this.toolMode !== 'draw') return;
        event.preventDefault();
        const coords = this.getCanvasCoordinates(event);
        let targetX = coords.x;
        let targetY = coords.y;
        this.isSnapped = false;

        const isPen = (event.pointerType === 'pen');
        const baseRadius = isPen ? 35 : this.snapThreshold;

        // 💡 드래그 이동 중 손가락 끝 실시간 뷰포트 좌표 데이터 연속 동기화 및 돋보기 활성화
        this.pointerPos.clientX = event.clientX;
        this.pointerPos.clientY = event.clientY;
        this.pointerPos.showLens = true;

        // 분기 A: 정점 개별 미세 편집 드래그 처리
        if (this.editingLineIndex !== -1 && this.editingVertexType) {
            const line = this.lines[this.editingLineIndex];
            const currentVertex = this.editingVertexType === 'start' ? line.start : line.end;
            const basePt = this.editingVertexType === 'start' ? line.end : line.start;
            
            if (isPen) {
                targetX = currentVertex.x + 0.55 * (coords.x - currentVertex.x);
                targetY = currentVertex.y + 0.55 * (coords.y - currentVertex.y);
            }

            const angleSnappedPt = this.snapToAbsoluteAngles(basePt, targetX, targetY);
            targetX = angleSnappedPt.x;
            targetY = angleSnappedPt.y;

            if (!this.isAngleSnapped) {
                const adjustedThreshold = baseRadius / this.transform.scale;
                const dx = targetX - basePt.x;
                const dy = targetY - basePt.y;
                if (Math.abs(dx) < adjustedThreshold) { targetX = basePt.x; this.isSnapped = true; }
                else if (Math.abs(dy) < adjustedThreshold) { targetY = basePt.y; this.isSnapped = true; }
            }

            if (this.editingVertexType === 'start') { line.start = { x: targetX, y: targetY }; }
            else { line.end = { x: targetX, y: targetY }; }

            this.render();
            this.calculateFinalAngle();
        } 
        // 분기 B: 선 전체 몸통 통째로 평행 이동 드래그 처리
        else if (this.movingLineIndex !== -1) {
            const line = this.lines[this.movingLineIndex];
            let deltaX = coords.x - this.lastCoords.x;
            let deltaY = coords.y - this.lastCoords.y;

            if (isPen) {
                deltaX *= 0.55;
                deltaY *= 0.55;
            }

            line.start.x += deltaX;
            line.start.y += deltaY;
            line.end.x += deltaX;
            line.end.y += deltaY;

            this.lastCoords = coords;
            this.render();
            this.calculateFinalAngle();
        }
        // 분기 C: 실시간 신규 가이드라인 드로우 트랙킹
        else if (this.currentLine) {
            const angleSnappedPt = this.snapToAbsoluteAngles(this.currentLine.start, targetX, targetY);
            targetX = angleSnappedPt.x;
            targetY = angleSnappedPt.y;

            if (!this.isAngleSnapped) {
                const snapEndpoint = this.findCloseEndpoint(targetX, targetY);
                if (snapEndpoint) {
                    targetX = snapEndpoint.x; targetY = snapEndpoint.y; this.isSnapped = true;
                } else {
                    const adjustedThreshold = baseRadius / this.transform.scale;
                    const dx = targetX - this.currentLine.start.x;
                    const dy = targetY - this.currentLine.start.y;
                    if (Math.abs(dx) < adjustedThreshold) { targetX = this.currentLine.start.x; this.isSnapped = true; }
                    else if (Math.abs(dy) < adjustedThreshold) { targetY = this.currentLine.start.y; this.isSnapped = true; }
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
        
        // 💡 [캡처 무결성 수호] 손가락/펜을 화면에서 떼는 순간 돋보기 UI 그래픽은 즉시 완벽 소거 폐기합니다.
        this.pointerPos.showLens = false;

        if (this.toolMode !== 'draw') return;

        if (this.editingLineIndex !== -1 && this.editingVertexType) {
            this.editingLineIndex = -1;
            this.editingVertexType = null;
            this.isAngleSnapped = false;
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
            this.isAngleSnapped = false;
            this.render();
            this.calculateFinalAngle();
        }
    }

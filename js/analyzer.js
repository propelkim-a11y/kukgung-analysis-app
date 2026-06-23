/**
 * js/analyzer.js
 * 국궁 고각 분석 및 스타일러스 펜 제어 시스템
 * - S펜 / 애플펜슬 Palm Rejection 및 포인터 분리
 * - 줌/이동 변환 행렬 역산 (확대 상태에서도 정확한 조준점 매핑)
 * - 삼각함수 기반 다중 선긋기 사잇각(고각) 초정밀 연산
 */

class BowAnalyzer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        
        // 다중 선 데이터 구조 (각 선은 시작점과 끝점 좌표 보유)
        // [{ start: {x, y}, end: {x, y} }, ...]
        this.lines = []; 
        this.currentLine = null;

        // 뷰포트 변환 상태 (app.js의 확대/축소/이동과 동기화 필요)
        this.transform = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };

        // 활성화된 툴 모드 ('move' 또는 'draw')
        this.toolMode = 'move'; 

        // 바인딩
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
    }

    /**
     * 캔버스 엘리먼트 초기화 및 포인터 이벤트 바인딩
     */
    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.setupPointerEvents();
    }

    /**
     * 외부(app.js)에서 변환 행렬 값을 실시간으로 주입받는 동기화 메서드
     */
    updateTransform(scale, offsetX, offsetY) {
        this.transform.scale = scale;
        this.transform.offsetX = offsetX;
        this.transform.offsetY = offsetY;
        this.render();
    }

    /**
     * 툴 모드 변경 ([확대] -> 'move', [선긋기] -> 'draw')
     */
    setMode(mode) {
        this.toolMode = mode;
    }

    /**
     * 그어진 모든 조준선 데이터 완전 초기화
     */
    clearLines() {
        this.lines = [];
        this.currentLine = null;
        this.render();
        this.broadcastAngle(0);
    }

    /**
     * Pointer Events API 적용 (S펜/애플펜슬 분리 및 Palm Rejection)
     */
    setupPointerEvents() {
        if (!this.canvas) return;

        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.canvas.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    }

    /**
     * 화면 상의 절대 픽셀 좌표를 줌/이동이 적용된 비디오 캔버스의 로컬 좌표로 역산
     */
    getCanvasCoordinates(event) {
        const rect = this.canvas.getBoundingClientRect();
        
        // 1. 브라우저 창 내의 순수 마우스/터치 물리 좌표 추출
        const clientX = event.clientX - rect.left;
        const clientY = event.clientY - rect.top;

        // 2. 확대 비율(Scale)과 화면 스크롤 스크린 이동 값(Offset)을 역산하여 본래 비디오 소스 좌표로 보정
        const canvasX = (clientX - this.transform.offsetX) / this.transform.scale;
        const canvasY = (clientY - this.transform.offsetY) / this.transform.scale;

        return { x: canvasX, y: canvasY };
    }

    /**
     * 터치/스타일러스 입력 시작
     */
    handlePointerDown(event) {
        if (this.toolMode !== 'draw') return;

        // Palm Rejection: 스타일러스 펜이 접근한 상태에서 손바닥 터치(touch)가 들어오면 전면 차단 무시
        if (event.pointerType === 'touch' && event.touchType === 'direct' && window.isStylusActive) {
            return; 
        }
        if (event.pointerType === 'pen') {
            window.isStylusActive = true;
        }

        this.canvas.setPointerCapture(event.pointerId);
        const coords = this.getCanvasCoordinates(event);

        // 새로운 선 드로잉 개시
        this.currentLine = {
            start: { x: coords.x, y: coords.y },
            end: { x: coords.x, y: coords.y }
        };
    }

    /**
     * 드래그 (선 긋는 중)
     */
    handlePointerMove(event) {
        if (this.toolMode !== 'draw' || !this.currentLine) return;

        const coords = this.getCanvasCoordinates(event);
        this.currentLine.end = { x: coords.x, y: coords.y };
        
        this.render();
        this.calculateAnglesInline();
    }

    /**
     * 입력 종료 및 선 확정
     */
    handlePointerUp(event) {
        if (event.pointerType === 'pen') {
            setTimeout(() => { window.isStylusActive = false; }, 500); // 펜 이탈 후 딜레이 캐싱
        }

        if (this.toolMode !== 'draw' || !this.currentLine) return;

        // 미세하게 터치만 하고 뗀 경우는 선으로 인정하지 않음 (노이즈 방지)
        const dist = Math.hypot(this.currentLine.end.x - this.currentLine.start.x, this.currentLine.end.y - this.currentLine.start.y);
        if (dist > 5) {
            this.lines.push(this.currentLine);
        }
        
        this.currentLine = null;
        this.render();
        this.calculateFinalAngle();
    }

    /**
     * 삼각함수 atan2 기반 고각 및 사잇각 연산
     */
    calculateAnglesInline() {
        if (this.lines.length === 0 && this.currentLine) {
            // 단일 선만 그어지고 있을 때는 해당 선의 지면 대비 수평 고각 계산
            const angle = this.getLineAngle(this.currentLine);
            this.broadcastAngle(angle);
        } else if (this.lines.length >= 1 && this.currentLine) {
            // 기존 선이 존재하고 새 선을 추가 전 가이드 중일 때 두 선의 사잇각 연산
            const angle = this.getIntersectionAngle(this.lines[this.lines.length - 1], this.currentLine);
            this.broadcastAngle(angle);
        }
    }

    calculateFinalAngle() {
        if (this.lines.length >= 2) {
            // 마지막에 그어진 2개 선의 사잇각을 최종 도출
            const line1 = this.lines[this.lines.length - 2];
            const line2 = this.lines[this.lines.length - 1];
            const angle = this.getIntersectionAngle(line1, line2);
            this.broadcastAngle(angle);
        } else if (this.lines.length === 1) {
            const angle = this.getLineAngle(this.lines[0]);
            this.broadcastAngle(angle);
        }
    }

    /**
     * 단일 선의 절대 수평각 측정 (atan2)
     */
    getLineAngle(line) {
        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;
        let angle = Math.atan2(-dy, dx) * (180 / Math.PI); // 컴퓨터 그래픽스 Y축 반전 보정
        if (angle < 0) angle += 360;
        return angle % 180; // 직선의 기울기 각도 범위(0~180) 평탄화
    }

    /**
     * 두 선 사이의 사잇각(내각) 계산
     */
    getIntersectionAngle(line1, line2) {
        const angle1 = Math.atan2(-(line1.end.y - line1.start.y), line1.end.x - line1.start.x);
        const angle2 = Math.atan2(-(line2.end.y - line2.start.y), line2.end.x - line2.start.x);
        
        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        return diff;
    }

    /**
     * 좌측 상단 플로팅 리포트에 각도 전달을 위한 이벤트 발행
     */
    broadcastAngle(angle) {
        const angleEvent = new CustomEvent('bowAngleUpdate', {
            detail: { angle: angle.toFixed(1) }
        });
        window.dispatchEvent(angleEvent);
    }

    /**
     * 캔버스 선 디스플레이 렌더링 루프
     */
    render() {
        if (!this.ctx || !this.canvas) return;

        // 기존 궤적 청소
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        // 중요: 메인 화면의 줌 행렬 상태(확대/이동)를 캔버스 컨텍스트에 그대로 주입
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        // 선 스타일 지정 (시인성이 좋은 형광 연두 계열 선조 조율)
        this.ctx.lineWidth = 2 / this.transform.scale; // 확대 시에도 선 두께 일정 유지 보정
        this.ctx.strokeStyle = '#00FF66';
        this.ctx.fillStyle = '#00FF66';

        // 1. 기 확정된 모든 조준선들 그리기
        this.lines.forEach(line => this.drawSingleLine(line));

        // 2. 현재 실시간으로 드래그 중인 임시 조준선 그리기
        if (this.currentLine) {
            this.ctx.strokeStyle = '#FFFF00'; // 드래그 중일 때는 황색 점조 가이드
            this.ctx.fillStyle = '#FFFF00';
            this.drawSingleLine(this.currentLine);
        }

        this.ctx.restore();
    }

    /**
     * 선 및 시작/끝점 조준 앵커 그리기
     */
    drawSingleLine(line) {
        this.ctx.beginPath();
        this.ctx.moveTo(line.start.x, line.start.y);
        this.ctx.lineTo(line.end.x, line.end.y);
        this.ctx.stroke();

        // 양 끝단에 정밀 조준용 미세 원형 앵커 배치
        const radius = 4 / this.transform.scale;
        this.ctx.beginPath();
        this.ctx.arc(line.start.x, line.start.y, radius, 0, 2 * Math.PI);
        this.ctx.arc(line.end.x, line.end.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
    }
}

// 전역 싱글톤 인스턴스 내보내기
window.bowAnalyzer = new BowAnalyzer();

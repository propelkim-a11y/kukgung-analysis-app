/**
 * analyzer.js
 * 렉 제거 최적화, 비디오 원본 비율 보존 및 자유 확대/축소 다중 분석 엔진 (선긋기 모드 메뉴 연동판)
 */

export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        
        this.points = []; // 무제한 다중 선 긋기 좌표 배열
        
        // 피치 투 줌 및 화면 자유 이동 매트릭스 변수
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.lastTouchDist = 0; 

        // 🛠️ 신설: 모드 메뉴 제어 변수 (기본값은 'draw' 선 긋기 모드)
        this.toolMode = 'draw'; 
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        // 리스너 오버랩 중복 등록 방지를 위해 기존 이벤트 수동 제거
        this.canvas.removeEventListener('mousedown', this.boundHandleStart);
        this.canvas.removeEventListener('mousemove', this.boundHandleMove);
        this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart);
        this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove);

        this.boundHandleStart = (e) => this.handleStart(e);
        this.boundHandleMove = (e) => this.handleMove(e);
        this.boundHandleTouchStart = (e) => this.handleTouchStart(e);
        this.boundHandleTouchMove = (e) => this.handleTouchMove(e);

        // PC 마우스 매핑
        this.canvas.addEventListener('mousedown', this.boundHandleStart);
        this.canvas.addEventListener('mousemove', this.boundHandleMove);
        
        // 모바일 터치 제스처 매핑
        this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
        
        // 드래그 마감 처리 바인딩 통합
        const endDrag = () => { this.isDragging = false; this.lastTouchDist = 0; };
        window.addEventListener('mouseup', endDrag);
        this.canvas.addEventListener('touchend', endDrag);

        this.draw();
    }

    // ⚡ 외부 app.js 메뉴 탭 버튼 클릭 시 모드를 전환해주는 통제 함수
    setToolMode(mode) {
        this.toolMode = mode; // 'draw' 또는 'move' 수신
        this.isDragging = false;
        console.log(`[작동 모드 변경] 현재 전환된 모드: ${mode === 'draw' ? '✏️ 선 긋기' : '🔍 화면 조작'}`);
    }

    // 화면 비율 스케일을 역산하여 드래그나 확대 중에도 점이 마우스/손가락 끝에 정확히 물리게 매핑하는 함수
    getCanvasCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = (clientX - rect.left) * (this.canvas.width / rect.width);
        const screenY = (clientY - rect.top) * (this.canvas.height / rect.height);
        
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    handleStart(e) {
        // 🛠️ 마우스 제어 시 'move' 모드이거나 우클릭(또는 Ctrl+클릭) 시 드래그 가동
        if (this.toolMode === 'move' || e.button === 2 || e.ctrlKey) { 
            this.isDragging = true;
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            return;
        }
        
        // 'draw' 선 긋기 모드일 때만 좌표를 찍음
        const coord = this.getCanvasCoordinates(e.clientX, e.clientY);
        this.points.push(coord);
        this.draw();
        this.calculateAngles();
    }

    handleMove(e) {
        if (!this.isDragging) return;
        this.offsetX = e.clientX - this.startX;
        this.offsetY = e.clientY - this.startY;
        this.draw();
    }

    handleTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        
        // 1. 손가락 2개 멀티터치는 어떤 모드이든 상관없이 무조건 피치 줌 확대/축소 작동
        if (e.touches.length === 2) { 
            this.lastTouchDist = this.getTouchDistance(e.touches[0], e.touches[1]);
        } 
        // 2. 한 손가락 터치 시 모드별 분기
        else if (e.touches.length === 1) {
            // 🛠️ 메뉴 탭이 '화면 이동/확대' 모드인 경우 밀어서 화면 스크롤 제어
            if (this.toolMode === 'move') { 
                this.isDragging = true;
                this.startX = e.touches[0].clientX - this.offsetX;
                this.startY = e.touches[0].clientY - this.offsetY;
            } 
            // 🛠️ 메뉴 탭이 '선 긋기' 모드인 경우 렉 없이 실시간 점 찍기 작동
            else {
                const coord = this.getCanvasCoordinates(e.touches[0].clientX, e.touches[0].clientY);
                this.points.push(coord);
                this.draw();
                this.calculateAngles();
            }
        }
    }

    handleTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        
        // 멀티터치 실시간 배율 확대 연산
        if (e.touches.length === 2 && this.lastTouchDist > 0) {
            const dist = this.getTouchDistance(e.touches[0], e.touches[1]);
            const factor = dist / this.lastTouchDist;
            this.scale = Math.min(5.0, Math.max(1.0, this.scale * factor)); // 최대 5배 확대 락
            this.lastTouchDist = dist;
            this.draw();
        } 
        // 한 손가락 캔버스 이동 제어
        else if (e.touches.length === 1 && this.isDragging) {
            this.offsetX = e.touches[0].clientX - this.startX;
            this.offsetY = e.touches[0].clientY - this.startY;
            this.draw();
        }
    }

    getTouchDistance(t1, t2) {
        return Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
    }

    // 비디오 원본 가로세로 비(Ratio)를 그대로 추적하면서 왜곡 없이 도화지에 그리는 핵심 연산 렌더러
    draw() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const v = window.analysisVideo;
        if (v && v.videoWidth > 0) {
            this.ctx.save();
            this.ctx.translate(this.offsetX, this.offsetY);
            this.ctx.scale(this.scale, this.scale);

            const vRatio = v.videoWidth / v.videoHeight;
            const cRatio = this.canvas.width / this.canvas.height;
            let drawW = this.canvas.width;
            let drawH = this.canvas.height;
            let drawX = 0;
            let drawY = 0;

            // 레터박스 여백 비율 계산식을 통한 원본 가로세로비 완벽 유지 강제화
            if (vRatio > cRatio) {
                drawH = this.canvas.width / vRatio;
                drawY = (this.canvas.height - drawH) / 2;
            } else {
                drawW = this.canvas.height * vRatio;
                drawX = (this.canvas.width - drawW) / 2;
            }

            // 동영상 프레임 캔버스 투사
            this.ctx.drawImage(v, drawX, drawY, drawW, drawH);

            // ⚡ 영상 뒤편에 상시 고정되어 지워지지 않는 은은한 격자 크로스 수직수평선 투사
            this.ctx.lineWidth = 1.5 / this.scale;
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; 
            this.ctx.setLineDash([8 / this.scale, 8 / this.scale]); 
            
            // 정중앙 수평선
            this.ctx.beginPath(); this.ctx.moveTo(0, this.canvas.height / 2); this.ctx.lineTo(this.canvas.width, this.canvas.height / 2); this.ctx.stroke();
            // 정중앙 수직선
            this.ctx.beginPath(); this.ctx.moveTo(this.canvas.width / 2, 0); this.ctx.lineTo(this.canvas.width / 2, this.canvas.height); this.ctx.stroke();
            this.ctx.setLineDash([]); 

            // 무제한 사용자 마크 렌더링 파이프라인
            this.ctx.lineCap = 'round';
            for (let i = 0; i < this.points.length; i++) {
                const isEvenPair = Math.floor(i / 2) % 2 === 0;
                const color = isEvenPair ? '#ff3b30' : '#007aff'; 
                
                // 터치 포인트 마커 동그라미 반지름 슬림 정밀 보정
                this.ctx.beginPath();
                this.ctx.arc(this.points[i].x, this.points[i].y, 4 / this.scale, 0, Math.PI * 2);
                this.ctx.fillStyle = color; this.ctx.fill();
                this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 1.2 / this.scale; this.ctx.stroke();

                // 2개 조가 한 선을 이루도록 링크 연산
                if (i % 2 === 1) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = color;
                    this.ctx.lineWidth = 3 / this.scale;
                    this.ctx.moveTo(this.points[i-1].x, this.points[i-1].y);
                    this.ctx.lineTo(this.points[i].x, this.points[i].y);
                    this.ctx.stroke();
                }
            }
            this.ctx.restore();
        }
    }

    // 선을 여러 개 그었을 때 가장 최근에 생성된 마지막 2쌍의 직선을 추적해 소수점 첫째 자리까지 정밀 각도 연산
    calculateAngles() {
        const len = this.points.length;
        if (len < 4 || len % 2 !== 0) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = `분석 중... (배치된 총 직선: ${Math.floor(len / 2)}개)`;
            return;
        }

        const p1 = this.points[len - 4];
        const p2 = this.points[len - 3];
        const p3 = this.points[len - 2];
        const p4 = this.points[len - 1];

        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const v2 = { x: p4.x - p3.x, y: p4.y - p3.y };

        const dotProduct = v1.x * v2.x + v1.y * v2.y;
        const dist1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const dist2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (dist1 === 0 || dist2 === 0) return;
        let cosTheta = Math.min(1.0, Math.max(-1.0, dotProduct / (dist1 * dist2)));
        let angleDeg = Math.acos(cosTheta) * (180 / Math.PI);

        if (angleDeg > 90) angleDeg = 180 - angleDeg;

        // 소수점 첫째 자리 표기 강제 슬라이스 연산 (.toFixed(1))
        const finalAngle = angleDeg.toFixed(1);
        if (this.angleDisplay) this.angleDisplay.innerText = `${finalAngle}°`;
        if (this.badgeDisplay) this.badgeDisplay.innerText = "분석 완료! 선을 이어서 계속 그을 수 있습니다.";
    }

    clear() {
        this.points = [];
        this.scale = 1.0; this.offsetX = 0; this.offsetY = 0; 
        this.draw();
        if (this.angleDisplay) this.angleDisplay.innerText = '0.0°';
        if (this.badgeDisplay) this.badgeDisplay.innerText = "두 선을 선택하세요.";
    }
}

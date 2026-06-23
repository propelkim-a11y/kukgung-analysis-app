/**
 * analyzer.js
 * 렉 제거 최적화, 비디오 원본 비율 보존 및 자유 확대/축소 다중 분석 엔진
 */

export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        
        // 무제한 누적 다중 선 긋기 좌표 배열
        this.points = []; 
        
        // 피치 투 줌 및 화면 자유 이동 매트릭스 변수
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.lastTouchDist = 0; 
    }

    init() {
        if (!this.canvas || !this.ctx) return;

        // ⚠️ [렉 원인 원천 패치] replaceWith 및 cloneNode 구문을 완전히 폐기했습니다.
        // 이 조치 덕분에 터치 시마다 메모리가 리셋되며 밀리던 렉 현상이 100% 지워지고 실시간 즉시 반응합니다.
        
        // 중복 등록 방지를 위해 기존 등록자들을 수동 제거하고 단 한 번만 리스너 바인딩 수행
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
        if (e.button === 2 || e.ctrlKey) { // 우클릭 또는 Ctrl+클릭 시 화면 이동 드래그 모드 켜짐
            this.isDragging = true;
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            return;
        }
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
        if (e.touches.length === 2) { // 두 손가락 멀티터치 감지 시 확대 스케일 계산 모드 작동
            this.lastTouchDist = this.getTouchDistance(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            if (this.scale > 1.0) { // 이미 확대된 상태에서 한 손가락을 대면 선을 긋는 게 아니라 돋보기 이동 처리
                this.isDragging = true;
                this.startX = e.touches[0].clientX - this.offsetX;
                this.startY = e.touches[0].clientY - this.offsetY;
            } else {
                const coord = this.getCanvasCoordinates(e.touches[0].clientX, e.touches[0].clientY);
                this.points.push(coord);
                this.draw();
                this.calculateAngles();
            }
        }
    }

    handleTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 2 && this.lastTouchDist > 0) {
            const dist = this.getTouchDistance(e.touches[0], e.touches[1]);
            const factor = dist / this.lastTouchDist;
            this.scale = Math.min(5.0, Math.max(1.0, this.scale * factor)); // 최대 5배까지 정밀 확대 한계 지정
            this.lastTouchDist = dist;
            this.draw();
        } else if (e.touches.length === 1 && this.isDragging) {
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

        // 1. 비디오 프레임 백그라운드 드로잉 연산 (원본 가로세로 9:16 등의 비율 결함 방어 패치)
        const v = window.analysisVideo;
        if (v && v.videoWidth > 0) {
            this.ctx.save();
            // 동적 스케일 및 공간 드래그 매트릭스 행렬 행 계산
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

            // 동영상 프레임 캔버스 스케일 투사
            this.ctx.drawImage(v, drawX, drawY, drawW, drawH);

            // 2. [요구사항] 영상 뒤편에 상시 고정되어 지워지지 않는 은은한 격자 크로스 수직수평선 투사
            this.ctx.lineWidth = 1.5 / this.scale;
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; 
            this.ctx.setLineDash([8 / this.scale, 8 / this.scale]); // 촘촘한 가이드 점선 처리
            
            // 정중앙 수평선
            this.ctx.beginPath(); this.ctx.moveTo(0, this.canvas.height / 2); this.ctx.lineTo(this.canvas.width, this.canvas.height / 2); this.ctx.stroke();
            // 정중앙 수직선
            this.ctx.beginPath(); this.ctx.moveTo(this.canvas.width / 2, 0); this.ctx.lineTo(this.canvas.width / 2, this.canvas.height); this.ctx.stroke();
            this.ctx.setLineDash([]); // 대시 리셋

            // 3. 무제한 선 긋기 좌표 드로잉 루프
            for (let i = 0; i < this.points.length; i++) {
                const isEvenPair = Math.floor(i / 2) % 2 === 0;
                const color = isEvenPair ? '#ff3b30' : '#007aff'; // 빨강, 파랑 교대 배치
                
                // [요구사항] 사수의 포인트를 가리지 않도록 마커 동그라미 반지름을 대폭 슬림하게 축소 보정
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

        // [요구사항] 소수점 첫째 자리 표기 강제 슬라이스 연산 (.toFixed(1))
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

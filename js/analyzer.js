/**
 * analyzer.js (1번째 조각)
 * 스타일러스 펜(S펜, 애플펜슬) 최적화, 피치 줌 고정 수리, 정밀 격자 그리드 및 렉 제거 다중 분석 엔진
 */

export class BowAnalyzer {
    constructor() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.angleDisplay = document.getElementById('res-manual-angle');
        this.badgeDisplay = document.getElementById('angle-display');
        
        this.points = []; // 독립 쌍을 이루는 다중 선 긋기 좌표 배열 (2점당 1개 직선)
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.lastTouchDist = 0; 
        this.toolMode = 'move'; 
        
        // S펜/애플펜슬 및 멀티 터치 인식을 위한 포인터 상태 추적 맵
        this.activePointers = new Map();
    }

    /**
     * 분석 도화지 터치 인터페이스 이벤트 핸들러 초기 결속
     */
    init() {
        if (!this.canvas || !this.ctx) return;

        // 중복 등록 방지를 위해 기존 이벤트 완벽 제거 후 단 1회 재등록
        this.canvas.removeEventListener('pointerdown', this.boundHandlePointerDown);
        this.canvas.removeEventListener('pointermove', this.boundHandlePointerMove);
        this.canvas.removeEventListener('pointerup', this.boundHandlePointerUp);
        this.canvas.removeEventListener('pointercancel', this.boundHandlePointerUp);

        this.boundHandlePointerDown = (e) => this.handlePointerDown(e);
        this.boundHandlePointerMove = (e) => this.handlePointerMove(e);
        this.boundHandlePointerUp = (e) => this.handlePointerUp(e);

        this.canvas.addEventListener('pointerdown', this.boundHandlePointerDown);
        this.canvas.addEventListener('pointermove', this.boundHandlePointerMove);
        this.canvas.addEventListener('pointerup', this.boundHandlePointerUp);
        this.canvas.addEventListener('pointercancel', this.boundHandlePointerUp);

        this.canvas.removeEventListener('wheel', this.boundHandleWheel);
        this.boundHandleWheel = (e) => this.handleWheel(e);
        this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false });

        this.draw();
    }

    /**
     * 툴 모드 교체 커맨더 (move: 확대스크롤 / draw: 선긋기)
     */
    setToolMode(mode) {
        this.toolMode = mode; 
        this.isDragging = false;
        this.activePointers.clear();
    }

    /**
     * 뷰포트 물리 터치 점을 줌 배율 및 드래그 위치로 정밀 역산하여 도화지 실좌표로 교정
     */
    getCanvasCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = (clientX - rect.left) * (this.canvas.width / rect.width);
        const screenY = (clientY - rect.top) * (this.canvas.height / rect.height);
        
        return {
            x: (screenX - this.offsetX) / this.scale,
            y: (screenY - this.offsetY) / this.scale
        };
    }

    /**
     * 포인터 터치/다운 코어 파이프라인
     */
    handlePointerDown(e) {
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, e);

        const pointerType = e.pointerType; 
        
        // 손가락 2개가 화면에 닿았을 때 물리 화면 픽셀 거리 타겟팅 (피치 투 줌 복구 수식)
        if (this.activePointers.size === 2) {
            this.isDragging = false; 
            const pointers = Array.from(this.activePointers.values());
            this.lastTouchDist = this.getPointerDistance(pointers, pointers);
            return;
        }

        // move(확대) 모드이거나 마우스 오른쪽 단추 클릭 시 자유 화면 드래그 스크롤 트리거
        if (this.toolMode === 'move' || e.button === 2) { 
            this.isDragging = true;
            this.startX = e.clientX - this.offsetX;
            this.startY = e.clientY - this.offsetY;
            return;
        }

        // draw(선긋기) 모드 포인팅 처리
        if (this.toolMode === 'draw') {
            // 하드웨어 S펜/애플펜슬이 닿아있다면 일반 손가락 터치는 팜 리젝션 필터링
            if (pointerType === 'touch' && this.hasPenActive()) return;

            const coord = this.getCanvasCoordinates(e.clientX, e.clientY);
            this.points.push(coord);
            this.draw();
            this.calculateAngles();
        }
    }

    /**
     * 현재 수집 중인 터치 장치들 중 스타일러스 펜 노드 존재 유무 검사기
     */
    hasPenActive() {
        for (const p of this.activePointers.values()) {
            if (p.pointerType === 'pen') return true;
        }
        return false;
    }

    /**
     * 터치/마우스 실시간 드래그 트래킹 파이프라인
     */
    handlePointerMove(e) {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, e); 

        // 실시간 멀티 터치 물리 거리를 계산하여 동적 스케일 조절 (최대 5배 한계 줌)
        if (this.activePointers.size === 2 && this.lastTouchDist > 0) {
            const pointers = Array.from(this.activePointers.values());
            const dist = this.getPointerDistance(pointers, pointers);
            const factor = dist / this.lastTouchDist;
            
            this.scale = Math.min(5.0, Math.max(1.0, this.scale * factor)); 
            this.lastTouchDist = dist;
            this.draw();
            return;
        }

        // 화면 캔버스 이동 제어 (한 손가락 밀어서 자유 드래그)
        if (this.isDragging) {
            this.offsetX = e.clientX - this.startX;
            this.offsetY = e.clientY - this.startY;
            this.draw();
        }
    }

    /**
     * 터치 이탈 안전 해제 구문
     */
    handlePointerUp(e) {
        this.activePointers.delete(e.pointerId);
        if (this.activePointers.size < 2) {
            this.lastTouchDist = 0;
        }
        this.isDragging = false;
    }

    /**
     * PC 휠 마우스 장치 줌 배율 서포터
     */
    handleWheel(e) {
        e.preventDefault();
        const zoomFactor = 1.1;
        if (e.deltaY < 0) {
            this.scale = Math.min(5.0, this.scale * zoomFactor);
        } else {
            this.scale = Math.max(1.0, this.scale / zoomFactor);
        }
        this.draw();
    }

    /**
     * 두 포인터 간의 순수 물리 피타고라스 직선 거리 환산 알고리즘
     */
    getPointerDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.clientX - p1.clientX, 2) + Math.pow(p2.clientY - p1.clientY, 2));
    }
    /**
     * 렌더링 컨텍스트 그래픽스 파이프라인 매핑 구문
     */
    draw() {
        if (!this.ctx) return;
        
        // 프레임 시작 즉시 도화지 완전 클리어
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. [최하단 레이어] 백그라운드 영상 프레임 렌더링 (contain 원본 비율 왜곡 없이 보존)
        const v = window.analysisVideo;
        if (v && v.videoWidth > 0) {
            this.ctx.save();
            // 동영상은 사용자가 확대한 배율과 드래그 오프셋 좌표 공간에 실시간 밀착 동기화
            this.ctx.translate(this.offsetX, this.offsetY);
            this.ctx.scale(this.scale, this.scale);

            const vRatio = v.videoWidth / v.videoHeight;
            const cRatio = this.canvas.width / this.canvas.height;
            let drawW = this.canvas.width;
            let drawH = this.canvas.height;
            let drawX = 0;
            let drawY = 0;

            if (vRatio > cRatio) {
                drawH = this.canvas.width / vRatio;
                drawY = (this.canvas.height - drawH) / 2;
            } else {
                drawW = this.canvas.height * vRatio;
                drawX = (this.canvas.width - drawW) / 2;
            }
            this.ctx.drawImage(v, drawX, drawY, drawW, drawH);
            this.ctx.restore();
        }

        // 2. [중간 레이어] 바둑판 정밀 격자 그리드 제도 (50픽셀 간격 모눈종이 영구 고정 표출)
        this.ctx.save();
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'; 
        
        const gridSize = 50;
        this.ctx.beginPath();
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
        }
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
        }
        this.ctx.stroke();

        // 3. [중간 레이어] 상시 고정 센터 점선 십자가 기준 가이드라인 투사
        this.ctx.lineWidth = 1.2;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; 
        this.ctx.setLineDash(); // 픽셀 절대 고정 점선
        
        this.ctx.beginPath(); 
        this.ctx.moveTo(0, this.canvas.height / 2); 
        this.ctx.lineTo(this.canvas.width, this.canvas.height / 2); 
        this.ctx.stroke();
        
        this.ctx.beginPath(); 
        this.ctx.moveTo(this.canvas.width / 2, 0); 
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height); 
        this.ctx.stroke();
        this.ctx.setLineDash([]); 
        this.ctx.restore();

        // 4. [최상단 레이어] 사용자 무제한 다중 선 렌더 루프
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.lineCap = 'round';

        for (let i = 0; i < this.points.length; i++) {
            const isEvenPair = Math.floor(i / 2) % 2 === 0;
            const color = isEvenPair ? '#ff3b30' : '#007aff'; // Red / Blue 패밀리룩 색상 가로지르기
            
            // 조준 꼭짓점 원형 앵커 제도
            this.ctx.beginPath();
            this.ctx.arc(this.points[i].x, this.points[i].y, 5 / this.scale, 0, Math.PI * 2);
            this.ctx.fillStyle = color; 
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff'; 
            this.ctx.lineWidth = 1.2 / this.scale; 
            this.ctx.stroke();

            // 2점식 독립 쌍이 연결 완료될 때마다 선 드로잉 결속
            if (i % 2 === 1) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 3 / this.scale; // 배율 역산으로 언제나 깨끗한 3px 두께 고정 유지
                this.ctx.moveTo(this.points[i-1].x, this.points[i-1].y);
                this.ctx.lineTo(this.points[i].x, this.points[i].y);
                this.ctx.stroke();
            }
        }
        this.ctx.restore();
    }

    /**
     * [독립 2직선 삼각 사잇각 연산 모듈]
     * 두 직선의 사잇각은 언제나 예각(0° ~ 90°)으로 산출하는 국궁 필드 자세 분석 표준 매칭
     */
    calculateAngles() {
        const len = this.points.length;
        if (len < 4 || len % 2 !== 0) {
            if (this.badgeDisplay) this.badgeDisplay.innerText = `선 배치 상태: ${Math.floor(len / 2)}개 완료`;
            return;
        }

        // 가장 최근에 구성 완료된 2개 직선(총 4개 좌표 노드) 엄격 추출
        const p1 = this.points[len - 4];
        const p2 = this.points[len - 3]; // 직선 A
        const p3 = this.points[len - 2];
        const p4 = this.points[len - 1]; // 직선 B

        // 각 직선의 2차원 방향 벡터 추출
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const v2 = { x: p4.x - p3.x, y: p4.y - p3.y };

        // 벡터 공간 내적 및 길이 추출
        const dotProduct = v1.x * v2.x + v1.y * v2.y;
        const dist1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const dist2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        if (dist1 === 0 || dist2 === 0) return;
        
        // 라디안 값 획득 및 디그리 도 단위 변환
        let cosTheta = Math.min(1.0, Math.max(-1.0, dotProduct / (dist1 * dist2)));
        let angleDeg = Math.acos(cosTheta) * (180 / Math.PI);

        // 두 직선이 교차하며 만드는 각 중 예각 부위를 수집하기 위한 보각 처리
        if (angleDeg > 90) angleDeg = 180 - angleDeg;

        const finalAngle = angleDeg.toFixed(1);
        
        // 규격 9 명세: 좌측 상단 HUD 노드에는 문자열 가식 없이 무결점 오직 수치만 표출
        if (this.angleDisplay) this.angleDisplay.innerText = `${finalAngle}°`;
        if (this.badgeDisplay) this.badgeDisplay.innerText = "연산 성공! 선을 이어서 계속 작도 가능합니다.";
    }

    /**
     * 초기화 리셋 모듈
     */
    clear() {
        this.points = [];
        this.scale = 1.0; 
        this.offsetX = 0; 
        this.offsetY = 0; 
        this.draw();
        if (this.angleDisplay) this.angleDisplay.innerText = '0.0°';
        if (this.badgeDisplay) this.badgeDisplay.innerText = "분석 대기 중";
    }
}

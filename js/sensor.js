/**
 * sensor.js
 * 기기 내장 자이로 센서 하드웨어 제어 및 실시간 롤(Roll) 수평 연산 모듈
 */
export class DynamicLeveler {
    constructor(onLevelChange) {
        this.onLevelChange = onLevelChange;
        this.statusText = null;
        this.angleText = null;
        this.levelLine = null;
    }

    /**
     * 센서 구동 및 iOS/Android 비동기 권한 획득 파이프라인
     */
    async init() {
        this.statusText = document.getElementById('status-text');
        this.angleText = document.getElementById('angle-text');
        this.levelLine = document.getElementById('level-line');

        // PC 에뮬레이션 환경일 경우 센서 바인딩 유예 처리
        if (!window.isMobileDevice) return true;

        // iOS 사파리 웹킷 전용 비동기 권한 승인 프로토콜 분기 검사
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
                    return true;
                }
                return false;
            } catch (err) {
                console.error("센서 권한 획득 실패:", err);
                return false;
            }
        } else {
            // 안드로이드 및 일반 모바일 브라우저 즉시 이벤트 리스너 바인딩
            window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
            return true;
        }
    }

    /**
     * 디바이스 회전 상태 및 오리엔테이션 역산 절대 롤(Roll) 교정 처리
     */
    handleOrientation(event) {
        if (!window.isMobileDevice || !event) return;

        let roll = event.gamma || 0;  
        let pitch = event.beta || 0;  
        let displayAngle = roll;

        // 현대 표준 스크린 오리엔테이션 API 싱크
        let screenAngle = 0;
        if (screen.orientation && screen.orientation.angle !== undefined) {
            screenAngle = screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            screenAngle = window.orientation;
        }

        // 스마트폰 가로/세로 그립 파지 형태에 따른 각도 축 교정 매핑 연산
        if (screenAngle === 90) {
            displayAngle = -pitch;
        } else if (screenAngle === 270 || screenAngle === -90) {
            displayAngle = pitch;
        } else if (screenAngle === 180) {
            displayAngle = -roll;
        }

        // 기기가 완전히 바닥을 바라보고 누워있는 특이 상태(Zenith 데드존) 필터링
        if (Math.abs(pitch) > 85 && (screenAngle === 0 || screenAngle === 180)) return; 

        // 실시간 수평계 라인 UI 물리 회전각 구동
        if (this.levelLine) {
            this.levelLine.style.transform = `rotate(${-displayAngle}deg)`;
        }
        
        // 텍스트 수치 노드 싱크
        if (this.angleText) {
            this.angleText.innerText = `${displayAngle.toFixed(1)}°`;
        }

        // 상용 기준 오차 범위 계산 (정밀도 ±1.0° 기준 칼수평 판정)
        const IS_LEVEL = Math.abs(displayAngle) <= 1.0; 
        
        // 정밀 상태에 따른 네온 그린(#00e676) / 레드 실시간 피드백 분기 렌더링
        if (this.levelLine) {
            this.levelLine.style.backgroundColor = IS_LEVEL ? "#00e676" : "#ff4d4d";
        }
        
        if (this.statusText) {
            this.statusText.innerText = IS_LEVEL ? "수평 일치" : "수평 조정 필요";
            this.statusText.style.color = IS_LEVEL ? "#00e676" : "#ff4d4d";
        }

        // 상위 앱 허브 파이프라인으로 자이로 상태 콜백 동기화 전달
        this.onLevelChange(IS_LEVEL, displayAngle);
    }
}

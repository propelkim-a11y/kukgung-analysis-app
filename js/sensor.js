/**
 * sensor.js
 * PC 및 안드로이드/iOS 크로스 플랫폼 최신 스마트폰 규격 완벽 대응 자이로 수평 필터
 */

export class DynamicLeveler {
    constructor(onLevelChange) {
        this.onLevelChange = onLevelChange;
        this.statusText = null;
        this.angleText = null;
        this.levelLine = null;
    }

    async init() {
        this.statusText = document.getElementById('status-text');
        this.angleText = document.getElementById('angle-text');
        this.levelLine = document.getElementById('level-line');

        // 데스크톱 PC 웹 환경 브라우저일 경우 물리 센서 마운트 안전 우회 패치
        if (!window.isMobileDevice) {
            console.log("PC 기기 감지: 자이로 연산 장치를 소프트웨어 가상 고정 상태로 대체합니다.");
            return true;
        }

        // iOS 13 이상 사파리 전용 샌드박스 센서 권한 강제 획득식
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
                    return true;
                }
                return false;
            } catch (err) {
                console.error("iOS 하드웨어 가속도 축 참조 실패:", err);
                return false;
            }
        } else {
            // 안드로이드 갤럭시 크롬 및 모바일 오페라/웨일 브라우저 계열
            window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
            return true;
        }
    }

    handleOrientation(event) {
        if (!window.isMobileDevice) return; 

        let roll = event.gamma || 0;  // 물리 좌우 틸트 값
        let pitch = event.beta || 0;  // 물리 전후 틸트 값
        let displayAngle = roll;

        let screenAngle = 0;
        if (screen.orientation && screen.orientation.angle !== undefined) {
            screenAngle = screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            screenAngle = window.orientation;
        }

        // 국궁 궁체 다각도 정사각 정렬을 위한 90도 가로회전 축 교정 매트릭스
        if (screenAngle === 90) {
            displayAngle = -pitch;
        } else if (screenAngle === 270 || screenAngle === -90) {
            displayAngle = pitch;
        } else if (screenAngle === 180) {
            displayAngle = -roll;
        }

        if (Math.abs(pitch) > 85 && (screenAngle === 0 || screenAngle === 180)) {
            return; 
        }

        if (this.levelLine) {
            this.levelLine.style.transform = `rotate(${-displayAngle}deg)`;
        }
        if (this.angleText) {
            this.angleText.innerText = `${displayAngle.toFixed(1)}°`;
        }

        // 국궁 활대 고착 기하 오차 범위 가중치를 반영한 1.0도 정밀 수평 허용 기준 정의
        const IS_LEVEL = Math.abs(displayAngle) <= 1.0; 
        
        if (this.levelLine) {
            this.levelLine.style.backgroundColor = IS_LEVEL ? "#00e676" : "#ff4d4d";
        }
        if (this.statusText) {
            this.statusText.innerText = IS_LEVEL ? "수평 일치" : "수평 정렬 필";
            this.statusText.style.color = IS_LEVEL ? "#00e676" : "#ff4d4d";
        }

        this.onLevelChange(IS_LEVEL, displayAngle);
    }
}

/**
 * sensor.js
 * PC 및 안드로이드/iOS 크로스 플랫폼 규격 완벽 대응 자이로 필터
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

        // 데스크톱 PC 웹 환경 브라우저일 경우 센서 마운트 안전 우회 처리
        if (!window.isMobileDevice) {
            console.log("PC 환경 감지됨: 자이로 수평 필터를 비활성화하고 가상 고정축을 바인딩합니다.");
            return true;
        }

        // iOS 13+ 하드웨어 센서 샌드박스 권한 요청 구문
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
                    return true;
                }
                return false;
            } catch (err) {
                console.error("iOS 장치 센서 마운트 예외:", err);
                return false;
            }
        } else {
            // 안드로이드 갤럭시 스마트폰 및 표준 모바일 웹 표준 브라우저
            window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
            return true;
        }
    }

    handleOrientation(event) {
        if (!window.isMobileDevice) return; // PC 모드일 경우 하드웨어 물리 필터 연산 스킵

        let roll = event.gamma || 0;  
        let pitch = event.beta || 0;  
        let displayAngle = roll;

        let screenAngle = 0;
        if (screen.orientation && screen.orientation.angle !== undefined) {
            screenAngle = screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            screenAngle = window.orientation;
        }

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

        const IS_LEVEL = Math.abs(displayAngle) <= 1.0; 
        
        if (this.levelLine) {
            this.levelLine.style.backgroundColor = IS_LEVEL ? "#00e676" : "#ff4d4d";
        }
        if (this.statusText) {
            this.statusText.innerText = IS_LEVEL ? "수평 일치" : "수평 조정 필요";
            this.statusText.style.color = IS_LEVEL ? "#00e676" : "#ff4d4d";
        }

        this.onLevelChange(IS_LEVEL, displayAngle);
    }
}

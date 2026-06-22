/**
 * sensor.js
 * 안드로이드(갤럭시) 및 iOS 최신 규격 대응 수평계 물리 센서 로직
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

        // iOS 13+ 권한 요청 대응 
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
                    return true;
                }
                return false;
            } catch (err) {
                console.error("iOS 센서 권한 요청 실패:", err);
                return false;
            }
        } else {
            // 안드로이드 및 일반 모바일 브라우저
            window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
            return true;
        }
    }

    handleOrientation(event) {
        let roll = event.gamma || 0;  
        let pitch = event.beta || 0;  
        let displayAngle = roll;

        let screenAngle = 0;
        if (screen.orientation && screen.orientation.angle !== undefined) {
            screenAngle = screen.orientation.angle;
        } else if (window.orientation !== undefined) {
            screenAngle = window.orientation;
        }

        // 국궁 촬영용 가로/세로 회전축 보정 매트릭스
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

/**
 * sensor.js
 * 안드로이드(갤럭시) 최신 규격 대응 수평계 로직
 */

export class DynamicLeveler {
    constructor(onLevelChange) {
        this.onLevelChange = onLevelChange;
        this.statusText = document.getElementById('status-text');
        this.angleText = document.getElementById('angle-text');
        this.levelLine = document.getElementById('level-line');
    }

    async init() {
        // iOS 권한 요청 대응 (안드로이드에서는 바로 true 반환)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
                    return true;
                }
                return false;
            } catch (err) {
                console.error("센서 권한 요청 실패:", err);
                return false;
            }
        } else {
            // 안드로이드 및 일반 브라우저
            window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
            return true;
        }
    }

    handleOrientation(event) {
        let roll = event.gamma || 0;
        let pitch = event.beta || 0;
        let displayAngle = roll;

        // 최신 안드로이드 규격: screen.orientation.angle 사용
        const orientationAngle = (window.screen && window.screen.orientation && window.screen.orientation.angle) !== undefined 
            ? window.screen.orientation.angle 
            : (window.orientation || 0);

        // 가로 모드(90도 또는 270도 회전) 시 축 보정
        if (orientationAngle === 90) {
            displayAngle = -pitch;
        } else if (orientationAngle === -90 || orientationAngle === 270) {
            displayAngle = pitch;
        }

        // UI 업데이트
        if (this.levelLine) {
            this.levelLine.style.transform = `rotate(${-displayAngle}deg)`;
        }
        if (this.angleText) {
            this.angleText.innerText = `좌우 기울기: ${displayAngle.toFixed(1)}°`;
        }

        const IS_LEVEL = Math.abs(displayAngle) <= 1.0;
        
        if (this.statusText) {
            if (IS_LEVEL) {
                this.statusText.innerText = "수평 일치! 촬영 준비 완료";
                this.statusText.style.color = "#00e676";
                if (this.levelLine) {
                    this.levelLine.style.backgroundColor = "#00e676";
                    this.levelLine.classList.add('ready');
                }
            } else {
                this.statusText.innerText = "삼각대 수평을 맞춰주세요";
                this.statusText.style.color = "#ff4d4d";
                if (this.levelLine) {
                    this.levelLine.style.backgroundColor = "#ff4d4d";
                    this.levelLine.classList.remove('ready');
                }
            }
        }

        this.onLevelChange(IS_LEVEL, displayAngle);
    }
}

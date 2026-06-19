/**
 * sensor.js
 * 스마트폰 자이로 센서를 활용한 수평 가이드 라인 제어 클래스
 */

export class DynamicLeveler {
    constructor(onLevelChange) {
        this.onLevelChange = onLevelChange; // 수평 상태 변화 시 실행할 콜백 함수
        this.statusText = document.getElementById('status-text');
        this.angleText = document.getElementById('angle-text');
        this.levelLine = document.getElementById('level-line');
    }

    async init() {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                    return true;
                }
                return false;
            } catch (err) {
                console.error("센서 권한 요청 에러:", err);
                return false;
            }
        } else {
            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
            return Promise.resolve(true);
        }
    }

    handleOrientation(event) {
        let roll = event.gamma || 0;
        let pitch = event.beta || 0;
        let displayAngle = roll;

        // 가로 거치 스마트폰 화면 축 보정 (landscape 모드 대응)
        // window.orientation은 deprecated 되었으나 구형 기기 대응용, 최신은 screen.orientation 사용 권장
        const orientation = window.orientation || (screen.orientation && screen.orientation.angle) || 0;
        
        if (orientation === 90 || orientation === -90) {
            displayAngle = orientation === 90 ? -pitch : pitch;
        }

        // 시각적 피드백: 가이드 라인 회전
        this.levelLine.style.transform = `rotate(${-displayAngle}deg)`;
        this.angleText.innerText = `좌우 기울기: ${displayAngle.toFixed(1)}°`;

        const IS_LEVEL = Math.abs(displayAngle) <= 1.0; // 오차 범위 1도 이내
        
        if (IS_LEVEL) {
            this.statusText.innerText = "수평 일치! 촬영 준비 완료";
            this.statusText.style.color = "#00e676";
            this.levelLine.style.backgroundColor = "#00e676";
            this.levelLine.classList.add('ready');
        } else {
            this.statusText.innerText = "삼각대 수평을 맞춰주세요";
            this.statusText.style.color = "#ff4d4d";
            this.levelLine.style.backgroundColor = "#ff4d4d";
            this.levelLine.classList.remove('ready');
        }

        // 외부 콜백 실행 (버튼 활성화 등 제어)
        if (this.onLevelChange) {
            this.onLevelChange(IS_LEVEL, displayAngle);
        }
    }
}

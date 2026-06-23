/**
 * js/sensor.js - 국궁 실시간 수평계 자이로 측정 인터페이스
 */
class BowGyroSensor {
    constructor() {
        this.data = { roll: 0, pitch: 0 };
        this.filterAlpha = 0.15; // 손떨림 차단용 로우패스 필터 상용 계수
        this.isActive = false;
        this.handleOrientation = this.handleOrientation.bind(this);
    }

    async start() {
        if (this.isActive) return true;
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') return this.activate();
                console.warn('[Sensor] 자이로 권한 거부');
                return false;
            } catch (error) {
                console.error('[Sensor] iOS 권한 요청 에러:', error);
                return false;
            }
        } else {
            return this.activate();
        }
    }

    activate() {
        window.addEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = true;
        return true;
    }

    stop() {
        if (!this.isActive) return;
        window.removeEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = false;
    }

    handleOrientation(event) {
        let rawRoll = event.gamma || 0;
        let rawPitch = event.beta || 0;
        const orientation = window.orientation || 0;
        let calculatedRoll = rawRoll;
        let calculatedPitch = rawPitch;

        // 가로 거치 촬영 대응 좌표축 물리적 스와핑
        if (orientation === 90) {
            calculatedRoll = -rawPitch;
            calculatedPitch = rawRoll;
        } else if (orientation === -90) {
            calculatedRoll = rawPitch;
            calculatedPitch = -rawRoll;
        }

        // Low-Pass Filter 구동
        this.data.roll = this.data.roll + this.filterAlpha * (calculatedRoll - this.data.roll);
        this.data.pitch = this.data.pitch + this.filterAlpha * (calculatedPitch - this.data.pitch);

        const sensorUpdateEvent = new CustomEvent('bowGyroUpdate', {
            detail: {
                roll: Number(this.data.roll.toFixed(1)),
                pitch: Number(this.data.pitch.toFixed(1)),
                isLevel: Math.abs(this.data.roll) < 1.0 // 1도 미만 시 칼수평 판정
            }
        });
        window.dispatchEvent(sensorUpdateEvent);
    }
}
window.bowGyroSensor = new BowGyroSensor();

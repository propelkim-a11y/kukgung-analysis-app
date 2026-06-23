/**
 * ==========================================
 * js/sensor.js
 * ==========================================
 */
class BowGyroSensor {
    constructor() {
        this.data = { roll: 0, pitch: 0 };
        this.filterAlpha = 0.15; // 로우패스 필터 노이즈 상쇄 계수
        this.isActive = false;
        this.handleOrientation = this.handleOrientation.bind(this);
    }

    async start() {
        if (this.isActive) return true;

        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    return this.activate();
                } else {
                    console.warn('[Sensor] 자이로 권한이 거부되었습니다.');
                    return false;
                }
            } catch (error) {
                console.error('[Sensor] iOS 권한 요청 실패:', error);
                return false;
            }
        } else {
            return this.activate();
        }
    }

    activate() {
        window.addEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = true;
        console.log('[Sensor] 실시간 자이로 센서 활성화 완료.');
        return true;
    }

    stop() {
        if (!this.isActive) return;
        window.removeEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = false;
        console.log('[Sensor] 자이로 센서 중지됨.');
    }

    handleOrientation(event) {
        let rawRoll = event.gamma || 0;
        let rawPitch = event.beta || 0;

        // 디바이스 가로 거치 촬영 환경 대응 수식 맵핑 스와핑
        const orientation = window.orientation || 0;
        let calculatedRoll = rawRoll;
        let calculatedPitch = rawPitch;

        if (orientation === 90) {
            calculatedRoll = -rawPitch;
            calculatedPitch = rawRoll;
        } else if (orientation === -90) {
            calculatedRoll = rawPitch;
            calculatedPitch = -rawRoll;
        }

        // Low-Pass Filter 보정 연산 (손떨림 노이즈 억제)
        this.data.roll = this.data.roll + this.filterAlpha * (calculatedRoll - this.data.roll);
        this.data.pitch = this.data.pitch + this.filterAlpha * (calculatedPitch - this.data.pitch);

        // 메인 앱 전역 통신용 커스텀 이벤트 발행
        const sensorUpdateEvent = new CustomEvent('bowGyroUpdate', {
            detail: {
                roll: Number(this.data.roll.toFixed(1)),
                pitch: Number(this.data.pitch.toFixed(1)),
                isLevel: Math.abs(this.data.roll) < 1.0 // 1.0도 미만일 때 칼수평 판정
            }
        });
        window.dispatchEvent(sensorUpdateEvent);
    }
}

window.bowGyroSensor = new BowGyroSensor();

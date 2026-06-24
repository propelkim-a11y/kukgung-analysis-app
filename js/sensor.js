/**
 * js/sensor.js
 * 국궁 자세 분석용 실시간 수평계 자이로 측정 인터페이스 (PC 예외 처리 완벽판)
 */

class BowGyroSensor {
    constructor() {
        this.data = { roll: 0, pitch: 0 };
        this.filterAlpha = 0.15; 
        this.isActive = false;
        this.handleOrientation = this.handleOrientation.bind(this);
    }

    async start() {
        if (this.isActive) return true;
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') return this.activate();
                else return false;
            } catch (error) {
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
        // 💡 [PC 뻗음 원천 차단] 자이로 하드웨어가 없는 PC 환경에서 null이나 NaN이 들어오면 연산을 스킵
        let rawRoll = event.gamma;
        let rawPitch = event.beta;
        if (rawRoll === null || rawPitch === null || isNaN(rawRoll) || isNaN(rawPitch)) {
            return;
        }

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

        this.data.roll = this.data.roll + this.filterAlpha * (calculatedRoll - this.data.roll);
        this.data.pitch = this.data.pitch + this.filterAlpha * (calculatedPitch - this.data.pitch);

        // 연산 결과 최종 안전 검증
        if (isNaN(this.data.roll) || isNaN(this.data.pitch)) return;

        const sensorUpdateEvent = new CustomEvent('bowGyroUpdate', {
            detail: {
                roll: Number(this.data.roll.toFixed(1)),
                pitch: Number(this.data.pitch.toFixed(1)),
                isLevel: Math.abs(this.data.roll) < 1.0 
            }
        });
        window.dispatchEvent(sensorUpdateEvent);
    }
}

window.bowGyroSensor = new BowGyroSensor();

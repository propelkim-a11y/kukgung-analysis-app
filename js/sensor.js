/**
 * js/sensor.js
 * 국궁 자세 분석용 실시간 수평계 자이로 측정 인터페이스 (3단계)
 * - 모바일 기기의 회전각(Roll)을 실시간으로 정밀 파싱
 * - 충격 및 손떨림 노이즈 차단을 위한 로우패스 필터(LPF) 적용
 */

class BowGyroSensor {
    constructor() {
        // 자이로 데이터 보관 (롤: 좌우 기울기, 피치: 앞뒤 기울기)
        this.data = { roll: 0, pitch: 0 };
        
        // 로우패스 필터 계수 (0.15: 부드러운 하드웨어 진동 억제)
        this.filterAlpha = 0.15; 
        
        // 현재 센서 구동 여부
        this.isActive = false;

        this.handleOrientation = this.handleOrientation.bind(this);
    }

    /**
     * 센서 구동 시작 (iOS 권한 샌드박스 대응 포함)
     */
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
            // 안드로이드 및 일반 웹캠 개발 환경
            return this.activate();
        }
    }

    activate() {
        window.addEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = true;
        console.log('[Sensor] 실시간 수평계 자이로 가동.');
        return true;
    }

    stop() {
        if (!this.isActive) return;
        window.removeEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = false;
        console.log('[Sensor] 수평계 자이로 중지.');
    }

    /**
     * 하드웨어 롤/피치 각도 파싱 및 회전축 보정
     */
    handleOrientation(event) {
        let rawRoll = event.gamma || 0;
        let rawPitch = event.beta || 0;

        // 가로 거치 촬영(Landscape) 시 축 스와핑 역산 처리
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

        // Low-Pass Filter 통과 연산으로 물리 노이즈 감쇄
        this.data.roll = this.data.roll + this.filterAlpha * (calculatedRoll - this.data.roll);
        this.data.pitch = this.data.pitch + this.filterAlpha * (calculatedPitch - this.data.pitch);

        // 메인 컨트롤러로 가공된 데이터 실시간 발행
        const sensorUpdateEvent = new CustomEvent('bowGyroUpdate', {
            detail: {
                roll: Number(this.data.roll.toFixed(1)),
                pitch: Number(this.data.pitch.toFixed(1)),
                isLevel: Math.abs(this.data.roll) < 1.0 // 1.0도 미만일 때 완벽 수평 상태 판정
            }
        });
        window.dispatchEvent(sensorUpdateEvent);
    }
}

// 전역 싱글톤 인스턴스 노출
window.bowGyroSensor = new BowGyroSensor();

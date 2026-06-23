/**
 * js/sensor.js
 * 국궁 자세 분석용 실시간 수평계 자이로 측정 인터페이스
 * - 모바일 기기의 회전각(Roll, Pitch) 실시간 추적
 * - 고주파 노이즈 제거를 위한 로우패스 필터(LPF) 내장
 * - 시스템 통합을 위한 전역 상태 발행 및 커스텀 이벤트 전송
 */

class BowGyroSensor {
    constructor() {
        // 자이로 데이터 보관 (롤: 좌우 기울기, 피치: 앞뒤 기울기)
        this.data = { roll: 0, pitch: 0 };
        
        // 로우패스 필터 계수 (0.1에 가까울수록 부드럽고 둔감함, 1.0은 필터 없음)
        this.filterAlpha = 0.15; 
        
        // 현재 센서 활성화 여부
        this.isActive = false;

        // 바인딩
        this.handleOrientation = this.handleOrientation.bind(this);
    }

    /**
     * 센서 측정 시작 (iOS 권한 요청 프로세스 포함)
     */
    async start() {
        if (this.isActive) return true;

        // iOS 13+ 기기 권한 요청 대응
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    return this.activate();
                } else {
                    console.warn('[Sensor] DeviceOrientation 권한이 거부되었습니다.');
                    return false;
                }
            } catch (error) {
                console.error('[Sensor] iOS 권한 요청 중 오류 발생:', error);
                return false;
            }
        } else {
            // 안드로이드 및 일반 웹캠 환경
            return this.activate();
        }
    }

    /**
     * 이벤트 리스너 등록 및 센서 가동
     */
    activate() {
        window.addEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = true;
        console.log('[Sensor] 실시간 수평계 자이로 센서가 활성화되었습니다.');
        return true;
    }

    /**
     * 센서 측정 중지
     */
    stop() {
        if (!this.isActive) return;
        window.removeEventListener('deviceorientation', this.handleOrientation, true);
        this.isActive = false;
        console.log('[Sensor] 수평계 자이로 센서가 중지되었습니다.');
    }

    /**
     * 가속도/자이로 센서 데이터 파싱 및 로우패스 필터링
     */
    handleOrientation(event) {
        // gamma: 좌우 기울기 (Roll, -90 ~ 90)
        // beta: 앞뒤 기울기 (Pitch, -180 ~ 180)
        let rawRoll = event.gamma || 0;
        let rawPitch = event.beta || 0;

        // 1. 디바이스 화면 방향(가로/세로) 변환 대응
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

        // 2. Low-Pass Filter 적용 (손떨림 및 고주파 환경 노이즈 차단)
        this.data.roll = this.data.roll + this.filterAlpha * (calculatedRoll - this.data.roll);
        this.data.pitch = this.data.pitch + this.filterAlpha * (calculatedPitch - this.data.pitch);

        // 3. 메인 앱(app.js 또는 UI 전반)으로 실시간 데이터 전송을 위한 커스텀 이벤트 발행
        const sensorUpdateEvent = new CustomEvent('bowGyroUpdate', {
            detail: {
                roll: Number(this.data.roll.toFixed(1)),
                pitch: Number(this.data.pitch.toFixed(1)),
                isLevel: Math.abs(this.data.roll) < 1.0 // 1도 미만일 때 완벽한 수평으로 판정
            }
        });
        window.dispatchEvent(sensorUpdateEvent);
    }

    /**
     * 현재 보정된 롤/피치 값 수동 반환 API
     */
    getAngles() {
        return {
            roll: parseFloat(this.data.roll.toFixed(1)),
            pitch: parseFloat(this.data.pitch.toFixed(1))
        };
    }
}

// 전역 싱글톤 인스턴스 내보내기
window.bowGyroSensor = new BowGyroSensor();

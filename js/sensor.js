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
  let rawRoll = event.gamma;   // 좌우 기울기 (-90 ~ 90)
  let rawPitch = event.beta;   // 앞뒤 기울기 (-180 ~ 180)
  
  if (rawRoll === null || rawPitch === null || isNaN(rawRoll) || isNaN(rawPitch)) {
    return;
  }

  // 현재 화면의 스크린 회전 각도 획득 (0: 세로, 90: 가로 왼쪽 회전, -90: 가로 오른쪽 회전, 180: 역방향 세로)
  const orientation = window.orientation || 0;
  let calculatedRoll = rawRoll;
  let calculatedPitch = rawPitch;

  // 디바이스 회전 방향에 따른 센서 축 하드웨어 역보정 알고리즘
  switch (orientation) {
    case 90: // 가로 모드 (홈버튼이 오른쪽 / 일반적인 촬영 방향)
      calculatedRoll = -rawPitch;
      calculatedPitch = rawRoll;
      break;
    case -90: // 반대 횡방향 가로 모드 (홈버튼이 왼쪽)
      calculatedRoll = rawPitch;
      calculatedPitch = -rawRoll;
      break;
    case 180: // 역방향 세로 모드 (폰을 거꾸로 들었을 때)
      calculatedRoll = -rawRoll;
      calculatedPitch = -rawPitch;
      break;
    case 0: // 일반 세로 모드
    default:
      calculatedRoll = rawRoll;
      calculatedPitch = rawPitch;
      break;
  }

  // 필터를 적용하여 센서의 미세한 떨림 저감 (Low-Pass Filter)
  this.data.roll = this.data.roll + this.filterAlpha * (calculatedRoll - this.data.roll);
  this.data.pitch = this.data.pitch + this.filterAlpha * (calculatedPitch - this.data.pitch);

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

window.bowGyroSensor = new BowGyroSensor();

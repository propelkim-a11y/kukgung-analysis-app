/**
 * analyzer.js
 * MediaPipe Pose를 활용한 국궁 자세 정밀 분석 클래스
 */

export class ArcheryAnalyzer {
    constructor() {
        // @ts-ignore
        this.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        
        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
    }

    /**
     * 3차원 공간상의 세 점을 이용한 사이각 계산 (벡터 내적)
     */
    calculateAngle(p1, p2, p3) {
        const ab = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
        const cb = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
        
        const dotProduct = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
        const normA = Math.sqrt(ab.x * ab.x + ab.y * ab.y + ab.z * ab.z);
        const normB = Math.sqrt(cb.x * cb.x + cb.y * cb.y + cb.z * cb.z);
        
        const angle = Math.acos(dotProduct / (normA * normB));
        return angle * (180 / Math.PI);
    }

    /**
     * 두 손목을 가로지르는 선과 물리적 수평선 사이의 고각 계산 (수평 보정치 적용)
     */
    calculateArrowAngle(wristL, wristR, phoneRoll) {
        // 화면 좌표계 상의 두 손목 벡터의 기울기 계산
        const dx = wristL.x - wristR.x;
        const dy = wristL.y - wristR.y; // 웹은 y축이 아래로 갈수록 증가
        
        const radians = Math.atan2(-dy, dx);
        let angle = radians * (180 / Math.PI);
        
        // 촬영 시 발생했던 스마트폰의 미세 수평 오차(phoneRoll)를 연산에서 강제 보정
        // 프로젝트 핵심 제약 조건: 수학적 역보정
        return angle - phoneRoll; 
    }

    /**
     * 특정 프레임 분석 실행
     */
    analyzeFrame(videoElement, phoneRoll, callback) {
        this.pose.onResults((results) => {
            if (!results.poseLandmarks) {
                callback(null);
                return;
            }

            const landmarks = results.poseLandmarks;
            
            // 국궁 분석 핵심 관절 정의 (오른손잡이 사수 기준)
            const leftWrist = landmarks[15];
            const leftElbow = landmarks[13];
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const rightElbow = landmarks[14];
            const rightWrist = landmarks[16];

            // 1. 관절 사잇각 계산
            const bowArmAngle = this.calculateAngle(leftShoulder, leftElbow, leftWrist); // 줌팔 펼침 정도
            const drawArmAngle = this.calculateAngle(rightShoulder, rightElbow, rightWrist); // 깍지팔 접힘 정도
            
            // 2. 화살 고각 예측 (양 손목 연결선 기준 + 자이로 센서 오차 역보정)
            const arrowAngle = this.calculateArrowAngle(leftWrist, rightWrist, phoneRoll);

            callback({
                bowArm: bowArmAngle,
                drawArm: drawArmAngle,
                arrow: arrowAngle,
                results: results
            });
        });

        this.pose.send({ image: videoElement });
    }
}

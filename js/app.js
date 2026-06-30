/**
 * js/app.js
 * - (v21.1) - 국궁 자세 분석 시스템 프리징 해결 및 고성능 안정화 통합 마스터 컨트롤러 완결판 (업로드 수리 버전)
 */

window.bowAppNodes = {};

document.addEventListener('DOMContentLoaded', async () => {
const core = window.bowAppCore;
const gesture = window.bowAppGesture;
const nodes = window.bowAppNodes;

// 1. [이식] DOM 노드 매핑 (안전한 카멜케이스 자동 맵핑 공정 및 예외 격리막)
try {
const ids = [
'scene-record', 'scene-analyze', 'btn-go-analyze', 'btn-go-record',
'camera-preview', 'btn-record-toggle', 'record-status',
'gyro-horizon-line', 'gyro-vertical-line',
'video-viewport', 'main-video', 'draw-canvas', 'unified-panel', 'panel-handle',
'btn-open', 'btn-move', 'btn-draw', 'btn-capture', 'btn-reset', 'video-input', 'btn-download-video',
'video-slider', 'btn-frame-prev', 'btn-play-pause', 'btn-frame-next', 'angle-report'
];
// (-) 하이픈 패턴을 찾아 자바스크립트 표준 카멜케이스 속성명으로 치환 후 기계적 매핑
ids.forEach(id => {
const nodeKey = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
nodes[nodeKey] = document.getElementById(id);
});

console.log('[시스템] 고도화 DOM 카멜케이스 매핑 엔진 컴파일 완료');
} catch (e) {
console.error('[오류] DOM 인프라 기계식 자동 매핑 실패:', e);
}

let selectedFPS = 120;
let currentFrameTime = 1 / 120;
let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentRoll = 0;
let actualFPS = 0; // 하드웨어가 실시간으로 확보한 최종 모니터링 프레임 레이트 변수
// 2. [개선] 프리징 없는 안전한 카메라 초기화 및 하이브리드 프레임 제약 조건
async function initCamera() {
if (cameraStream) stopCamera();
console.log('[시스템] 프리징 해제 디바이스 카메라 최적화 시동...');

try {
// [이식] exact 제약의 하드웨어 크래시를 방지하기 위해 ideal 범위를 지정, 하드웨어 성능 한계를 유연하게 유도
const constraints = {
video: {
facingMode: 'environment',
frameRate: { ideal: 120, min: 24 }, // 120을 표방하되 구형 단말기 기기 한계 완전 수용
width: { ideal: 1280 },
height: { ideal: 720 }
},
audio: false
};

cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
nodes.cameraPreview.srcObject = cameraStream;

const track = cameraStream.getVideoTracks()[0];
const settings = track.getSettings();
actualFPS = settings.frameRate || "확인 중";
selectedFPS = typeof actualFPS === 'number' ? actualFPS : 120;

console.log(`[시스템] 카메라 미디어 스트림 연결 성공: ${actualFPS}fps 확보`);

// [이식] iOS 모바일 및 사파리 환경에서 비디오 비동기 가동 시 프리징 현상을 원천 차단하는 오버레이 속성 강제 각인
nodes.cameraPreview.setAttribute('autoplay', '');
nodes.cameraPreview.setAttribute('muted', '');
nodes.cameraPreview.setAttribute('playsinline', '');

try {
// play() 메소드를 철저히 비동기로 격리 유도하여 웹앱 런타임 블로킹 해결
await nodes.cameraPreview.play();
} catch (e) {
console.warn('[경고] 브라우저 정책에 의한 자동 재생 차단 감지, 사용자 상호작용 트리거 대기');
}

// 센서 시동 시작
if (window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
await window.bowGyroSensor.start();
}

// [이식] 디바이스가 연동한 최적의 FPS 상태 정보를 모니터링 인터페이스로 수렴
if (nodes.recordStatus) {
nodes.recordStatus.innerHTML = `대기 중 <span style="color:#00ff00; font-size:10px;">(기기 지원: ${actualFPS} FPS)</span>`;
}

currentFrameTime = 1 / (typeof actualFPS === 'number' ? actualFPS : 120);
setTimeout(resizeCanvasToDisplay, 150);
} catch (err) {
console.error('[오류] 카메라 초기화 하드웨어 디스크립터 로드 최종 실패:', err);
if (nodes.recordStatus) nodes.recordStatus.innerText = "카메라 연결 실패";
}
}

function stopCamera() {
if (cameraStream) {
cameraStream.getTracks().forEach(track => track.stop());
cameraStream = null;
}
if (nodes.cameraPreview) nodes.cameraPreview.srcObject = null;
}

function resizeCanvasToDisplay() {
if (!nodes.drawCanvas) return;
const width = window.innerWidth;
const height = window.innerHeight;
const dpr = window.devicePixelRatio || 1;

nodes.drawCanvas.width = width * dpr;
nodes.drawCanvas.height = height * dpr;

if (window.bowAnalyzer) {
window.bowAnalyzer.canvas = nodes.drawCanvas;
window.bowAnalyzer.ctx = nodes.drawCanvas.getContext('2d');
window.bowAnalyzer.render();
}
}
// 3. 녹화 종료 후 모니터링 연동 타임라인 분석 변환 다운로더
function handleRecordingFinish(blob, phoneRollAtRecord = 0) {
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// [이식] 실제 동작 결과 도출된 고유 프레임 연산 정보를 타임스탬프와 파일 확장자 명명 규칙에 유기적 투영
const fpsMark = typeof actualFPS === 'number' ? Math.round(actualFPS) : "120";
const currentMimeType = mediaRecorder?.mimeType || 'video/webm';
const ext = currentMimeType.includes('mp4') ? '.mp4' : '.webm';
const fileName = `kukgung_${fpsMark}fps_${timestamp}${ext}`;

const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = fileName;
document.body.appendChild(a);
a.click();
a.remove();
console.log(`[시스템] 프리징 해결 고성능 비디오 물리 저장 완결: ${fileName}`);

if (nodes.mainVideo.src && nodes.mainVideo.src.startsWith('blob:')) {
URL.revokeObjectURL(nodes.mainVideo.src);
}

nodes.mainVideo.src = url;
nodes.mainVideo.dataset.phoneRoll = phoneRollAtRecord;

nodes.mainVideo.onloadedmetadata = () => {
const detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
currentFrameTime = 1 / detectedFPS;

nodes.drawCanvas.width = nodes.mainVideo.videoWidth;
nodes.drawCanvas.height = nodes.mainVideo.videoHeight;

if (isFinite(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
nodes.videoSlider.max = nodes.mainVideo.duration;
nodes.videoSlider.step = 0.0001;
}

stopCamera();
if (window.bowGyroSensor && typeof window.bowGyroSensor.stop === 'function') {
window.bowGyroSensor.stop();
}
nodes.sceneRecord.classList.remove('active');
nodes.sceneAnalyze.classList.add('active');
setActiveMenu(nodes.btnMove);
if (window.bowAnalyzer) window.bowAnalyzer.setMode('move');

nodes.mainVideo.currentTime = 0.1;
if (window.bowAnalyzer) {
window.bowAnalyzer.init(nodes.drawCanvas);
window.bowAnalyzer.render();
}

console.log('[시스템] 동적 시계열 모니터링 분석 레이어 동기화 완료');
setTimeout(resizeCanvasToDisplay, 100);
};
}

// 로컬 인덱스드 부트 데이터 백업 세션 복구 유지 보수
if (core && typeof core.initDB === 'function') {
core.initDB().then(async () => {
try {
await core.restoreLastSession(nodes.mainVideo, nodes.drawCanvas);
} catch (e) {
console.warn('[System] 세션 부팅 복구 예외 레이어 무력화 대응 완료');
}
if (nodes.mainVideo && !isNaN(nodes.mainVideo.duration) && nodes.mainVideo.duration > 0) {
nodes.videoSlider.max = nodes.mainVideo.duration;
nodes.videoSlider.step = 0.0001;
}
});
}

// 4. [수정] 기기 지원 최적 코덱 동적 탐색 및 6Mbps 데이터 스트림 인코더 스펙 빌드업
nodes.btnRecordToggle?.addEventListener('click', () => {
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
if (isMobile && window.bowGyroSensor && typeof window.bowGyroSensor.start === 'function') {
window.bowGyroSensor.start();
}

if (!mediaRecorder || mediaRecorder.state === 'inactive') {
recordedChunks = [];
const stream = nodes.cameraPreview?.srcObject;
if (!stream) {
console.error('[오류] 캡처 타겟 스트림 컨텍스트가 존재하지 않습니다.');
return;
}

// [이식] 하드웨어 파편화 환경에서 가장 구동률이 우수한 웹 비디오 수렴용 코덱 포맷 순차 레이어 선별
const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';

// [이식] 고속 프레임 유입 데이터 파편 처리를 유연하고 안전하게 견뎌내도록 6Mbps 대역폭 인코딩 옵션 강제 결합
const options = {
mimeType,
videoBitsPerSecond: 6000000
};

try {
mediaRecorder = new MediaRecorder(stream, options);
} catch (e) {
console.warn('[경고] 지정 코덱 포맷 인코더 구성 실패, 시스템 네이티브 기본 설정으로 바이패스 우회합니다.');
mediaRecorder = new MediaRecorder(stream);
}

try {
mediaRecorder.ondataavailable = (e) => {
if (e.data && e.data.size > 0) recordedChunks.push(e.data);
};

mediaRecorder.onstop = async () => {
const actualRecordedMime = mediaRecorder.mimeType || mimeType || 'video/webm';
const videoBlob = new Blob(recordedChunks, { type: actualRecordedMime });

if (core && typeof core.saveCache === 'function') {
await core.saveCache('lastVideoBlob', videoBlob);
await core.saveCache('lastRecordedMime', actualRecordedMime);
}

handleRecordingFinish(videoBlob, currentRoll);
recordedChunks = [];
};

// 100ms 데이터 파편 유실에 의한 브라우저 멈춤을 원천 해결하는 버퍼 슬라이싱 스케줄러 가동
mediaRecorder.start(100);
isRecording = true;
nodes.btnRecordToggle.textContent = '녹화중지';
nodes.btnRecordToggle.classList.add('recording');

// [이식] 실시간 확보 작동 프레임 정보를 모니터링 폰트로 UI 상단 레이아웃에 전방위 인젝션
if (nodes.recordStatus) {
nodes.recordStatus.innerHTML = `<span style="color:red;">● 녹화 중</span> <span style="font-size:10px;">(${actualFPS} FPS)</span>`;
}
} catch (e) {
console.error('[오류] 고성능 레코더 가동 크래시:', e);
}
} else {
if (mediaRecorder && mediaRecorder.state !== 'inactive') {
mediaRecorder.stop();
}
isRecording = false;
nodes.btnRecordToggle.textContent = '녹화시작';
nodes.btnRecordToggle.classList.remove('recording');
if (nodes.recordStatus) {
nodes.recordStatus.innerHTML = `대기 중 <span style="color:#00ff00; font-size:10px;">(기기 지원: ${actualFPS} FPS)</span>`;
}
}
});
nodes.btnReset?.addEventListener('click', async () => {
if (window.bowAnalyzer && typeof window.bowAnalyzer.clearLines === 'function') {
window.bowAnalyzer.clearLines();
}
if (core && core.state) {
core.state.scale = 1; core.state.offsetX = 0; core.state.offsetY = 0;
}
if (window.bowAppGesture && typeof window.bowAppGesture.applyTransform === 'function') {
window.bowAppGesture.applyTransform();
}
if (core && typeof core.saveCache === 'function') {
await core.saveCache('lastLines', []);
await core.saveCache('lastTransform', { scale: 1, offsetX: 0, offsetY: 0 });
}
if (nodes.angleReport) {
nodes.angleReport.innerHTML = `
<div class="final-angle" style="font-size:20px; font-weight:bold; color:#00FF66;">0.0°</div>
<div class="sub-info" style="font-size:11px; opacity:0.75; margin-top:2px;">(선분 초기화 완료)</div>`;
}
setTimeout(resizeCanvasToDisplay, 100);
});

// 5. 이미지 캡쳐 그래픽 병합 알고리즘 및 슬라이더 타임 인터페이스 동기화
nodes.btnCapture?.addEventListener('click', () => {
const video = nodes.mainVideo;
const drawCanvas = nodes.drawCanvas;
if (!video || !drawCanvas) return;

const offscreen = document.createElement('canvas');
offscreen.width = video.videoWidth || 1280;
offscreen.height = video.videoHeight || 720;
const ctx = offscreen.getContext('2d');

ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
ctx.drawImage(drawCanvas, 0, 0, offscreen.width, offscreen.height);

ctx.fillStyle = "white";
ctx.font = "bold 24px Arial";
const angleText = nodes.angleReport?.innerText.split('\n') || "0.0°";
ctx.fillText(`국궁 고성능 최적화 분석: ${angleText}`, 20, offscreen.height - 30);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const link = document.createElement('a');
link.download = `kukgung_analysis_${timestamp}.png`;
link.href = offscreen.toDataURL('image/png');
link.click();
});

const fpsButtons = document.querySelectorAll('.fps-btn');
const cpuCores = navigator.hardwareConcurrency || 4;

if (cpuCores <= 4) {
fpsButtons.forEach(btn => {
const fpsVal = parseInt(btn.getAttribute('data-fps'), 10);
if (fpsVal >= 120) {
btn.style.opacity = '0.25';
btn.style.pointerEvents = 'none';
}
});
}

fpsButtons.forEach(btn => {
btn.addEventListener('click', async () => {
if (isRecording) return;
fpsButtons.forEach(b => b.classList.remove('active'));
btn.classList.add('active');
selectedFPS = parseInt(btn.getAttribute('data-fps'), 10);
if (nodes.sceneRecord?.classList.contains('active')) {
await initCamera();
}
});
});

nodes.mainVideo?.addEventListener('loadedmetadata', () => {
const detectedFPS = nodes.mainVideo.videoFrameRate || (typeof actualFPS === 'number' ? actualFPS : selectedFPS);
currentFrameTime = 1 / detectedFPS;
if (nodes.videoSlider) {
nodes.videoSlider.max = nodes.mainVideo.duration || 100;
nodes.videoSlider.step = 0.0001;
}
resizeCanvasToDisplay();
});

nodes.mainVideo?.addEventListener('timeupdate', () => {
if (nodes.videoSlider && !isNaN(nodes.mainVideo.currentTime)) {
nodes.videoSlider.value = nodes.mainVideo.currentTime;
}
});

nodes.videoSlider?.addEventListener('input', () => {
nodes.mainVideo.pause();
if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
nodes.mainVideo.currentTime = parseFloat(nodes.videoSlider.value);
});

nodes.btnPlayPause?.addEventListener('click', () => {
if (nodes.mainVideo.paused) {
nodes.mainVideo.play();
nodes.btnPlayPause.textContent = '일시정지';
} else {
nodes.mainVideo.pause();
nodes.btnPlayPause.textContent = '재생';
}
});
// 6. 초정밀 타임 세션 프레임 매크로 매커니즘 및 자이로 수평계 동적 컬러 피드백 ㄷ자 루프 결합
let longPressTimer = null;
let repeatInterval = null;

function startFrameRepeat(direction) {
clearFrameRepeat();
longPressTimer = setTimeout(() => {
repeatInterval = setInterval(() => {
nodes.mainVideo.pause();
if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
if (direction === 'next') {
nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
} else {
nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
}
}, 60);
}, 300);
}

function clearFrameRepeat() {
if (longPressTimer) clearTimeout(longPressTimer);
if (repeatInterval) clearInterval(repeatInterval);
longPressTimer = null;
repeatInterval = null;
}

nodes.btnFramePrev?.addEventListener('pointerdown', (e) => {
e.preventDefault(); nodes.mainVideo.pause();
if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
nodes.mainVideo.currentTime = Math.max(0, nodes.mainVideo.currentTime - currentFrameTime);
startFrameRepeat('prev');
});

nodes.btnFrameNext?.addEventListener('pointerdown', (e) => {
e.preventDefault(); nodes.mainVideo.pause();
if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생';
nodes.mainVideo.currentTime = Math.min(nodes.mainVideo.duration, nodes.mainVideo.currentTime + currentFrameTime);
startFrameRepeat('next');
});

window.addEventListener('pointerup', clearFrameRepeat);
window.addEventListener('pointercancel', clearFrameRepeat);

// [이식] 실시간 수평계 오차 가변 트랜스폼 회전 및 임계점 판정 피드백 컬러 필터 매핑 ㄷ자 루프 완벽 복구
window.addEventListener('bowGyroUpdate', (e) => {
const { roll, isLevel } = e.detail;
if (isNaN(roll)) return;

currentRoll = roll;
if (core && core.state) core.state.currentRoll = roll;

if (nodes.sceneRecord?.classList.contains('active')) {
if (nodes.gyroHorizonLine) {
nodes.gyroHorizonLine.style.transform = `translate(-50%, -50%) rotate(${roll}deg)`;
nodes.gyroHorizonLine.setAttribute('data-angle', `${roll}°`);

// [이식] 완벽 수평 피드백 기준에 맞춰 실시간 변조되는 멈춤 없는 배경색 핸들러 기법 주입 (그린/레드 컬러 변형)
nodes.gyroHorizonLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
nodes.gyroHorizonLine.classList.toggle('perfect-level', isLevel);
}
if (nodes.gyroVerticalLine) {
// [이식] 수직선 색상 정밀 동기화 레이어 결합
nodes.gyroVerticalLine.style.backgroundColor = isLevel ? '#00ff00' : '#ff4444';
nodes.gyroVerticalLine.classList.toggle('perfect-level', isLevel);
}
// 녹화 준비 상태일 때 트리거 보더라인 실시간 강조 가변 매핑
if (nodes.btnRecordToggle && !isRecording) {
nodes.btnRecordToggle.style.borderColor = isLevel ? '#00ff00' : '#ff4444';
}
}
});

window.addEventListener('bowAngleUpdate', (e) => {
if (nodes.angleReport && e.detail.angle !== undefined) {
nodes.angleReport.innerHTML = `
<div style="font-size:24px; font-weight:bold; color:#00ff00;">${e.detail.angle}°</div>
<div style="font-size:11px; color:#aaa; margin-top:2px;">(측정: ${e.detail.raw}° / 보정: ${e.detail.roll}°)</div>`;
}
if (window.bowAnalyzer && core) core.saveCache('lastLines', window.bowAnalyzer.lines);
});
// [수정] 업로드 파일 인터페이스 비동기 가동 구조 결합 (v21.1 수리 패치 영역)
nodes.btnOpen?.addEventListener('click', () => {
console.log('[시스템] 파일 선택창 호출');
nodes.videoInput?.click();
});

nodes.videoInput?.addEventListener('change', async (e) => {
const files = e.target.files;
if (!files || files.length === 0) return;
console.log('[시스템] 파일 로드 시작:', files[0].name);

// 1. PWA 캐시 저장 (선택 사항)
if (core && typeof core.saveCache === 'function') {
await core.saveCache('lastVideoBlob', files[0]);
}

// 2. 비디오 소스 주입 및 로드
const url = URL.createObjectURL(files[0]);
nodes.mainVideo.src = url;
nodes.mainVideo.load();

// 3. 비디오 로드 완료 후 처리
nodes.mainVideo.onloadeddata = () => {
console.log('[시스템] 비디오 데이터 로드 완료');
// 슬라이더 및 캔버스 초기화
if (nodes.videoSlider) {
nodes.videoSlider.max = nodes.mainVideo.duration || 100;
nodes.videoSlider.step = 0.0001;
nodes.videoSlider.value = 0;
}
resizeCanvasToDisplay();

// 장면 전환 (분석 화면으로)
nodes.sceneRecord?.classList.remove('active');
nodes.sceneAnalyze?.classList.add('active');

// 분석 엔진 초기화
if (window.bowAnalyzer) {
window.bowAnalyzer.clearLines();
window.bowAnalyzer.setMode('move');
window.bowAnalyzer.render();
}
nodes.mainVideo.currentTime = 0.1; // 첫 프레임 미리보기
};
});

nodes.btnMove?.addEventListener('click', () => { setActiveMenu(nodes.btnMove); if (window.bowAnalyzer) { window.bowAnalyzer.setMode('move'); window.bowAnalyzer.render(); } });
nodes.btnDraw?.addEventListener('click', () => { setActiveMenu(nodes.btnDraw); if (window.bowAnalyzer) { window.bowAnalyzer.setMode('draw'); window.bowAnalyzer.render(); } });

function setActiveMenu(activeBtn) {
[nodes.btnOpen, nodes.btnMove, nodes.btnDraw, nodes.btnCapture, nodes.btnDownloadVideo].forEach(btn => btn?.classList.remove('active'));
activeBtn?.classList.add('active');
}

nodes.btnGoRecord?.addEventListener('click', async () => { nodes.mainVideo.pause(); if (nodes.btnPlayPause) nodes.btnPlayPause.textContent = '재생'; nodes.sceneAnalyze.classList.remove('active'); nodes.sceneRecord.classList.add('active'); await initCamera(); });
nodes.btnGoAnalyze?.addEventListener('click', () => { stopCamera(); nodes.sceneRecord.classList.remove('active'); nodes.sceneAnalyze.classList.add('active'); setActiveMenu(nodes.btnMove); if (window.bowAnalyzer) window.bowAnalyzer.setMode('move'); setTimeout(resizeCanvasToDisplay, 100); });
nodes.panelHandle?.addEventListener('click', () => { if (!core || !core.state) return; core.state.isPanelOpen = !core.state.isPanelOpen; nodes.unifiedPanel?.classList.toggle('collapsed', !core.state.isPanelOpen); });

nodes.btnDownloadVideo?.addEventListener('click', async () => {
try {
const savedBlob = await core.loadCache('lastVideoBlob');
if (!savedBlob) { alert('추출할 촬영 비디오 데이터가 존재하지 않습니다.'); return; }
const actualMime = await core.loadCache('lastRecordedMime') || 'video/webm';
const ext = actualMime.includes('mp4') ? '.mp4' : '.webm';
const url = URL.createObjectURL(savedBlob);
const a = document.createElement('a');
a.href = url;
a.download = `kukgung_video_${Date.now()}${ext}`;
a.click();
URL.revokeObjectURL(url);
} catch (err) {
console.error(err);
}
});

// [이식] 비동기 비블로킹 순차 컴파일 및 실행 순서의 확실한 보장
await initCamera();
resizeCanvasToDisplay();
window.addEventListener('resize', resizeCanvasToDisplay);

if (window.bowAppGesture && typeof window.bowAppGesture.init === 'function') window.bowAppGesture.init(nodes.videoViewport, nodes.mainVideo);
if (window.bowAnalyzer && typeof window.bowAnalyzer.init === 'function') window.bowAnalyzer.init(nodes.drawCanvas);
});

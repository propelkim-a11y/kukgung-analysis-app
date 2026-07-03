// ============================================================================
// [Physics Core - Part 1] 국궁 탄도학 시뮬레이션 물리 연산 엔진 (Fix Completed)
// ============================================================================

// 전역 시뮬레이션 상태 인프라 변수
let canvas, ctx;
let animationFrameId = null;
let trajectoryData = []; // 화살 비행 궤적 좌표 축적 데이터 배열

// 초기화 이벤트 리스너 바인딩
window.addEventListener('load', () => {
  canvas = document.getElementById('simCanvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    fireArrow(); // [초기 화면 엔진 수호] 로드 즉시 기본 변수 기반 가상 비행 탄도 렌더링
  }
});

// 브라우저 리사이징 대응 뷰포트 정렬
function resizeCanvas() {
  if (!canvas) return;
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  // 리사이즈 시점에도 강제 역학 계산을 수행하여 고정 스케일로 화면 동기화
  if (typeof drawScene === 'function') drawScene();
}

// [핵심 연산 루틴] 화살 시뮬레이션 발사 및 역학 미분 방정식 수치 해석
function fireArrow() {
  // 1. UI 입력 폼 엘리먼트 데이터 실시간 캡처 및 파싱
  const v0 = parseFloat(document.getElementById('velocity').value) || 50;
  const thetaDeg = parseFloat(document.getElementById('angle').value) || 30;
  const psiDeg = parseFloat(document.getElementById('yawAngle').value) || 0;
  
  const cd = parseFloat(document.getElementById('dragCoeff').value) || 0.35;
  const cl = parseFloat(document.getElementById('liftCoeff').value) || 0.05;
  const wGram = parseFloat(document.getElementById('weight').value) || 25;
  const dMm = parseFloat(document.getElementById('diameter').value) || 5.5;
  const h0 = parseFloat(document.getElementById('launchHeight').value) || 1.5;
  
  const windX = parseFloat(document.getElementById('windX').value) || 0;
  const windY = parseFloat(document.getElementById('windY').value) || 0;
  const rho = parseFloat(document.getElementById('airDensity').value) || 1.225;

  // 2. 물리 표준 단위계 변환 (제2조 연산 오류 폭발 방어 수치 정형화)
  const mass = wGram / 1000; // g -> kg 변환
  const radius = (dMm / 1000) / 2; // mm -> m 반지름 계산
  const area = Math.PI * Math.pow(radius, 2); // 화살 전면 투영 단면적
  const g = 9.80665; // 표준 중력 가속도 상수

  // 호도법(Radian) 기반 삼각함수 가속 각도 파싱
  const theta = thetaDeg * Math.PI / 180; // 수직 발사 고각
  const psi = psiDeg * Math.PI / 180; // 수평 사격 방위각

  // 3차원 공간 속도 벡터 성분 분해 (x: 전방 전진, y: 측면 편차, z: 수직 고도)
  let vx = v0 * Math.cos(theta) * Math.cos(psi);
  let vy = v0 * Math.cos(theta) * Math.sin(psi);
  let vz = v0 * Math.sin(theta);

  // 시뮬레이터 원점 런타임 공간 시작 좌표 초기화
  let x = 0;
  let y = 0;
  let z = h0;

  // 수치 통합 제어 실시간 트래킹 변수 세팅
  let t = 0;
  const dt = 0.005; // 5ms 고정 정밀도 타임 스텝 설정
  let maxDistance = 0;
  let maxHeight = z;
  let maxLoopGuard = 10000; // 무한 루프 긴급 차단 락업 장치

  trajectoryData = []; // 과거 궤적 세션 클리어 및 리셋
  trajectoryData.push({ x: x, y: y, z: z });

  // 3. 전진 오일러 역학 해석 통합 연산 루프 진입
  while (z >= 0 && maxLoopGuard > 0) {
    maxLoopGuard--;

    // 환경 변수 바람(종풍, 횡풍) 벡터를 융합한 화살의 공기역학적 상대 속도 연산
    const relVx = vx - windX;
    const relVy = vy - windY;
    const relVz = vz;
    const relV = Math.sqrt(relVx * relVx + relVy * relVy + relVz * relVz) || 0.0001;

    // 공기 유체 저항 항력(Drag Force) 물리 법칙 계산
    const fd = 0.5 * cd * rho * area * relV * relV;
    const fdx = -fd * (relVx / relV);
    const fdy = -fd * (relVy / relV);
    const fdz = -fd * (relVz / relV);

    // 비행 안정성 상방 유도 양력(Lift Force) 물리 법칙 계산
    const fl = 0.5 * cl * rho * area * relV * relV;
    const flz = fl; 

    // 뉴턴 제2법칙 가속도 연산 도출 (a = F / m)
    const ax = fdx / mass;
    const ay = fdy / mass;
    const az = -g + (fdz / mass) + (flz / mass);

    // 시간 축 변화율에 따른 다음 단계 속도 갱신
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    // 시간 축 변화율에 따른 다음 단계 변위 공간 위치 좌표 갱신
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;

    // 실시간 물리 정점 및 최대 횡적 도달 거리 기록 갱신
    if (z > maxHeight) maxHeight = z;
    maxDistance = x;

    // 캔버스 디스플레이 드로잉용 비행 경로 궤적 좌표 수집 저장
    trajectoryData.push({ x: x, y: y, z: z });
  }

  // 4. 최종 영점 충돌 순간의 합성 속도 벡터 및 탄도 운동에너지 산출
  const finalV = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const impactEnergy = 0.5 * mass * finalV * finalV;

  // 5. 구조화된 비행 연산 결과 데이터 패킹 변환
  const flightResults = {
    maxDistance: maxDistance,
    maxHeight: maxHeight,
    lateralDeviation: y,
    flightTime: t,
    impactVelocity: finalV,
    impactEnergy: impactEnergy
  };

  // ui.js 모듈 파일 내부의 결과 폼 전용 데이터 인젝션 트리거 연동 호출
  if (typeof updateFlightResultsUI === 'function') {
    updateFlightResultsUI(flightResults);
  }

  // 6. 그래픽 프레임 디스플레이 렌더러 애니메이션 호출 동기화
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(drawScene);
}
// ============================================================================
// [Physics Core - Part 2] 시점별 3차원 좌표축 및 과녁 보조선 렌더링 엔진 (Fix Completed)
// ============================================================================

// HTML5 Canvas 그래픽스 신 드로잉 메인 엔진 루틴
function drawScene() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // --------------------------------------------------------------------------
  // 1. 구조 배경 베이스 그리드 레이어 (Grid Layer)
  // --------------------------------------------------------------------------
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
  ctx.lineWidth = 1;
  for (let i = 50; i < canvas.width; i += 50) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
  }
  for (let j = 50; j < canvas.height; j += 50) {
    ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke();
  }

  // 환경 변수 탭 폼에서 과녁 높이 데이터 안전 바인딩 파싱
  const targetH = parseFloat(document.getElementById('targetHeight').value) || 1.3;

  // --------------------------------------------------------------------------
  // 2. 프리미엄 계측 좌표축 및 과녁 보조선 레이어 (Axis Layer)
  // --------------------------------------------------------------------------
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text"';
  ctx.textBaseline = 'middle';

  // 글로벌 세션 뷰 타입 로직 분기 검증
  const viewMode = typeof currentView !== 'undefined' ? currentView : 'side';

  if (viewMode === 'side') {
    // [측면도 고정 스케일] 가로: 수평 비행 거리 X (0m ~ 160m), 세로: 수직 비행 높이 Z (0m ~ 40m)
    const startX = canvas.width * 0.1;
    const endX = canvas.width * 0.9;
    const groundY = canvas.height * 0.85;
    const topY = canvas.height * 0.15;

    // 메인 사대 지면 바닥선 (X축 기본 물리 기준선)
    ctx.strokeStyle = '#1d1d1f';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(startX - 20, groundY); ctx.lineTo(endX + 20, groundY); ctx.stroke();

    // 수직 고도 탐지선 (Z축 기본 물리 기준선)
    ctx.beginPath(); ctx.moveTo(startX, groundY + 10); ctx.lineTo(startX, topY - 20); ctx.stroke();

    // 물리 좌표축 방향 레이블 네임텍스트 매핑
    ctx.fillStyle = '#86868b';
    ctx.textAlign = 'left';
    ctx.fillText('거리 X (m)', endX + 25, groundY);
    ctx.textAlign = 'center';
    ctx.fillText('높이 Z (m)', startX, topY - 30);

    // [완전 복구] 수평 거리 눈금 스케일 상시 고정 주입 (0m ~ 160m 구간)
    const distances =;
    distances.forEach(d => {
      const tickX = startX + (d / 160) * (canvas.width * 0.8);
      ctx.strokeStyle = d === 145 ? '#ff453a' : 'rgba(0,0,0,0.15)'; // 국궁 규격 145m 고대비 레드 분기
      ctx.lineWidth = d === 145 ? 1.5 : 1;
      
      ctx.beginPath(); ctx.moveTo(tickX, groundY); ctx.lineTo(tickX, groundY + 5); ctx.stroke();
      
      ctx.fillStyle = d === 145 ? '#ff453a' : '#515154';
      ctx.font = d === 145 ? 'bold 11px -apple-system' : '11px -apple-system';
      ctx.fillText(d + 'm', tickX, groundY + 18);
    });

    // [완전 복구] 상방 수직 높이 눈금 스케일 상시 고정 주입 (0m ~ 40m 구간)
    const heights =;
    ctx.font = '11px -apple-system';
    ctx.fillStyle = '#515154';
    ctx.textAlign = 'right';
    heights.forEach(h => {
      const tickY = groundY - (h / 40) * (canvas.height * 0.7);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.moveTo(startX, tickY); ctx.lineTo(startX - 5); ctx.stroke();
      ctx.fillText(h + 'm', startX - 10, tickY);
    });

    // [핵심 크로스 보조선] 145m 정밀 국궁 과녁 십자 지표 마커 타겟 연출
    const targetX145 = startX + (145 / 160) * (canvas.width * 0.8);
    const targetYPos = groundY - (targetH / 40) * (canvas.height * 0.7);
    ctx.strokeStyle = 'rgba(255, 69, 58, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); // 정밀 대시 가이드라인 처리
    ctx.beginPath(); ctx.moveTo(startX, targetYPos); ctx.lineTo(targetX145, targetYPos); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(targetX145, groundY); ctx.lineTo(targetX145, targetYPos); ctx.stroke();
    ctx.setLineDash([]); // 대시라인 속성 즉시 반환 해제

    // 과녁 정밀 적중 판단용 노드 서클 포인트 스탬프
    ctx.fillStyle = '#ff453a';
    ctx.beginPath(); ctx.arc(targetX145, targetYPos, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.font = 'bold 11px -apple-system';
    ctx.fillText('국궁과녁 (145m)', targetX145 - 10, targetYPos - 12);

  } else if (viewMode === 'front') {
    // [정면도 고정 스케일] 가로: 중심 기준 측면 편차 Y (-5m ~ 5m), 세로: 비행 고도 높이 Z (0m ~ 40m)
    const midX = canvas.width / 2;
    const groundY = canvas.height * 0.85;
    const topY = canvas.height * 0.15;

    // 좌우 가로 수평축 경계선 마킹
    ctx.strokeStyle = '#1d1d1f';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(midX - (canvas.width * 0.4) - 20, groundY); ctx.lineTo(midX + (canvas.width * 0.4) + 20, groundY); ctx.stroke();

    // 정중앙 수직 중심 영점 라인 가이드선 (Y = 0m 오프셋 기준 지표선)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(midX, groundY + 10); ctx.lineTo(midX, topY - 20); ctx.stroke();

    ctx.fillStyle = '#86868b';
    ctx.textAlign = 'left';
    ctx.fillText('측면 편차 Y (m)', midX + (canvas.width * 0.4) + 25, groundY);
    ctx.textAlign = 'center';
    ctx.fillText('높이 Z (m)', midX, topY - 30);

    // 횡적 좌우 흔들림 편차 계측 스케일 눈금 마킹 (-5m, -2.5m, 0m, 2.5m, 5m)
    const deviations = [-5, -2.5, 0, 2.5, 5];
    ctx.textAlign = 'center';
    deviations.forEach(d => {
      const tickX = midX + (d / 10) * (canvas.width * 0.4);
      ctx.strokeStyle = d === 0 ? '#0071e3' : 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.moveTo(tickX, groundY); ctx.lineTo(tickX, groundY + 5); ctx.stroke();
      
      ctx.fillStyle = d === 0 ? '#0071e3' : '#515154';
      ctx.fillText(d + 'm', tickX, groundY + 18);
    });

    // 정면 표적용 타겟 과녁 횡대 가이드 가설선 배치
    const targetYPos = groundY - (targetH / 40) * (canvas.height * 0.7);
    ctx.strokeStyle = 'rgba(255, 69, 58, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(midX - 30, targetYPos); ctx.lineTo(midX + 30, targetYPos); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff453a';
    ctx.beginPath(); ctx.arc(midX, targetYPos, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.font = 'bold 11px -apple-system';
    ctx.fillText('과녁 중심점', midX, targetYPos - 12);

  } else if (viewMode === 'top') {
    // [평면도 고정 스케일] 가로: 전방 종적 주행 거리 X (0m ~ 160m), 세로: 횡적 좌우 측면편차 Y (-5m ~ 5m)
    const startX = canvas.width * 0.1;
    const endX = canvas.width * 0.9;
    const midY = canvas.height / 2;

    // 메인 탄도 비행 정방향 수평 방위선 (Y = 0)
    ctx.strokeStyle = '#1d1d1f';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(startX - 20, midY); ctx.lineTo(endX + 20, midY); ctx.stroke();

    ctx.fillStyle = '#86868b';
    ctx.textAlign = 'left';
    ctx.fillText('거리 X (m)', endX + 25, midY);
    ctx.textAlign = 'center';
    ctx.fillText('측면 편차 Y (m)', startX, midY - (canvas.height * 0.4) - 20);

    // [완전 복구] 평면 기준 종방향 거리 스케일 단위 눈금 상시 고정 투영 (0m ~ 160m 구간)
    const distances =;
    ctx.textAlign = 'center';
    distances.forEach(d => {
      const tickX = startX + (d / 160) * (canvas.width * 0.8);
      ctx.strokeStyle = d === 145 ? '#ff453a' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = d === 145 ? 1.5 : 1;
      
      ctx.beginPath(); ctx.moveTo(tickX, midY - 5); ctx.lineTo(tickX, midY + 5); ctx.stroke();
      
      ctx.fillStyle = d === 145 ? '#ff453a' : '#515154';
      ctx.font = d === 145 ? 'bold 11px -apple-system' : '11px -apple-system';
      ctx.fillText(d + 'm', tickX, midY + 18);
    });

    // 145m 영점 한계선에 평면 국궁 과녁 차단 방위 횡선 정밀 배치
    const targetX145 = startX + (145 / 160) * (canvas.width * 0.8);
    ctx.strokeStyle = '#ff453a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(targetX145, midY - 15); ctx.lineTo(targetX145, midY + 15); ctx.stroke();
    
    ctx.fillStyle = '#ff453a';
    ctx.font = 'bold 11px -apple-system';
    ctx.textAlign = 'left';
    ctx.fillText('과녁 라인', targetX145 + 8, midY - 8);
  }

  // --------------------------------------------------------------------------
  // 3. 최상단 최우선 순위 비행 탄도 궤적 렌더링 레이어 (Trajectory Arrow Layer)
  // --------------------------------------------------------------------------
  if (trajectoryData.length > 0) {
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0071e3'; // 프리미엄 테크니컬 네온 블루 칼라 적용
    
    trajectoryData.forEach((point, index) => {
      let screenX = 0;
      let screenY = 0;
      
      // 실시간 토글 뷰포트 상태에 따른 좌표 가상 매핑 트랜스폼
      if (viewMode === 'side') {
        screenX = (point.x / 160) * (canvas.width * 0.8) + (canvas.width * 0.1);
        screenY = (canvas.height * 0.85) - (point.z / 40) * (canvas.height * 0.7);
      } else if (viewMode === 'front') {
        screenX = (canvas.width / 2) + (point.y / 10) * (canvas.width * 0.4);
        screenY = (canvas.height * 0.85) - (point.z / 40) * (canvas.height * 0.7);
      } else if (viewMode === 'top') {
        screenX = (point.x / 160) * (canvas.width * 0.8) + (canvas.width * 0.1);
        screenY = (canvas.height / 2) + (point.y / 10) * (canvas.height * 0.4);
      }
      
      if (index === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    });
    ctx.stroke();
  }
}

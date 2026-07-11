/**
 * js/analyzer.js - [Part 1]
 * - 국궁 고각 분석 시스템 락 프리 최종 완결판
 * (v20.0 - 3) 가로세로 분할 박스 완전 가둠 완결 버전
 * - [ ] (Phone Roll) 업데이트 디바이스 기울기 실시간 하드웨어 역보정 엔진 탑재판
 * - [💡] 분석용 템플릿 파일(.json) 내보내기(Export) 및 가져오기(Import) 무결성 탑재판
 */

class BowAnalyzer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.lines = [];
    this.currentLine = null;
    this.transform = { scale: 1, offsetX: 0, offsetY: 0 };
    this.toolMode = 'move';
    this.snapThreshold = 35; // 손가락 터치 타겟팅 기본 반경
    this.isSnapped = false;

    // 국궁 전통 표준 절대 고각 자석 제어용 플래그 상태 변수
    this.isAngleSnapped = false;
    this.angleSnapThreshold = 1.5; // (±1.5°) 자석 각도 오차 범위

    // 더블 탭 삭제 제어를 위한 정밀 타임 스탬프 및 좌표 추적 변수
    this.lastTapTime = 0;
    this.tapThreshold = 300; // 0.3 초 이내 연속 터치 시 더블 탭 인정
    this.lastTapCoords = { x: 0, y: 0 };

    // 선 정점 편집 미세 수정을 위한 상태 변수
    this.editingLineIndex = -1;
    this.editingVertexType = null;
    this.movingLineIndex = -1;
    this.lastCoords = { x: 0, y: 0 };

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  // [ ] 💡 하드웨어 충돌 박멸 리스너를 단 한 번만 영구 결합하여 중복 누적 버그 차단
  init(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');

    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
  }

  updateTransform(scale, offsetX, offsetY) {
    this.transform.scale = scale;
    this.transform.offsetX = offsetX;
    this.transform.offsetY = offsetY;
    this.render();
  }

  setMode(mode) {
    this.toolMode = mode;
    this.render();
  }

  clearLines() {
    this.lines = [];
    this.currentLine = null;
    this.editingLineIndex = -1;
    this.editingVertexType = null;
    this.movingLineIndex = -1;
    this.isAngleSnapped = false;
    this.render();
    this.calculateFinalAngle(); // 0 점 기반 보정치 전송 클리어
  }

  undoLastLine() {
    if (this.lines.length > 0) {
      this.lines.pop();
      this.isAngleSnapped = false;
      this.render();
      this.calculateFinalAngle();
      return true;
    }
    return false;
  }

  getCanvasCoordinates(event) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const canvasScaleX = this.canvas.width / rect.width;
    const canvasScaleY = this.canvas.height / rect.height;
    const cX = (event.clientX - rect.left) * canvasScaleX;
    const cY = (event.clientY - rect.top) * canvasScaleY;

    const canvasX = (cX - (this.transform.offsetX * canvasScaleX)) / this.transform.scale;
    const canvasY = (cY - (this.transform.offsetY * canvasScaleY)) / this.transform.scale;
    return { x: canvasX, y: canvasY };
  }
  // 점과 선분 사이의 최단거리 측정 기하 연산 함수
  getDistanceToLine(x, y, line) {
    if (!line || !line.start || !line.end) return Infinity;
    const A = x - line.start.x;
    const B = y - line.start.y;
    const C = line.end.x - line.start.x;
    const D = line.end.y - line.start.y;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) {
      xx = line.start.x; yy = line.start.y;
    } else if (param > 1) {
      xx = line.end.x; yy = line.end.y;
    } else {
      xx = line.start.x + param * C;
      yy = line.start.y + param * D;
    }
    return Math.hypot(x - xx, y - yy);
  }

  // 드로잉 시 주변 정점에 자석처럼 들러붙는 마감 함수
  findCloseEndpoint(x, y) {
    const baseRadius = window.isStylusActive ? 35 : this.snapThreshold;
    const targetRadius = baseRadius / this.transform.scale;
    for (let line of this.lines) {
      if (Math.hypot(line.start.x - x, line.start.y - y) < targetRadius) {
        return { x: line.start.x, y: line.start.y };
      }
      if (Math.hypot(line.end.x - x, line.end.y - y) < targetRadius) {
        return { x: line.end.x, y: line.end.y };
      }
    }
    return null;
  }

  handlePointerDown(event) {
    if (this.toolMode !== 'draw') return;
    if (event.pointerType === 'pen') {
      window.isStylusActive = true;
    } else if (event.pointerType === 'touch' && window.isStylusActive) {
      return;
    }
    event.preventDefault();

    this.canvas.setPointerCapture(event.pointerId);
    const coords = this.getCanvasCoordinates(event);

    const baseRadius = (event.pointerType === 'pen') ? 35 : this.snapThreshold;
    const targetRadius = baseRadius / this.transform.scale;

    const currentTime = new Date().getTime();
    const tapLength = currentTime - this.lastTapTime;

    this.editingLineIndex = -1;
    this.editingVertexType = null;
    this.movingLineIndex = -1;

    if (tapLength < this.tapThreshold && tapLength > 0) {
      const distFromLastTap = Math.hypot(coords.x - this.lastTapCoords.x, coords.y - this.lastTapCoords.y);
      if (distFromLastTap < targetRadius) {
        for (let i = 0; i < this.lines.length; i++) {
          if (this.getDistanceToLine(coords.x, coords.y, this.lines[i]) < targetRadius) {
            this.lines.splice(i, 1);
            this.lastTapTime = 0;
            this.currentLine = null;
            this.isAngleSnapped = false;
            this.render();
            this.calculateFinalAngle();

            const deleteEvent = new CustomEvent('bowGestureUndo', {
              detail: { lines: this.lines }
            });
            window.dispatchEvent(deleteEvent);
            return;
          }
        }
      }
    }

    this.lastTapTime = currentTime;
    this.lastTapCoords = coords;
    this.lastCoords = coords;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      if (Math.hypot(line.start.x - coords.x, line.start.y - coords.y) < targetRadius) {
        this.editingLineIndex = i;
        this.editingVertexType = 'start';
        break;
      }
      if (Math.hypot(line.end.x - coords.x, line.end.y - coords.y) < targetRadius) {
        this.editingLineIndex = i;
        this.editingVertexType = 'end';
        break;
      }
    }

    if (this.editingLineIndex === -1) {
      for (let i = 0; i < this.lines.length; i++) {
        if (this.getDistanceToLine(coords.x, coords.y, this.lines[i]) < targetRadius) {
          this.movingLineIndex = i;
          break;
        }
      }
    }

    if (this.editingLineIndex === -1 && this.movingLineIndex === -1) {
      let startPt = { x: coords.x, y: coords.y };
      const snappedPt = this.findCloseEndpoint(coords.x, coords.y);
      if (snappedPt) startPt = snappedPt;
      this.currentLine = { start: startPt, end: { x: coords.x, y: coords.y } };
    }
  }
  snapToAbsoluteAngles(basePt, targetX, targetY) {
    const dx = targetX - basePt.x;
    const dy = targetY - basePt.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return { x: targetX, y: targetY };

    let rawAngle = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (rawAngle < 0) rawAngle += 360;
    const normalizedAngle = rawAngle % 180;

    const targets = [37.79, 52.21];
    this.isAngleSnapped = false;

    for (let target of targets) {
      if (Math.abs(normalizedAngle - target) < this.angleSnapThreshold) {
        this.isAngleSnapped = true;
        let targetRad = target * (Math.PI / 180);
        if (rawAngle >= 180) targetRad = (target + 180) * (Math.PI / 180);
        return {
          x: basePt.x + length * Math.cos(targetRad),
          y: basePt.y - length * Math.sin(targetRad)
        };
      }
    }
    return { x: targetX, y: targetY };
  }

  handlePointerMove(event) {
    if (this.toolMode !== 'draw') return;
    event.preventDefault();
    const coords = this.getCanvasCoordinates(event);
    let targetX = coords.x;
    let targetY = coords.y;
    this.isSnapped = false;

    const isPen = (event.pointerType === 'pen');
    const baseRadius = isPen ? 35 : this.snapThreshold;

    if (this.editingLineIndex !== -1 && this.editingVertexType) {
      const line = this.lines[this.editingLineIndex];
      const currentVertex = this.editingVertexType === 'start' ? line.start : line.end;
      const basePt = this.editingVertexType === 'start' ? line.end : line.start;

      /*if (isPen) {
        targetX = currentVertex.x + 0.55 * (coords.x - currentVertex.x);
        targetY = currentVertex.y + 0.55 * (coords.y - currentVertex.y);
      }*/

      const angleSnappedPt = this.snapToAbsoluteAngles(basePt, targetX, targetY);
      targetX = angleSnappedPt.x;
      targetY = angleSnappedPt.y;

      if (!this.isAngleSnapped) {
        const adjustedThreshold = baseRadius / this.transform.scale;
        const dx = targetX - basePt.x;
        const dy = targetY - basePt.y;
        if (Math.abs(dx) < adjustedThreshold) {
          targetX = basePt.x; this.isSnapped = true;
        } else if (Math.abs(dy) < adjustedThreshold) {
          targetY = basePt.y; this.isSnapped = true;
        }
      }

      if (this.editingVertexType === 'start') { line.start = { x: targetX, y: targetY }; }
      else { line.end = { x: targetX, y: targetY }; }

      this.render();
      this.calculateFinalAngle();
    }
    else if (this.movingLineIndex !== -1) {
      const line = this.lines[this.movingLineIndex];
      let deltaX = coords.x - this.lastCoords.x;
      let deltaY = coords.y - this.lastCoords.y;

      /*if (isPen) {
        deltaX *= 0.55;
        deltaY *= 0.55;
      }*/

      line.start.x += deltaX;
      line.start.y += deltaY;
      line.end.x += deltaX;
      line.end.y += deltaY;

      this.lastCoords = coords;
      this.render();
      this.calculateFinalAngle();
    }
    else if (this.currentLine) {
      const angleSnappedPt = this.snapToAbsoluteAngles(this.currentLine.start, targetX, targetY);
      targetX = angleSnappedPt.x;
      targetY = angleSnappedPt.y;

      if (!this.isAngleSnapped) {
        const snapEndpoint = this.findCloseEndpoint(targetX, targetY);
        if (snapEndpoint) {
          targetX = snapEndpoint.x; targetY = snapEndpoint.y;
          this.isSnapped = true;
        } else {
          const adjustedThreshold = baseRadius / this.transform.scale;
          const dx = targetX - this.currentLine.start.x;
          const dy = targetY - this.currentLine.start.y;
          if (Math.abs(dx) < adjustedThreshold) {
            targetX = this.currentLine.start.x; this.isSnapped = true;
          } else if (Math.abs(dy) < adjustedThreshold) {
            targetY = this.currentLine.start.y; this.isSnapped = true;
          }
        }
      }
      this.currentLine.end = { x: targetX, y: targetY };
      this.render();
      this.calculateAnglesInline(); // 실시간 드로잉 보정 연산 바인딩
    }
  }
  handlePointerUp(event) {
    if (event.pointerType === 'pen') {
      setTimeout(() => { window.isStylusActive = false; }, 500);
    }
    if (this.toolMode !== 'draw') return;

    if (this.editingLineIndex !== -1 && this.editingVertexType) {
      this.editingLineIndex = -1;
      this.editingVertexType = null;
    } else if (this.movingLineIndex !== -1) {
      this.movingLineIndex = -1;
    } else if (this.currentLine) {
      const dx = this.currentLine.end.x - this.currentLine.start.x;
      const dy = this.currentLine.end.y - this.currentLine.start.y;
      if (Math.hypot(dx, dy) > 8) {
        this.lines.push(this.currentLine);
      }
      this.currentLine = null;
    }
    this.isAngleSnapped = false;
    this.render();
    this.calculateFinalAngle();
  }

  /**
   * [ ] (Roll) . 추가 촬영 당시 스마트폰 기울기 를 가져와 고각을 보정합니다
   */
  getCorrectedAngle(visualAngle) {
    const video = window.bowAppNodes?.mainVideo;
    const phoneRoll = parseFloat(video?.dataset?.phoneRoll || 0);

    // : = + (Roll) 보정 공식 실제 고각 화면상 측정 각도 스마트폰 기울기
    const corrected = visualAngle + phoneRoll;

    return {
      visual: visualAngle.toFixed(1),
      roll: phoneRoll.toFixed(1),
      final: corrected.toFixed(1)
    };
  }

  /**
   * [ ] 수정 드로잉 진행 중 실시간 앵글 피드백 연산 연동
   */
  calculateAnglesInline() {
    if (!this.currentLine) return;
    let rawAngle = 0;

    if (this.lines.length === 0) {
      rawAngle = this.getLineAngle(this.currentLine);
    } else {
      rawAngle = this.getIntersectionAngle(this.lines[this.lines.length - 1], this.currentLine);
    }

    const result = this.getCorrectedAngle(rawAngle);
    this.broadcastAngle(result);
  }

  /**
   * [ ] 수정 확정 최종 각도 계산 및 보정치 전송 로직
   */
  calculateFinalAngle() {
    let rawAngle = 0;

    if (this.lines.length >= 2) {
      rawAngle = this.getIntersectionAngle(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1]);
    } else if (this.lines.length === 1) {
      rawAngle = this.getLineAngle(this.lines[0]);
    }

    const result = this.getCorrectedAngle(rawAngle);
    this.broadcastAngle(result);
  }

  getLineAngle(line) {
    if (!line || !line.start || !line.end) return 0;
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    return Number((angle % 180).toFixed(1));
  }

  getIntersectionAngle(line1, line2) {
    if (!line1 || !line2 || !line1.start || !line1.end || !line2.start || !line2.end) return 0;
    const angle1 = Math.atan2(-(line1.end.y - line1.start.y), line1.end.x - line1.start.x);
    const angle2 = Math.atan2(-(line2.end.y - line2.start.y), line2.end.x - line2.start.x);
    let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
    if (diff > 180) diff = 360 - diff;
    return Number(Math.abs(diff).toFixed(1));
  }
  /**
   * [ ] 수정 외부 각도 업데이트 브로드캐스트 및 인터페이스 렌더링
   */
  broadcastAngle(result) {
    const angleEvent = new CustomEvent('bowAngleUpdate', {
      detail: {
        angle: result.final, // 보정된 최종 고각
        raw: result.visual, // 화면상 측정값
        roll: result.roll // 적용된 보정치
      }
    });
    window.dispatchEvent(angleEvent);

    // UI 플로팅 리포트 멀티라인 패널 디자인 구조화
    const report = document.getElementById('angle-report');
    if (report) {
      report.innerHTML = `
        <div class="final-angle" style="font-size:20px; font-weight:bold; color:#00FF66;">${result.final}°</div>
        <div class="sub-info" style="font-size:11px; opacity:0.75; margin-top:2px;">(측정: ${result.visual}° / 보정: ${result.roll}°)</div>
      `;
    }
  }

  drawSingleLineAbsoluteAngle(line, scaleX) {
    if (!line || !line.start || !line.end) return;
    const rawAngle = this.getLineAngle(line);
    const result = this.getCorrectedAngle(rawAngle);

    this.ctx.save();
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    this.ctx.shadowBlur = 4;
    this.ctx.font = `bold ${Math.max(11, (12 * scaleX) / this.transform.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Text"`;

    const textX = line.start.x + (12 / this.transform.scale);
    const textY = line.start.y - (12 / this.transform.scale);
    this.ctx.fillText(`${result.final}°`, textX, textY);
    this.ctx.restore();
  }

  drawInlineAngleArc(line1, line2, scaleX) {
    if (!line1 || !line2) return;

    const l1 = Array.isArray(line1) ? line1[line1.length - 1] : line1;
    const l2 = Array.isArray(line2) ? line2[line2.length - 1] : line2;
    if (!l1 || !l2 || !l1.start || !l1.end || !l2.start || !l2.end) return;

    const a1 = Math.atan2((l1.start.y - l1.end.y), l1.start.x - l1.end.x);
    const a2 = Math.atan2((l2.end.y - l2.start.y), l2.end.x - l2.start.x);
    const rawDeg = this.getIntersectionAngle(l1, l2);
    const result = this.getCorrectedAngle(rawDeg);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    this.ctx.lineWidth = (0.8 * scaleX) / this.transform.scale;
    const radius = (40 * scaleX) / this.transform.scale;
    this.ctx.arc(l1.end.x, l1.end.y, radius, -a1, -a2, a1 > a2);
    this.ctx.stroke();

    this.ctx.fillStyle = '#34C759';
    this.ctx.font = `bold ${Math.max(13, (14 * scaleX) / this.transform.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Text"`;
    this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
    this.ctx.shadowBlur = 5;
    this.ctx.fillText(` 사잇각 ${result.final}°`, l1.end.x + (20 / this.transform.scale), l1.end.y - (20 / this.transform.scale));
    this.ctx.restore();
  }
  render() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const canvasScaleY = this.canvas.height / rect.height;

    this.ctx.translate(this.transform.offsetX * scaleX, this.transform.offsetY * canvasScaleY);
    this.ctx.scale(this.transform.scale, this.transform.scale);
    this.ctx.lineWidth = (1.2 * scaleX) / this.transform.scale;

    this.lines.forEach((line, idx) => {
      const isEditing = (idx === this.editingLineIndex || idx === this.movingLineIndex);
      this.ctx.strokeStyle = isEditing ? '#FF9500' : '#00FF66';
      this.ctx.fillStyle = isEditing ? '#FF9500' : '#00FF66';
      this.drawSingleLine(line);
      this.drawSingleLineAbsoluteAngle(line, scaleX);
    });

    if (this.lines.length >= 2) {
      this.drawInlineAngleArc(this.lines[this.lines.length - 2], this.lines[this.lines.length - 1], scaleX);
    } else if (this.lines.length === 1 && this.currentLine) {
      this.drawInlineAngleArc(this.lines, this.currentLine, scaleX);
    }

    if (this.currentLine) {
      if (this.isAngleSnapped) {
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.fillStyle = '#007AFF';
      } else {
        this.ctx.strokeStyle = this.isSnapped ? '#34C759' : '#FFFFFF';
        this.ctx.fillStyle = this.isSnapped ? '#34C759' : '#FFFFFF';
      }
      this.drawSingleLine(this.currentLine);
      this.drawSingleLineAbsoluteAngle(this.currentLine, scaleX);
    }
    this.ctx.restore();
  }

  drawSingleLine(line) {
    if (!line || !line.start || !line.end) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;

    this.ctx.beginPath();
    this.ctx.moveTo(line.start.x, line.start.y);
    this.ctx.lineTo(line.end.x, line.end.y);
    this.ctx.stroke();

    const pinSize = (8 * scaleX) / this.transform.scale;
    this.ctx.save();
    this.ctx.lineWidth = (1.0 * scaleX) / this.transform.scale;

    this.ctx.beginPath();
    this.ctx.moveTo(line.start.x - pinSize, line.start.y);
    this.ctx.lineTo(line.start.x + pinSize, line.start.y);
    this.ctx.moveTo(line.start.x, line.start.y - pinSize);
    this.ctx.lineTo(line.start.x, line.start.y + pinSize);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(line.end.x - pinSize, line.end.y);
    this.ctx.lineTo(line.end.x + pinSize, line.end.y);
    this.ctx.moveTo(line.end.x, line.end.y - pinSize);
    this.ctx.lineTo(line.end.x, line.end.y + pinSize);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * [💡] 현재 그려진 분석 선분 데이터를 템플릿 파일(.json)로 저장 및 내보내기
   */
  exportTemplate() {
    if (this.lines.length === 0) {
      alert("저장할 분석 선분 데이터가 존재하지 않습니다.");
      return;
    }
    const dataStr = JSON.stringify(this.lines, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kukgung_template_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    console.log('[Template] 분석용 템플릿 파일 내보내기 정상 완료');
  }

  /**
   * [💡] JSON 파일을 물리적으로 읽어와 분석용 가이드 레이어로 복원 주입
   */
  importTemplate(fileObject) {
    if (!fileObject) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedLines = JSON.parse(e.target.result);
        if (Array.isArray(importedLines)) {
          this.lines = importedLines;
          this.currentLine = null;
          this.editingLineIndex = -1;
          this.editingVertexType = null;
          this.movingLineIndex = -1;
          this.isAngleSnapped = false;
          this.render();
          this.calculateFinalAngle();
          console.log('[Template] 분석용 템플릿 레이어 가져오기 성공 및 동화 완료');
        } else {
          alert("유효한 템플릿 기하 구조 파일 형식이 아닙니다.");
        }
      } catch (err) {
        console.error('[Template] 템플릿 파싱 결함', err);
        alert("템플릿 파일을 읽는 도중 디코딩 예외가 발생했습니다.");
      }
    };
    reader.readAsText(fileObject);
  }
}

window.bowAnalyzer = new BowAnalyzer();

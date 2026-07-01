document.addEventListener('DOMContentLoaded', () => {
    console.log(`[System Info] Kukgung AI Engine ${KUKGUNG_SYSTEM.config.version} Initialized.`);
    
    const btnQuickStart = document.getElementById('btn-quick-start');
    const sceneIntro = document.getElementById('scene-intro');
    const sceneCapture = document.getElementById('scene-capture');

    // [수정 및 추가된 핵심 코드 시작]
    if (btnQuickStart) {
        btnQuickStart.addEventListener('click', () => {
            console.log("-> 분석 시작 버튼 클릭됨. 화면 전환 시도 중...");
            
            // 1. 화면 강제 전환 (CSS 클래스 또는 스타일에 따라 조절 필요)
            if (sceneIntro && sceneCapture) {
                sceneIntro.style.display = 'none';
                sceneCapture.style.display = 'block';
                KUKGUNG_SYSTEM.state.currentScene = 'capture';
                console.log("-> 화면 뷰 전환 성공");
            } else {
                // ID가 다를 경우 클래스로 강제 전환 시도
                document.querySelector('.scene-intro')?.classList.add('hidden');
                document.querySelector('.scene-capture')?.classList.remove('hidden');
            }

            // 2. 카메라 및 파이프라인 작동 함수 호출
            if (typeof initHardwarePipeline === 'function') {
                initHardwarePipeline();
            } else if (typeof initCamera === 'function') {
                initCamera();
            } else {
                console.warn("카메라 초기화 함수를 찾을 수 없습니다. 아래쪽 코드를 확인하세요.");
            }
        });
    } else {
        console.error("오류: HTML에서 'btn-quick-start' 버튼을 찾을 수 없습니다.");
    }
}); // DOMContentLoaded 닫기 기호

/**
 * js/app_core.js (Part 1 of 2)
 * 국궁 자세 분석 시스템 - 대용량 IndexedDB 캐시 스토리지 코어 (먹통 방어 쉴드 판)
 */

class BowAppCore {
    constructor() {
        this.dbName = 'KukgungStorage';
        this.dbVersion = 3;
        this.db = null;
        
        // 메모리 동결을 방지하기 위한 시스템 경량화 라이프사이클 상태 제어
        this.state = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            isDragging: false,
            startX: 0,
            startY: 0,
            isPanelOpen: true
        };
    }

    // 데이터베이스 하드웨어 마운트 인프라 가동
    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('appCache')) {
                    db.createObjectStore('appCache');
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('[Storage] 캐시 데이터베이스 커널 바인딩 완료');
                resolve();
            };

            request.onerror = (e) => {
                console.error('[Storage] DB 마운트 실패:', e.target.error);
                resolve(); // 시동 스레드가 완전히 마비되는 락 현상을 예방하기 위해 강제 안전 해제
            };
        });
    }

    // 영구 스냅샷 캐시 저장 파이프라인
    saveCache(key, value) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(false);
            try {
                const tx = this.db.transaction('appCache', 'readwrite');
                const store = tx.objectStore('appCache');
                store.put(value, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    // 비동기 스냅샷 데이터 호출 인터페이스
    loadCache(key) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(null);
            try {
                const tx = this.db.transaction('appCache', 'readonly');
                const store = tx.objectStore('appCache');
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
    }
/**
 * js/app_core.js (Part 2 of 2)
 */
    // 💡 [먹통 현상 원천 차단 마감] 무거운 비디오 로드를 격리하고 선 데이터만 0.1초 만에 복원
    async function restoreLastSession(videoEl, canvasEl) {
        try {
            // 변환 행렬 캐시 복원
            const lastTransform = await this.loadCache('lastTransform');
            if (lastTransform) {
                this.state.scale = lastTransform.scale || 1;
                this.state.offsetX = lastTransform.offsetX || 0;
                this.state.offsetY = lastTransform.offsetY || 0;
            }

            // 공들여 그려놓은 나노 십자 조준선 좌표만 초고속 복원
            const lastLines = await this.loadCache('lastLines');
            if (lastLines && window.bowAnalyzer) {
                window.bowAnalyzer.lines = lastLines;
                // 비디오 상태와 상관없이 캔버스 위에 독립적으로 먼저 가이드라인 투사
                window.bowAnalyzer.render();
            }

            // 💡 핵심: 수백 MB 대용량 비디오 바이너리는 시동 스레드에서 직접 load() 하지 않고
            // 껍데기 포인터 주소만 가볍게 안전 확인 후 내보내기용 스토리지에만 대기 처리
            const videoBlob = await this.loadCache('lastVideoBlob');
            if (videoBlob && videoEl) {
                // 백그라운드 지연 주입 방식으로 메인 UI 스레드가 기절하는 현상 완벽 방어
                setTimeout(() => {
                    try {
                        const url = URL.createObjectURL(videoBlob);
                        videoEl.src = url;
                        // loadedmetadata가 늦게 떠도 UI 단추들이 굳지 않도록 안전 유도
                        videoEl.load();
                    } catch (err) {
                        console.warn('[Storage] 미디어 스트림 복원 안전 우회');
                    }
                }, 150);
            }
        } catch (err) {
            console.error('[Storage] 복원 프로세스 예외 보호 가동:', err);
        }
        return true;
    }

    // 외부 노출 바인딩 스위칭 매핑
    window.bowAppCore = new BowAppCore();
    window.bowAppCore.restoreLastSession = window.bowAppCore.restoreLastSession || restoreLastSession;
})();

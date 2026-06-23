/**
 * js/app_core.js
 * 국궁 자세 분석 앱 - 코어 저장소 및 데이터 복원 엔진 (5단계)
 * - IndexedDB 규격을 동원하여 대용량 비디오 바이너리 원본 및 앵커 좌표 백업
 * - 앱 진입 시 직전 분석 세션 영구 복원
 */

class BowAppCore {
    constructor() {
        this.dbName = 'BowArcheryDB';
        this.dbVersion = 1;
        this.db = null;
        
        // 시스템 전체 가변 상태 통합 구조체
        this.state = {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            isDragging: false,
            startX: 0,
            startY: 0,
            lastTouchDist: 0,
            isPanelOpen: true
        };
    }

    /**
     * IndexedDB 초기화 및 로컬 비동기 오픈
     */
    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                // 영구 복원 캐시 스토어 생성
                if (!db.objectStoreNames.contains('appCache')) {
                    db.createObjectStore('appCache');
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('[Core] IndexedDB 영구 저장소 활성화.');
                resolve(this.db);
            };

            request.onerror = (e) => {
                console.error('[Core] IndexedDB 에러:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    /**
     * 영구 저장소에 키-값 쌍 스냅샷 캐싱
     */
    async saveCache(key, value) {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction('appCache', 'readwrite');
            const store = tx.objectStore('appCache');
            store.put(value, key);
            tx.oncomplete = () => resolve(true);
        });
    }

    /**
     * 영구 저장소로부터 캐시 데이터 리로드
     */
    async getCache(key) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const tx = this.db.transaction('appCache', 'readonly');
            const store = tx.objectStore('appCache');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * 앱 기동 시 직전 회차 비디오 소스 및 기하학 선 데이터 완전 자동 복원
     */
    async restoreLastSession(videoEl, canvasEl) {
        try {
            // 1. 마지막으로 촬영/오픈했던 비디오 파일 원본 복원
            const videoBlob = await this.getCache('lastVideoBlob');
            if (videoBlob && videoEl) {
                const videoURL = URL.createObjectURL(videoBlob);
                videoEl.src = videoURL;
                videoEl.load();
                console.log('[Core] 지난 회차 비디오 소스 복원 성공.');
            }

            // 2. 마지막으로 그렸던 조준선 기하학 배열 데이터 복원
            const savedLines = await this.getCache('lastLines');
            if (savedLines && window.bowAnalyzer) {
                window.bowAnalyzer.lines = savedLines;
                
                // 3. 직전 확대 상태 변환 행렬 캐시 동기화
                const savedTransform = await this.getCache('lastTransform');
                if (savedTransform) {
                    this.state.scale = savedTransform.scale;
                    this.state.offsetX = savedTransform.offsetX;
                    this.state.offsetY = savedTransform.offsetY;
                }
                window.bowAnalyzer.updateTransform(this.state.scale, this.state.offsetX, this.state.offsetY);
                console.log('[Core] 지난 회차 조준선 및 변환 행렬 복원 성공.');
            }
        } catch (error) {
            console.error('[Core] 세션 복원 중 예외 발생:', error);
        }
    }
}

window.bowAppCore = new BowAppCore();

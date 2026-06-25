/**
 * js/app_core.js (Part 1 of 2)
 * 국궁 자세 분석 시스템 - 대용량 캐시 스토리지 코어 (시크릿 탭 완벽 방어 쉴드 판)
 */

class BowAppCore {
    constructor() {
        this.dbName = 'KukgungStorage';
        this.dbVersion = 3;
        this.db = null;
        
        // 💡 시크릿 탭 전용 가상 인메모리 백업 휘발성 창고 개설 (먹통 차단 핵심부)
        this.virtualMemory = new Map();

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

    // 💡 [시크릿 모드 우회 패치] DB 거부 차단 시 즉각 가상 스토리지 모드로 자동 전환 유도
    initDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('appCache')) {
                        db.createObjectStore('appCache');
                    }
                };

                request.onsuccess = (e) => {
                    this.db = e.target.result;
                    console.log('[Storage] 정식 데이터베이스 커널 바인딩 완료');
                    resolve();
                };

                request.onerror = (e) => {
                    // 시크릿 탭에서 거부 에러 유발 시, 시동 락에 걸리지 않도록 가상 창고로 강제 우회 해제
                    console.warn('[Storage] 시크릿 탭 감지: 가상 인메모리 엔진으로 우회 기동');
                    this.db = null;
                    resolve(); 
                };
            } catch (err) {
                this.db = null;
                resolve();
            }
        });
    }

    // 캐시 저장 라우터 (정식 DB 부재 시 가상 메모리에 휘발성 임시 저장 대체)
    saveCache(key, value) {
        return new Promise((resolve) => {
            if (!this.db) {
                this.virtualMemory.set(key, value);
                return resolve(true);
            }
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
/**
 * js/app_core.js (Part 2 of 2)
 */
    // 캐시 호출 라우터 (정식 DB 부재 시 가상 메모리에서 임시 데이터 즉각 반환)
    loadCache(key) {
        return new Promise((resolve) => {
            if (!this.db) {
                return resolve(this.virtualMemory.get(key) || null);
            }
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

    // 시크릿 탭 및 일반 모드 호환 세션 라이프사이클 복원 엔진
    async restoreLastSession(videoEl, canvasEl) {
        try {
            const lastTransform = await this.loadCache('lastTransform');
            if (lastTransform) {
                this.state.scale = lastTransform.scale || 1;
                this.state.offsetX = lastTransform.offsetX || 0;
                this.state.offsetY = lastTransform.offsetY || 0;
            }

            const lastLines = await this.loadCache('lastLines');
            if (lastLines && window.bowAnalyzer) {
                window.bowAnalyzer.lines = lastLines;
                window.bowAnalyzer.render();
            }

            const videoBlob = await this.loadCache('lastVideoBlob');
            if (videoBlob && videoEl) {
                setTimeout(() => {
                    try {
                        const url = URL.createObjectURL(videoBlob);
                        videoEl.src = url;
                        videoEl.load();
                    } catch (err) {
                        console.warn('[Storage] 미디어 스트림 안전 우회');
                    }
                }, 150);
            }
        } catch (err) {
            console.error('[Storage] 복원 엔진 예외 보호 가동:', err);
        }
        return true;
    }
}

// 전역 윈도우 인프라 공인 매핑
window.bowAppCore = new BowAppCore();

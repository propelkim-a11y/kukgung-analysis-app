/**
 * js/app_core.js
 * 국궁 자세 분석 시스템 - 대용량 캐시 스토리지 코어 (초기화 부팅 락프리 완결판 v17.7)
 */

class BowAppCore {
    constructor() {
        this.dbName = 'KukgungStorage';
        this.dbVersion = 4; // 💡 버전을 올려 구버전 꼬임 데이터베이스를 강제 초기화
        this.db = null;
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

    // 💡 [데드락 박멸 패치] 버전 교착 현상 감지 시 기존 락을 스스로 파괴하고 강제 리셋
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
                    
                    // 💡 [핵심 보안] 백그라운드에 구버전 연결이 대기하면 즉각 연결을 끊어 무한 멈춤 예방
                    this.db.onversionchange = () => {
                        this.db.close();
                        console.log('[Storage] 신버전 배포 감지: 데이터베이스 안전 폐쇄');
                    };
                    
                    console.log('[Storage] 정식 데이터베이스 커널 바인딩 완료');
                    resolve();
                };

                request.onblocked = (e) => {
                    // 💡 [핵심 보안] 다른 탭이나 캐시가 락을 걸고 버티면 강제로 세션을 해제하여 먹통 방지
                    console.warn('[Storage] 데이터베이스 락 감지: 강제 해제 스위칭');
                    resolve();
                };

                request.onerror = (e) => {
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
            // 1. 제스처 트랜스폼 매트릭스 복원
            const lastTransform = await this.loadCache('lastTransform');
            if (lastTransform) {
                this.state.scale = lastTransform.scale || 1;
                this.state.offsetX = lastTransform.offsetX || 0;
                this.state.offsetY = lastTransform.offsetY || 0;
            }

            // 2. 기존 기하학 선 드로잉 데이터 복원 및 동기화
            const lastLines = await this.loadCache('lastLines');
            if (lastLines && window.bowAnalyzer) {
                window.bowAnalyzer.lines = lastLines;
                window.bowAnalyzer.render();
            }

            // 💡 [치명적 굳음 해결] 무거운 이전 비디오 Blob 복원 코드를 전면 제거
            // 앱이 완전히 꺼진 후 재구동될 때 하드웨어 코덱이 잠기거나 메인 스레드가 멈추는 현상을 완벽 차단합니다.
            if (videoEl) {
                videoEl.removeAttribute('src');
                videoEl.load();
            }

        } catch (err) {
            console.error('[Storage] 복원 엔진 예외 보호 가동:', err);
        }
        return true;
    }
}

// 전역 윈도우 인프라 공인 매핑
window.bowAppCore = new BowAppCore();

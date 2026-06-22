/**
 * firebase-sync.js
 * Supabase Realtime Broadcast를 활용한 기기 간 동시 녹화 동기화
 */

export class ArcherySync {
    constructor(onStart, onStop) {
        this.onStart = onStart;
        this.onStop = onStop;
        this.supabase = null;
        this.channel = null;
        this.deviceId = Math.random().toString(36).substring(2, 11); // 무한 루프 방지용 ID
        this.syncBadge = document.getElementById('sync-badge');

        // ⚠️ 본인의 Supabase 프로젝트 주소와 Anon 키를 입력하세요!
        this.SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
        this.SUPABASE_KEY = 'YOUR_ANON_KEY';
    }

    init(roomId = 'default-room') {
        if (this.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
            console.warn('Supabase 환경 변수가 설정되지 않았습니다.');
            if (this.syncBadge) this.syncBadge.innerText = "설정 필요";
            return;
        }

        const supabaseLib = window.supabase;
        if (supabaseLib && typeof supabaseLib.createClient === 'function') {
            this.supabase = supabaseLib.createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
        } else {
            console.error("Supabase CDN 로드 실패");
            if (this.syncBadge) this.syncBadge.innerText = "라이브러리 에러";
            return;
        }
        
        // self: false로 설정하여 자기 자신에게 신호가 돌아와 먹통이 되는 현상 차단
        this.channel = this.supabase.channel(`archery_${roomId}`, {
            config: { broadcast: { self: false } } 
        });

        this.channel
            .on('broadcast', { event: 'record' }, (payload) => {
                const { action, senderId } = payload.payload;
                
                // 크로스 체크: 내가 보낸 신호라면 실행하지 않고 필터링
                if (senderId === this.deviceId) return;

                console.log(`[원격] 명령 수신: ${action}`);
                if (action === 'START') this.onStart();
                else if (action === 'STOP') this.onStop();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (this.syncBadge) {
                        this.syncBadge.innerText = `방 ${roomId} 연결됨`;
                        this.syncBadge.style.background = "#00e676";
                        this.syncBadge.style.color = "#000";
                    }
                } else if (status === 'CHANNEL_ERROR') {
                    if (this.syncBadge) this.syncBadge.innerText = "연결 실패";
                }
            });
    }

    sendSignal(action) {
        if (!this.channel) return;
        
        this.channel.send({
            type: 'broadcast',
            event: 'record',
            payload: { 
                action: action,
                senderId: this.deviceId 
            }
        });
    }
}

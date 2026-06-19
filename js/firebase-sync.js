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
        this.syncBadge = document.getElementById('sync-badge');

        // Supabase 설정 (사용자가 자신의 키를 입력해야 함)
        this.SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
        this.SUPABASE_KEY = 'YOUR_ANON_KEY';
    }

    init(roomId = 'default-room') {
        if (this.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
            console.warn('Supabase 설정이 필요합니다.');
            if (this.syncBadge) this.syncBadge.innerText = "설정 필요";
            return;
        }

        // @ts-ignore
        this.supabase = supabase.createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
        
        this.channel = this.supabase.channel(`archery_${roomId}`, {
            config: { broadcast: { self: true } }
        });

        this.channel
            .on('broadcast', { event: 'record' }, (payload) => {
                const { action } = payload.payload;
                if (action === 'START') this.onStart();
                else if (action === 'STOP') this.onStop();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (this.syncBadge) {
                        this.syncBadge.innerText = `방 ${roomId} 연결됨`;
                        this.syncBadge.style.background = "#00e676";
                    }
                }
            });
    }

    sendSignal(action) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'record',
            payload: { action }
        });
    }
}

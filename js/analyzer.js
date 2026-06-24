
/* 9. 비디오 슬라이더 타임라인 */
.timeline-container {
    width: 100%;
    padding: 0 4px;
}

#video-slider {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    outline: none;
}

#video-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #FFFFFF;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: pointer;
}

/* 10. 비디오 제어바 */
.video-control-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 48px;
}

.control-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    padding: 8px 16px;
}

.control-btn:active {
    color: #34C759;
}

/* 11. 촬영 컨트롤 */
.status-text {
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    text-align: center;
    font-weight: 500;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.control-row-center {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
}

.action-btn-main {
    background: rgba(0, 0, 0, 0.4); 
    border: 3px solid #FFFFFF;
    color: #FFFFFF;
    font-size: 15px;
    font-weight: 700;
    padding: 10px 28px;
    border-radius: 22px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    transition: all 0.2s ease;
}

.action-btn-main.recording {
    background: #FF3B30;
    border-color: #FF3B30;
    color: #FFFFFF;
    box-shadow: 0 0 20px rgba(255, 59, 48, 0.5);
    animation: pulseGlow 1.5s infinite alternate;
}

.switch-btn {
    width: 100%;
    height: 40px;
    background: rgba(255, 255, 255, 0.07);
    border: 0.5px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #FFFFFF;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

@keyframes pulseGlow {
    from { transform: scale(1); }
    to { transform: scale(1.04); }
}

.text-menu-bar-sync, #btn-record-move-sync {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
}

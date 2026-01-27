import {type} from '@tauri-apps/plugin-os';

export function isMobile() {
    const p = type();
    if (p === 'android' || p === 'ios') {
        if (window.screen.width < 600) {
            return true;
        }
    }
    return false;
}

// 系统常量
export const CONSTANT = {
    keyringService: "kissh_sync_password@kischang.top",
    keyringUser: "user_sync_key"
}

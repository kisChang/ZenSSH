import {type} from '@tauri-apps/plugin-os';
import { ElNotification } from 'element-plus'

export function notify(options) {
    ElNotification({
        title: options.title,
        message: options.message,
        type: options.type,
        zIndex: options.zIndex | 0,
        offset: 30,
        duration: options.duration | 4500,
    })
}

export function genId() {
    return crypto.randomUUID().replace(/-/g, '');
}
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

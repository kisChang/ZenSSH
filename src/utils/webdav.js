import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * 创建 Basic Auth 请求头值（支持 UTF-8）
 */
function basicAuth(username, password) {
    return 'Basic ' + btoa(encodeURIComponent(username) + ':' + encodeURIComponent(password));
}

/**
 * 读取 Response 的 body
 */
async function readBody(res) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * WebDAV PUT 请求
 */
export async function webdavPut(url, username, password, data) {
    const res = await tauriFetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': basicAuth(username, password),
            'Content-Type': 'application/json',
        },
        body: typeof data === 'string' ? data : JSON.stringify(data),
    });
    const body = await readBody(res);
    return { status: res.status, statusText: res.statusText, data: body };
}

/**
 * WebDAV GET 请求
 */
export async function webdavGet(url, username, password) {
    const res = await tauriFetch(url, {
        method: 'GET',
        headers: {
            'Authorization': basicAuth(username, password),
        },
    });
    const body = await readBody(res);
    return { status: res.status, statusText: res.statusText, data: body };
}

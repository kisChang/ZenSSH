import {defineStore} from 'pinia'
import {invoke} from "@tauri-apps/api/core";
import {
    initializeKeyring,
    getPassword,
    setPassword,
    deletePassword
} from "@/utils/plugin-keyring.js";
import {CONSTANT, genId} from "@/commons.js";
import client from "@/request.js"
import {webdavGet, webdavPut} from "@/utils/webdav.js";

// config 前缀 k_
// session 前缀 s_
/////// genId

function mergeList(list1 = [], list2 = [], keyName) {
    const map = new Map();
    [...list1, ...list2].forEach(item => {
        map.set(item[keyName], item);
    });
    return Array.from(map.values());
}

// 合并删除标记，同 configId 保留最新时间
function mergeDeletedIds(ids1 = [], ids2 = []) {
    const map = new Map();
    [...ids1, ...ids2].forEach(item => {
        if (!map.has(item.configId) || map.get(item.configId).deletedAt < item.deletedAt) {
            map.set(item.configId, item);
        }
    });
    return Array.from(map.values());
}

export const appRunState = defineStore('AppRunningState', {
    persist: false,
    state: () => ({
        keyring: false,
    }),
    actions: {
        async checkKeyring() {
            return new Promise((resolve, reject) => {
                if (!this.keyring) {
                    initializeKeyring(CONSTANT.keyringService).catch(err => {
                        //忽略异常
                    }).finally(() => {
                        this.keyring = true
                        resolve()
                    })
                } else {
                    resolve()
                }
            })
        },
        async keyringGet() {
            await this.checkKeyring()
            return new Promise((resolve, reject) => {
                getPassword(CONSTANT.keyringUser).then(rv => {
                    resolve(rv)
                }).catch(err => {
                    resolve(null)
                })
            })
        },
        async keyringSet(password) {
            await this.checkKeyring()
            return await setPassword(CONSTANT.keyringUser, password)
        },
        async keyringDelete() {
            await this.checkKeyring()
            return await deletePassword(CONSTANT.keyringUser)
        },
    }
});

export const appConfigStore = defineStore('AppConf', {
    persist: true,
    state: () => ({
        // 国际化
        locale: "zhCn",

        // 同步云
        syncType: 0,
        gistsAccessToken: null,
        gistsFileId: null,
        gistsLastSync: null,

        // WebDAV 同步
        webdavUrl: null,
        webdavUsername: null,
        webdavPassword: null,
        webdavLastSync: null,

        // 虚拟键盘配置
        virtualKeyboardVibrate: 0,

        // 删除标记，用于多端同步删除
        deletedIds: [],
    }),
    actions: {
        saveSetting(setting) {
            this.syncType = setting.syncType
            this.gistsAccessToken = setting.gistsAccessToken
            this.gistsFileId = setting.gistsFileId
            this.gistsLastSync = setting.gistsLastSync
            this.webdavUrl = setting.webdavUrl
            this.webdavUsername = setting.webdavUsername
            this.webdavPassword = setting.webdavPassword
            this.webdavLastSync = setting.webdavLastSync
            this.virtualKeyboardVibrate = setting.virtualKeyboardVibrate
            this.locale = setting.locale
            this.deletedIds = setting.deletedIds || []
        },
        /**
         * 记录删除标记，用于多端同步删除
         */
        recordDeletion(configId) {
            // 如果已存在删除记录，更新时间戳
            const existing = this.deletedIds.find(d => d.configId === configId);
            if (existing) {
                existing.deletedAt = Date.now();
            } else {
                this.deletedIds.push({ configId, deletedAt: Date.now() });
            }
        },
        /**
         * 清理超过 N 天的删除标记，防止数据无限膨胀
         */
        cleanupDeletedIds(days = 90) {
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            this.deletedIds = this.deletedIds.filter(d => d.deletedAt >= cutoff);
        },
        async syncToCloud() {
            //0. 处理需要同步的数据
            let confData = JSON.parse(JSON.stringify(useMngStore().$state));
            // 加入删除标记，供其他客户端同步删除
            confData.deletedIds = this.deletedIds;
            // 清理不需要的数据
            for (let config of confData.configList) {
                delete config.isCloud
            }
            let content = JSON.stringify(confData)
            const that = this;
            //1. 生成密钥
            let userPass = await appRunState().keyringGet();
            let salt = await invoke("encrypt_gen_salt");
            let keyB64 = await invoke("encrypt_derive_key", {password: userPass, salt: salt});
            //2. 对数据进行加密
            const res = await invoke("encrypt_encrypt_data", { plaintext: content, keyB64: keyB64 });
            let contentEncrypted = res[0];
            let nonce = res[1];

            //3. 生成存储数据
            let payload = JSON.stringify({
                content: contentEncrypted,
                nonce: nonce,
                salt: salt,
            })

            const time = new Date().toLocaleString()

            //4. 根据同步类型请求
            if (this.syncType === 3) {
                // WebDAV 同步
                const webdavFullUrl = this.webdavUrl.replace(/\/+$/, '') + '/ZenSSH_SyncCloud.json'
                try {
                    const uploadRes = await webdavPut(webdavFullUrl, this.webdavUsername, this.webdavPassword, payload)
                    if (uploadRes.status === 200 || uploadRes.status === 201 || uploadRes.status === 204) {
                        that.webdavLastSync = time
                    } else {
                        throw new Error("同步请求失败，错误码：" + uploadRes.status + " " + uploadRes.statusText);
                    }
                } catch (e) {
                    console.log(e)
                    if (e.response) {
                        throw new Error(`WebDAV同步失败: ${e.response.status} ${e.response.statusText}`);
                    }
                    throw new Error(`WebDAV同步失败: ${e.message}`);
                }
            } else {
                // Gist 同步 (1=Gitee, 2=Github)
                let files = {
                    'SyncCloud.json': {
                        content: payload,
                    }
                }
                const url = ["", "https://gitee.com/api/v5/gists", "https://api.github.com/gists"][this.syncType]
                const headers = {
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + this.gistsAccessToken,
                        "X-GitHub-Api-Version": "2022-11-28",
                    }
                }

                if (that.gistsFileId) {
                    // 注：必须同步更新description
                    const res = await client.patch(url + "/" + that.gistsFileId, {
                        access_token: that.gistsAccessToken,
                        files: files,
                        description: 'ZenSSH Sync @' + time,
                        id: that.gistsFileId
                    }, headers)
                    if (res.status === 200) {
                        that.gistsFileId = res.data.id
                        that.gistsLastSync = time
                    } else {
                        throw new Error("同步请求失败，错误码：" + res.status + " " + res.statusText);
                    }
                } else {
                    const res = await client.post(url, {
                        access_token: that.gistsAccessToken,
                        files: files,
                        description: 'ZenSSH Sync @' + time,
                        public: false,
                    }, headers)
                    if (res.status === 201) {
                        that.gistsFileId = res.data.id
                        that.gistsLastSync = time
                    } else {
                        throw new Error("同步请求失败，错误码：" + res.status + " " + res.statusText);
                    }
                }
            }
        },
        async loadByCloud() {
            if (this.syncType === 0) {
                return false
            }
            let userPass = await appRunState().keyringGet();
            let cloudJson
            let res

            if (this.syncType === 3) {
                // WebDAV 同步
                const webdavFullUrl = this.webdavUrl.replace(/\/+$/, '') + '/ZenSSH_SyncCloud.json'
                try {
                    res = await webdavGet(webdavFullUrl, this.webdavUsername, this.webdavPassword)
                } catch (e) {
                    if (e.response && e.response.status === 404) {
                        throw new Error("云端没有同步文件，请先在本地执行一次同步再使用。");
                    }
                    if (e.response) {
                        throw new Error(`WebDAV加载失败: ${e.response.status} ${e.response.statusText}`);
                    }
                    throw new Error(`WebDAV加载失败: ${e.message}`);
                }
                cloudJson = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            } else {
                // Gist 同步 (1=Gitee, 2=Github)
                let syncUrl = this.syncType === 1 ? 'https://gitee.com/api/v5/gists/' : 'https://api.github.com/gists/'
                syncUrl = syncUrl + this.gistsFileId +
                    // 兼容gitee的参数
                    "?access_token=" + this.gistsAccessToken
                    + "&id=" + this.gistsFileId
                    + "&time=" + new Date().getTime();
                const headers = { // 兼容github 的请求头
                    "Accept": "application/vnd.github+json",
                    "Authorization": "Bearer " + this.gistsAccessToken,
                    "X-GitHub-Api-Version": "2022-11-28",
                }

                res = await client.get(syncUrl, {headers: headers})
                cloudJson = JSON.parse(res.data.files['SyncCloud.json'].content)
            }

            // 通过加密salt 获取真实密钥
            let keyB64 = await invoke("encrypt_derive_key", {password: userPass, salt: cloudJson.salt});
            const decrypt = await invoke("encrypt_decrypt_data", {
                cipherB64: cloudJson.content,
                nonceB64: cloudJson.nonce,
                keyB64: keyB64,
            });

            // 合并配置
            const cloudContent = JSON.parse(decrypt);
            const localContent = useMngStore().$state
            let mergedList = mergeList(cloudContent.configList, localContent.configList, 'configId')

            // 合并删除标记（云端 + 本地）
            const cloudDeletedIds = cloudContent.deletedIds || [];
            const mergedDeletedIds = mergeDeletedIds(cloudDeletedIds, this.deletedIds);
            // 用删除标记过滤已删除的条目
            const deletedIdSet = new Set(mergedDeletedIds.map(d => d.configId));
            mergedList = mergedList.filter(item => !deletedIdSet.has(item.configId));

            // 标记本地/云端
            const localIds = new Set(cloudContent.configList.map(item => item.configId));
            mergedList = mergedList.map(item => ({
                ...item,
                isCloud: localIds.has(item.configId)
            }));
            useMngStore().$state = {
                ...cloudContent,
                ...localContent,
                configList: mergedList
            };

            // 更新本地删除标记并清理过期记录
            this.deletedIds = mergedDeletedIds;
            this.cleanupDeletedIds();

            if (this.syncType === 3) {
                this.webdavLastSync = new Date().toLocaleString()
            } else {
                this.gistsLastSync = new Date(res.data.updated_at).toLocaleString()
            }
            return true
        },
    }
});

// 填充默认值
export function normalizeConfig(config) {
    if (!config.type) config.type = 'ssh';
    if (config.type === 'ssh') {
        if (config.port === undefined) config.port = 22;
        if (!config.timeout) config.timeout = 30;
        if (!config.keepaliveInterval) config.keepaliveInterval = 30;
        if (!config.authType) config.authType = 'password';
    } else if (config.type === 'serial') {
        if (!config.baudRate) config.baudRate = 115200;
        if (!config.dataBits) config.dataBits = 8;
        if (!config.parity) config.parity = 'None';
        if (!config.stopBits) config.stopBits = 1;
        if (!config.flowControl) config.flowControl = 'None';
    }
}

export const useMngStore = defineStore('UserConf', {
    persist: true,
    state: () => ({
        configList: [],
    }),
    getters: {
        getById(state, id) {
            return state.configList.find(item => item.configId === id);
        }
    },
    actions: {
        addConfig(config, connectNow) {
            config.configId = 'k_' + genId();
            // 确保新字段有默认值
            normalizeConfig(config);
            this.configList.push(config);
            // 同步配置到后端
            this.syncConfig(this.configList).then()

            if (connectNow) {
                useTabsStore().connectConfig(config, 'connect')
            }
        },
        removeConfig(id) {
            // 记录删除标记（tombstone），供多端同步时传播删除操作
            appConfigStore().recordDeletion(id)
            this.configList = this.configList.filter(item => item.configId !== id)
            this.syncConfig(this.configList).then()
            // 同步到云端，将删除标记传播给其他客户端
            appConfigStore().syncToCloud().catch(() => {})
        },
        updateConfig(config) {
            normalizeConfig(config);
            let find = this.configList.find(item => item.configId === config.configId)
            if (config.passwordNew !== "***************") {
                config.password = config.passwordNew;
            }
            delete config.passwordNew;
            Object.assign(find, config)
            this.syncConfig(this.configList).then()
        },

        /**
         * 同步配置到后端的 CONFIG_MAP
         */
        async syncConfig() {
            let backendConfig = {};
            this.configList.forEach(item => {
                backendConfig[item.configId] = item;
            })
            await invoke('sync_config', { configMap: backendConfig });
        },
    },
})

export const useHostKeyStore = defineStore('HostKey', {
    persist: true,
    state: () => ({
        // 已确认的主机密钥指纹，key 为 fingerprint，value 为 { keyType, timestamp }
        confirmedKeys: {},
    }),
    actions: {
        isConfirmed(fingerprint) {
            return !!this.confirmedKeys[fingerprint];
        },
        markConfirmed(fingerprint, keyType) {
            this.confirmedKeys[fingerprint] = {
                keyType,
                timestamp: Date.now(),
            };
        },
        removeConfirmed(fingerprint) {
            delete this.confirmedKeys[fingerprint];
        },
    },
})

export const useTabsStore = defineStore('counter', {
    state: () => ({
        connList: [],
        // 端口转发列表
        portForwards: [],
    }),
    getters: {
        // 获取指定会话的转发列表
        getForwardsBySession: (state) => (sessionId) => {
            return state.portForwards.filter(f => f.sessionId === sessionId);
        }
    },
    actions: {
        connectConfig(config, type) {
            config = Object.assign({}, config);
            normalizeConfig(config)
            let title = config.name;
            if (!title) {
                if (config.type === 'serial') {
                    title = 'Serial: ' + config.portName;
                } else {
                    title = config.username + "@" + config.host;
                }
            }
            let sessionId = "s_" + genId();
            this.connList.push({
                id: sessionId,
                sessionId: sessionId,
                configId: config.configId,
                title: title,
                type: type,
                state: 0,
                config: config,
            });
        },
        connectSuccess(id) {
            let find = this.connList.find(item => item.id === id)
            if (find) find.state = 1
        },
        connectClose(id) {
            let find = this.connList.find(item => item.id === id)
            if (find) find.state = 2
        },
        connectRemove(id) {
            this.connList = this.connList.filter(item => item.id !== id)
        },
        // 端口转发管理
        addPortForward(forward) {
            this.portForwards.push({
                id: 'pf_' + Math.random().toString(36).substring(2),
                session_id: forward.session_id,
                channel_id: forward.channel_id,
                local_host: forward.local_host,
                local_port: forward.local_port,
                remote_host: forward.remote_host,
                remote_port: forward.remote_port,
                state: 'active'
            });
        },
        removePortForward(id) {
            this.portForwards = this.portForwards.filter(item => item.id !== id);
        },
        updatePortForwardState(id, state) {
            let find = this.portForwards.find(item => item.id === id);
            if (find) find.state = state;
        },
    },
})

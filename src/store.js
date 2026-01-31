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

        // 虚拟键盘配置
        virtualKeyboardVibrate: 0,
    }),
    actions: {
        saveSetting(setting) {
            this.syncType = setting.syncType
            this.gistsAccessToken = setting.gistsAccessToken
            this.gistsFileId = setting.gistsFileId
            this.gistsLastSync = setting.gistsLastSync
            this.virtualKeyboardVibrate = setting.virtualKeyboardVibrate
            this.locale = setting.locale
        },
        async syncToCloud(content) {
            const that = this;
            //1. 生成密钥
            let userPass = await appRunState().keyringGet();
            let salt = await invoke("encrypt_gen_salt");
            let keyB64 = await invoke("encrypt_derive_key", {password: userPass, salt: salt});
            //2. 对数据进行加密
            const res = await invoke("encrypt_encrypt_data", { plaintext: content, keyB64: keyB64 });
            let contentEncrypted = res[0];
            let nonce = res[1];

            //2. 生成存储数据
            let files = {
                'SyncCloud.json': {
                    content: JSON.stringify({
                        content: contentEncrypted,
                        nonce: nonce,
                        salt: salt,
                    }),
                }
            }

            //3. 生成请求参数
            const url = ["", "https://gitee.com/api/v5/gists", "https://api.github.com/gists"][this.syncType]
            const headers = {
                headers: {
                    "Accept": "application/vnd.github+json",
                    "Authorization": "Bearer " + this.gistsAccessToken,
                    "X-GitHub-Api-Version": "2022-11-28",
                }
            }

            //4. 请求同步
            const time = new Date().toLocaleString()
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
        },
        async loadByCloud() {
            if (this.syncType === 0) {
                return false
            }
            let userPass = await appRunState().keyringGet();

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

            // 加载并解密数据
            const res = await client.get(syncUrl, {headers: headers})
            const cloudJson = JSON.parse(res.data.files['SyncCloud.json'].content)
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
            useMngStore().$state = {
                ...cloudContent,
                ...localContent,
                configList: mergeList(cloudContent.configList, localContent.configList, 'configId')
            };
            this.gistsLastSync = new Date(res.data.updated_at).toLocaleString()
            return true
        },
    }
});

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
            this.normalizeConfig(config);
            this.configList.push(config);
            // 同步配置到后端
            this.syncConfig(this.configList).then()

            if (connectNow) {
                useTabsStore().connectConfig(config, 'connect')
            }
        },
        normalizeConfig(config) {
            // 填充默认值
            if (config.port === undefined) config.port = 22;
            if (!config.timeout) config.timeout = 30;
            if (!config.keepaliveInterval) config.keepaliveInterval = 30;
            if (!config.authType) config.authType = 'password';
        },
        removeConfig(id) {
            this.configList = this.configList.filter(item => item.configId !== id)
            this.syncConfig(this.configList).then()
        },
        updateConfig(config) {
            this.normalizeConfig(config);
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
            let title = config.name || config.username + "@" + config.host;
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

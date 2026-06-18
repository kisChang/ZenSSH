import {defineStore} from 'pinia'
import {invoke} from "@tauri-apps/api/core";
import {deletePassword, getPassword, initializeKeyring, setPassword} from "@/utils/plugin-keyring.js";
import {CONSTANT, genId, isMobile} from "@/commons.js";
import client from "@/request.js"
import {webdavGet, webdavPut} from "@/utils/webdav.js";

// config 前缀 k_
// session 前缀 s_
/////// genId

// 智能合并列表，比较 lastUpdate 时间，保留较新的版本
// list1: 本地列表, list2: 云端列表, keyName: 唯一键名
function mergeList(list1 = [], list2 = [], keyName) {
    const map = new Map();

    // 1. 先将 list1 全部放入
    for (const item of list1) {
        map.set(item[keyName], item);
    }

    // 2. 处理 list2 中的项：对于冲突项，比较 lastUpdate 保留较新的
    const list1Keys = new Set(list1.map(item => item[keyName]));

    for (const cloudItem of list2) {
        const localItem = list1.find(item => item[keyName] === cloudItem[keyName]);

        if (!list1Keys.has(cloudItem[keyName])) {
            // list2 中独有的项，直接放入
            map.set(cloudItem[keyName], cloudItem);
        } else if (localItem && cloudItem.lastUpdate && localItem.lastUpdate) {
            // 双方都有 lastUpdate，比较时间，保留较新的
            if (localItem.lastUpdate >= cloudItem.lastUpdate) {
                // 本地较新或相同，保持本地
            } else {
                // 云端较新，覆盖本地
                map.set(cloudItem[keyName], cloudItem);
            }
        } else if (cloudItem.lastUpdate && !localItem.lastUpdate) {
            // 云端有时间戳，本地没有，优先用云端
            map.set(cloudItem[keyName], cloudItem);
        } else if (!cloudItem.lastUpdate && localItem.lastUpdate) {
            // 本地有时间戳，云端没有，优先用本地（什么都不做）
        } else if (!cloudItem.lastUpdate && !localItem.lastUpdate) {
            // 都没有 lastUpdate，保持现有逻辑（用云端，即什么都不做）
        }
    }

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
        // 主题: 'dark' 深色, 'light' 亮色
        theme: 'dark',

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
        credentialDeletedIds: [],
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
            this.theme = setting.theme
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
        /**
         * 记录凭据删除标记
         */
        recordCredentialDeletion(credentialId) {
            const existing = this.credentialDeletedIds.find(d => d.configId === credentialId);
            if (existing) {
                existing.deletedAt = Date.now();
            } else {
                this.credentialDeletedIds.push({ configId: credentialId, deletedAt: Date.now() });
            }
        },
        /**
         * 清理凭据删除标记
         */
        cleanupCredentialDeletedIds(days = 90) {
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            this.credentialDeletedIds = this.credentialDeletedIds.filter(d => d.deletedAt >= cutoff);
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
            // 添加凭据删除标记（用于凭据的多端同步删除）- 从 appConfigStore 获取
            confData.credentialDeletedIds = this.credentialDeletedIds || [];
            // 确保版本号存在（用于多端配置升级协调）
            confData._version = confData._version || 0;
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

            // 处理配置版本号冲突 - 取最大值确保配置升级到最新版本
            const cloudVersion = cloudContent._version || 0;
            const localVersion = localContent._version || 0;
            const mergedVersion = Math.max(cloudVersion, localVersion);
            console.log(`[Sync] Version conflict resolved: cloud=${cloudVersion}, local=${localVersion}, merged=${mergedVersion}`);

            // 合并主机配置列表 - 云端优先，本地存在时用云端覆盖
            let mergedList = mergeList(localContent.configList || [], cloudContent.configList || [], 'configId')

            // 合并凭据列表 - 云端优先，本地存在时用云端覆盖
            let mergedCredentialList = mergeList(
                localContent.credentialList || [],
                cloudContent.credentialList || [],
                'credentialId'
            );

            // 合并删除标记（云端 + appConfigStore + 本地 useMngStore）- 主机配置
            const cloudDeletedIds = cloudContent.deletedIds || [];
            // 先合并云端和 appConfigStore，再合并本地 useMngStore
            const mergedDeletedIds = mergeDeletedIds(
                mergeDeletedIds(cloudDeletedIds, this.deletedIds),
                localContent.deletedIds || []
            );
            // 用删除标记过滤已删除的主机配置
            const deletedIdSet = new Set(mergedDeletedIds.map(d => d.configId));
            mergedList = mergedList.filter(item => !deletedIdSet.has(item.configId));

            // 合并凭据删除标记（云端 + 本地 useMngStore + appConfigStore）
            const mergedCredDeletedIds = mergeDeletedIds(
                mergeDeletedIds(
                    cloudContent.credentialDeletedIds || [],
                    localContent.credentialDeletedIds || []
                ),
                appConfigStore().credentialDeletedIds || []
            );
            // 用删除标记过滤已删除的凭据
            const deletedCredIdSet = new Set(mergedCredDeletedIds.map(d => d.configId));
            mergedCredentialList = mergedCredentialList.filter(item => !deletedCredIdSet.has(item.credentialId));

            // 标记本地/云端
            const localIds = new Set((cloudContent.configList || []).map(item => item.configId));
            mergedList = mergedList.map(item => ({
                ...item,
                isCloud: localIds.has(item.configId)
            }));

            // 更新 store 状态
            useMngStore().$patch({
                _version: mergedVersion,
                configList: mergedList,
                credentialList: mergedCredentialList,
                credentialDeletedIds: mergedCredDeletedIds,
                deletedIds: mergedDeletedIds,
            });

            // 更新本地删除标记并清理过期记录
            this.deletedIds = mergedDeletedIds;
            this.cleanupDeletedIds();
            // 清理过期凭据删除标记
            this.cleanupCredentialDeletedIds();

            // 同步完成后，检查并执行配置升级
            // 如果云端版本更高，或合并后需要升级，在此触发
            useMngStore().migrateOldConfigs();

            if (this.syncType === 3) {
                this.webdavLastSync = new Date().toLocaleString()
            } else {
                this.gistsLastSync = new Date(res.data.updated_at).toLocaleString()
            }
            return true
        },
    }
});

// 配置版本号，用于配置升级管理
export const CONFIG_VERSION = 2;

// 凭据默认值
export const DEFAULT_CREDENTIAL = {
    credentialId: '',
    name: '',
    username: '',
    authType: 'password',
    password: '',
    privateKeyPath: '',
    privateKeyData: '',
    keyPassword: '',
};

// 填充默认值
export function normalizeConfig(config) {
    // 确保 lastUpdate 字段存在（用于多端同步时比较版本）
    if (!config.lastUpdate) {
        config.lastUpdate = Date.now();
    }
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

// 从配置中提取凭据信息（用于升级旧配置）
export function extractCredentialFromConfig(config) {
    return {
        ...DEFAULT_CREDENTIAL,
        credentialId: 'c_' + genId(),
        name: config.username + '@' + config.host,
        username: config.username || '',
        authType: config.authType || 'password',
        password: config.password || '',
        privateKeyPath: config.privateKeyPath || '',
        privateKeyData: config.privateKeyData || '',
        keyPassword: config.keyPassword || '',
    };
}

export const useMngStore = defineStore('UserConf', {
    persist: true,
    state: () => ({
        // 配置版本号，用于管理配置升级
        _version: 0,
        configList: [],
        credentialList: [],
        deletedIds: [],
        credentialDeletedIds: [],
    }),
    getters: {
        // 获取凭据选项列表（用于选择框）
        credentialOptions(state) {
            return state.credentialList.map(item => ({
                value: item.credentialId,
                label: item.name,
                credential: item
            }));
        },
        // 获取排序后的配置列表
        sortedConfigList(state) {
            return [...state.configList].sort((a, b) => {
                const orderA = a.sortOrder ?? 0;
                const orderB = b.sortOrder ?? 0;
                return orderA - orderB;
            });
        }
    },
    actions: {
        getById(id) {
            return this.configList.find(item => item.configId === id);
        },
        getCredentialById(id) {
            return this.credentialList.find(item => item.credentialId === id);
        },

        // 根据当前版本号逐步执行升级操作
        migrateOldConfigs() {
            const currentVersion = this._version || 0;
            // 版本 0 -> 1 升级：将内嵌的凭据提取为独立凭据，并添加排序字段
            if (currentVersion < 1) {
                this.migrateV0ToV1();
            }
            // 版本 1 -> 2 升级：清理和修复配置（移除冗余凭据字段、处理凭据重复、修复映射）
            if (currentVersion < 2) {
                this.migrateV1ToV2();
            }
            // 更新到最新版本
            if (this._version !== CONFIG_VERSION) {
                this._version = CONFIG_VERSION;
                console.log(`[Migrate] Config upgraded to version ${CONFIG_VERSION}`);
            }
            // 强制刷新到本地存储（pinia-plugin-persistedstate）
            this.$patch(() => {});
            this.$persist();
        },

        // 版本 1 -> 2 升级：清理和修复配置（移除冗余凭据字段、处理凭据重复、修复映射关系）
        migrateV1ToV2() {
            console.log('[Migrate V1->V2] Starting config cleanup and fix...');
            let fixedCount = 0;

            // 1. 处理凭据重复：合并 username@host 相同的凭据
            const credentialMap = new Map();
            const duplicateCredentials = [];

            this.credentialList.forEach(cred => {
                // 凭据的 name 字段已经是 username@host 格式，直接使用
                const key = (cred.name || '').toLowerCase();
                if (!key) {
                    // 没有有效标识的凭据，保留
                    credentialMap.set(cred.credentialId, cred);
                    return;
                }
                if (credentialMap.has(key)) {
                    // 发现重复凭据
                    duplicateCredentials.push({ old: cred, existing: credentialMap.get(key) });
                } else {
                    credentialMap.set(key, cred);
                }
            });

            // 合并重复凭据：将配置从旧凭据迁移到已有凭据
            duplicateCredentials.forEach(({ old: oldCred, existing: existingCred }) => {
                console.log(`[Migrate V1->V2] Merging duplicate credential: "${oldCred.name}" -> "${existingCred.name}"`);
                // 将使用旧凭据的配置迁移到新凭据
                this.configList.forEach(config => {
                    if (config.credentialId === oldCred.credentialId) {
                        config.credentialId = existingCred.credentialId;
                        fixedCount++;
                    }
                });
            });

            // 移除重复凭据，保留合并后的列表
            const uniqueCredentials = Array.from(credentialMap.values());
            const removedCount = this.credentialList.length - uniqueCredentials.length;
            if (removedCount > 0) {
                console.log(`[Migrate V1->V2] Removed ${removedCount} duplicate credentials`);
                this.credentialList = uniqueCredentials;
            }

            // 2. 修复配置与凭据的映射关系
            this.configList.forEach(config => {
                // 检查是否有内嵌凭据信息但没有 credentialId
                const hasEmbeddedAuth = config.password || config.privateKeyPath || config.privateKeyData;
                const hasCredentialId = config.credentialId && this.credentialList.some(c => c.credentialId === config.credentialId);

                if (hasEmbeddedAuth && !hasCredentialId) {
                    // 配置有凭据信息但没有有效的 credentialId，尝试查找匹配的凭据或创建新的
                    const matchCred = this.credentialList.find(c =>
                        c.name === (config.username + '@' + config.host)
                    );

                    if (matchCred) {
                        // 找到匹配的凭据，建立映射
                        config.credentialId = matchCred.credentialId;
                        console.log(`[Migrate V1->V2] Linked config to existing credential: ${config.username}@${config.host}`);
                        fixedCount++;
                    } else {
                        // 创建新凭据
                        const newCred = {
                            credentialId: 'c_' + genId(),
                            name: config.username + '@' + config.host,
                            username: config.username || '',
                            authType: config.authType || 'password',
                            password: config.password || '',
                            privateKeyPath: config.privateKeyPath || '',
                            privateKeyData: config.privateKeyData || '',
                            keyPassword: config.keyPassword || '',
                            lastUpdate: Date.now(),
                        };
                        this.credentialList.push(newCred);
                        config.credentialId = newCred.credentialId;
                        console.log(`[Migrate V1->V2] Created new credential for: ${config.username}@${config.host}`);
                        fixedCount++;
                    }
                }

                // 3. 移除配置中不再需要的凭据字段（已迁移到凭据系统的）
                if (config.credentialId) {
                    delete config.password;
                    delete config.privateKeyPath;
                    delete config.privateKeyData;
                    delete config.keyPassword;
                    // username 和 authType 保留，因为配置本身可能需要显示这些信息
                }
            });

            // 4. 清理无效的凭据引用
            this.configList.forEach(config => {
                if (config.credentialId && !this.credentialList.some(c => c.credentialId === config.credentialId)) {
                    // credentialId 指向不存在的凭据，清除它
                    console.log(`[Migrate V1->V2] Removing invalid credentialId from config: ${config.configId}`);
                    delete config.credentialId;
                    fixedCount++;
                }
            });

            // 5. 清理孤立的凭据（没有被任何配置使用的凭据）
            const usedCredentialIds = new Set(
                this.configList
                    .filter(c => c.credentialId)
                    .map(c => c.credentialId)
            );
            const orphanedCredentials = this.credentialList.filter(
                cred => !usedCredentialIds.has(cred.credentialId)
            );
            if (orphanedCredentials.length > 0) {
                console.log(`[Migrate V1->V2] Removing ${orphanedCredentials.length} orphaned credentials`);
                this.credentialList = this.credentialList.filter(
                    cred => usedCredentialIds.has(cred.credentialId)
                );
            }

            if (fixedCount > 0 || removedCount > 0) {
                console.log(`[Migrate V1->V2] Fixed ${fixedCount} configs, removed ${removedCount} duplicate credentials`);
            } else {
                console.log('[Migrate V1->V2] No issues found');
            }
        },

        // 版本 0 -> 1 升级：将内嵌的凭据提取为独立凭据，添加排序字段
        migrateV0ToV1() {
            console.log('[Migrate] Upgrading config from v0 to v1 (credential system + sortOrder)');

            // 1. 提取凭据
            let migratedCount = 0;
            this.configList.forEach(config => {
                // 只处理 SSH 类型且有认证信息的配置
                normalizeConfig(config);
                if (config.type === 'ssh') {
                    // 检查是否已有匹配的凭据
                    const existingCred = this.credentialList.find(c =>
                        c.name === config.username + '@' + config.host
                    );

                    if (!existingCred) {
                        // 提取凭据
                        const credential = extractCredentialFromConfig(config);
                        this.credentialList.push(credential);
                        // 在配置中保存凭据引用
                        config.credentialId = credential.credentialId;
                        migratedCount++;
                    } else {
                        // 使用已有的凭据
                        config.credentialId = existingCred.credentialId;
                    }
                }
            });

            if (migratedCount > 0) {
                console.log(`[Migrate] Migrated ${migratedCount} configs to new credential system`);
            }

            // 2. 添加排序字段
            this.configList.forEach((config, index) => {
                config.sortOrder = index;
            });
        },

        // 添加凭据
        addCredential(credential) {
            credential.credentialId = 'c_' + genId();
            if (!credential.name) {
                credential.name = '凭据_' + credential.credentialId.slice(-6);
            }
            // 确保 lastUpdate 字段存在（用于多端同步时比较版本）
            if (!credential.lastUpdate) {
                credential.lastUpdate = Date.now();
            }
            this.credentialList.push(credential);
            this.syncConfig().then();
            return credential.credentialId;
        },

        // 更新凭据
        updateCredential(credential) {
            let find = this.credentialList.find(item => item.credentialId === credential.credentialId);
            if (find) {
                // 处理密码更新
                if (credential.passwordNew && credential.passwordNew !== "**************") {
                    credential.password = credential.passwordNew;
                }
                delete credential.passwordNew;
                // 更新 lastUpdate 时间戳（用于多端同步时比较版本）
                credential.lastUpdate = Date.now();
                Object.assign(find, credential);
                this.syncConfig().then();
            }
        },

        // 删除凭据
        removeCredential(credentialId) {
            // 检查是否有配置正在使用此凭据
            const usingConfigs = this.configList.filter(c => c.credentialId === credentialId);
            if (usingConfigs.length > 0) {
                throw new Error(`有 ${usingConfigs.length} 个配置正在使用此凭据，请先解除关联`);
            }

            this.credentialList = this.credentialList.filter(item => item.credentialId !== credentialId);
            this.syncConfig().then();
        },

        // 获取配置使用的凭据（如果没有指定凭据ID，尝试查找匹配的旧凭据）
        getConfigCredential(config) {
            if (config.credentialId) {
                return this.getCredentialById(config.credentialId);
            }
            // 兼容旧配置：按用户名+主机名查找匹配的凭据
            return this.credentialList.find(c =>
                c.name === config.username + '@' + config.host
            );
        },

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
            Object.assign(find, config)
            this.syncConfig(this.configList).then()
        },

        // 将凭据的认证信息同步到配置（用于后端连接）
        syncAuthInfoToConfig(config, credential) {
            if (!credential) return;
            config.authType = credential.authType;
            // 同步用户名（如果凭据中有）
            if (credential.username) {
                config.username = credential.username;
            }
            if (credential.authType === 'password') {
                config.password = credential.password;
                // 清空密钥相关字段
                config.privateKeyPath = '';
                config.privateKeyData = '';
                config.keyPassword = '';
            } else if (credential.authType === 'key') {
                config.privateKeyPath = credential.privateKeyPath;
                config.privateKeyData = credential.privateKeyData;
                config.keyPassword = credential.keyPassword;
                // 清空密码字段
                config.password = '';
            }
        },

        /**
         * 同步配置到后端的 CONFIG_MAP
         */
        async syncConfig() {
            // 确保迁移完成
            this.migrateOldConfigs();

            let backendConfig = {};
            this.configList.forEach(item => {
                const config = Object.assign({}, item);
                const cred = useMngStore().getConfigCredential(config);
                if (cred) {
                    useMngStore().syncAuthInfoToConfig(config, cred);
                }
                backendConfig[item.configId] = config
            })
            await invoke('sync_config', { configMap: backendConfig });
        },

        /**
         * 重新排序配置列表
         * @param {Array} newOrder - 新的排序顺序（configId 数组）
         */
        reorderConfig(newOrder) {
            // 根据新顺序重新排列 configList
            const sortedList = [];
            newOrder.forEach((configId, index) => {
                const config = this.configList.find(c => c.configId === configId);
                if (config) {
                    config.sortOrder = index;
                    sortedList.push(config);
                }
            });
            // 添加可能遗漏的配置（确保所有配置都保留）
            this.configList.forEach(config => {
                if (!newOrder.includes(config.configId)) {
                    config.sortOrder = sortedList.length;
                    sortedList.push(config);
                }
            });
            this.configList = sortedList;
            this.syncConfig(this.configList).then();
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
            // 处理默认属性
            normalizeConfig(config)
            // 加载凭据信息，覆盖到config中
            const cred = useMngStore().getConfigCredential(config);
            if (cred) {
                useMngStore().syncAuthInfoToConfig(config, cred);
            }
            // 处理跳板机配置更新问题
            if (config.bastionConfigId) {
                const backendConfig = {}
                let bastionConfigId = config.bastionConfigId
                while (bastionConfigId) {
                    const tmp = Object.assign({}, useMngStore().getById(bastionConfigId));
                    bastionConfigId = tmp?.bastionConfigId
                    if (tmp) {
                        const cred = useMngStore().getConfigCredential(tmp);
                        if (cred) {
                            useMngStore().syncAuthInfoToConfig(tmp, cred);
                        }
                        backendConfig[tmp.configId] = tmp
                    }
                }
                invoke('sync_config', { configMap: backendConfig }).then()
            }
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
        // 切换指定session的SFTP显示状态
        toggleSftp(sessionId) {
            const conn = this.connList.find(item => item.sessionId === sessionId);
            if (conn && conn.type === 'connect' && conn.state === 1) {
                // 切换当前连接项的SFTP显示状态
                conn.showSftp = !conn.showSftp;
                return conn.showSftp;
            }
            return false;
        },
        // 设置指定session的SFTP显示状态
        setShowSftp(sessionId, show) {
            const conn = this.connList.find(item => item.sessionId === sessionId);
            if (conn && conn.type === 'connect' && conn.state === 1) {
                conn.showSftp = show;
                return true;
            }
            return false;
        },
        connectSuccess(id) {
            let find = this.connList.find(item => item.id === id)
            if (find) {
                find.state = 1
                // SSH连接成功后默认显示SFTP（仅PC端）
                if (find.type === 'connect' && !isMobile()) {
                    find.showSftp = true;
                }
            }
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

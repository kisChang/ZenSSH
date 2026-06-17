<template>
  <el-container>
    <el-header v-loading="isLoading" height="40px" class="header">
      <el-menu mode="horizontal"
               class="app-menu"
               menu-trigger="click"
               :default-active="activeMenu"
               :router="false"
               @select="handleMenuSelect"
               data-tauri-drag-region>
        <!--          <el-sub-menu index="1">
                    <template #title>文件</template>
                    <el-menu-item index="2-1">导入配置</el-menu-item>
                    <el-menu-item index="2-2">保存配置</el-menu-item>
                    <el-divider />
                    <el-menu-item index="2-3" @click="appExit">退出</el-menu-item>
                  </el-sub-menu>-->
        <el-menu-item index="2" @click="showPanel('host')">{{ $t('main.host') }}</el-menu-item>
        <el-menu-item index="6" @click="showPanel('credential')">{{ $t('main.credential') }}</el-menu-item>
        <el-menu-item index="3" @click="openSetting">{{ $t('main.setting') }}</el-menu-item>
        <el-menu-item index="4" @click="handleCheckUpdate(true)">{{update ? ("检测到更新：" + update.version) : "检查更新"}}</el-menu-item>
        <el-menu-item index="5" @click="showAbout">{{ $t('main.about') }}</el-menu-item>
      </el-menu>

      <el-dialog
          v-model="showUpdater"
          title="检查到更新"
          width="500">
        <!-- 下载中显示进度条 -->
        <div v-if="isDownloading">
          <div>正在下载更新...</div>
          <el-progress :percentage="downloadProgress" :status="downloadProgress === 100 ? 'success' : ''" />
          <div class="download-info">{{ downloadedSize }} / {{ totalSize }}</div>
        </div>
        <!-- 未下载时显示更新信息 -->
        <div v-else-if="_update">
          <div>当前版本：{{_update.currentVersion}}</div>
          <div>最新版本：{{_update.version}}</div>
          <div>发布时间：{{_update.date}}</div>
          <div>更新内容：{{_update.body || "暂无说明"}}</div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-button @click="showUpdater = false" :disabled="isDownloading">Cancel</el-button>
            <el-button type="primary" @click="handleAppUpdate" :loading="isDownloading" :disabled="isDownloading">
              {{ isDownloading ? '下载中...' : '立即更新' }}
            </el-button>
          </div>
        </template>
      </el-dialog>
    </el-header>
    <el-splitter>
      <el-splitter-panel :min="200" :size="asideSize">
        <connect-manage v-if="panelMode === 'host'" ref="connectManage"/>
        <credential-manage v-else-if="panelMode === 'credential'" />
      </el-splitter-panel>
      <el-splitter-panel :min="200">
        <div class="terminal-panel">
          <terminal-tabs ref="terminalTabs" @tab-change="tabChange"/>
        </div>
      </el-splitter-panel>
    </el-splitter>
  </el-container>
</template>

<script>
import { markRaw } from 'vue';
import {check} from '@tauri-apps/plugin-updater';
import {openUrl} from '@tauri-apps/plugin-opener';
import {exit, relaunch} from '@tauri-apps/plugin-process';
import ConnectManage from "./views/ConnectManage.vue";
import CredentialManage from "./views/CredentialManage.vue";
import TerminalTabs from "./pc/TerminalTabs.vue";
import {useTabsStore} from "@/store.js";

export default {
  name: "IndexPc",
  components: {TerminalTabs, ConnectManage, CredentialManage},
  props: {
    isLoading: false,
  },
  data() {
    return {
      asideSize: 200,
      activeMenu: "",
      showUpdater: false,
      activeSessionId: null,
      panelMode: 'host', // 'host' | 'credential'
      isDownloading: false,
      downloadProgress: 0,
      downloadedSize: '0 B',
      totalSize: '0 B',
    }
  },
  mounted() {
    this.handleCheckUpdate();
  },
  methods: {
    tabChange(sessionId, item) {
      this.activeSessionId = sessionId;
    },
    handleCheckUpdate(byUser) {
      check().then(update => {
        if (update) {
          this._update = markRaw(update);
          this.showUpdater = true
        } else {
          if (byUser) {
            this.notify({type: 'success', message: '暂无更新，开发者正在噼里啪啦中...'});
          }
        }
      }).catch(err => {
        this.notify({type: 'primary', message: '暂无更新，因为开发者弄坏了更新服务器:' + err});
      })
    },
    handleAppUpdate() {
      this.isDownloading = true;
      this.downloadProgress = 0;
      let downloaded = 0;
      let contentLength = 0;
      // alternatively we could also call update.download() and update.install() separately
      this._update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength;
            this.totalSize = this.formatSize(event.data.contentLength);
            console.log(`started downloading ${event.data.contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            this.downloadProgress = Math.round((downloaded / contentLength) * 100);
            this.downloadedSize = this.formatSize(downloaded);
            console.log(`downloaded ${downloaded} from ${contentLength}`);
            break;
          case 'Finished':
            console.log('download finished');
            break;
        }
      }).then(() => {
        console.log('update installed');
        this.downloadProgress = 100;
        this.downloadedSize = this.totalSize;
        setTimeout(() => {
          relaunch().then();
        }, 500);
      }).catch((err) => {
        this.isDownloading = false;
        this.notify({type: 'error', message: '更新下载失败: ' + err});
      })
    },
    formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    handleMenuSelect(index) {
      this.activeMenu = index
      this.$nextTick(() => {
        this.activeMenu = null
      })
    },
    showPanel(mode) {
      this.panelMode = mode;
      if (this.asideSize === 0) {
        this.asideSize = 200;
      }
    },
    openSetting() {
      for (let conn of useTabsStore().connList) {
        if (conn.type === 'setting') {
          this.$refs.terminalTabs.activeTab = 'setting';
          return;
        }
      }
      useTabsStore().connList.push({
        id: 'setting',
        type: 'setting',
        title: '设置',
        state: 1
      })
    },
    appExit() {
      exit(0).then()
    },
    showAbout(){
      openUrl("https://blog.kischang.top").then()
    },
  }
}
</script>

<style lang="scss" scoped>
.header {
  height: 40px;
  padding: 0;
  background: linear-gradient(135deg, var(--bg-header-start) 0%, var(--bg-header-end) 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.aside-hidden {
  width: 0 !important;
}
:deep(.el-splitter) {
  height: calc(100vh - 40px);
  background: var(--bg-panel);
}
:deep(.el-splitter__bar) {
  background: var(--splitter-bg);
  transition: background 0.2s ease;
  &:hover {
    background: var(--splitter-hover);
  }
}
:deep(.el-splitter__bar::after) {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 4px;
  height: 30px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.terminal-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  :deep(.terminal-tabs),
  :deep(.terminal-tabs-welcome) {
    flex: 1 1 0;
    height: auto !important;
    min-height: 0;
    overflow: hidden;
  }
  :deep(.terminal-container) {
    height: calc(100vh - 110px);
  }
}

.download-info {
  text-align: center;
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 14px;
}

.el-menu--horizontal {
  --el-menu-horizontal-height: 100%;
  --el-menu-hover-bg-color: var(--bg-hover);
  --el-menu-active-color: var(--color-primary);
  background: transparent;
  border-bottom: none;
  user-select: none;
  .el-menu-item {
    padding: 0 14px;
    color: var(--text-secondary) !important;
    font-size: 13px;
    transition: all 0.2s ease;
    border-radius: 4px;
    margin: 4px 4px 0;
    &:hover {
      color: var(--text-primary) !important;
      background: rgba(64, 158, 255, 0.2) !important;
    }
    &:focus {
      background: transparent;
    }
  }
  .el-divider--horizontal {
    margin: 5px 0 !important;
  }
}
</style>


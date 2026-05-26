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
        <div>
          <div>当前版本：{{update.currentVersion}}</div>
          <div>最新版本：{{update.version}}</div>
          <div>发布时间：{{update.date}}</div>
          <div>更新内容：{{update.body || "暂无说明"}}</div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-button @click="showUpdater = false">Cancel</el-button>
            <el-button type="primary" @click="handleAppUpdate">
              立即更新
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
        <div class="terminal-panel" :class="showStatusBar ? 'terminal-panel' : 'terminal-panel no_bar'">
          <terminal-tabs ref="terminalTabs" @tab-change="tabChange"/>
          <div class="status-bar" v-if="showStatusBar">
            <server-monitor :session-id="activeSessionId"/>
          </div>
        </div>
      </el-splitter-panel>
    </el-splitter>
  </el-container>
</template>

<script>
import {check} from '@tauri-apps/plugin-updater';
import {openUrl} from '@tauri-apps/plugin-opener'
import {exit, relaunch} from '@tauri-apps/plugin-process'
import ConnectManage from "./views/ConnectManage.vue";
import CredentialManage from "./views/CredentialManage.vue";
import TerminalTabs from "./views/TerminalTabs.vue";
import ServerMonitor from "@/subs/ServerMonitor.vue";
import {useTabsStore} from "@/store.js";

export default {
  name: "IndexPc",
  components: {ServerMonitor, TerminalTabs, ConnectManage, CredentialManage},
  props: {
    isLoading: false,
  },
  computed: {
    showStatusBar() {
      return this.activeSessionId && this.activeSessionType === 'ssh'
    }
  },
  data() {
    return {
      asideSize: 200,
      activeMenu: "",
      showUpdater: false,
      update: null,
      activeSessionId: null,
      activeSessionType: 'welcome',
      panelMode: 'host', // 'host' | 'credential'
    }
  },
  mounted() {
    this.handleCheckUpdate();
  },
  methods: {
    tabChange(tab, item) {
      this.activeSessionId = tab;
      this.activeSessionType = item?.config?.type;
    },
    handleCheckUpdate(byUser) {
      check().then(update => {
        if (update) {
          this.update = update;
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
    async handleAppUpdate() {
      let downloaded = 0;
      let contentLength = 0;
      // alternatively we could also call update.download() and update.install() separately
      await this.update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength;
            console.log(`started downloading ${event.data.contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            console.log(`downloaded ${downloaded} from ${contentLength}`);
            break;
          case 'Finished':
            console.log('download finished');
            break;
        }
      });
      console.log('update installed');
      await relaunch();
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
@import "./styles/variables.scss";

.header {
  height: 40px;
  padding: 0;
  background: linear-gradient(135deg, $bg-header-start 0%, $bg-header-end 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.aside-hidden {
  width: 0 !important;
}
:deep(.el-splitter) {
  height: calc(100vh - 40px);
  background: $bg-panel;
}
:deep(.el-splitter__bar) {
  background: $splitter-bg;
  transition: background 0.2s ease;
  &:hover {
    background: $splitter-hover;
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
  height: calc(100vh - 40px);
  :deep(.terminal-tabs),
  :deep(.terminal-tabs-welcome) {
    flex: 1 1 0;
    height: auto !important;
    min-height: 0;
    overflow: hidden;
  }
  :deep(.terminal-container) {
    height: calc(100vh - 100px);
  }
  &.no_bar {
    :deep(.terminal-container) {
      height: calc(100vh - 70px);
    }
  }
}

.status-bar {
  flex-shrink: 0;
  height: 28px;
  padding: 0 16px;
  background: linear-gradient(90deg, $bg-status-start 0%, $bg-status-end 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  overflow: hidden;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
}

.status-bar-empty {
  font-size: 12px;
  color: $text-muted;
}

.el-menu--horizontal {
  --el-menu-horizontal-height: 100%;
  --el-menu-hover-bg-color: $bg-hover;
  --el-menu-active-color: $color-primary;
  background: transparent;
  border-bottom: none;
  user-select: none;
  .el-menu-item {
    padding: 0 14px;
    color: rgba(255, 255, 255, 0.75) !important;
    font-size: 13px;
    transition: all 0.2s ease;
    border-radius: 4px;
    margin: 4px 4px 0;
    &:hover {
      color: $text-primary !important;
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


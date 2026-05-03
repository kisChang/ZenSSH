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
        <el-menu-item index="2" @click="toggleSessionManage">{{ $t('main.host') }}</el-menu-item>
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
        <connect-manage ref="connectManage"/>
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
import TerminalTabs from "./views/TerminalTabs.vue";
import ServerMonitor from "@/subs/ServerMonitor.vue";
import {useTabsStore} from "@/store.js";

export default {
  name: "IndexPc",
  components: {ServerMonitor, TerminalTabs, ConnectManage},
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
      activeSessionType: null,
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
    toggleSessionManage() {
      if (this.asideSize > 0) {
        this.asideSize = 0;
      } else {
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
  height: 30px;
  padding: 0;
  background: #525252;
}
.aside-hidden {
  width: 0 !important;
}
:deep(.el-splitter) {
  height: calc(100vh - 30px);
}

.terminal-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 30px);
  :deep(.terminal-tabs),
  :deep(.terminal-tabs-welcome) {
    flex: 1 1 0;
    height: auto !important;
    min-height: 0;
    overflow: hidden;
  }
  :deep(.terminal-container) {
    height: calc(100vh - 90px);
  }
  &.no_bar {
    height: calc(100vh);
    :deep(.terminal-container) {
      height: calc(100vh - 60px);
    }
  }
}

.status-bar {
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  background: #1e293b;
  border-top: 1px solid #334155;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.status-bar-empty {
  font-size: 12px;
  color: #64748b;
}

.el-menu--horizontal {
  --el-menu-horizontal-height: 100%;
  user-select: none;
  .el-menu-item {
    padding: 0 10px;
    color: var(--el-menu-text-color) !important;
    &:hover {
      color: var(--el-menu-active-color) !important;
    }
  }
  .el-divider--horizontal {
    margin: 5px 0 !important;
  }
}
</style>


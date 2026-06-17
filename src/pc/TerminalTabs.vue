<template>
  <el-tabs
      ref="tab"
      v-model="activeTab"
      type="card"
      :class="activeTab === 'welcome' ? 'terminal-tabs-welcome' : 'terminal-tabs'"
      @contextmenu="handleContextmenu">
    <el-tab-pane
        v-for="item in tabs"
        :key="item.id"
        :name="item.id">
      <template #label>
        <template v-if="item.type === 'connect' || item.type === 'sftp' || item.type === 'serial'">
          <el-icon v-if="item.state === 0" color="#409EFF" class="is-loading"><Loading /></el-icon>
          <el-icon v-if="item.state === 1" color="#67C23A"><Link /></el-icon>
          <el-icon v-if="item.state === 2" color="#F40"><CircleCloseFilled/></el-icon>
        </template>
        <span>{{ item.title }}</span>
        <el-icon class="tab-icon" @click="removeTab($event, item.sessionId || item.id)"><CircleClose /></el-icon>
      </template>
      <el-empty
          v-if="item.type === 'welcome'"
          image="/logo.png"
          description=" ">
        <div slot="description" v-html="$t('common.hello')"></div>
        <el-button style="margin-top: 30px;" type="primary" @click="showQuickConn">{{ $t('main.quickConnect') }}</el-button>
      </el-empty>

      <div v-else-if="item.type === 'setting'" class="setting-tab">
        <setting-form />
      </div>

      <!-- 使用 splitter 分割 terminal 和 sftp (仅SSH连接) -->
      <div v-else-if="item.type === 'connect'" class="ssh-container">
        <el-splitter direction="vertical" class="terminal-splitter">
          <el-splitter-panel>
            <terminal :ref="'xterm_' + item.sessionId" :session="item"/>
          </el-splitter-panel>
          <el-splitter-panel v-if="item.showSftp" :min="400" :size="400">
            <sftp-file-browser :ref="'sftp_' + item.sessionId" :session="item"/>
          </el-splitter-panel>
        </el-splitter>
        <div class="monitor-bar">
          <server-monitor :session-id="item.sessionId" class="monitor-content"/>
          <el-button
              class="sftp-toggle-btn"
              :type="item.showSftp ? 'primary' : 'default'"
              size="small"
              @click.stop="toggleSftp(item)">
            <el-icon><Folder v-if="item.showSftp"/><FolderOpened v-else/></el-icon>
            SFTP
          </el-button>
        </div>
      </div>

      <terminal v-else-if="item.type === 'serial'" :ref="'xterm_' + item.sessionId" :session="item"/>
    </el-tab-pane>

    <el-dropdown
        v-if="!isMobile"
        ref="dropdownRef"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{ modifiers: [{ name: 'offset', options: { offset: [0, 0] } }] }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start">
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item>Action 1</el-dropdown-item>
          <el-dropdown-item>Action 2</el-dropdown-item>
          <el-dropdown-item>Action 3</el-dropdown-item>
          <el-dropdown-item>Action 4</el-dropdown-item>
          <el-dropdown-item>Action 5</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </el-tabs>
</template>

<script>
import { keepScreenOn } from "tauri-plugin-keep-screen-on-api";
import Terminal from "@/subs/Terminal.vue";
import SftpFileBrowser from "@/subs/SftpFileBrowser.vue";
import ServerMonitor from "@/subs/ServerMonitor.vue";
import {invoke} from "@tauri-apps/api/core";
import {useTabsStore} from "@/store.js";
import SettingForm from "@/subs/SettingForm.vue";
import {isMobile} from "@/commons.js";
import {Folder, FolderOpened} from "@element-plus/icons-vue";

export default {
  name: "TerminalTabs",
  props: {
    active: {
      require: true,
      default: false,
    }
  },
  components: {SettingForm, Terminal, SftpFileBrowser, ServerMonitor, Folder, FolderOpened},
  data() {
    const tabStore = useTabsStore()
    return {
      isMobile: false,
      activeTab: 'welcome',
      tabStore: tabStore,
      tabs: tabStore.connList,
      triggerRef: {
        getBoundingClientRect: () => (DOMRect.fromRect()),
      },
    }
  },
  watch: {
    'tabStore.connList': {
      handler(newVal) {
        this.tabs = newVal;
        this.autoFocusTab()
      },
      deep: true
    },
    active: {
      handler(newVal) {
        // 激活时 保持屏幕常亮
        keepScreenOn(newVal)
      },
    },
    activeTab: {
      handler(newVal) {
        const item = this.tabs.find(v => v.id === newVal);
        this.$emit('tab-change', item?.sessionId || null, item);
      },
    },
  },
  computed: {
    activeTabContext() {
      return this.tabs.filter( value => value.sessionId === this.activeTab)
    }
  },
  beforeUnmount() {
    keepScreenOn(false)
  },
  mounted() {
    if (isMobile()) {
      this.isMobile = true
    } else {
      // 仅在PC端保留该页面
      this.tabStore.connList.push({
        id: 'welcome',
        type: 'welcome',
        title: 'Welcome',
        state: 1
      })
    }
  },
  methods: {
    async onBackButtonPress() {
      return true
    },
    autoFocusTab() {
      if (this.tabs.length > 0) {
        // 默认激活最后一个Tab
        this.activeTab = this.tabs[this.tabs.length - 1].id
      } else {
        this.activeTab = 'welcome'
        this.$bus.emit('tab-only-one')
      }
    },
    removeTab(e, sessionId) {
      if (sessionId.startsWith("s_")) {
        this.$confirm(this.$t('connect.confirmDisconnect'), {showClose: false}).then(() => {
          this.closeTerminal(sessionId).then(() => {
            this.tabStore.connectRemove(sessionId)
          })
          this.notify({
            type: 'success',
            message: this.$t('connect.successDisconnect'),
          })
        }).catch(() => {})
      } else {
        this.tabStore.connectRemove(sessionId)
      }
      e.stopPropagation()
    },
    async closeTerminal(sessionId) {
      if (this.tabs.find(t => t.sessionId === sessionId)) {
        if (this.$refs['xterm_' + sessionId] && this.$refs['xterm_' + sessionId].length)
          this.$refs['xterm_' + sessionId][0].disconnect()
      }
    },
    showQuickConn() {
      this.$bus.emit('show-quick-connect')
    },
    toggleSftp(item) {
      this.tabStore.setShowSftp(item.sessionId, !item.showSftp);
    },

    handleContextmenu(event) {
      // 暂未启用
      /*const { clientX, clientY } = event
      this.triggerRef.getBoundingClientRect = () => (DOMRect.fromRect({
        x: clientX,
        y: clientY,
      }))
      event.preventDefault()
      this.$refs.dropdownRef.handleOpen()*/
    },
  }
};
</script>

<style scoped lang="scss">
.terminal-tabs-welcome {
  height: calc(100vh - 110px);
  background: var(--bg-header-start);
  :deep(.el-empty) {
    padding-top: 80px;
    .el-empty__image {
      width: 180px;
      opacity: 0.9;
    }
    .el-empty__description {
      margin-top: 20px;
      p {
        color: var(--text-secondary);
        font-size: 15px;
        line-height: 1.6;
      }
    }
  }
  :deep(.el-button--primary) {
    background: var(--btn-primary-bg);
    border: none;
    padding: 12px 28px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 500;
    transition: all 0.25s ease;
    &:hover {
      background: var(--btn-primary-hover);
      box-shadow: 0 6px 20px var(--btn-shadow);
      transform: translateY(-2px);
    }
  }
}
.terminal-tabs {
  height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 40px);
  background: var(--bg-panel);
  border-top: 1px solid var(--tabs-border-top);

  :deep(.el-tabs__header) {
    background: var(--bg-card);
    border-bottom: 1px solid var(--tabs-header-border);
    margin: 0;
    padding: 0 8px;
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }

  :deep(.el-tabs__item) {
    padding: 0 16px;
    height: 38px;
    line-height: 38px;
    color: var(--text-secondary);
    font-size: 13px;
    background: transparent;
    transition: all 0.2s ease;
    border-radius: 6px 6px 0 0;
    margin: 4px 2px 0;

    &:hover {
      color: var(--text-primary);
      background: var(--tabs-item-hover-bg);
    }
  }

  :deep(.el-tabs__item.is-active) {
    color: var(--text-primary);
    background: linear-gradient(180deg, var(--tabs-item-active-bg-start) 0%, var(--tabs-item-active-bg-end) 100%);
    font-weight: 500;
    box-shadow: 0 -2px 8px var(--tabs-item-active-shadow);
  }

  :deep(.el-tabs__active-bar) {
    display: none;
  }

  :deep(.el-tabs__content) {
    height: calc(100% - 46px);
    overflow: hidden;
  }

  .tab-icon {
    width: 22px;
    height: 22px;
    padding: 0;
    margin-left: 8px;
    border-radius: 50%;
    opacity: 0.6;
    transition: all 0.2s ease;
    &:hover {
      background: var(--tabs-close-hover-bg);
      color: #FFF;
      opacity: 1;
    }
  }

  .sftp-icon {
    width: 22px;
    height: 22px;
    padding: 0;
    margin-left: 8px;
    border-radius: 50%;
    opacity: 0.6;
    color: #67C23A;
    transition: all 0.2s ease;
    cursor: pointer;
    &:hover {
      opacity: 1;
      color: #67C23A;
    }
  }

  .setting-tab {
    padding: 20px;
    height: 100%;
    overflow: auto;
  }

  .ssh-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .terminal-splitter {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    :deep(.el-splitter) {
      height: 100%;
    }
    :deep(.el-splitter-panel) {
      width: 100%;
      overflow: hidden;
    }
  }

  .monitor-bar {
    flex-shrink: 0;
    height: 28px;
    padding: 0 12px;
    background: linear-gradient(90deg, var(--bg-status-start) 0%, var(--bg-status-end) 100%);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    .monitor-content {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .sftp-toggle-btn {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      font-size: 12px;
      height: 22px;
    }
  }
}
@media (max-width: 768px) {
  .terminal-tabs {
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }
  .terminal-tabs-welcome {
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }
}
</style>

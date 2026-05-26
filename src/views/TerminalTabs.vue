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

      <terminal :ref="'xterm_' + item.sessionId" v-else-if="item.type === 'connect' || item.type === 'serial'" :session="item"/>

      <sftp-file-browser :ref="'sftp_' + item.sessionId" v-else-if="item.type === 'sftp'" :session="item"/>
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
import {invoke} from "@tauri-apps/api/core";
import {useTabsStore} from "@/store.js";
import SettingForm from "@/subs/SettingForm.vue";
import {isMobile} from "@/commons.js";

export default {
  name: "TerminalTabs",
  props: {
    active: {
      require: true,
      default: false,
    }
  },
  components: {SettingForm, Terminal, SftpFileBrowser},
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
      if (this.isMobile && this.activeTabContext && this.activeTabContext.length) {
        let context = this.activeTabContext[0]
        if (context.type === 'sftp' && this.$refs['sftp_' + context.sessionId]) {
          return this.$refs['sftp_' + context.sessionId][0].onBackButtonPress()
        }
      }
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
        this.$refs['xterm_' + sessionId][0].disconnect()
      }
    },
    showQuickConn() {
      this.$bus.emit('show-quick-connect')
    },
    showHostList() {
      this.$bus.emit('show-host-list')
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
@import "../styles/variables.scss";

.terminal-tabs-welcome {
  height: calc(100vh - 110px);
  background: $bg-header-start;
  :deep(.el-empty) {
    padding-top: 80px;
    .el-empty__image {
      width: 180px;
      opacity: 0.9;
    }
    .el-empty__description {
      margin-top: 20px;
      p {
        color: rgba(255, 255, 255, 0.6);
        font-size: 15px;
        line-height: 1.6;
      }
    }
  }
  :deep(.el-button--primary) {
    background: $btn-primary-bg;
    border: none;
    padding: 12px 28px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 500;
    transition: all 0.25s ease;
    &:hover {
      background: $btn-primary-hover;
      box-shadow: 0 6px 20px rgba(64, 158, 255, 0.45);
      transform: translateY(-2px);
    }
  }
}
.terminal-tabs {
  height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 40px);
  background: linear-gradient(180deg, $bg-panel 0%, lighten($bg-panel, 3%) 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.05);

  :deep(.el-tabs__header) {
    background: linear-gradient(90deg, darken($bg-card, 3%) 0%, darken($bg-card, 5%) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
    color: rgba(255, 255, 255, 0.55);
    font-size: 13px;
    background: transparent;
    transition: all 0.2s ease;
    border-radius: 6px 6px 0 0;
    margin: 4px 2px 0;

    &:hover {
      color: $text-primary;
      background: rgba(255, 255, 255, 0.05);
    }
  }

  :deep(.el-tabs__item.is-active) {
    color: $text-primary;
    background: linear-gradient(180deg, #252535 0%, #1e1e2a 100%);
    font-weight: 500;
    box-shadow: 0 -2px 8px rgba(64, 158, 255, 0.15);
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
      background: rgba(239, 68, 68, 0.9);
      color: #FFF;
      opacity: 1;
    }
  }

  .setting-tab {
    padding: 20px;
    height: 100%;
    overflow: auto;
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

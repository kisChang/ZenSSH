<template>
  <el-tabs
      ref="tab"
      v-model="activeTab"
      type="card"
      class="terminal-tabs"
      @contextmenu="handleContextmenu">
    <el-tab-pane
        v-for="item in tabs"
        :key="item.id"
        :name="item.id">
      <template #label>
        <template v-if="item.type === 'connect' || item.type === 'sftp'">
          <el-icon v-if="item.state === 0" color="#409EFF" class="is-loading"><Loading /></el-icon>
          <el-icon v-if="item.state === 1" color="#67C23A"><Link /></el-icon>
          <el-icon v-if="item.state === 2" color="#F40"><CircleCloseFilled/></el-icon>
        </template>
        <span>{{ item.title }}</span>
        <el-icon class="tab-icon" @click="removeTab($event, item.sessionId || item.id)"><CloseBold /></el-icon>
      </template>
      <el-empty
          v-if="item.type === 'welcome'"
          image="/logo.png"
          description="欢迎使用ZenSSH，简洁、专注的SSH全平台解决方案">
        <el-button type="primary" @click="showQuickConn">开始连接</el-button>
      </el-empty>

      <div v-else-if="item.type === 'setting'" class="setting-tab">
        <setting-form />
      </div>

      <terminal ref="xterm" v-else-if="item.type === 'connect'" :session="item"/>

      <sftp-file-browser :ref="'sftp_' + item.sessionId" v-else-if="item.type === 'sftp'" :session="item"/>
    </el-tab-pane>

    <el-tab-pane v-if="isMobile && tabs.length <= 0" :closable="false" label="Welcome" name="welcome">

      <el-empty
          image="/logo.png"
          description="欢迎使用ZenSSH，简洁、专注的SSH全平台解决方案">
        <el-button type="primary" @click="showHostList">开始连接</el-button>
      </el-empty>
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
import { onBackButtonPress } from "@tauri-apps/api/app";
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
        title: '欢迎使用',
        state: 1
      })
    }
  },
  methods: {
    async onBackButtonPress() {
      if (this.isMobile && this.activeTabContext && this.activeTabContext.length) {
        let context = this.activeTabContext[0]
        if (context.type === 'sftp' && this.$refs['sftp_' + context.sessionId]) {
          this.$refs['sftp_' + context.sessionId][0].onBackButtonPress()
          return false
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
        this.$confirm("确定关闭会话？", {showClose: false}).then(() => {
          this.closeTerminal(sessionId).then(() => {
            this.tabStore.connectRemove(sessionId)
          })
          this.notify({
            type: 'success',
            message: '已关闭',
          })
        }).catch(() => {})
      } else {
        this.tabStore.connectRemove(sessionId)
      }
      e.stopPropagation()
    },
    async closeTerminal(sessionId) {
      await invoke("ssh_close", {sessionId: sessionId});
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
.terminal-tabs {
  height: 100%;
  background: #222;
  ::v-deep(.el-tabs__item.is-active) {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }
  .tab-icon {
    width: 10px;
    height: 10px;
    padding: 2px;
    border: 1px solid var(--el-color-primary);
    margin-left: 10px;
    border-radius: 50%;
    &:hover {
      background: var(--el-color-primary);
      color: #FFF;
    }
  }

  .setting-tab {
    padding: 20px;
  }
}
</style>

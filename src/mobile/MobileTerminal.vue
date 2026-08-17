<template>
  <div class="mobile-terminal">
    <template v-for="item in tabStore.connList" :key="item.id">
      <!-- 终端层：每个连接都保持挂载，通过 active 类控制显示 -->
      <div class="terminal-layer"
           v-if="item.type === 'connect' || item.type === 'serial'"
           :class="{ active: currentConnId === item.id && !item.showSftp }">
        <terminal :ref="'xterm_' + item.sessionId"
                  :session="item"/>
      </div>

      <!-- SFTP 层：仅在该连接打开 SFTP 时渲染 -->
      <div class="sftp-layer"
           v-if="item.type === 'connect' && item.showSftp"
           :class="{ active: currentConnId === item.id && item.showSftp }">
        <div class="mobile-sftp-header">
          <div class="header-left">
            <el-button class="back-btn" :icon="ArrowLeft" circle @click="handleBack" />
          </div>
          <div class="header-center">
            <span class="header-title">SFTP</span>
          </div>
          <div class="header-right">
            <el-button class="back-btn" :icon="Close" circle @click="handleClose" />
          </div>
        </div>
        <sftp-file-browser :ref="'sftp_' + item.sessionId"
                           :session="item"/>
      </div>
    </template>
  </div>
</template>

<script>
import Terminal from "@/subs/Terminal.vue";
import SftpFileBrowser from "@/subs/SftpFileBrowser.vue";
import {useTabsStore} from "@/store.js";
import {ArrowLeft, Close} from "@element-plus/icons-vue";

export default {
  name: "MobileTerminal",
  components: {Terminal, SftpFileBrowser},
  data() {
    const tabStore = useTabsStore()
    return {
      tabStore: tabStore,
      currentConnId: null,
      ArrowLeft: ArrowLeft,
      Close: Close
    }
  },
  computed: {
    // 始终从 store 实时获取当前连接，避免引用过期
    currentConn() {
      if (!this.currentConnId) return null
      return this.tabStore.connList.find(v => v.id === this.currentConnId) || null
    },
    isSftpActive() {
      return this.currentConn?.showSftp || false
    }
  },
  methods: {
    setActiveConn(id) {
      this.currentConnId = id
    },
    handleBack() {
      if (this.currentConn) {
        this.currentConn.showSftp = false
      }
      this.$bus.emit('show-host-list')
    },
    handleClose() {
      if (this.currentConn) {
        this.currentConn.showSftp = false
      }
      this.$bus.emit('tab-only-one')
    },
    async onBackButtonPress() {
      if (this.currentConn && this.isSftpActive) {
        const ref = this.$refs['sftp_' + this.currentConn.sessionId]
        // v-for 中的动态 ref 可能是数组，兼容访问
        const sftp = Array.isArray(ref) ? ref[0] : ref
        if (sftp) {
          return sftp.onBackButtonPress()
        }
      }
      return true
    }
  }
}
</script>

<style lang="scss" scoped>
.mobile-terminal {
  z-index: 99;
  position: fixed;
  top: env(safe-area-inset-top);
  bottom: env(safe-area-inset-bottom);
  left: 0;
  right: 0;

  width: 100%;
  height: 100%;
  background: var(--bg-primary);

  .terminal-layer,
  .sftp-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: none;
    flex-direction: column;
  }

  .terminal-layer.active,
  .sftp-layer.active {
    display: flex;
  }

  :deep(.terminal-container) {
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }
}

.sftp-layer {
  :deep(.file-list) {
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 180px);
  }
}

.mobile-sftp-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  padding-top: env(safe-area-inset-top);
  background: var(--bg-header-start);
  border-bottom: 1px solid var(--border-color);

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    width: 60px;
  }

  .header-right {
    justify-content: flex-end;
  }

  .header-center {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }

  .header-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .back-btn {
    width: 40px;
    height: 40px;
    padding: 0;
    background: transparent;
    border: none;

    &:active {
      background: var(--bg-hover);
    }
  }
}
</style>

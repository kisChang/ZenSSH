<template>
  <div class="mobile-terminal">
    <terminal v-if="currentConn && (currentConn.type === 'connect' || currentConn.type === 'serial') && !isSftpActive"
              :ref="'xterm_' + currentConn.sessionId"
              :session="currentConn"/>

    <div v-if="currentConn && (currentConn.type === 'sftp' || (currentConn.type === 'connect' && isSftpActive))" class="sftp-container">
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
      <sftp-file-browser :ref="'sftp_' + currentConn.sessionId"
                         :session="currentConn"/>
    </div>
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
    currentConn() {
      if (!this.currentConnId) return null
      return this.tabStore.connList.find(v => v.id === this.currentConnId)
    },
    isSftpActive() {
      return this.currentConn && this.tabStore.activeSftpSession === this.currentConn.sessionId
    }
  },
  methods: {
    setActiveConn(id) {
      this.currentConnId = id
    },
    handleBack() {
      // 如果当前在SFTP视图，切换回Terminal视图
      if (this.isSftpActive) {
        this.tabStore.deactivateSftp();
      } else {
        this.$bus.emit('show-host-list')
      }
    },
    handleClose() {
      // 关闭SFTP时切换回Terminal视图
      if (this.isSftpActive) {
        this.tabStore.deactivateSftp();
      } else {
        this.$bus.emit('tab-only-one')
      }
    },
    async onBackButtonPress() {
      if ((this.currentConn?.type === 'sftp' || this.isSftpActive) && this.$refs['sftp_' + this.currentConn.sessionId]) {
        return this.$refs['sftp_' + this.currentConn.sessionId].onBackButtonPress()
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

  :deep(.terminal-container) {
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  }
}

.sftp-container {
  display: flex;
  flex-direction: column;
  height: 100%;
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

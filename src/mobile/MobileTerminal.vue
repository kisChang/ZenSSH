<template>
  <div class="mobile-terminal">
    <terminal v-if="currentConn && (currentConn.type === 'connect' || currentConn.type === 'serial')"
              :ref="'xterm_' + currentConn.sessionId"
              :session="currentConn"/>

    <sftp-file-browser v-else-if="currentConn && currentConn.type === 'sftp'"
                       :ref="'sftp_' + currentConn.sessionId"
                       :session="currentConn"/>
  </div>
</template>

<script>
import Terminal from "@/subs/Terminal.vue";
import SftpFileBrowser from "@/subs/SftpFileBrowser.vue";
import {useTabsStore} from "@/store.js";

export default {
  name: "MobileTerminal",
  components: {Terminal, SftpFileBrowser},
  data() {
    const tabStore = useTabsStore()
    return {
      tabStore: tabStore,
      currentConnId: null,
    }
  },
  computed: {
    currentConn() {
      if (!this.currentConnId) return null
      return this.tabStore.connList.find(v => v.id === this.currentConnId)
    }
  },
  methods: {
    setActiveConn(id) {
      this.currentConnId = id
    },
    async onBackButtonPress() {
      if (this.currentConn?.type === 'sftp' && this.$refs['sftp_' + this.currentConn.sessionId]) {
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
  :deep(.file-list) {
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 100px);
  }
}
</style>

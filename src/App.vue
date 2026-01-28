<template>
  <div class="container" v-loading="isLoading">
    <index-mobile v-if="isMobile"/>
    <el-container v-else-if="isPc">
      <el-header height="40px" class="header">
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
          <el-menu-item index="2" @click="toggleSessionManage">链接管理</el-menu-item>
          <el-menu-item index="3" @click="openSetting">应用配置</el-menu-item>
          <el-menu-item index="4" @click="handleCheckUpdate(true)">{{update ? ("检测到更新：" + update.version) : "检查更新"}}</el-menu-item>
          <el-menu-item index="5" @click="showAbout">关于</el-menu-item>
        </el-menu>

        <el-dialog
            v-model="showUpdater"
            title="检查到更新"
            width="500">
          <span>{{ update }}</span>
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
          <terminal-tabs ref="terminalTabs"/>
        </el-splitter-panel>
      </el-splitter>
    </el-container>
  </div>
</template>

<script>
import {check} from '@tauri-apps/plugin-updater';
import {openUrl} from '@tauri-apps/plugin-opener'
import {listen} from '@tauri-apps/api/event'
import {relaunch, exit} from '@tauri-apps/plugin-process'
import ConnectManage from "./views/ConnectManage.vue";
import TerminalTabs from "./views/TerminalTabs.vue";
import {appConfigStore, appRunState, useMngStore, useTabsStore} from "@/store.js";
import IndexMobile from "@/IndexMobile.vue";
import {isMobile} from "@/commons.js";

export default {
  name: "Tauri",
  components: {IndexMobile, TerminalTabs, ConnectManage},
  data() {
    return {
      isLoading: true,

      asideSize: 200,
      activeMenu: "",
      isMobile: false, isPc: false,

      showUpdater: false, update: null,
    }
  },
  async mounted() {
    // 加载密钥串
    while (true) {
      let syncPass = await appRunState().keyringGet()
      if (!syncPass) { //必须初始化密钥
        let setPass = await this.$prompt(
            "请设置端到端加密密钥。<br/><span style='font-weight: bold;color: #F40;'>注意：请您务必保管好您的密钥，丢失您的数据无法恢复！</span>",
            "设置密钥", {
              showClose: false,
              showCancelButton: false,
              closeOnClickModal: false,
              closeOnEsc: false,
              dangerouslyUseHTMLString: true,
            });
        if (!setPass.value) {
          this.$notify({message: "务必设置密钥才可以使用本程序！", type: "warning", zIndex: 19999});
          continue;
        }
        await appRunState().keyringSet(setPass.value)
      } else {
        // 密钥处理成功后跳出
        break;
      }
    }

    // 检查设备类型
    if (isMobile()) {
      this.isMobile = true
      this.asideSize = 0;
    } else {
      this.isPc = true;
      this.handleCheckUpdate();
    }
    await this.$nextTick();

    // Rust 后端 全局事件监听
    listen("ssh_close", event => {
      const {session_id, exit_status} = event.payload;
      this.$bus.emit("ssh_close_" + session_id, {session_id, exit_status});
    })
    // 加载云端同步数据
    this.isLoading = true
    appConfigStore().loadByCloud().then(res => {
      if (res) {
        this.$message({message: "加载云端数据成功", type: "success"})
        this.$forceUpdate()
      }
    }).catch(err => {
      this.$message({message: "配置同步失败：" + err, type: "error"})
    }).finally(() => {
      // 推送一次配置信息到后端
      useMngStore().syncConfig();
      // 结束loading
      this.isLoading = false

      //TODO 测试代码
      // this.openSetting()
    })
  },
  methods: {
    handleCheckUpdate(byUser) {
      check().then(update => {
        if (update) {
          this.update = update;
          this.showUpdater = true
        } else {
          if (byUser) {
            this.$message.success('暂无更新，开发者正在噼里啪啦中...');
          }
        }
      }).catch(err => {
        this.$message.primary('暂无更新，因为开发者弄坏了更新服务器:' + err);
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
      openUrl("https://kischang.top").then()
    },
  }
}
</script>

<style lang="scss">
.el-drawer {
  height: auto !important;
  user-select: none;
}

.pop-drawer {
  padding: 0 !important;
}

.btn-list {
  .el-alert {
    justify-content: center;
    padding: 16px 16px;
    background: none;

    &:active {
      background: #3d3d3d;
    }

    svg {
      height: 1rem;
      width: 1rem;
    }

    .el-alert__title {
      letter-spacing: 2px;
      font-size: 1rem;
    }
  }
}
</style>

<style lang="scss" scoped>
.container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  .header {
    height: 30px;
    padding: 0;
    text-align: right;
    background: #525252;
  }
  .aside-hidden {
    width: 0 !important;
  }
  ::v-deep(.el-splitter) {
    height: calc(100vh - 30px);
  }
}
</style>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

html, body {
  padding: 0;
  margin: 0;
}

.terminal .xterm-helpers {
  width: 0 !important;
  height: 0 !important;
  position: relative;
  opacity: 0;
}
.el-tabs__header {
  margin: 0 !important;
}

.container {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
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
.btn {
  margin-top: 16px;
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  border: none;
  background: #22c55e;
  color: #052e16;
  font-size: 16px;
  font-weight: 600;
}
</style>

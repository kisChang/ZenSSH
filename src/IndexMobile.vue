<template>
  <div class="hosts-page">
    <header class="header">
      <div class="left">
        <span class="title"></span>
      </div>
      <div class="center">
        <el-icon v-if="isLoading" class="is-loading"><Loading /></el-icon>
        {{ title }}
      </div>
      <div class="right">
      </div>
    </header>

    <main class="content">
      <transition :name="transitionName" mode="out-in">
        <div :key="activeTab" class="tab-content">
          <mobile-host v-if="activeTab === 'host'" ref="hostMng"/>

          <!-- 移动端连接列表 -->
          <div v-else-if="activeTab === 'conn'" class="conn-list-view">
            <el-empty v-if="tabsStore.connList <= 0"
                      image="/logo.png"
                      description=" ">
              <div slot="description" v-html="$t('common.hello')"></div>
              <el-button style="margin-top: 30px;" type="primary" @click="toggleTab('host')">
                {{ $t('main.quickConnect') }}
              </el-button>
            </el-empty>

            <el-scrollbar v-else
                          class="conn-list-scroll">
              <div v-for="item in tabsStore.connList"
                   :key="item.id"
                   class="conn-item">
                <div class="conn-icon-wrap"
                     @click="selectConn(item)">
                  <el-icon v-if="item.state === 0" class="is-loading" :size="24"><Loading /></el-icon>
                  <el-icon v-else-if="item.state === 1" color="#67C23A" :size="24"><Link /></el-icon>
                  <el-icon v-else-if="item.state === 2" color="#F40" :size="24"><CircleCloseFilled/></el-icon>
                </div>
                <div class="conn-info"
                     @click="selectConn(item)">
                  <div class="conn-title">{{ item.title }}</div>
<!--              <div class="conn-state">
                <span v-if="item.state === 0">连接中...</span>
                <span v-else-if="item.state === 1">已连接</span>
                <span v-else-if="item.state === 2">已断开</span>
              </div>-->
                  <div v-if="item.type === 'sftp'" class="sftp-indicator">
                    <el-icon :size="10" color="#67C23A"><Folder /></el-icon>
                    <span class="sftp-text">SFTP</span>
                  </div>
                  <div v-if="item.type === 'connect' && item.state === 1" class="monitor-indicator">
                    <server-monitor :session-id="item.sessionId"/>
                  </div>
                  <div v-if="item.config?.portForwards?.length" class="port-forward-list">
                    <div v-for="(pf, idx) in item.config.portForwards" :key="idx" class="port-forward-item">
                      <el-icon :size="10" color="#409EFF"><Paperclip /></el-icon>
                      <span class="pf-text">{{ pf.localHost }}:{{ pf.localPort }}→{{ pf.remoteHost }}:{{ pf.remotePort }}</span>
                    </div>
                  </div>
                </div>
                <el-button style="background: none;padding: 15px;"
                           size="small"
                           circle
                           @click="closeConn(item)">
                  <el-icon class="conn-arrow" :size="15"><Close/></el-icon>
                </el-button>
              </div>
            </el-scrollbar>
          </div>

          <mobile-setting v-else-if="activeTab === 'setting'" class="mobile-setting"/>
        </div>
      </transition>
    </main>

    <!-- 移动端终端页面 -->
    <transition name="terminal-anim">
      <terminal-tabs v-show="activeTab === 'conn' && showTerminal"
                     ref="terminalTabs"
                     class="terminal-mobile"
                     :active="showTerminal"/>
    </transition>

    <footer class="tabbar">
      <div class="tab" @click="toggleTab('host')" :class="{active : activeTab === 'host'}">
        <el-icon :size="20"><Platform /></el-icon>
        <span>{{ $t('main.host') }}</span>
      </div>
      <div class="tab" @click="toggleTab('conn')" :class="{active : activeTab === 'conn'}">
        <el-icon :size="20"><Connection /></el-icon>
        <span>{{ $t('main.conn') }}</span>
      </div>
      <div class="tab" @click="toggleTab('setting')" :class="{active : activeTab === 'setting'}">
        <el-icon :size="20"><SetUp /></el-icon>
        <span>{{ $t('main.setting') }}</span>
      </div>
    </footer>
  </div>
</template>

<script>
import {
  checkBatteryOptimizationStatus,
  requestBatteryOptimizationExemption,
} from 'tauri-plugin-android-battery-optimization-api';
import ConnectManage from "@/views/ConnectManage.vue";
import TerminalTabs from "@/views/TerminalTabs.vue";
import MobileHost from "@/mobile/MobileHost.vue";
import MobileSetting from "@/mobile/MobileSetting.vue";
import ServerMonitor from "@/subs/ServerMonitor.vue";
import {useTabsStore} from "@/store.js";
import {onBackButtonPress} from "@tauri-apps/api/app";
import {isMobile} from "@/commons.js";
import {exit} from "@tauri-apps/plugin-process";
import {Loading, Link, CircleCloseFilled, Connection, Files, ArrowRight, Paperclip, Folder, Cpu} from "@element-plus/icons-vue";
import {ElMessageBox} from "element-plus";

export default {
  name: "IndexMobile",
  props: {
    isLoading: false,
  },
  components: {Loading, Link, CircleCloseFilled, Connection, Files, ArrowRight, Paperclip, Folder, Cpu, MobileSetting, MobileHost, TerminalTabs, ConnectManage, ServerMonitor},
  data() {
    const tabsStore = useTabsStore();
    return {
      activeTab: 'host',
      title: '',
      tabsStore: tabsStore,
      showTerminal: false,
      monitorSession: null,
      transitionName: 'slide-left',
      tabIndexMap: { 'host': 0, 'conn': 1, 'setting': 2 },
    }
  },
  mounted() {
    this.toggleTab('host')
    this.$bus.on('mobile-connect-ssh', (config) => {
      this.toggleTab('conn')
      this.tabsStore.connectConfig(config, 'connect')
      this.showTerminal = true
    })
    this.$bus.on('mobile-connect-sftp', (config) => {
      this.toggleTab('conn')
      this.tabsStore.connectConfig(config, 'sftp')
      this.showTerminal = true
    })
    this.$bus.on('show-quick-connect', () => {
      this.toggleTab('host')
      this.$nextTick(() => {
        this.$refs.hostMng.handleConnNew()
      })
    })
    this.$bus.on('show-host-list', () => {
      this.toggleTab('host')
      this.showTerminal = false
    })
    this.$bus.on('tab-only-one', () => {
      this.showTerminal = false
    })

    // 检查电池优化选项
    checkBatteryOptimizationStatus().then(status => {
      if (status.isOptimized) {
        this.$confirm("由于Android 系统限制，如果未禁用电池优化不允许后台运行，则SSH连接无法在后台保持，请允许应用在后台运行。", {showClose: false}).then(() => {
          requestBatteryOptimizationExemption().catch(err => {})
        }).catch(() => {})
      }
    })

    if (isMobile()) {
      onBackButtonPress(this.onBackButtonPress)
    }
  },
  methods: {
    // 处理安卓端返回事件的支持
    onBackButtonPress() {
      ElMessageBox.close()
      if (this.activeTab === 'host') {
        this.$confirm("确认退出？", {showClose: false}).then(() => {
          exit(0)
        }).catch(() => {})
      } else if (this.activeTab === 'conn'){
        if (this.showTerminal) {
          // 从终端页面返回，先回到连接列表
          this.$refs.terminalTabs.onBackButtonPress().then(rv => {
            if (rv) {
              this.showTerminal = false
            }
          })
        } else {
          // 从连接列表返回到主机列表
          this.toggleTab('host')
          this.showTerminal = false
        }
      } else {
        this.toggleTab('host')
      }
    },
    toggleTab: function (to) {
      const titleMap = {
        'host': "main.host",
        'conn': "main.conn",
        'setting': "main.setting",
      }
      const fromIndex = this.tabIndexMap[this.activeTab]
      const toIndex = this.tabIndexMap[to]
      this.transitionName = toIndex > fromIndex ? 'slide-left' : 'slide-right'
      this.activeTab = to
      this.title = this.$t(titleMap[to])
    },
    closeConn(item) {
      this.$confirm("确认关闭？", {
        showClose: true,
        cancelButtonText: '取消',
        confirmButtonText: '关闭',
      }).then(() => {
        this.tabsStore.connectRemove(item.id)
      }).catch(() => {
      })
    },
    selectConn: function (item) {
      if (item.state !== 1){
        this.$confirm("链接已断开，尝试重连或者关闭？", {
          showClose: true,
          cancelButtonText: '重连',
          confirmButtonText: '关闭',
        }).then(() => {
          this.tabsStore.connectRemove(item.id)
        }).catch(() => {
          this.tabsStore.connectRemove(item.id)
          this.tabsStore.connectConfig(item.config, 'connect')
        })
        return
      }
      this.showTerminal = true
      // 激活对应Tab
      this.$nextTick(() => {
        if (this.$refs.terminalTabs) {
          this.$refs.terminalTabs.activeTab = item.id
        }
      })
    },
    openMonitor(item) {
      this.monitorSession = item;
    },
  }
};
</script>

<style lang="scss" scoped>
$bg: #0f172a;
$card: #1e293b;
$text-main: #ffffff;
$text-sub: #94a3b8;

.hosts-page {
  position: fixed;
  top: env(safe-area-inset-top);
  bottom: env(safe-area-inset-bottom);
  left: 0;
  right: 0;
  background: $bg;
  color: $text-main;
  display: flex;
  flex-direction: column;
}
:deep(.terminal-mobile) {
  z-index: 1;
  position: fixed;
  top: env(safe-area-inset-top);
  bottom: env(safe-area-inset-bottom);
  left: 0;
  right: 0;
}

.terminal-anim-enter-active,
.terminal-anim-leave-active {
  transition: transform 0.3s ease;
}

.terminal-anim-enter-from {
  transform: translateY(100%);
}

.terminal-anim-leave-to {
  transform: translateY(100%);
}

.header {
  flex-shrink: 0;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 16px;

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 30%;
  }

  .center {
    width: 40%;
    text-align: center;
    font-weight: 600;
    font-size: 18px;
  }

  .right {
    justify-content: flex-end;
  }
}

.content {
  flex: 1;
  overflow: hidden;
  position: relative;

  .tab-content {
    width: 100%;
    height: 100%;
  }

  h2 {
    margin-top: 10vh;
    font-size: 20px;
    font-weight: 600;
  }

  .desc {
    margin-top: 8px;
    font-size: 14px;
    color: $text-sub;
    line-height: 1.5;
  }

  /* 连接列表样式 */
  .conn-list-view {
    height: 100%;
    display: flex;
    flex-direction: column;
    .empty-conn {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 60vh;
      color: $text-sub;
      font-size: 16px;
    }
    .conn-list-scroll {
      flex: 1;
      padding: 8px 12px;
    }
    .conn-item {
      display: flex;
      align-items: center;
      padding: 5px 10px;
      margin-bottom: 8px;
      background: $card;
      border-radius: 8px;
      &:active {
        background: #334155;
      }
    }
    .conn-icon-wrap {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      flex-shrink: 0;
    }
    .conn-info {
      flex: 1;
      margin-left: 10px;
      min-width: 0;
      .conn-title {
        font-size: 15px;
        font-weight: 500;
        color: $text-main;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .conn-state {
        font-size: 12px;
        color: $text-sub;
        margin-top: 2px;
      }
    }
    .conn-arrow {
      color: $text-sub;
      flex-shrink: 0;
    }
    .port-forward-list {
      .port-forward-item {
        display: flex;
        align-items: center;
        gap: 4px;
        .pf-text {
          font-size: 8px;
          color: #409EFF;
          font-family: monospace;
        }
      }
    }
    .sftp-indicator {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      .sftp-text {
        font-size: 8px;
        color: #67C23A;
      }
    }
    .serial-indicator {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      .serial-text {
        font-size: 8px;
        color: #E6A23C;
      }
    }
  }

  /* 配置页面布局 */
  .mobile-setting {
    max-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 80px);
    overflow: scroll;
  }
}

.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.tabbar {
  flex-shrink: 0;
  height: 60px;
  display: flex;
  background: #020617;
  border-top: 1px solid #1e293b;
  transition: height 0.2s;

  &.hidden {
    height: 0;
    overflow: hidden;
    border-top: none;
  }

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: $text-sub;

    &.active {
      color: $text-main;
      background: #252d3a;
    }

    span {
      font-size: 0.7rem;
    }
  }
}

// Monitor inline panel styles
.monitor-panel {
  position: fixed;
  bottom: env(safe-area-inset-bottom);
  left: 0;
  right: 0;
  background: $card;
  z-index: 10;
  border-top: 1px solid #1e293b;
  .monitor-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid #1e293b;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    .close-icon {
      font-size: 18px;
      cursor: pointer;
      color: #94a3b8;
      &:hover {
        color: #fff;
      }
    }
  }
}
</style>

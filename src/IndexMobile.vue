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

          <!-- 移动端凭据管理 -->
          <mobile-credential v-else-if="activeTab === 'credential'" />

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
                  <div v-if="item.config?.type === 'serial' && item.state === 1" class="serial-indicator">
                    <el-icon :size="10" color="#E6A23C"><Cpu /></el-icon>
                    <span class="serial-text">Serial</span>
                  </div>
                  <div v-if="item.config?.type === 'ssh' && item.state === 1" class="monitor-indicator">
                    <server-monitor :session-id="item.sessionId"/>
                  </div>
                  <div v-if="item.config?.portForwards?.length" class="port-forward-list">
                    <div v-for="(pf, idx) in item.config.portForwards" :key="idx" class="port-forward-item">
                      <el-icon :size="10" color="#409EFF"><Paperclip /></el-icon>
                      <span class="pf-text">{{ pf.localHost }}:{{ pf.localPort }}→{{ pf.remoteHost }}:{{ pf.remotePort }}</span>
                    </div>
                  </div>
                </div>
                <el-button v-if="item.type === 'connect' && item.state === 1"
                           style="background: none;padding: 15px;"
                           size="small"
                           circle
                           @click.stop="openSftp(item)">
                  <el-icon class="conn-arrow" :size="15"><Folder /></el-icon>
                </el-button>
                <el-button style="background: none;padding: 15px;"
                           size="small"
                           circle
                           @click.stop="closeConn(item)">
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
      <mobile-terminal v-show="activeTab === 'conn' && showTerminal"
                       ref="mobileTerminal"/>
    </transition>

    <footer class="tabbar">
      <div class="tab" @click="toggleTab('host')" :class="{active : activeTab === 'host'}">
        <el-icon :size="20"><Platform /></el-icon>
        <span>{{ $t('main.host') }}</span>
      </div>
      <div class="tab" @click="toggleTab('credential')" :class="{active : activeTab === 'credential'}">
        <el-icon :size="20"><Key /></el-icon>
        <span>{{ $t('main.credential') }}</span>
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
import MobileTerminal from "@/mobile/MobileTerminal.vue";
import MobileHost from "@/mobile/MobileHost.vue";
import MobileCredential from "@/mobile/MobileCredential.vue";
import MobileSetting from "@/mobile/MobileSetting.vue";
import ServerMonitor from "@/subs/ServerMonitor.vue";
import {useTabsStore} from "@/store.js";
import {onBackButtonPress} from "@tauri-apps/api/app";
import {isMobile} from "@/commons.js";
import {exit} from "@tauri-apps/plugin-process";
import {Loading, Link, CircleCloseFilled, Connection, Files, ArrowRight, Paperclip, Folder, Cpu, Key} from "@element-plus/icons-vue";
import {ElMessageBox} from "element-plus";

export default {
  name: "IndexMobile",
  props: {
    isLoading: false,
  },
  components: {Loading, Link, CircleCloseFilled, Connection, Files, ArrowRight, Paperclip, Folder, Cpu, Key, MobileSetting, MobileHost, MobileCredential, MobileTerminal, ConnectManage, ServerMonitor},
  data() {
    const tabsStore = useTabsStore();
    return {
      activeTab: 'host',
      title: '',
      tabsStore: tabsStore,
      showTerminal: false,
      transitionName: 'slide-left',
      tabIndexMap: { 'host': 0, 'credential': 1, 'conn': 2, 'setting': 3 },
    }
  },
  watch: {
    showTerminal(newVal) {
      if (newVal && this.$refs.mobileTerminal && this.tabsStore.connList.length > 0) {
        // 激活时设置当前连接为列表中最后一个
        const lastConn = this.tabsStore.connList[this.tabsStore.connList.length - 1]
        this.$refs.mobileTerminal.setActiveConn(lastConn.id)
      }
    },
  },
  mounted() {
    this.toggleTab('host')
    this.$bus.on('mobile-connect-ssh', (config) => {
      this.toggleTab('conn')
      this.tabsStore.connectConfig(config, 'connect')
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
        this.$refs.hostMng.onBackButtonPress().then(rv => {
          if (rv) {
            this.$confirm("确认退出？", {showClose: false}).then(() => {
              exit(0)
            }).catch(() => {})
          }
        })
      } else if (this.activeTab === 'conn'){
        if (this.showTerminal) {
          // 从终端页面返回，先回到连接列表
          this.$refs.mobileTerminal.onBackButtonPress().then(rv => {
            if (rv) {
              this.showTerminal = false
            }
          })
        } else {
          // 从连接列表返回到主机列表
          this.toggleTab('host')
          this.showTerminal = false
        }
      } else if (this.activeTab === 'credential') {
        // 从凭据管理返回到主机列表
        this.toggleTab('host')
      } else {
        this.toggleTab('host')
      }
    },
    toggleTab: function (to) {
      const titleMap = {
        'host': "main.host",
        'credential': "main.credential",
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
      // 设置当前激活的连接
      this.$nextTick(() => {
        if (this.$refs.mobileTerminal) {
          this.$refs.mobileTerminal.setActiveConn(item.id)
        }
      })
    },
    openSftp(item) {
      if (item.state === 1 && item.type === 'connect') {
        // 移动端需要手动点击SFTP按钮才显示，不默认显示
        this.showTerminal = true;
        this.$nextTick(() => {
          if (this.$refs.mobileTerminal) {
            this.$refs.mobileTerminal.setActiveConn(item.id);
            this.tabsStore.setShowSftp(item.id, true);
          }
        });
      }
    },
  }
};
</script>

<style lang="scss" scoped>
.hosts-page {
  position: fixed;
  top: env(safe-area-inset-top);
  bottom: env(safe-area-inset-bottom);
  left: 0;
  right: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
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
  background: var(--bg-header-start);
  border-bottom: 1px solid var(--border-color);
  position: relative;
  z-index: 10;

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
    color: var(--text-primary);
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
    color: var(--text-secondary);
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
      color: var(--text-secondary);
      font-size: 16px;
    }
    .conn-list-scroll {
      flex: 1;
      padding: 12px 16px;
    }
    .conn-item {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      margin-bottom: 12px;
      background: var(--bg-card);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

      &:active {
        background: var(--bg-active);
        transform: scale(0.98);
      }
    }
    .conn-icon-wrap {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-hover);
      border-radius: 12px;
      flex-shrink: 0;
      border: 1px solid var(--border-color-light);
    }
    .conn-info {
      flex: 1;
      margin-left: 14px;
      min-width: 0;
      .conn-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      .conn-state {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 2px;
      }
    }
    .conn-arrow {
      color: var(--text-secondary);
      flex-shrink: 0;
      padding: 8px;
      border-radius: 50%;
      transition: all 0.2s ease;

      &:active {
        background: var(--bg-hover);
        color: var(--color-error);
      }
    }
    .port-forward-list {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      .port-forward-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(64, 158, 255, 0.15);
        border-radius: 6px;
        border: 1px solid rgba(64, 158, 255, 0.25);
        .pf-text {
          font-size: 10px;
          color: #409EFF;
          font-family: monospace;
        }
      }
    }
    .sftp-indicator {
      margin-top: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: rgba(34, 197, 94, 0.15);
      border-radius: 6px;
      border: 1px solid rgba(34, 197, 94, 0.25);
      .sftp-text {
        font-size: 10px;
        font-weight: 500;
        color: #67C23A;
      }
    }
    .serial-indicator {
      margin-top: 6px;
      margin-left: 6px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: rgba(230, 162, 60, 0.15);
      border-radius: 6px;
      border: 1px solid rgba(230, 162, 60, 0.25);
      .serial-text {
        font-size: 10px;
        font-weight: 500;
        color: #E6A23C;
      }
    }
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
  height: 65px;
  display: flex;
  background: var(--bg-header-start);
  border-top: 1px solid var(--border-color);
  padding-bottom: env(safe-area-inset-bottom);
  transition: height 0.2s;
  position: relative;

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
    color: var(--text-muted);
    position: relative;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%) scaleX(0);
      width: 40px;
      height: 3px;
      background: var(--gradient-active);
      border-radius: 2px;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    &.active {
      color: var(--color-primary);
      transform: translateY(-2px);

      &::before {
        transform: translateX(-50%) scaleX(1);
      }

      :deep(.el-icon) {
        filter: drop-shadow(0 0 8px var(--color-primary-light));
      }
    }

    &:active {
      transform: scale(0.95);
    }

    span {
      font-size: 0.7rem;
      margin-top: 4px;
      opacity: 0.9;
    }

    :deep(.el-icon) {
      transition: all 0.25s ease;
    }
  }
}

// Monitor inline panel styles
.monitor-panel {
  position: fixed;
  bottom: env(safe-area-inset-bottom);
  left: 0;
  right: 0;
  background: var(--bg-card);
  z-index: 10;
  border-top: 1px solid #1e293b;
  .monitor-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-color);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    .close-icon {
      font-size: 18px;
      cursor: pointer;
      color: var(--text-muted);
      &:hover {
        color: var(--text-primary);
      }
    }
  }
}
</style>

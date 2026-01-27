<template>
  <div class="hosts-page">
    <header v-if="!titleHidden" class="header">
      <div class="left">
        <span class="title"></span>
      </div>
      <div class="center">{{ title }}</div>
      <div class="right">
      </div>
    </header>

    <main class="content">
      <mobile-host v-show="activeTab === 'host'" ref="hostMng"/>

      <terminal-tabs v-show="activeTab === 'conn'" :active="activeTab === 'conn'"/>

      <mobile-setting v-show="activeTab === 'setting'"/>
    </main>

    <footer class="tabbar" v-if="!titleHidden">
      <div class="tab" @click="toggleTab('host')" :class="{active : activeTab === 'host'}">
        <el-icon :size="20"><Platform /></el-icon>
        <span>主机</span>
      </div>
      <div class="tab" @click="toggleTab('conn')" :class="{active : activeTab === 'conn'}">
        <el-icon :size="20"><Connection /></el-icon>
        <span>连接</span>
      </div>
      <div class="tab" @click="toggleTab('setting')" :class="{active : activeTab === 'setting'}">
        <el-icon :size="20"><SetUp /></el-icon>
        <span>设置</span>
      </div>
    </footer>
  </div>
</template>

<script>
import {
  checkBatteryOptimizationStatus,
  requestBatteryOptimizationExemption,
} from 'tauri-plugin-android-battery-optimization-api';
import ConnectManage from "./views/ConnectManage.vue";
import TerminalTabs from "./views/TerminalTabs.vue";
import MobileHost from "@/mobile/MobileHost.vue";
import {useTabsStore} from "@/store.js";
import MobileSetting from "@/mobile/MobileSetting.vue";
import {onBackButtonPress} from "@tauri-apps/api/app";
import {isMobile} from "@/commons.js";
import {exit} from "@tauri-apps/plugin-process";

export default {
  name: "IndexMobile",
  components: {MobileSetting, MobileHost, TerminalTabs, ConnectManage},
  data() {
    const tabsStore = useTabsStore();
    return {
      activeTab: 'host',
      title: '', titleHidden: false,
      tabsStore: tabsStore,
    }
  },
  mounted() {
    this.toggleTab('host')
    this.$bus.on('mobile-connect-ssh', (config) => {
      this.toggleTab('conn')
      this.tabsStore.connectConfig(config, 'connect')
      this.titleHidden =
          this.tabsStore.connList.length > 0;
    })
    this.$bus.on('mobile-connect-sftp', (config) => {
      this.toggleTab('conn')
      this.tabsStore.connectConfig(config, 'sftp')
      this.titleHidden =
          this.tabsStore.connList.length > 0;
    })
    this.$bus.on('show-quick-connect', () => {
      this.toggleTab('host')
      this.$nextTick(() => {
        this.$refs.hostMng.handleConnNew()
      })
    })
    this.$bus.on('show-host-list', () => {
      this.toggleTab('host')
    })
    this.$bus.on('tab-only-one', () => {
      this.titleHidden = false
    })

    // 检查电池优化选项
    checkBatteryOptimizationStatus().then(status => {
      if (status.isOptimized) {
        requestBatteryOptimizationExemption().then(res => {
          console.log('request ok:', res)
        }).catch(err => {
          console.log('request fail:', err)
        })
      }
    })

    if (isMobile()) {
      // 处理安卓端返回事件的支持
      onBackButtonPress(() => {
        if (this.activeTab === 'host') {
          this.$confirm("确认退出？", {showClose: false}).then(() => {
            exit(0)
          }).catch(() => {})
        } else {
          this.toggleTab('host')
        }
      })
    }

    //TODO 测试代码
    // this.toggleTab('setting')
  },
  methods: {
    toggleTab: function (to) {
      const titleMap = {
        'host': "主机",
        'conn': "连接",
        'setting': "设置",
      }
      this.activeTab = to
      this.title = titleMap[to]
      this.titleHidden = false
      if (to === 'conn') {
        // 有连接时隐藏全部信息
        this.titleHidden =
            this.tabsStore.connList.length > 0;
      }
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
  height: 100vh;
  background: $bg;
  color: $text-main;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Header */
.header {
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

/* Content */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;

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

}

/* Tabbar */
.tabbar {
  height: 64px;
  display: flex;
  background: #020617;
  border-top: 1px solid #1e293b;

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: $text-sub;

    &.active {
      color: $text-main;
      background: #0b1220;
    }
    span {
      font-size: 0.7rem;
    }
  }
}
</style>

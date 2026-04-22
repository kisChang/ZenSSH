<template>
  <div class="container">
    <el-config-provider :locale="locale">
      <index-mobile v-if="isMobile"
                    :is-loading="isLoading"/>
      <index-pc v-else-if="isPc"
                :is-loading="isLoading"/>
    </el-config-provider>
  </div>
</template>

<script>
import {listen} from '@tauri-apps/api/event'
import {appConfigStore, appRunState, useMngStore} from "@/store.js";
import IndexMobile from "@/IndexMobile.vue";
import IndexPc from "@/IndexPc.vue";
import {isMobile} from "@/commons.js";
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

export default {
  name: "Tauri",
  components: {IndexMobile, IndexPc},
  data() {
    return {
      isLoading: true, locale: zhCn,

      asideSize: 200,
      activeMenu: "",
      isMobile: false, isPc: false,
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
          this.notify({message: "务必设置密钥才可以使用本程序！", type: "warning", zIndex: 19999});
          continue;
        }
        await appRunState().keyringSet(setPass.value)
      } else {
        // 密钥处理成功后跳出
        break;
      }
    }

    // 国际化初始化
    this.loadI18n()
    this.$bus.on('change-i18n', () => {
      this.loadI18n()
    })

    // 检查设备类型
    if (isMobile()) {
      this.isMobile = true
      this.asideSize = 0;
    } else {
      this.isPc = true;
    }
    await this.$nextTick();

    // Rust 后端 全局事件监听
    listen("ssh_close", event => {
      const {session_id, exit_status} = event.payload;
      this.$bus.emit("ssh_close_" + session_id, {session_id, exit_status});
    }).catch()

    this.initAppData().catch(err => {
      this.notify({message: "配置同步失败：" + err, type: "error"})
    }).finally(() => {
      // 推送一次配置信息到后端
      useMngStore().syncConfig();
      // 结束loading
      this.isLoading = false
    })
  },
  methods: {
    loadI18n() {
      this.$i18n.locale = appConfigStore().locale
      this.locale = this.$i18n.locale === "zhCn" ? zhCn : en
    },
    async initAppData() {
      // 加载云端同步数据
      this.isLoading = true
      let res = await appConfigStore().loadByCloud()
      if (res) {
        this.notify({message: "云端数据同步成功", type: "success"})
        this.$forceUpdate()
      }
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

@media (max-width: 768px) {
  .el-notification {
    right: auto !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
  }
}

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
  display: flex;
  flex-direction: column;
  height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom));
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.btn {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: none;
  background: #22c55e;
  color: #052e16;
  font-size: 16px;
  font-weight: 600;
}
</style>

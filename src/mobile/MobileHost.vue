<template>
  <div class="host-content" style="text-align: center;">
    <div v-if="showConnect">
      <el-scrollbar height="80vh">
        <connect-form ref="connectForm" v-model="config" />
        <div style="text-align: center;display: flex;padding: 0 5vw;">
          <button class="btn" style="width: 30%;margin-right: 10px;" @click="showConnect = false">
            <el-icon><DArrowLeft /></el-icon>
          </button>
          <button v-if="config.configId" class="btn" @click="handleUpdateSubmit">
            {{ $t('common.submit') }}
          </button>
          <button v-else class="btn" @click="quickConnect">
            <el-icon><Position /></el-icon>
            {{ config.type === 'serial' ? $t('main.serialConnect') : $t('main.quickConnect') }}
          </button>
        </div>
      </el-scrollbar>
    </div>
    <div v-else-if="configList.length" style="text-align: center;">
      <el-scrollbar class="config-list">
        <div v-for="once of configList"
             class="config-item"
             @click="handleClickConfig(once)"
             :key="once.host">
          <div class="title">{{ once.name }}</div>
          <div class="subtitle">
            <el-icon v-if="once.isCloud" color="#22c55e"><UploadFilled /></el-icon>
            <template v-if="once.type === 'serial'">
              Serial: {{ once.portName }} @ {{ once.baudRate }}
            </template>
            <template v-else>
              {{ once.username }}@{{ once.host }}
            </template>
          </div>
        </div>
      </el-scrollbar>
    </div>
    <div v-else style="text-align: center;">
      <img class="app-icon" src="/logo.png" />

      <h2>{{ $t('main.quickConnect') }}</h2>
      <p class="desc" v-html="$t('common.hello')"></p>

      <button class="btn" style="width: 70%;" @click="handleConnNew">{{ $t('main.connectNow') }}</button>
    </div>

    <div v-if="!showConnect" class="fab" @click="handleConnNew">+</div>

    <el-drawer v-model="showDrawer" direction="btt" :with-header="false" size="25%" body-class="pop-drawer">
      <template #default>
        <div class="btn-list">
          <el-alert :title="$t('main.quickConnect')" type="primary" show-icon :closable="false" @click="handleConnConf">
            <template #icon><Connection /></template>
          </el-alert>
          <el-alert title="文件管理" type="primary" show-icon :closable="false" @click="handleConnSftp">
            <template #icon><Files /></template>
          </el-alert>
          <el-alert title="更新配置" type="primary" show-icon :closable="false" @click="handleUpdateConf">
            <template #icon><Edit /></template>
          </el-alert>
          <el-alert title="删除" type="warning" show-icon :closable="false" @click="handleDeleteConf"/>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script>
import ConnectForm, {DEFAULT_CONFIG} from "@/subs/ConnectForm.vue";
import {useMngStore} from "@/store.js";

export default {
  name: "MobileHost",
  components: {ConnectForm},
  data() {
    const appMng = useMngStore();
    const defaultConfig = Object.assign({}, DEFAULT_CONFIG);
    return {
      appMng: appMng,
      showConnect: false,
      configAdd: true,
      config: defaultConfig,
      showDrawer: false,
    }
  },
  computed: {
    configList() {
      return this.appMng.configList
    }
  },
  methods: {
    handleConnNew() {
      this.config = Object.assign({}, DEFAULT_CONFIG);
      this.showConnect = true
    },
    handleClickConfig(conf) {
      this.showDrawer = true
      this.config = conf
    },
    handleUpdateSubmit() {
      this.$refs.connectForm.valid(() => {
        this.showConnect = false
        this.appMng.updateConfig(this.config)
      })
    },
    handleConnConf(){
      this.showDrawer = false
      this.$bus.emit('mobile-connect-ssh', this.config)
    },
    handleConnSftp(){
      this.showDrawer = false
      this.$bus.emit('mobile-connect-sftp', this.config)
    },
    handleUpdateConf(){
      this.showConnect = true
      this.showDrawer = false
      this.config = Object.assign({passwordNew: "***************"}, this.config)
    },
    handleDeleteConf(){
      this.showDrawer = false
      this.$confirm("确认删除配置信息？", {showClose: false}).then(rv => {
        if (rv === 'confirm') {
          this.appMng.removeConfig(this.config.configId)
        }
      }).catch()
    },
    quickConnect(){
      this.$refs.connectForm.valid(() => {
        this.showConnect = false
        this.appMng.addConfig(this.config, false)
        // 跳转到连接
        this.$bus.emit('mobile-connect-ssh', this.config)
      })
    },
  }
}
</script>

<style scoped lang="scss">
$green: #22c55e;

.host-content {
  width: 100vw;
  :deep(.conn-form) {
    width: 90%;
  }

  .config-list {
    padding: 0 10px;
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 130px);
    user-select: none;
    .config-item:first-child {
      border-top: 1px solid #686868;
    }
    .config-item {
      text-align: left;
      padding: 5px 10px;
      border-bottom: 1px solid #686868;
      &:active {
        background: #3d3d3d;
      }

      .title {
        font-size: 1.2rem;
        margin-top: 5px;
      }
      .subtitle {
        font-size: 0.9rem;
        color: #bebebe;
      }
    }
  }
}

/* Icon */
.app-icon {
  width: 80px;
  height: 80px;
}

.discover {
  margin-top: 20px;
  color: $green;
  font-size: 14px;
}

/* Floating button */
.fab {
  position: absolute;
  right: 20px;
  bottom: 96px;
  width: 56px;
  height: 56px;
  background: $green;
  color: #052e16;
  border-radius: 50%;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

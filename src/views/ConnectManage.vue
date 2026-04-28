<template>
  <div class="menu">
    <div v-if="configList.length > 0">
      <div v-for="once of configList"
           @dblclick="configReConnect(once)"
           class="config-item"
           @contextmenu="handleContextmenu($event, once)"
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
    </div>
    <div style="padding-top: 10px;text-align: center;">
      <el-button @click="showConnectAdd" type="primary">{{ $t('main.quickConnect') }}</el-button>
    </div>

    <el-dialog
        v-model="showConnect"
        :title="(configAdd ? $t('common.create') : $t('common.update')) + (config.type === 'serial' ? $t('connect.typeSerial') : ' ' + $t('main.conn'))"
        :close-on-click-modal="false"
        :close-on-press-escape="false"
        top="5vh"
        modal-class="app-dialog">
      <connect-form ref="connectForm" v-model="config" :is-edit="!configAdd" />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showConnect = false">{{ $t('common.cancel') }}</el-button>
          <el-button v-if="configAdd" type="primary" @click="quickConnect">
            {{ config.type === 'serial' ? $t('main.serialConnect') : $t('main.quickConnect') }}
          </el-button>
          <el-button v-else type="primary" @click="saveConfig">
            {{ $t('common.submit') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

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
            <el-dropdown-item @click="dropdownConnect">{{ $t('main.quickConnect') }}</el-dropdown-item>
          <el-dropdown-item @click="dropdownConnectSftp">{{ $t('sftp.main') }}</el-dropdown-item>
          <el-dropdown-item @click="dropdownShowConfig">{{ $t('main.setting') }}</el-dropdown-item>
          <el-dropdown-item @click="dropdownRemove">{{ $t('common.delete') }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script>
import ConnectForm, {DEFAULT_CONFIG} from "@/subs/ConnectForm.vue";
import {useMngStore, useTabsStore} from "@/store.js";
import {isMobile} from "@/commons.js";

export default {
  name: "ConnectManage",
  components: {ConnectForm},
  data() {
    const appMng = useMngStore();
    const defaultConfig = Object.assign({}, DEFAULT_CONFIG);
    return {
      isMobile: false,
      appMng: appMng,
      showConnect: false,
      configAdd: true,

      triggerRef: {
        getBoundingClientRect: () => (DOMRect.fromRect()),
      },
      triggerConfig: null,
      config: defaultConfig,
    }
  },
  computed: {
    configList() {
      return this.appMng.configList
    }
  },
  mounted() {
    if (isMobile()) {
      this.isMobile = true
    }
    this.$bus.on('show-quick-connect', () => {
      this.showConnectAdd()
    })
  },
  methods: {
    showConnectAdd(){
      this.config = Object.assign({}, DEFAULT_CONFIG)
      this.showConnect = true
      this.configAdd = true
    },
    quickConnect(){
      this.$refs.connectForm.valid(() => {
        this.showConnect = false
        this.appMng.addConfig(this.config, true)
      })
    },
    configReConnect(config){
      useTabsStore().connectConfig(config, 'connect')
    },

    dropdownConnect() {
      this.configReConnect(this.triggerConfig)
    },
    dropdownConnectSftp() {
      useTabsStore().connectConfig(this.triggerConfig, 'sftp')
    },
    dropdownShowConfig() {
      this.showConnect = true
      this.configAdd = false
      this.$nextTick(() => {
        this.config = Object.assign({passwordNew: "***************"}, this.triggerConfig)
      })
    },
    dropdownRemove() {
      this.$confirm(this.$t('main.confirmDelete'), {showClose: false}).then(() => {
        this.appMng.removeConfig(this.triggerConfig.configId)
        this.notify({
          type: 'success',
          message: this.$t('common.success'),
        })
      }).catch(() => {})
    },
    saveConfig() {
      this.$refs.connectForm.valid(() => {
        this.appMng.updateConfig(this.config)
        this.showConnect = false
        this.configAdd = true
      })
    },
    handleContextmenu(event, config) {
      const { clientX, clientY } = event
      this.triggerRef.getBoundingClientRect = () => (DOMRect.fromRect({
        x: clientX,
        y: clientY,
      }))
      event.preventDefault()
      this.$refs.dropdownRef.handleOpen()
      this.triggerConfig = config
    },
  }
}
</script>

<style scoped lang="scss">
@media (max-width: 768px) {
  :deep(.el-dialog) {
    width: 90% !important;
  }
}

.config-item {
  padding: 3px 10px 0;
  border-bottom: 1px solid #DDD;
  cursor: pointer;
  .title {
    font-size: 1.1rem;
    line-height: 1.5rem;
  }
  .subtitle {
    font-size: 0.8rem;
    :deep(.el-icon svg) {
      width: 10px;
      height: 10px;
    }
  }
  &:hover {
    .title, .subtitle {
      color: var(--el-color-primary);
    }
  }
}
.menu {
  background: #333;
  height: 100%;
}
</style>

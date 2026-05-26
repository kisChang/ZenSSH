<template>
  <div class="menu">
    <draggable
        v-if="configList.length > 0"
        v-model="configListModel"
        item-key="configId"
        animation="200"
        ghost-class="ghost"
        drag-class="drag"
        chosen-class="chosen"
        :force-fallback="true">
      <template #item="{ element }">
        <div class="config-item" @dblclick.stop="configReConnect(element)" @contextmenu.stop="handleContextmenu($event, element)">
          <div class="title">{{ element.name }}</div>
          <div class="subtitle">
            <el-icon v-if="element.isCloud" color="#22c55e">
              <UploadFilled/>
            </el-icon>
            <template v-if="element.type === 'serial'">
              Serial: {{ element.portName }} @ {{ element.baudRate }}
            </template>
            <template v-else>
              {{ element.username }}@{{ element.host }}
            </template>
          </div>
        </div>
      </template>
    </draggable>
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
import draggable from "vuedraggable";

export default {
  name: "ConnectManage",
  components: {ConnectForm, draggable},
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
      return this.appMng.sortedConfigList
    },
    configListModel: {
      get() {
        return this.appMng.sortedConfigList
      },
      set(newList) {
        console.log('[ConnectManage] configListModel setter called:', newList.map(c => c.name))
        this.appMng.reorderConfig(newList.map(c => c.configId))
      }
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
@import "../styles/variables.scss";

@media (max-width: 768px) {
  :deep(.el-dialog) {
    width: 90% !important;
  }
}

.config-item {
  padding: 5px;
  margin: 6px;
  border-radius: 8px;
  background: linear-gradient(145deg, $bg-card 0%, darken($bg-card, 5%) 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  user-select: none;
  cursor: grab;
  transition: all 0.25s ease;
  &:hover {
    background: linear-gradient(145deg, lighten($bg-card, 5%) 0%, $bg-card 100%);
    border-color: $border-color-active;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
    transform: translateY(-1px);
    .title {
      color: $color-primary;
    }
    .subtitle {
      color: rgba(255, 255, 255, 0.8);
    }
  }
  &.ghost {
    opacity: 0.5;
    background-color: darken($bg-card, 5%);
  }
  &.drag {
    opacity: 0.9;
    background-color: darken($bg-card, 10%);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  &.chosen {
    opacity: 0.8;
    background-color: darken($bg-card, 15%);
  }
  .title {
    font-size: 14px;
    font-weight: 500;
    color: $text-primary;
    line-height: 1.5;
    margin-bottom: 4px;
    transition: color 0.2s ease;
  }
  .subtitle {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    transition: color 0.2s ease;
    :deep(.el-icon svg) {
      width: 12px;
      height: 12px;
      vertical-align: -2px;
    }
  }
}
.menu {
  height: 100%;
  padding-top: 8px;
}

:deep(.el-button--primary) {
  background: $btn-primary-bg;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  transition: all 0.2s ease;
  &:hover {
    background: $btn-primary-hover;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
    transform: translateY(-1px);
  }
}
</style>

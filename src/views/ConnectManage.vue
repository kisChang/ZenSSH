<template>
  <div class="menu">
    <div v-if="configList.length > 0">
      <div v-for="once of configList"
           @dblclick="configReConnect(once)"
           class="config-item"
           @contextmenu="handleContextmenu($event, once)"
           :key="once.host">
        <div class="title">{{ once.name }}</div>
      </div>
    </div>
    <div style="padding-top: 10px;text-align: center;">
      <el-button @click="showConnectAdd" type="primary">立即连接</el-button>
    </div>

    <el-dialog
        v-model="showConnect"
        :title="configAdd ? '创建连接' : '编辑连接'"
        modal-class="app-dialog">
      <connect-form v-model="config" />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showConnect = false">取消</el-button>
          <el-button v-if="configAdd" type="primary" @click="quickConnect">
            立即连接
          </el-button>
          <el-button v-else type="primary" @click="saveConfig">
            更新配置
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
          <el-dropdown-item @click="dropdownConnect">连接</el-dropdown-item>
          <el-dropdown-item @click="dropdownConnectSftp">文件管理</el-dropdown-item>
          <el-dropdown-item @click="dropdownShowConfig">配置</el-dropdown-item>
          <el-dropdown-item @click="dropdownRemove">删除</el-dropdown-item>
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
      this.showConnect = false
      this.appMng.addConfig(this.config, true)
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
      this.$confirm("确定删除此配置？", {showClose: false}).then(() => {
        this.appMng.removeConfig(this.triggerConfig.configId)
        this.notify({
          type: 'success',
          message: '已删除配置',
        })
      }).catch(() => {})
    },
    saveConfig() {
      this.appMng.updateConfig(this.config)
      this.showConnect = false
      this.configAdd = true
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
  ::v-deep(.el-dialog) {
    width: 90% !important;
  }
}

.config-item {
  padding: 3px 10px;
  border-bottom: 1px solid #DDD;
  cursor: pointer;
  .title {
    font-size: 1rem;
    line-height: 1.5rem;
    &:hover {
      color: var(--el-color-primary);
    }
  }
  .tag {
    font-size: 0.7rem;
    line-height: 1rem;
    color: var(--el-color-primary-dark-2);
  }
}
.menu {
  background: #333;
  height: 100%;
}
</style>

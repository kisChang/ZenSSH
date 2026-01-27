<template>
  <div class="content" style="text-align: center;">
    <div v-if="showConnect">
      <connect-form v-model="config" />
      <div style="text-align: center;display: flex;padding: 0 5vw;">
        <button class="btn" style="width: 30%;margin-right: 10px;" @click="showConnect = false">
          <el-icon><DArrowLeft /></el-icon>
        </button>
        <button v-if="config.configId" class="btn" @click="handleUpdateSubmit">
          保存配置
        </button>
        <button v-else class="btn" @click="quickConnect">
          <el-icon><Position /></el-icon>
          立即连接
        </button>
      </div>
    </div>
    <div v-else-if="configList.length" style="text-align: center;">
      <img class="app-icon" src="/logo.png" style="margin-top: 0; width: 50px;"/>
      <div class="config-list">
        <div v-for="once of configList"
             class="config-item"
             @click="handleClickConfig(once)"
             :key="once.host">
          <div class="title">{{ once.name }}</div>
          <div class="subtitle">{{ once.username }}@{{ once.host }}</div>
        </div>
      </div>
    </div>
    <div v-else style="text-align: center;">
      <img class="app-icon" src="/logo.png" />

      <h2>连接主机</h2>
      <p class="desc">
        将您的连接详细信息保存为主机名，<br/>
        即可一键连接。
      </p>

      <button class="btn" style="width: 70%;" @click="handleConnNew">开始连接</button>
    </div>

    <div v-if="!showConnect" class="fab" @click="handleConnNew">+</div>

    <el-drawer v-model="showDrawer" direction="btt" :with-header="false" size="25%" body-class="pop-drawer">
      <template #default>
        <div class="btn-list">
          <el-alert title="立即连接" type="primary" show-icon :closable="false" @click="handleConnConf">
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
import {Files} from "@element-plus/icons-vue";

export default {
  name: "MobileHost",
  components: {Files, ConnectForm},
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
      this.showConnect = false
      this.appMng.updateConfig(this.config)
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
      this.showConnect = false
      this.appMng.addConfig(this.config, true)
      // 跳转到连接
      this.$bus.emit('mobile-connect-ssh', this.config)
    },
  }
}
</script>

<style scoped lang="scss">
$green: #22c55e;

.content {
  width: 100vw;
  ::v-deep(.conn-form) {
    width: 90%;
  }

  .config-list {
    padding: 0 10px;
    .config-item:first-child {
      border-top: 1px solid #aeaeae;
    }
    .config-item {
      text-align: left;
      padding: 5px 10px;
      border-bottom: 1px solid #aeaeae;
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
  margin-top: 15vh;
  width: 100px;
  height: 100px;
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

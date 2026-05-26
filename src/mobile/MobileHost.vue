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
        <draggable
          v-model="configListModel"
          item-key="configId"
          animation="200"
          ghost-class="ghost"
          drag-class="drag"
          chosen-class="chosen"
          :force-fallback="true"
          handle=".drag-handle"
        >
          <template #item="{ element }">
            <div class="config-item">
              <div class="drag-handle" @click.stop>
                <el-icon><Rank /></el-icon>
              </div>
              <div class="item-content" @click.stop="handleClickConfig(element)">
                <div class="title">{{ element.name }}</div>
                <div class="subtitle">
                  <el-icon v-if="element.isCloud" color="#22c55e"><UploadFilled /></el-icon>
                  <template v-if="element.type === 'serial'">
                    Serial: {{ element.portName }} @ {{ element.baudRate }}
                  </template>
                  <template v-else>
                    {{ element.username }}@{{ element.host }}
                  </template>
                </div>
              </div>
            </div>
          </template>
        </draggable>
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
import draggable from "vuedraggable";

export default {
  name: "MobileHost",
  components: {ConnectForm, draggable},
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
      return this.appMng.sortedConfigList
    },
    configListModel: {
      get() {
        return this.appMng.sortedConfigList
      },
      set(newList) {
        this.appMng.reorderConfig(newList.map(c => c.configId))
      }
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
$bg: #0f172a;
$card: #1e293b;
$text-main: #ffffff;
$text-sub: #94a3b8;

.host-content {
  width: 100vw;
  :deep(.conn-form) {
    width: 90%;
  }

  .config-list {
    padding: 12px 16px;
    height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 130px);
    user-select: none;

    .config-item {
      display: flex;
      align-items: center;
      text-align: left;
      padding: 16px;
      margin-bottom: 12px;
      background: linear-gradient(135deg, $card 0%, rgba(30, 41, 59, 0.8) 100%);
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(180deg, $green 0%, rgba(34, 197, 94, 0.3) 100%);
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      &:active {
        background: linear-gradient(135deg, #334155 0%, rgba(51, 65, 85, 0.9) 100%);
        transform: scale(0.98);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

        &::before {
          opacity: 1;
        }
      }

      &.ghost {
        opacity: 0.4;
        background: rgba(30, 41, 59, 0.6);
        border: 1px dashed rgba(255, 255, 255, 0.2);
        box-shadow: none;
      }

      &.drag {
        opacity: 0.95;
        background: linear-gradient(135deg, #334155 0%, rgba(51, 65, 85, 0.95) 100%);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        transform: rotate(2deg) scale(1.02);
      }

      &.chosen {
        opacity: 0.9;
        background: linear-gradient(135deg, #3d4f63 0%, rgba(61, 79, 99, 0.9) 100%);
        border: 1px solid rgba(34, 197, 94, 0.3);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      }

      .title {
        font-size: 1.1rem;
        font-weight: 600;
        color: $text-main;
        margin-bottom: 6px;
        letter-spacing: 0.3px;
      }

      .subtitle {
        font-size: 0.85rem;
        color: $text-sub;
        display: flex;
        align-items: center;
        gap: 6px;

        .el-icon {
          flex-shrink: 0;
        }
      }

      .drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        cursor: grab;
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
        margin-left: 4px;
        order: 1;

        &:active {
          cursor: grabbing;
          color: $green;
        }

        .el-icon {
          font-size: 14px;
        }
      }
      .item-content {
        flex: 1;
        min-width: 0;
        padding: 4px 0;

        .title {
          font-size: 1.1rem;
          font-weight: 600;
          color: $text-main;
          margin-bottom: 6px;
          letter-spacing: 0.3px;
        }

        .subtitle {
          font-size: 0.85rem;
          color: $text-sub;
          display: flex;
          align-items: center;
          gap: 6px;

          .el-icon {
            flex-shrink: 0;
          }
        }
      }
    }
  }
}

/* Icon */
.app-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.discover {
  margin-top: 20px;
  color: $green;
  font-size: 14px;
}

/* Floating button */
.fab {
  position: absolute;
  right: 24px;
  bottom: 100px;
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, $green 0%, #16a34a 100%);
  color: #052e16;
  border-radius: 50%;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:active {
    transform: scale(0.9);
    box-shadow: 0 2px 10px rgba(34, 197, 94, 0.3);
  }
}

/* Pop drawer */
:deep(.pop-drawer) {
  background: linear-gradient(180deg, $bg 0%, darken($bg, 3%) 100%) !important;
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 20px;

  .btn-list {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .el-alert {
      border-radius: 12px;
      border: none;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:active {
        transform: scale(0.98);
        opacity: 0.9;
      }

      &.el-alert--primary {
        background: linear-gradient(135deg, rgba(64, 158, 255, 0.2) 0%, rgba(64, 158, 255, 0.1) 100%);
        border: 1px solid rgba(64, 158, 255, 0.3);
      }

      &.el-alert--warning {
        background: linear-gradient(135deg, rgba(230, 162, 60, 0.2) 0%, rgba(230, 162, 60, 0.1) 100%);
        border: 1px solid rgba(230, 162, 60, 0.3);
      }
    }
  }
}
</style>

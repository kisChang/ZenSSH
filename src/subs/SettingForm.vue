<template>
  <el-form ref="form"
           :model="settingForm"
           :rules="settingRules"
           label-width="5rem"
           class="setting-form"
           size="large"
           label-suffix=":"
           @submit="false">
    <template v-if="isMobile">
      <h3>虚拟键盘配置：</h3>
      <el-form-item label="震动">
        <el-slider v-model="settingForm.virtualKeyboardVibrate"
                   style="max-width: 80%"
                   @change="testVibrate"
                   :show-tooltip="false"
                   :step="5" show-stops :min="0" :max="50" />
        <span v-if="settingForm.virtualKeyboardVibrate > 0" style="margin-left: 15px">{{settingForm.virtualKeyboardVibrate}}ms</span>
        <span v-else style="margin-left: 15px;color: #F40">{{ $t('common.disable') }}</span>
      </el-form-item>
    </template>

    <h3>{{ $t('setting.sync_config') }}</h3>
    <el-form-item :label="$t('setting.syncType')">
      <el-radio-group v-model="settingForm.syncType">
        <el-radio :value="0">{{ $t('common.disable') }}</el-radio>
        <el-radio :value="1">Gitee Gist</el-radio>
        <el-radio :value="2">Github Gist</el-radio>
        <el-radio :value="3">WebDAV</el-radio>
      </el-radio-group>
    </el-form-item>
    <template v-if="settingForm.syncType === 1 || settingForm.syncType === 2">
      <el-form-item :label="$t('setting.gistsAccessToken')" prop="gistsAccessToken">
        <el-input v-model="settingForm.gistsAccessToken" :placeholder="$t('setting.gistsAccessToken_placeholder')" />
      </el-form-item>
      <el-form-item :label="$t('setting.gistsFileId')" prop="gistsFileId">
        <el-input v-model="settingForm.gistsFileId" :placeholder="$t('setting.gistsFileId_placeholder')" />
      </el-form-item>
      <el-form-item :label="$t('setting.gistsLastSync')">
        <div style="display: block;">
          <span v-if="settingForm.gistsFileId && settingForm.gistsLastSync">
            {{ settingForm.gistsLastSync }}
          </span>
          <span v-else>{{ $t('setting.gistsLastSyncNo') }}</span>
        </div>
        <div style="display: block;margin-left: 20px;">
          <el-button :loading="syncConfigLoading" size="default" type="primary" @click="syncConfig">
            {{ $t('setting.syncNow') }}
          </el-button>
        </div>
      </el-form-item>
    </template>
    <template v-if="settingForm.syncType === 3">
      <el-form-item :label="$t('setting.webdavUrl')" prop="webdavUrl">
        <el-input v-model="settingForm.webdavUrl" :placeholder="$t('setting.webdavUrl_placeholder')" />
      </el-form-item>
      <el-form-item :label="$t('setting.webdavUsername')" prop="webdavUsername">
        <el-input v-model="settingForm.webdavUsername" :placeholder="$t('setting.webdavUsername_placeholder')" />
      </el-form-item>
      <el-form-item :label="$t('setting.webdavPassword')" prop="webdavPassword">
        <el-input v-model="settingForm.webdavPassword" type="password" show-password :placeholder="$t('setting.webdavPassword_placeholder')" />
      </el-form-item>
      <el-form-item :label="$t('setting.webdavLastSync')">
        <div style="display: block;">
          <span v-if="settingForm.webdavLastSync">
            {{ settingForm.webdavLastSync }}
          </span>
          <span v-else>{{ $t('setting.webdavLastSyncNo') }}</span>
        </div>
        <div style="display: block;margin-left: 20px;">
          <el-button :loading="syncConfigLoading" size="default" type="primary" @click="syncConfig">
            {{ $t('setting.syncNow') }}
          </el-button>
        </div>
      </el-form-item>
    </template>
    <h3>{{ $t('setting.base_config') }}</h3>
    <el-form-item :label="$t('setting.keyring')">
      <el-button size="default" type="primary" @click="resetKeyring">{{ $t('common.reset') }}</el-button>
    </el-form-item>
    <el-form-item :label="$t('common.lang')">
      <el-select v-model="settingForm.locale">
        <el-option label="简体中文" value="zhCn"></el-option>
        <el-option label="English" value="en"></el-option>
      </el-select>
    </el-form-item>

    <div style="display: inline-block;min-width: 10rem;text-align: center;">
      <div class="btn" @click="handleSave">{{ $t('common.submit') }}</div>
    </div>
  </el-form>
</template>

<script>
import {appConfigStore, appRunState, useMngStore} from "@/store.js";
import {isMobile} from "@/commons.js";
import {relaunch} from "@tauri-apps/plugin-process"
import {vibrate} from "@tauri-apps/plugin-haptics";

export default {
  name: "SettingForm",
  data() {
    let set = appConfigStore();
    return {
      setting: set,
      settingForm: {},
      settingRules: {
        gistsAccessToken: [
          { required: true, message: '请输入授权码', trigger: 'blur' },
        ],
        webdavUrl: [
          { required: true, message: '请输入WebDAV地址', trigger: 'blur' },
        ],
        webdavUsername: [
          { required: true, message: '请输入用户名', trigger: 'blur' },
        ],
        webdavPassword: [
          { required: true, message: '请输入密码', trigger: 'blur' },
        ],
      },
      syncConfigLoading: false,
      isMobile: false,
    }
  },
  mounted() {
    this.isMobile = isMobile()
    this.settingForm = Object.assign({}, this.setting.$state)
  },
  methods: {
    testVibrate(){
      vibrate(this.settingForm.virtualKeyboardVibrate).catch(() => {});
    },

    handleSave(){
      this.$refs.form.validate(valid => {
        if (valid) {
          this.save(() => {
            this.$bus.emit("change-i18n")
            this.notify({message: this.$t('common.success'), type: "success"})
          })
        }
      })
    },
    save(func) {
      this.$refs.form.validate(valid => {
        if (valid) {
          this.setting.saveSetting(this.settingForm)
          this.settingForm = Object.assign({}, this.setting.$state)
          this.$nextTick(() => {
            if (typeof func === "function") {
              func()
            }
          })
        }
      })
    },
    resetKeyring() {
      this.$confirm(this.$t('main.confirmResetKeyring'), {showClose: false}).then(() => {
        appRunState().keyringDelete().then(() => {
          relaunch()
        })
      }).catch(() => {})
    },
    async syncConfig() {
      this.save()
      if (this.setting.syncType === 0) {
        return;
      }
      this.syncConfigLoading = true
      if (this.setting.gistsFileId || this.setting.webdavLastSync) {
        // 先尝试加载云端配置
        try {
          await this.setting.loadByCloud();
        }catch (error) {
          console.error(error);
        }
      }
      this.setting.syncToCloud().then(() => {
        this.notify({message: this.$t('main.syncSuccess'), type: "success"})
        this.settingForm = Object.assign({}, this.setting.$state)
      }).catch(err => {
        this.notify({message: err, type: "error"})
      }).finally(() => {
        this.syncConfigLoading = false
      })
    },
  }
}
</script>

<style scoped lang="scss">
h3 {
  text-align: left;
}
.setting-form{
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }
  :deep(.el-form-item__error) {
    font-size: 10px;
  }
}
</style>

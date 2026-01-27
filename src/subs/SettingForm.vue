<template>
  <el-form ref="form"
           :model="settingForm"
           :rules="settingRules"
           label-width="5rem"
           size="large"
           label-suffix=":"
           @submit="false">
    <template v-if="isMobile">
      <h3>虚拟键盘配置：</h3>
      <el-form-item label="震动">
        <el-slider v-model="setting.virtualKeyboardVibrate"
                   style="max-width: 80%"
                   :show-tooltip="false"
                   :step="5" show-stops :min="0" :max="50" />
        <span v-if="setting.virtualKeyboardVibrate > 0" style="margin-left: 15px">{{setting.virtualKeyboardVibrate}}ms</span>
        <span v-else style="margin-left: 15px;color: #F40">禁用</span>
      </el-form-item>
    </template>

    <h3>配置云同步：</h3>
    <el-form-item label="同步方式">
      <el-radio-group v-model="settingForm.syncType">
        <el-radio :value="0">禁用</el-radio>
        <el-radio :value="1">Gitee Gist</el-radio>
        <el-radio :value="2">Github Gist</el-radio>
      </el-radio-group>
    </el-form-item>
    <template v-if="settingForm.syncType === 1 || settingForm.syncType === 2">
      <el-form-item label="授权码" prop="gistsAccessToken">
        <el-input v-model="settingForm.gistsAccessToken" placeholder="用户授权码" />
      </el-form-item>
      <el-form-item label="配置ID" prop="gistsFileId">
        <el-input v-model="settingForm.gistsFileId" placeholder="配置ID" />
      </el-form-item>
      <el-form-item label="备份状态">
        <div style="display: block;">
          <span v-if="settingForm.gistsFileId && settingForm.gistsLastSync">
            Sync at {{ settingForm.gistsLastSync }}
          </span>
          <span v-else>从未同步</span>
        </div>
        <div style="display: block;margin-left: 20px;">
          <el-button size="default" type="primary" @click="syncConfig">立即同步</el-button>
          <el-button size="default" type="primary" @click="resetKeyring">重置密钥</el-button>
        </div>
      </el-form-item>
    </template>

    <div style="display: inline-block;min-width: 10rem;text-align: center;">
      <div class="btn" @click="handleSave">保存并重载应用</div>
    </div>
  </el-form>
</template>

<script>
import {appConfigStore, appRunState, useMngStore} from "@/store.js";
import {isMobile} from "@/commons.js";
import {relaunch} from "@tauri-apps/plugin-process"

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
      },

      isMobile: false,
    }
  },
  mounted() {
    this.isMobile = isMobile()
    this.settingForm = Object.assign({}, this.setting.$state)
  },
  methods: {
    handleSave(){
      this.$refs.form.validate(valid => {
        if (valid) {
          this.$confirm("确定保存配置并重载（以应用新配置）？", {showClose: false}).then(() => {
            this.save(() => {
              relaunch()
            })
          }).catch(() => {})
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
      this.$confirm("确定重置加密密钥？", {showClose: false}).then(() => {
        appRunState().keyringDelete().then(() => {
          relaunch()
        })
      }).catch(() => {})
    },
    async syncConfig() {
      this.save()
      if (this.setting.syncType == 0) {
        return;
      }
      if (this.setting.gistsFileId) {
        // 先尝试加载最后配置
        try {
          await this.setting.loadByCloud();
        }catch (error) {
          console.error(error);
        }
      }
      let confJson = JSON.stringify(useMngStore().$state)
      this.setting.syncToCloud(confJson).then(() => {
        this.$message({message: "同步成功", type: "success"})
        this.settingForm = Object.assign({}, this.setting.$state)
      }).catch(err => {
        this.$message({message: err, type: "error"})
      })
    },
  }
}
</script>

<style scoped lang="scss">
h3 {
  text-align: left;
}
</style>

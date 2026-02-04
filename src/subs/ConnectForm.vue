<template>
  <el-form ref="form" :model="config" :rules="configRules" label-width="5rem" class="conn-form" size="large" label-suffix=":">
    <el-form-item :label="$t('connect.name')" prop="name">
      <el-input v-model="config.name" :placeholder="$t('connect.name_placeholder')" />
    </el-form-item>
    <el-form-item :label="$t('connect.host')" prop="host">
      <el-input v-model="config.host" :placeholder="$t('connect.host_placeholder')" />
    </el-form-item>
    <el-form-item :label="$t('connect.port')" prop="port">
      <el-input-number v-model="config.port" :min="1" :max="65535" :placeholder="$t('connect.port_placeholder')" style="min-width: 15rem;"/>
    </el-form-item>
    <el-form-item :label="$t('connect.username')" prop="username">
      <el-input v-model="config.username" :placeholder="$t('connect.username_placeholder')" />
    </el-form-item>

    <!-- 认证方式 -->
    <el-form-item :label="$t('connect.authType')">
      <el-radio-group v-model="config.authType" @change="handleAuthTypeChange">
        <el-radio value="password">{{ $t('connect.authType_pw') }}</el-radio>
        <el-radio value="key">{{ $t('connect.authType_key') }}</el-radio>
      </el-radio-group>
    </el-form-item>

    <!-- 密码认证 -->
    <template v-if="config.authType === 'password'">
      <el-form-item v-if="config.configId" :label="$t('connect.password')" prop="password">
        <el-input v-model="config.passwordNew" type="password" :placeholder="$t('connect.passwordNew_placeholder')" show-password />
      </el-form-item>
      <el-form-item v-else :label="$t('connect.password')" prop="password">
        <el-input v-model="config.password" type="password" :placeholder="$t('connect.password_placeholder')" show-password />
      </el-form-item>
    </template>

    <!-- 私钥认证 -->
    <template v-if="config.authType === 'key'">
      <el-form-item :label="$t('connect.privateKeyPath')">
        <el-input v-model="config.privateKeyPath" :placeholder="$t('connect.privateKeyPath_placeholder')" />
      </el-form-item>
      <el-form-item :label="$t('connect.privateKeyData')">
        <el-input
            v-model="config.privateKeyData"
            type="textarea"
            :rows="3"
            :placeholder="$t('connect.privateKeyData_placeholder')"
        />
      </el-form-item>
      <el-form-item :label="$t('connect.keyPassword')">
        <el-input
            v-model="config.keyPassword"
            type="password"
            :placeholder="$t('connect.keyPassword_placeholder')"
            show-password
        />
      </el-form-item>
    </template>

    <el-form-item :label="$t('connect.bastionConfigId')">
      <el-select v-model="config.bastionConfigId"
                 :value-on-clear="''"
                 :placeholder="$t('connect.bastionConfigId_placeholder')"
                 clearable
                 style="width: 100%">
        <el-option
            v-for="sess in filterBastionSessions"
            :key="sess.configId"
            :value="sess.configId"
            :label="sess.name + '(' + sess.username + '@' + sess.host + ')'"
        />
      </el-select>
    </el-form-item>

    <!-- 高级选项 -->
    <el-form-item :label="$t('connect.timeout')">
      <el-input-number v-model="config.timeout" :min="1" :max="300" />
    </el-form-item>
    <el-form-item :label="$t('connect.keepaliveInterval')">
      <el-input-number v-model="config.keepaliveInterval" :min="0" :max="300" />
    </el-form-item>
  </el-form>
</template>

<script>
import {useMngStore} from "@/store.js";

export const DEFAULT_CONFIG = {
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  passwordNew: '',
  privateKeyPath: '',
  privateKeyData: '',
  keyPassword: '',
  timeout: 30,
  keepaliveInterval: 30,
  bastionConfigId: '',
};

export default {
  name: "ConnForm",
  data() {
    return {
      bastionSessions: [],

      configRules: {
        name: [
          { required: true, trigger: 'blur' },
          { min: 3, max: 20, message: this.$t('connect.name_message'), trigger: 'blur' },
        ],
        host: [ { required: true, message: this.$t('connect.host_message'),trigger: 'blur' } ],
        port: [ { required: true, message: this.$t('connect.port_message'),trigger: 'blur' } ],
        username: [ { required: true, message: this.$t('connect.username_message'),trigger: 'blur' } ],
        password: [ { required: true, message: this.$t('connect.password_message'),trigger: 'blur' } ],
      }
    }
  },
  computed: {
    filterBastionSessions() {
      if (this.config?.configId) {
        return this.bastionSessions.filter(x => x.configId !== this.config.configId)
      } else {
        return this.bastionSessions
      }
    },
    config: {
      get() {
        return this.$attrs.modelValue;
      },
      set(val) {
        this.$emit('update:modelValue', val);
      }
    }
  },
  mounted() {
    this.bastionSessions = useMngStore().configList
  },
  methods: {
    valid(func) {
      this.$refs.form.validate(valid => {
        if (valid) {
          func()
        }
      })
    },
    handleAuthTypeChange(val) {
      this.config.authType = val;
      if (val === 'password') {
        this.config.privateKeyPath = '';
        this.config.privateKeyData = '';
        this.config.keyPassword = '';
      } else {
        this.config.password = '';
      }
    },
    reset() {
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      this.config.authType = 'password';
    }
  }
};
</script>

<style scoped lang="scss">
.conn-form {
  display: inline-block;
  :deep(.el-collapse-item__header) {
    padding-left: 10px;
    font-size: 14px;
  }
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }
  :deep(.el-form-item__error) {
    font-size: 10px;
  }
}
</style>

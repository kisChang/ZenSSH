<template>
  <el-form :model="config" :rules="configRules" label-width="5rem" class="conn-form" size="large" label-suffix=":">
    <el-form-item label="名称">
      <el-input v-model="config.name" placeholder="连接名称" />
    </el-form-item>
    <el-form-item label="主机">
      <el-input v-model="config.host" placeholder="主机地址" />
    </el-form-item>
    <el-form-item label="端口">
      <el-input-number v-model="config.port" :min="1" :max="65535" placeholder="22" style="width: 100%"/>
    </el-form-item>
    <el-form-item label="用户名">
      <el-input v-model="config.username" placeholder="用户名" />
    </el-form-item>

    <!-- 认证方式 -->
    <el-form-item label="认证方式">
      <el-radio-group v-model="authType" @change="handleAuthTypeChange">
        <el-radio value="password">密码</el-radio>
        <el-radio value="key">私钥</el-radio>
      </el-radio-group>
    </el-form-item>

    <!-- 密码认证 -->
    <template v-if="authType === 'password'">
      <el-form-item v-if="config.configId" label="密码">
        <el-input v-model="config.passwordNew" type="password" placeholder="更新密码" show-password />
      </el-form-item>
      <el-form-item v-else label="密码">
        <el-input v-model="config.password" type="password" placeholder="密码" show-password />
      </el-form-item>
    </template>

    <!-- 私钥认证 -->
    <template v-if="authType === 'key'">
      <el-form-item label="私钥路径">
        <el-input v-model="config.privateKeyPath" placeholder="私钥文件路径 (~/.ssh/id_rsa)" />
      </el-form-item>
      <el-form-item label="私钥内容">
        <el-input
          v-model="config.privateKeyData"
          type="textarea"
          :rows="3"
          placeholder="直接粘贴私钥内容（优先级高于路径）"
        />
      </el-form-item>
      <el-form-item label="密钥密码">
        <el-input
          v-model="config.keyPassword"
          type="password"
          placeholder="私钥密码（可选）"
          show-password
        />
      </el-form-item>
    </template>

    <el-form-item label="代理会话">
      <el-select v-model="config.bastionConfigId" placeholder="选择代理会话" style="width: 100%">
        <el-option :value="''" label="None">None</el-option>
        <el-option
            v-for="sess in filterBastionSessions"
            :key="sess.configId"
            :value="sess.configId"
            :label="sess.name + '(' + sess.username + '@' + sess.host + ')'"
        />
      </el-select>
    </el-form-item>

    <!-- 高级选项 -->
    <el-form-item label="超时(秒)">
      <el-input-number v-model="config.timeout" :min="1" :max="300" />
    </el-form-item>
    <el-form-item label="保活间隔">
      <el-input-number v-model="config.keepaliveInterval" :min="0" :max="300" />
    </el-form-item>
  </el-form>
</template>

<script>
import {useMngStore} from "@/store.js";

export const DEFAULT_CONFIG = {
  name: "新连接",
  host: '',
  port: 22,
  username: '',
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
      authType: 'password',
      bastionSessions: [],

      configRules: {
        name: [
          { required: true, message: '请输入配置名称', trigger: 'blur' },
          { min: 3, max: 20, message: '名称长度限制在3-20字符', trigger: 'blur' },
        ],
        host: [ { required: true, message: '请输入主机地址',trigger: 'blur' } ],
        port: [ { required: true, message: '请输入SSH端口',trigger: 'blur' } ],
        username: [ { required: true, message: '请输入授权账号名',trigger: 'blur' } ],
        password: [ { required: true, message: '请输入密码',trigger: 'blur' } ],
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
    handleAuthTypeChange(val) {
      if (val === 'password') {
        this.config.privateKeyPath = '';
        this.config.privateKeyData = '';
        this.config.keyPassword = '';
      } else {
        this.config.password = '';
      }
    },
    reset() {
      this.authType = 'password';
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  }
};
</script>

<style scoped lang="scss">
.conn-form {
  :deep(.el-collapse-item__header) {
    padding-left: 10px;
    font-size: 14px;
  }
  :deep(.el-form-item) {
    margin-bottom: 12px;
  }
}
</style>

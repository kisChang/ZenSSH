<template>
  <el-form ref="form" :model="config" :rules="configRules" label-width="5rem" class="conn-form" size="large" label-suffix=":">
    <!-- 连接类型选择（仅新建时显示） -->
    <el-form-item :label="$t('connect.type')" prop="type" v-if="!isEdit">
      <el-radio-group v-model="config.type" @change="handleTypeChange">
        <el-radio value="ssh">SSH</el-radio>
        <el-radio value="serial">{{ $t('connect.typeSerial') }}</el-radio>
      </el-radio-group>
    </el-form-item>

    <!-- ========== SSH 字段 ========== -->
    <template v-if="config.type === 'ssh'">
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
      <el-form-item v-if="config.configId" :label="$t('connect.password')" prop="passwordNew">
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

    <!-- 端口映射配置   -->
    <el-form-item label-width="40px" class="forward-content">
      <template v-slot:label>
        <div>
          <div>端口</div>
          <el-button size="small" type="primary" circle @click="addPortForward">
            <el-icon :size="15"><Plus /></el-icon>
          </el-button>
        </div>
      </template>
      <div class="forward-item" v-if="config.portForwards && config.portForwards.length">
        <el-row v-for="(pf, index) in config.portForwards" :key="pf.id">
          <el-col :span="7">
            <el-input size="small" v-model="pf.localHost" />
          </el-col>
          <el-col :span="4">
            <el-input type="number" size="small" v-model.number="pf.localPort" />
          </el-col>
          <el-col :span="1">
            <el-icon style="rotate: 90deg"><Sort /></el-icon>
          </el-col>
          <el-col :span="7">
            <el-input size="small" v-model="pf.remoteHost" />
          </el-col>
          <el-col :span="4">
            <el-input type="number" size="small" v-model.number="pf.remotePort" />
          </el-col>
          <el-col @click="removePortForward(pf, index)" :span="1" style="padding: 3px;">
            <el-icon :size="15"><CircleClose /></el-icon>
          </el-col>
        </el-row>
      </div>
      <div v-else style="margin: auto;">
        <el-empty :image-size="50" description="No Port Forward Config." />
      </div>
    </el-form-item>
    </template>

    <!-- ========== 串口字段 ========== -->
    <template v-if="config.type === 'serial'">
    <el-form-item :label="$t('connect.name')" prop="name">
      <el-input v-model="config.name" :placeholder="$t('connect.name_placeholder')" />
    </el-form-item>
    <el-form-item :label="$t('connect.portName')" prop="portName">
      <el-select v-model="config.portName"
                 :placeholder="$t('connect.portName_placeholder')"
                 filterable
                 style="width: 100%"
                 @focus="loadSerialPorts">
        <el-option
            v-for="port in serialPorts"
            :key="port.portName"
            :value="port.portName"
            :label="port.portName + ' (' + port.portType + ')'"
        />
      </el-select>
    </el-form-item>
    <el-form-item :label="$t('connect.baudRate')" prop="baudRate">
      <el-select v-model="config.baudRate" style="width: 100%">
        <el-option :value="1200" label="1200" />
        <el-option :value="2400" label="2400" />
        <el-option :value="4800" label="4800" />
        <el-option :value="9600" label="9600" />
        <el-option :value="19200" label="19200" />
        <el-option :value="38400" label="38400" />
        <el-option :value="57600" label="57600" />
        <el-option :value="115200" label="115200" />
        <el-option :value="230400" label="230400" />
        <el-option :value="460800" label="460800" />
        <el-option :value="921600" label="921600" />
      </el-select>
    </el-form-item>
    <el-form-item :label="$t('connect.dataBits')">
      <el-select v-model="config.dataBits" style="width: 100%">
        <el-option :value="5" label="5" />
        <el-option :value="6" label="6" />
        <el-option :value="7" label="7" />
        <el-option :value="8" label="8" />
      </el-select>
    </el-form-item>
    <el-form-item :label="$t('connect.parity')">
      <el-select v-model="config.parity" style="width: 100%">
        <el-option value="None" :label="$t('connect.parityNone')" />
        <el-option value="Even" :label="$t('connect.parityEven')" />
        <el-option value="Odd" :label="$t('connect.parityOdd')" />
      </el-select>
    </el-form-item>
    <el-form-item :label="$t('connect.stopBits')">
      <el-select v-model="config.stopBits" style="width: 100%">
        <el-option :value="1" label="1" />
        <el-option :value="2" label="2" />
      </el-select>
    </el-form-item>
    <el-form-item :label="$t('connect.flowControl')">
      <el-select v-model="config.flowControl" style="width: 100%">
        <el-option value="None" :label="$t('connect.flowNone')" />
        <el-option value="Software" :label="$t('connect.flowSoftware')" />
        <el-option value="Hardware" :label="$t('connect.flowHardware')" />
      </el-select>
    </el-form-item>
    </template>
  </el-form>
</template>

<script>
import {invoke} from "@tauri-apps/api/core";
import {useMngStore} from "@/store.js";

export const DEFAULT_PF = {
  localHost: "127.0.0.1",
  localPort: 1000,
  remoteHost: "127.0.0.1",
  remotePort: 0,
}
export const DEFAULT_CONFIG = {
  type: 'ssh',
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

  // 串口相关字段
  portName: '',
  baudRate: 115200,
  dataBits: 8,
  parity: 'None',
  stopBits: 1,
  flowControl: 'None',

  // 端口转发配置
  portForwards: [],
};

export default {
  name: "ConnForm",
  props: {
    isEdit: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      bastionSessions: [],
      serialPorts: [],

      configRules: {
        name: [
          { required: true, trigger: 'blur' },
          { min: 3, max: 20, message: this.$t('connect.name_message'), trigger: 'blur' },
        ],
        host: [ { required: true, message: this.$t('connect.host_message'),trigger: 'blur' } ],
        port: [ { required: true, message: this.$t('connect.port_message'),trigger: 'blur' } ],
        username: [ { required: true, message: this.$t('connect.username_message'),trigger: 'blur' } ],
        password: [ { required: true, message: this.$t('connect.password_message'),trigger: 'blur' } ],
        passwordNew: [ { required: true, message: this.$t('connect.password_message'),trigger: 'blur' } ],
        portName: [ { required: true, message: this.$t('connect.portName_message'),trigger: 'blur' } ],
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
    addPortForward() {
      if (!this.config.portForwards) {
        this.config.portForwards = []
      }
      this.config.portForwards.push({ ...DEFAULT_PF })
    },
    removePortForward(pf, index){
      this.config.portForwards.splice(index, 1)
    },
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
    handleTypeChange(val) {
      if (val === 'ssh') {
        this.config.portName = '';
        this.config.baudRate = 115200;
        this.config.dataBits = 8;
        this.config.parity = 'None';
        this.config.stopBits = 1;
        this.config.flowControl = 'None';
      } else {
        this.config.host = '';
        this.config.port = 22;
        this.config.username = '';
        this.config.password = '';
        this.config.passwordNew = '';
        this.config.privateKeyPath = '';
        this.config.privateKeyData = '';
        this.config.keyPassword = '';
        this.config.authType = 'password';
        this.config.bastionConfigId = '';
        this.config.portForwards = [];
      }
    },
    async loadSerialPorts() {
      if (this.serialPorts.length > 0) return;
      try {
        this.serialPorts = await invoke('serial_list');
      } catch (e) {
        console.error('Failed to list serial ports:', e);
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
  .forward-content {
    :deep(.el-form-item__content) {
      line-height: 28px;
    }
  }
  .forward-item {
    min-height: 100px;
    :deep(.el-icon) {
      height: 28px;
    }
  }
}
</style>

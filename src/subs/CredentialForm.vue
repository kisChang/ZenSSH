<template>
  <el-form
    ref="formRef"
    :model="formData"
    :rules="formRules"
    label-width="100px"
    label-suffix=":"
    v-bind="$attrs"
  >
    <el-form-item :label="$t('credential.name')" prop="name">
      <el-input
        v-model="formData.name"
        :placeholder="$t('credential.namePlaceholder')"
      />
    </el-form-item>

    <el-form-item :label="$t('connect.username')" prop="username">
      <el-input
        v-model="formData.username"
        :placeholder="$t('connect.username_placeholder')"
      />
    </el-form-item>

    <el-form-item :label="$t('connect.authType')" prop="authType">
      <el-radio-group v-model="formData.authType">
        <el-radio value="password">{{ $t('connect.authType_pw') }}</el-radio>
        <el-radio value="key">{{ $t('connect.authType_key') }}</el-radio>
      </el-radio-group>
    </el-form-item>

    <!-- 密码认证 -->
    <template v-if="formData.authType === 'password'">
      <el-form-item :label="$t('connect.password')" prop="password">
        <el-input
          v-model="formData.password"
          type="password"
          show-password
          :placeholder="$t('connect.password_placeholder')"
        />
      </el-form-item>
    </template>

    <!-- 密钥认证 -->
    <template v-if="formData.authType === 'key'">
      <el-form-item :label="$t('connect.privateKeyPath')">
        <el-input
          v-model="formData.privateKeyPath"
          :placeholder="$t('connect.privateKeyPath_placeholder')"
        />
      </el-form-item>
      <el-form-item :label="$t('connect.privateKeyData')">
        <el-input
          v-model="formData.privateKeyData"
          type="textarea"
          :rows="3"
          :placeholder="$t('connect.privateKeyData_placeholder')"
        />
      </el-form-item>
      <el-form-item :label="$t('connect.keyPassword')">
        <el-input
          v-model="formData.keyPassword"
          type="password"
          show-password
          :placeholder="$t('connect.keyPassword_placeholder')"
        />
      </el-form-item>
    </template>
  </el-form>
</template>

<script>
export default {
  name: 'CredentialForm',
  inheritAttrs: false,
  props: {
    modelValue: {
      type: Object,
      required: true,
    },
  },
  computed: {
    formData: {
      get() {
        return this.modelValue;
      },
      set(val) {
        this.$emit('update:modelValue', val);
      },
    },
    formRules() {
      return {
        name: [
          { required: true, message: this.$t('credential.nameRequired'), trigger: 'blur' },
          { min: 1, max: 50, message: this.$t('credential.nameLength'), trigger: 'blur' },
        ],
        password: [
          { required: true, message: this.$t('connect.password_message'), trigger: 'blur' },
        ],
      };
    },
  },
  methods: {
    validate() {
      return this.$refs.formRef.validate();
    },
    resetFields() {
      return this.$refs.formRef.resetFields();
    },
  },
};
</script>

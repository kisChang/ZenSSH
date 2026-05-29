<template>
  <div class="credential-manage">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="showAddDialog">
        <el-icon><Plus /></el-icon>
        {{ $t('credential.add') }}
      </el-button>
    </div>

    <!-- 凭据列表 -->
    <div class="credential-list">
      <el-scrollbar>
        <div v-if="credentialList.length === 0" class="empty-state">
          <el-empty :description="$t('credential.empty')" />
        </div>
        <div v-else>
          <div
            v-for="item in credentialList"
            :key="item.credentialId"
            class="credential-item"
            @click="handleEdit(item)"
          >
            <div class="credential-info">
              <div class="credential-name">{{ item.name }}</div>
              <div class="credential-type">
                <el-tag size="small" :type="item.authType === 'password' ? 'primary' : 'success'">
                  {{ item.authType === 'password' ? $t('connect.authType_pw') : $t('connect.authType_key') }}
                </el-tag>
                <span v-if="getUsageCount(item.credentialId) > 0" class="usage-count">
                  {{ $t('credential.usageCount', { count: getUsageCount(item.credentialId) }) }}
                </span>
              </div>
            </div>
            <div class="credential-actions">
              <el-button
                type="danger"
                size="small"
                circle
                @click.stop="handleDelete(item)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? $t('credential.editTitle') : $t('credential.addTitle')"
      :close-on-click-modal="false"
      width="500px"
      class="credential-dialog"
    >
      <CredentialForm ref="formRef" v-model="formData" />

      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmit">{{ $t('common.submit') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { useMngStore, DEFAULT_CREDENTIAL, appConfigStore } from "@/store.js";
import { Plus, Delete } from "@element-plus/icons-vue";
import CredentialForm from "@/subs/CredentialForm.vue";

export default {
  name: "CredentialManage",
  components: { Plus, Delete, CredentialForm },
  data() {
    const mngStore = useMngStore();
    return {
      mngStore,
      dialogVisible: false,
      isEdit: false,
      formData: {
        ...DEFAULT_CREDENTIAL,
        passwordNew: '',
      },
    };
  },
  computed: {
    credentialList() {
      return this.mngStore.credentialList;
    },
  },
  mounted() {
    // 确保旧配置已升级
    this.mngStore.migrateOldConfigs();
  },
  methods: {
    // 获取凭据使用数量
    getUsageCount(credentialId) {
      return this.mngStore.configList.filter(c => c.credentialId === credentialId).length;
    },
    showAddDialog() {
      this.isEdit = false;
      this.formData = {
        ...DEFAULT_CREDENTIAL,
        passwordNew: '',
      };
      this.dialogVisible = true;
    },
    handleEdit(item) {
      this.isEdit = true;
      this.formData = {
        ...item,
        passwordNew: item.password ? '**************' : '',
      };
      this.dialogVisible = true;
    },
    handleDelete(item) {
      const usageCount = this.getUsageCount(item.credentialId);
      if (usageCount > 0) {
        this.$message.warning(this.$t('credential.inUse', { count: usageCount }));
        return;
      }

      this.$confirm(this.$t('credential.confirmDelete'), {
        confirmButtonText: this.$t('common.delete'),
        cancelButtonText: this.$t('common.cancel'),
        type: 'warning',
      })
        .then(() => {
          // 记录删除标记用于多端同步
          appConfigStore().recordCredentialDeletion(item.credentialId);
          this.mngStore.removeCredential(item.credentialId);
          this.$message.success(this.$t('common.success'));
          // 同步到云端
          appConfigStore().syncToCloud().catch(() => {});
        })
        .catch(() => {});
    },
    async handleSubmit() {
      const valid = await this.$refs.formRef.validate().catch(() => false);
      if (!valid) return;

      if (this.isEdit) {
        this.mngStore.updateCredential(this.formData);
        this.$message.success(this.$t('common.success'));
      } else {
        const newId = this.mngStore.addCredential(this.formData);
        this.$message.success(this.$t('credential.addSuccess'));
      }
      this.dialogVisible = false;
    },
  },
};
</script>

<style lang="scss" scoped>
.credential-manage {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-panel);
  color: var(--text-primary);

  .toolbar {
    padding: 10px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: center;
  }

  .credential-list {
    flex: 1;
    overflow: hidden;

    .empty-state {
      padding: 40px 0;
    }
  }

  .credential-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid #444;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: #444;
    }

    .credential-info {
      flex: 1;
      min-width: 0;

      .credential-name {
        font-size: 1.1rem;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .credential-type {
        display: flex;
        align-items: center;
        gap: 8px;

        .usage-count {
          font-size: 0.8rem;
          color: #aaa;
        }
      }
    }

    .credential-actions {
      flex-shrink: 0;
      margin-left: 10px;
    }
  }
}

// 移动端适配
@media (max-width: 768px) {
  .credential-manage {
    .toolbar {
      padding: 8px 12px;
    }

    .credential-item {
      padding: 15px;

      .credential-info {
        .credential-name {
          font-size: 1rem;
        }
      }
    }
  }

  :deep(.credential-dialog) {
    width: 90% !important;
    margin: 10vh auto;

    .el-dialog__body {
      padding: 15px;
    }

    .el-form-item {
      margin-bottom: 15px;
    }

    .el-form-item__label {
      font-size: 0.9rem;
    }
  }
}
</style>

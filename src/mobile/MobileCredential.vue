<template>
  <div class="credential-mobile">
    <!-- 凭据列表 -->
    <div v-if="!showForm" class="credential-list">
      <el-scrollbar class="credential-scroll">
        <div v-if="credentialList.length === 0" class="empty-state">
          <img class="app-icon" src="/logo.png" />
          <h2>{{ $t('credential.title') }}</h2>
          <p class="desc">{{ $t('credential.emptyDesc') }}</p>
          <button class="btn" style="width: 70%;" @click="handleAdd">
            {{ $t('credential.add') }}
          </button>
        </div>
        <div v-else class="list-container">
          <div
            v-for="item in credentialList"
            :key="item.credentialId"
            class="credential-item"
            @click="handleEdit(item)"
          >
            <div class="credential-main">
              <div class="credential-name">{{ item.name }}</div>
              <div class="credential-meta">
                <el-tag size="small" :type="item.authType === 'password' ? 'primary' : 'success'">
                  {{ item.authType === 'password' ? $t('connect.authType_pw') : $t('connect.authType_key') }}
                </el-tag>
                <span v-if="getUsageCount(item.credentialId) > 0" class="usage-badge">
                  {{ getUsageCount(item.credentialId) }}
                </span>
              </div>
            </div>
            <el-icon class="arrow-icon" :size="18"><ArrowRight /></el-icon>
          </div>
        </div>
      </el-scrollbar>

      <!-- 添加按钮 -->
      <div v-if="credentialList.length > 0" class="fab" @click="handleAdd">+</div>
    </div>

    <!-- 凭据表单 -->
    <div v-else class="credential-form">
      <el-scrollbar height="80vh">
        <CredentialForm
          ref="credentialFormRef"
          v-model="formData"
          class="mobile-form"
        />

        <div class="form-actions">
          <button class="btn btn-secondary" style="width: 30%; margin-right: 10px;" @click="handleCancel">
            <el-icon><DArrowLeft /></el-icon>
          </button>
          <button v-if="isEdit" class="btn btn-danger" style="width: 30%; margin-right: 10px;" @click="handleDelete">
            {{ $t('common.delete') }}
          </button>
          <button class="btn" :style="{ width: isEdit ? '30%' : '60%' }" @click="handleSubmit">
            {{ $t('common.submit') }}
          </button>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script>
import { useMngStore, DEFAULT_CREDENTIAL, appConfigStore } from "@/store.js";
import { DArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import CredentialForm from "@/subs/CredentialForm.vue";

export default {
  name: "MobileCredential",
  components: { DArrowLeft, ArrowRight, CredentialForm },
  data() {
    const mngStore = useMngStore();
    return {
      mngStore,
      showForm: false,
      isEdit: false,
      credentialFormRef: null,
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
    getUsageCount(credentialId) {
      return this.mngStore.configList.filter(c => c.credentialId === credentialId).length;
    },
    handleAdd() {
      this.isEdit = false;
      this.formData = {
        ...DEFAULT_CREDENTIAL,
        passwordNew: '',
      };
      this.showForm = true;
    },
    handleEdit(item) {
      this.isEdit = true;
      this.formData = {
        ...item,
        passwordNew: item.password ? '**************' : '',
      };
      this.showForm = true;
    },
    handleCancel() {
      this.showForm = false;
    },
    handleDelete() {
      const usageCount = this.getUsageCount(this.formData.credentialId);
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
          appConfigStore().recordCredentialDeletion(this.formData.credentialId);
          this.mngStore.removeCredential(this.formData.credentialId);
          this.$message.success(this.$t('common.success'));
          this.showForm = false;
          // 同步到云端
          appConfigStore().syncToCloud().catch(() => {});
        })
        .catch(() => {});
    },
    async handleSubmit() {
      const valid = await this.$refs.credentialFormRef.validate();
      if (!valid) return;

      if (this.isEdit) {
        this.mngStore.updateCredential(this.formData);
        this.$message.success(this.$t('common.success'));
      } else {
        this.mngStore.addCredential(this.formData);
        this.$message.success(this.$t('credential.addSuccess'));
      }
      this.showForm = false;
    },
  },
};
</script>

<style lang="scss" scoped>
@import "../styles/variables.scss";

.credential-mobile {
  height: 100%;
  background: $bg-primary;
  color: $text-primary;

  .credential-list {
    height: 100%;
    position: relative;

    .credential-scroll {
      height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 130px);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 60vh;
      padding: 20px;
      text-align: center;

      .app-icon {
        width: 80px;
        height: 80px;
        margin-bottom: 20px;
        border-radius: 20px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }

      h2 {
        font-size: 1.5rem;
        margin-bottom: 10px;
        font-weight: 600;
      }

      .desc {
        font-size: 0.9rem;
        color: $text-secondary;
        margin-bottom: 30px;
        line-height: 1.5;
      }
    }

    .list-container {
      padding: 10px;
    }

    .credential-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      margin-bottom: 12px;
      background: linear-gradient(135deg, $bg-card 0%, rgba(30, 41, 59, 0.8) 100%);
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

      &:active {
        background: linear-gradient(135deg, #334155 0%, rgba(51, 65, 85, 0.9) 100%);
        transform: scale(0.98);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .credential-main {
        flex: 1;
        min-width: 0;

        .credential-name {
          font-size: 1.05rem;
          font-weight: 600;
          margin-bottom: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: $text-primary;
          letter-spacing: 0.3px;
        }

        .credential-meta {
          display: flex;
          align-items: center;
          gap: 10px;

          .usage-badge {
            font-size: 0.75rem;
            color: $text-secondary;
            background: rgba(255, 255, 255, 0.08);
            padding: 3px 10px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
        }
      }

      .arrow-icon {
        color: $text-secondary;
        margin-left: 12px;
        padding: 6px;
        border-radius: 8px;
        transition: all 0.2s ease;

        &:active {
          background: rgba(255, 255, 255, 0.1);
          color: $text-primary;
        }
      }
    }

    .fab {
      position: absolute;
      right: 24px;
      bottom: 24px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, $color-success-alt 0%, #16a34a 100%);
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
  }

  .credential-form {
    height: 100%;
    padding: 16px;

    .mobile-form {
      :deep(.el-form-item) {
        margin-bottom: 18px;
      }

      :deep(.el-form-item__label) {
        color: $text-primary;
        font-size: 0.9rem;
        font-weight: 500;
      }

      :deep(.el-input__inner),
      :deep(.el-textarea__inner) {
        background: $bg-card;
        border-color: #334155;
        color: $text-primary;
        border-radius: 10px;
        padding: 12px 14px;

        &::placeholder {
          color: $text-secondary;
        }
      }

      :deep(.el-radio) {
        color: $text-primary;
      }
    }

    .form-actions {
      display: flex;
      justify-content: center;
      margin-top: 30px;
      padding-bottom: 30px;
      gap: 12px;
    }
  }
}

.btn {
  height: 48px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, $color-success-alt 0%, #16a34a 100%);
  color: #052e16;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:active {
    transform: scale(0.96);
  }

  &.btn-secondary {
    background: linear-gradient(135deg, $bg-card 0%, #252f3f 100%);
    color: $text-primary;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  &.btn-danger {
    background: linear-gradient(135deg, $color-error-alt 0%, #dc2626 100%);
    color: white;
  }
}
</style>

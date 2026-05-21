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
$bg: #0f172a;
$card: #1e293b;
$text-main: #ffffff;
$text-sub: #94a3b8;
$green: #22c55e;
$red: #ef4444;

.credential-mobile {
  height: 100%;
  background: $bg;
  color: $text-main;

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
      }

      h2 {
        font-size: 1.5rem;
        margin-bottom: 10px;
      }

      .desc {
        font-size: 0.9rem;
        color: $text-sub;
        margin-bottom: 30px;
      }
    }

    .list-container {
      padding: 10px;
    }

    .credential-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 15px;
      margin-bottom: 10px;
      background: $card;
      border-radius: 8px;
      cursor: pointer;

      &:active {
        background: #334155;
      }

      .credential-main {
        flex: 1;
        min-width: 0;

        .credential-name {
          font-size: 1rem;
          font-weight: 500;
          margin-bottom: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .credential-meta {
          display: flex;
          align-items: center;
          gap: 8px;

          .usage-badge {
            font-size: 0.75rem;
            color: $text-sub;
            background: rgba(255,255,255,0.1);
            padding: 2px 8px;
            border-radius: 10px;
          }
        }
      }

      .arrow-icon {
        color: $text-sub;
        margin-left: 10px;
      }
    }

    .fab {
      position: absolute;
      right: 20px;
      bottom: 20px;
      width: 56px;
      height: 56px;
      background: $green;
      color: #052e16;
      border-radius: 50%;
      font-size: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
  }

  .credential-form {
    height: 100%;
    padding: 15px;

    .mobile-form {
      :deep(.el-form-item) {
        margin-bottom: 15px;
      }

      :deep(.el-form-item__label) {
        color: $text-main;
        font-size: 0.9rem;
      }

      :deep(.el-input__inner),
      :deep(.el-textarea__inner) {
        background: $card;
        border-color: #334155;
        color: $text-main;

        &::placeholder {
          color: $text-sub;
        }
      }

      :deep(.el-radio) {
        color: $text-main;
      }
    }

    .form-actions {
      display: flex;
      justify-content: center;
      margin-top: 30px;
      padding-bottom: 20px;
    }
  }
}

.btn {
  height: 44px;
  border: none;
  border-radius: 8px;
  background: $green;
  color: #052e16;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &.btn-secondary {
    background: $card;
    color: $text-main;
  }

  &.btn-danger {
    background: $red;
    color: white;
  }
}
</style>

<template>
  <div
      class="file-manager"
      :class="{ dragging: isDragging }"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
  >
    <!-- 顶部栏 -->
    <div class="toolbar">
      <div class="path">📂 {{ currentDir }}</div>
      <div class="actions">
        <button @click="goUp">🔼parent</button>
        <button @click="mkdir">📁mkdir</button>
        <button @click="touchFile">📄mkfile</button>
        <button @click="upload">📤upload</button>
      </div>
    </div>

    <!-- 文件列表 -->
    <el-scrollbar class="file-list">
      <ul>
        <li
            v-for="item in sortedFiles"
            :key="item.filename"
            class="file-item"
            @click="open(item)"
        >
      <span class="icon">
        {{ item.is_dir ? '📁' : '📄' }}
      </span>
          <span class="name">{{ item.filename }}</span>

          <span v-if="!item.is_dir" class="more">⋯</span>
        </li>
      </ul>
    </el-scrollbar>

    <el-drawer :model-value="activeFile != null" direction="btt" :with-header="false" size="25%" body-class="pop-drawer" @close="activeFile = null">
      <template #default>
        <div class="btn-list">
<!--          <el-alert title="预览" type="primary" show-icon :closable="false" @click="handlePreview">
            <template #icon><View /></template>
          </el-alert>-->
          <el-alert title="编辑" type="primary" show-icon :closable="false" @click="handleEdit">
            <template #icon><Edit /></template>
          </el-alert>
          <el-alert title="下载" type="primary" show-icon :closable="false" @click="handleDownload">
            <template #icon><Download /></template>
          </el-alert>
          <el-alert title="删除" type="warning" show-icon :closable="false" @click="handleDelete"/>
        </div>
      </template>
    </el-drawer>


    <el-dialog
        v-model="downloadShow"
        width="300"
        :show-close="false"
        :close-on-press-escape="false"
        :close-on-click-modal="false">
      <el-progress :text-inside="true" :stroke-width="26" :percentage="downloadProgress" />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="handleDownloadCancel">{{ $t('common.cancel') }}</el-button>
          <el-button :loading="downloadProgress < 100" type="primary" @click="downloadShow = false">
            完成
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 文本编辑器浮层 -->
    <TextEditor
        v-if="editingFile"
        :session="session"
        :file-path="editingFile"
        @close="closeEditor"
    />
  </div>
</template>

<script>
import {open, save} from '@tauri-apps/plugin-dialog';
import {readFile, writeFile} from '@tauri-apps/plugin-fs';
import {Channel, invoke} from '@tauri-apps/api/core'
import {useTabsStore} from "@/store.js";
import {genId, sep} from "@/commons.js";
import TextEditor from "./TextEditor.vue";
import {Download, Edit} from '@element-plus/icons-vue';

export default {
  components: { TextEditor, Edit, Download },
  props: {
    session: {
      type: Object,
      required: true
    }
  },
  computed: {
    sessionId(){
      return this.session?.sessionId ?? '';
    },
    sortedFiles() {
      return [...this.files].sort((a, b) => {
        // 1️⃣ 目录优先
        if (a.is_dir !== b.is_dir) {
          return a.is_dir ? -1 : 1
        }

        // 2️⃣ 同类型按文件名排序
        return a.filename.localeCompare(
            b.filename,
            undefined,
            { sensitivity: 'base' } // 忽略大小写
        )
      })
    },
    sessionState() {
      return this.session?.state ?? 0;
    },
  },
  data() {
    const tabStore = useTabsStore();
    return {
      tabStore: tabStore,
      currentDir: '.',
      files: [],
      activeFile: null,
      editingFile: null,
      downloadShow: false, downloadProgress: 0,
      connected: true,  // 初始值为 true，连接后保持连接状态
      closed: false,
      isDragging: false,
    }
  },
  watch: {
    sessionState: {
      immediate: true,
      handler(newVal) {
        if (newVal === 2) {
          this.$nextTick(() => {
            this.connect();
          });
        }
      }
    }
  },
  mounted() {
    this.connect().then()
  },
  beforeUnmount() {
    this.disconnect();
  },
  methods: {
    onBackButtonPress() {
      if (this.editingFile) {
        this.$confirm('正在编辑文件，是否关闭编辑器？', {showClose: false}).then(() => {
          this.editingFile = null;
        }).catch(() => {});
        return false;
      }
      if (this.downloadShow) {
        this.handleDownloadCancel()
        return false
      }
      if (this.activeFile) {
        this.activeFile = null
        return false
      }
      if (this.currentDir === '/') {
        return true
      }
      return this.goUp()
    },
    async connect() {
      // 直接使用sessionId初始化SFTP
      await invoke('ssh_sftp_open', { sessionId: this.sessionId })
      this.currentDir = await invoke('ssh_sftp_canonicalize', { sessionId: this.sessionId, filePath: '.' })
      await this.loadDir()
    },
    async loadDir() {
      this.files = await invoke('ssh_sftp_listdir', {
        sessionId: this.sessionId,
        dir: this.currentDir,
      })
    },

    async open(item) {
      if (item.is_dir) {
        this.currentDir =
            this.currentDir.replace(/\/$/, '') +
            '/' +
            item.filename
        await this.loadDir()
      } else {
        this.activeFile = this.currentDir + '/' + item.filename
      }
    },
    async handleDownload() {
      const serverFilePath = this.activeFile
      const fileName = this.activeFile.substring(this.activeFile.lastIndexOf('/') + 1)
      this.activeFile = null
      const savePath = await save({title: "Save " + fileName})
      // 清空文件
      await writeFile(savePath, new Uint8Array([]));
      this.downloadProgress = 1
      this.downloadShow = true
      this.downloadTaskId = "task_" + genId()
      const onDownEvent = new Channel();
      onDownEvent.onmessage = async ({ event, data }) => {
        if (event === 'chunk') {
          // 逐步追加文件
          await writeFile(savePath, Uint8Array.from(data.data), {
            append: true,
          });
        }
        if (event === 'process') this.downloadProgress = data.val;
        if (event === 'cancelled') {
          this.notify({message: "下载已取消", type: "success"})
        }
      };
      invoke('ssh_sftp_read', {
        taskId: this.downloadTaskId,
        sessionId: this.sessionId,
        filePath: serverFilePath,
        savePath: savePath,
        onDownEvent: onDownEvent,
      }).catch().finally(() => {
        this.downloadShow = false;
      })
    },
    handleDownloadCancel() {
      if (this.downloadTaskId) {
        invoke('ssh_sftp_read_cancel', {
          taskId: this.downloadTaskId,
        }).catch().finally(() => {
          this.downloadTaskId = null
        })
      }
    },
    handleEdit() {
      const filePath = this.activeFile;
      this.activeFile = null;
      this.editingFile = filePath;
    },
    closeEditor() {
      this.editingFile = null;
    },
    async handleDelete() {
      this.$confirm("确认删除该文件？", {showClose: false}).then(rv => {
        const loading = this.$loading({})
        invoke('ssh_sftp_remove_file', {
          sessionId: this.sessionId,
          file: this.activeFile,
        }).then(_ => {
          this.activeFile = null
          this.loadDir().catch()
        }).finally(() => {
          loading.close()
        })
      }).catch(() => {
        this.activeFile = null
      })
    },

    async mkdir() {
      const { value } = await this.$prompt('请输入目录名', '新建目录', {
        showClose: false,
        inputPattern: /\S+/,
        inputErrorMessage: '目录名不能为空',
      }).catch(() => {})
      if (!value) return
      await invoke('ssh_sftp_mkdir', {
        sessionId: this.sessionId,
        dir: this.currentDir + '/' + value,
      })
      await this.loadDir()
    },

    async touchFile() {
      const { value } = await this.$prompt('请输入文件名', '新建文件', {
        showClose: false,
        inputPattern: /\S+/,
        inputErrorMessage: '文件名不能为空',
      }).catch(() => {})
      if (!value) return
      await invoke('ssh_sftp_write', {
        sessionId: this.sessionId,
        filePath: this.currentDir + '/' + value,
        data: new Uint8Array([]),
      })
      await this.loadDir()
    },

    async upload() {
      const filePath = await open({title: "Choose File Upload", multiple: false, directory: false})
      if (!filePath) return
      await this.uploadFile(filePath)
    },

    async uploadFile(filePath) {
      const loading = this.$loading({text: "Uploading..."})
      const fileName = filePath.substring(filePath.lastIndexOf(sep) + 1)
      let fileContent
      try {
        fileContent = await readFile(filePath)
      } catch (err) {
        this.notify.error('读取本地文件失败:' + err)
        loading.close()
        return
      }
      invoke('ssh_sftp_write', {
        sessionId: this.sessionId,
        filePath: this.currentDir + '/' + fileName,
        data: fileContent
      }).then(() => {
        this.loadDir().catch()
      }).catch(err=> {
        this.notify.error('Fail:' + err)
      }).finally(()=> {
        loading.close()
      })
    },

    onDragOver(e) {
      if (e.dataTransfer.types.includes('Files')) {
        this.isDragging = true
      }
    },

    onDragLeave(e) {
      // 仅当离开文件管理器区域时重置状态
      if (!e.currentTarget.contains(e.relatedTarget)) {
        this.isDragging = false
      }
    },

    async onDrop(e) {
      this.isDragging = false
      const files = e.dataTransfer.files
      if (!files || files.length === 0) return

      const loading = this.$loading({text: "Uploading..."})
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // 使用 webkitRelativePath 或 name 获取文件名
        const filePath = file.path || file.name
        if (!filePath) {
          this.notify.error('无法获取文件路径')
          continue
        }
        await this.uploadFile(filePath).catch(err => {
          this.notify.error('上传失败:' + err)
        })
      }
      loading.close()
    },

    goUp() {
      if (this.currentDir === '/')
        return true
      this.currentDir = this.currentDir.replace(/\/[^/]+$/, '') || '/'
      this.loadDir()
      return false
    },
    disconnect() {
      if (this.closed) return;
      this.closed = true;
    },
  },
}
</script>

<style lang="scss" scoped>
@media (min-width: 768px) {
  :deep(.el-drawer){
    &.btt {
      left: 25%;
      width: 50%;
    }
  }
}

.file-manager {
  padding: 12px;
  width: 100%;
  overflow: hidden;
}

/* 顶部 */
.toolbar {
  .path {
    flex: 1;
    margin-bottom: 10px;
  }
  .actions {
    flex: 1;
    margin-bottom: 10px;
    text-align: center;
    button {
      margin-right: 6px;
    }
  }
}


/* 列表 */
.file-list {
  height: calc(100vh - 200px);
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
}

.file-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  &:hover {
    background: #6a6a6a;
  }
}

.icon {
  margin-right: 10px;
}

.name {
  flex: 1;
  word-break: break-all;
}

.more {
  font-size: 20px;
  color: #999;
}

/* 拖放上传样式 */
.file-manager.dragging {
  position: relative;
}

.file-manager.dragging::after {
  content: 'Drop files here to upload';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(64, 158, 255, 0.2);
  border: 3px dashed #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #409eff;
  z-index: 100;
  pointer-events: none;
}
</style>

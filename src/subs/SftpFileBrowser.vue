<template>
  <div class="file-manager">
    <!-- 顶部栏 -->
    <div class="toolbar">
      <div class="path">📂 {{ currentDir }}</div>
      <div class="actions">
        <button @click="bakHostTab">🏡 Host</button>
        <button @click="goUp">🔼 Back</button>
        <button @click="mkdir">📁 mkdir</button>
        <button @click="upload">📤 upload</button>
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
  </div>
</template>

<script>
import {open, save} from '@tauri-apps/plugin-dialog';
import {writeFile, exists, create, readFile} from '@tauri-apps/plugin-fs';
import {Channel, invoke} from '@tauri-apps/api/core'
import {useTabsStore} from "@/store.js";
import {genId, sep} from "@/commons.js";

export default {
  props: {
    session: {
      type: Object,
      required: true
    }
  },
  computed: {
    sessionId(){
      return this.session.sessionId;
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
  },
  data() {
    const tabStore = useTabsStore();
    return {
      tabStore: tabStore,
      currentDir: '.',
      files: [],
      activeFile: null,
      downloadShow: false, downloadProgress: 0,
    }
  },
  mounted() {
    this.connect().then(() => {
      this.tabStore.connectSuccess(this.sessionId);
      this.$bus.on("ssh_close_" + this.sessionId, () => {
        this.disconnect();
      });
    }).catch(err => {
      this.disconnect();
      this.notify({
        type: 'warning',
        message: '连接失败:' + err,
      });
    });
  },
  beforeUnmount() {
    this.disconnect();
  },
  methods: {
    onBackButtonPress() {
      if (this.downloadShow) {
        this.handleDownloadCancel()
        return
      }
      if (this.activeFile) {
        this.activeFile = null
        return
      }
      if (this.currentDir === '/') {
        this.bakHostTab()
        return
      }
      this.goUp()
    },
    async connect() {
      const connectConfig = Object.assign({}, this.session.config)
      connectConfig.configId = this.session.configId
      connectConfig.sessionId = this.session.sessionId
      const onEvent = new Channel();
      await invoke("ssh_connect", {
        onEvent: onEvent,
        sessionId: this.sessionId,
        cols: 60,
        rows: 40,
        config: connectConfig
      });
      // 获取当前目录
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
      const name = prompt('目录名')
      if (!name) return
      await invoke('ssh_sftp_mkdir', {
        sessionId: this.sessionId,
        dir: this.currentDir + '/' + name,
      })
      await this.loadDir()
    },

    async upload() {
      const filePath = await open({title: "Choose File Upload", multiple: false, directory: false})
      const loading = this.$loading({text: "Uploading..."})
      const fileName = filePath.substring(filePath.lastIndexOf(sep) + 1)
      const fileContent = await readFile(filePath);
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

    async remove(item) {
      const path = this.currentDir + '/' + item.filename
      if (item.is_dir) {
        await invoke('ssh_sftp_remove_dir', {
          sessionId: this.sessionId,
          dir: path,
        })
      } else {
        await invoke('ssh_sftp_remove_file', {
          sessionId: this.sessionId,
          file: path,
        })
      }
      await this.loadDir()
    },

    goUp() {
      if (this.currentDir === '/') return
      this.currentDir = this.currentDir.replace(/\/[^/]+$/, '') || '/'
      this.loadDir()
    },

    bakHostTab() {
      this.$bus.emit('show-host-list')
    },
    disconnect() {
      if (this.closed) return;
      this.closed = true;
      this.tabStore.connectClose(this.sessionId);
      invoke("ssh_close", { sessionId: this.sessionId }).catch(() => {});
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
  max-width: 900px;
  margin: auto;
  padding: 12px;
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
</style>

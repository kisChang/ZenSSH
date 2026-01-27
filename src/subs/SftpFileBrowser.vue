<template>
  <div class="file-manager">
    <!-- 顶部栏 -->
    <div class="toolbar">
      <div class="path">📂 {{ currentDir }}</div>
      <div class="actions">
        <button @click="goUp">⬆ 上一级</button>
        <button @click="mkdir">📁 新建</button>
      </div>
    </div>

    <!-- 文件列表 -->
    <ul class="file-list">
      <li
          v-for="item in files"
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
  </div>
</template>

<script>
import {save} from '@tauri-apps/plugin-dialog';
import {writeFile} from '@tauri-apps/plugin-fs';
import {Channel, invoke} from '@tauri-apps/api/core'
import {useTabsStore} from "@/store.js";

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
    }
  },
  data() {
    const tabStore = useTabsStore();
    return {
      tabStore: tabStore,
      currentDir: '.',
      files: [],
      activeFile: null
    }
  },
  mounted() {
    this.connect().then(() => {

    })
  },
  beforeUnmount() {
    this.disconnect();
  },
  methods: {
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
    handlePreview() {
    },
    async handleDownload() {
      const loading = this.$loading({})
      invoke('ssh_sftp_read', {
        sessionId: this.sessionId,
        filePath: this.activeFile,
      }).then(fileContent => {
        let content = new TextEncoder().encode(fileContent)
        const fileName = this.activeFile.substring(this.activeFile.lastIndexOf('/') + 1)
        const extensions = fileName.lastIndexOf('.') >= 0 ? fileName.substring(fileName.lastIndexOf('.') + 1) : ''
        save({ filters: [{name: fileName, extensions: [extensions]}]}).then(path => {
          writeFile(path, content)
        })
        this.activeFile = null
      }).finally(() => {
        loading.close()
      })
    },
    async handleDelete() {
      this.$confirm("确认删除该文件？", {showClose: false}).then(rv => {
        const loading = this.$loading({})
        invoke('ssh_sftp_remove_file', {
          sessionId: this.sessionId,
          file: this.activeFile,
        }).then(_ => {
          this.activeFile = null
        }).finally(() => {
          loading.close()
        })
      }).catch(() => {
        this.activeFile = null
      })
    },

    async saveFile() {
      await invoke('ssh_sftp_write', {
        sessionId: this.sessionId,
        filePath: this.activeFile,
        data: Array.from(new TextEncoder().encode("fileContent")),
      })
      alert('保存成功')
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
  ::v-deep(.el-drawer){
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
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.actions button {
  margin-right: 6px;
}

/* 列表 */
.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}

.file-item:hover {
  background: #f6f6f6;
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

<template>
  <div class="text-editor-overlay" @click.self="handleClose">
    <div class="text-editor-panel">
      <!-- 顶部工具栏 -->
      <div class="editor-toolbar">
        <span class="file-path" :title="filePath">{{ fileName }}</span>
        <div class="toolbar-actions">
          <button class="btn-save" @click="handleSave" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
          <button class="btn-close" @click="handleClose">✕</button>
        </div>
      </div>

      <!-- 编辑器容器 -->
      <div class="editor-container" ref="editorContainerRef"></div>

      <!-- 底部状态栏 -->
      <div class="editor-status">
        <span>{{ fileSize }}</span>
        <span>{{ loading ? '加载中...' : '就绪' }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { invoke } from '@tauri-apps/api/core';
import { EditorView, keymap, lineNumbers, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { ElMessageBox } from 'element-plus';

export default {
  props: {
    session: { type: Object, required: true },
    filePath: { type: String, required: true },
  },
  data() {
    return {
      loading: true,
      saving: false,
      editorView: null,
      languageConf: new Compartment(),
      originalContent: null,
    };
  },
  computed: {
    sessionId() { return this.session.sessionId; },
    fileName() {
      return this.filePath.substring(this.filePath.lastIndexOf('/') + 1);
    },
    fileSize() {
      if (!this.editorView) return '';
      const len = this.editorView.state.doc.length;
      if (len < 1024) return `${len} B`;
      return `${(len / 1024).toFixed(1)} KB`;
    },
    isDirty() {
      if (!this.editorView || this.originalContent === null) return false;
      return this.editorView.state.doc.toString() !== this.originalContent;
    },
  },
  mounted() {
    this.initEditor();
    this.loadFile();
  },
  beforeUnmount() {
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
  },
  methods: {
    async loadFile() {
      this.loading = true;
      try {
        const content = await invoke('ssh_sftp_read_text', {
          sessionId: this.sessionId,
          filePath: this.filePath,
        });
        if (this.editorView) {
          this.editorView.dispatch({
            changes: { from: 0, to: this.editorView.state.doc.length, insert: content },
          });
          this.originalContent = content;
        }
      } catch (err) {
        this.notify({ type: 'warning', message: '读取文件失败: ' + err });
      } finally {
        this.loading = false;
      }
    },
    async handleSave() {
      if (this.saving) return;
      this.saving = true;
      try {
        const content = this.editorView.state.doc.toString();
        await invoke('ssh_sftp_write', {
          sessionId: this.sessionId,
          filePath: this.filePath,
          data: new TextEncoder().encode(content),
        });
        this.notify({ type: 'success', message: '文件已保存' });
        this.originalContent = this.editorView.state.doc.toString();
      } catch (err) {
        this.notify({ type: 'warning', message: '保存失败: ' + err });
      } finally {
        this.saving = false;
      }
    },
    async handleClose() {
      if (this.isDirty) {
        try {
          await ElMessageBox.confirm('文件已被修改，是否保存更改？', '提示', {
            confirmButtonText: '保存',
            cancelButtonText: '不保存',
            distinguishCancelAndClose: true,
          });
          await this.handleSave();
          if (!this.isDirty) {
            this.$emit('close');
          }
        } catch (action) {
          if (action === 'cancel') {
            this.$emit('close');
          }
          // 'close' action - do nothing
        }
        return;
      }
      this.$emit('close');
    },
    initEditor() {
      const startState = EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          drawSelection({ cursorBlinkRate: 530 }),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          this.languageConf.of([]),
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '14px',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            },
            '.cm-scroller': {
              overflow: 'auto',
              lineHeight: '1.6',
            },
            '.cm-content': {
              padding: '8px 0',
              minHeight: '100%',
              WebkitOverflowScrolling: 'touch',
            },
            '.cm-gutters': {
              backgroundColor: '#1e1e2e',
              borderRight: '1px solid #3a3a4a',
              color: '#6c7086',
              paddingRight: '8px',
              paddingLeft: '8px',
              userSelect: 'none',
            },
            '.cm-lineNumbers .cm-gutterElement': {
              padding: '0 8px 0 4px',
              minWidth: '40px',
              textAlign: 'right',
            },
            '.cm-cursor': {
              borderLeftColor: '#cdd6f4',
            },
            '.cm-activeLineGutter': {
              backgroundColor: '#313244',
            },
            '&.cm-focused .cm-selectionBackground, ::selection': {
              backgroundColor: '#585b70',
            },
          }),
          EditorView.theme({
            '.cm-editor': { backgroundColor: '#1e1e2e', color: '#cdd6f4' },
            '&.cm-focused': { outline: 'none' },
          }, { dark: true }),
        ],
      });

      this.editorView = new EditorView({
        state: startState,
        parent: this.$refs.editorContainerRef,
      });

      // 根据文件扩展名加载语言高亮
      this.setLanguage(this.fileName);
    },
    setLanguage(filename) {
      const ext = filename.split('.').pop().toLowerCase();
      const langMap = {
        js: javascript(), jsx: javascript(), ts: javascript({ typescript: true }), tsx: javascript({ typescript: true, jsx: true }),
        py: python(), pyw: python(),
        html: html(),
        css: css(), scss: css(), less: css(),
        json: json(),
        md: markdown(), markdown: markdown(),
        xml: xml(), svg: xml(),
        yml: yaml(), yaml: yaml(),
        php: php(),
        sql: sql(),
      };
      const langExt = langMap[ext];
      if (langExt && this.editorView) {
        this.editorView.dispatch({
          effects: this.languageConf.reconfigure(langExt),
        });
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.text-editor-overlay {
  position: fixed;
  top: env(safe-area-inset-top);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
}

.text-editor-panel {
  width: 100vw;
  max-width: 1200px;
  height: 95vh;
  display: flex;
  flex-direction: column;
  background: #1e1e2e;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

  @media (min-width: 768px) {
    width: 85vw;
    height: 85vh;
  }
}

.editor-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #181825;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;

  .file-path {
    flex: 1;
    color: #cdd6f4;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
    margin-left: 12px;
  }

  .btn-save {
    padding: 6px 16px;
    background: #89b4fa;
    color: #1e1e2e;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .btn-close {
    padding: 6px 10px;
    background: #45475a;
    color: #cdd6f4;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
  }
}

.editor-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.editor-status {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  background: #181825;
  border-top: 1px solid #313244;
  color: #6c7086;
  font-size: 12px;
  flex-shrink: 0;
}
</style>

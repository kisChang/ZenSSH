<template>
  <div class="terminal-container" ref="container">
    <div ref="terminal" class="my-terminal" :style="termStyle"></div>

    <div v-show="enableKeyboard" class="footer-keyboard">
      <keyboard @press="pressKeyboard"
                @toggleKeyboard="updateTerminalSize"
                @click.stop="()=>{}"/>
    </div>

    <div v-if="showAutocomplete.show" class="show-autocomplete" :style="showAutocomplete">
      <div>ls</div>
      <div>ls -al</div>
    </div>
  </div>
</template>

<script>
import {Channel, invoke} from "@tauri-apps/api/core";
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import {ProgressAddon} from "@xterm/addon-progress";
import {SearchAddon} from '@xterm/addon-search';
import Keyboard from "@/mobile/keyboard.vue";
import {useTabsStore} from "@/store.js";
import {isMobile} from "@/commons.js";

const SCROLL_THRESHOLD = 6;  // 最小触发距离
const SCROLL_SPEED = 12;     // 滚动速度（越小越快）

export default {
  name: "Terminal",
  components: {Keyboard},
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
      closed: false,
      term: null, termStyle: { bottom: 0, height: '100vh' },
      enableKeyboard: false,
      currenLine: "", showAutocomplete: {show: false, left: '100px', top: '100px'},
    }
  },
  mounted() {
    if (isMobile()) { // 仅在移动端上启用虚拟键盘
      this.enableKeyboard = true
    }
    this.connect().then(() => {
      this.tabStore.connectSuccess(this.sessionId);
      this.$bus.on("ssh_close_" + this.sessionId, () => {
        this.disconnect();
      });
      this.updateTerminalSize();
    }).catch(err => {
      this.disconnect();
      this.$notify({
        type: 'warning',
        message: '连接失败:' + err,
      });
    });
  },
  beforeUnmount() {
    this.disconnect();
  },
  methods: {
    disconnect() {
      if (this.closed) return;
      this.closed = true;
      this.tabStore.connectClose(this.sessionId);
      invoke("ssh_close", { sessionId: this.sessionId }).catch(() => {});
      this.unbindTouchEvents()
    },
    async connect() {
      // 生成配置信息
      const connectConfig = Object.assign({}, this.session.config)
      connectConfig.configId = this.session.configId
      connectConfig.sessionId = this.session.sessionId
      let fontSize = isMobile() ? 12 : 14
      // 初始化 Terminal
      this.term = new Terminal({
        cursorBlink: true,
        fontSize: fontSize,
        disableStdin: this.enableKeyboard,
        fontFamily: 'monospace',
        overviewRuler: {
          width: 5,
        },
        cursorStyle: 'bar',
        cursorInactiveStyle: 'bar',
        linkHandler: {} // 暂不支持
      });
      this.fitAddon = new FitAddon()
      this.term.loadAddon(this.fitAddon)
      // 进度条扩展
      const progressAddon = new ProgressAddon();
      this.term.loadAddon(progressAddon);
      // 可以在缓冲区里检索，后面可以扩展用户支持
      const searchAddon = new SearchAddon();
      this.term.loadAddon(searchAddon);
      this.term.open(this.$refs.terminal);
      // 禁用输入后，这样可以直接使用内建的软键盘输入
      this.term.textarea.readOnly = this.enableKeyboard
      // 将event与Terminal建立连接，监听 SSH 事件
      const onEvent = new Channel();
      onEvent.onmessage = ({ event, data }) => {
        switch (event) {
          case "data":
          case "extendedData":
            this.term.write(data.data);
            break;
          case "eof":
          case "close":
            this.term.write("\r\n[connection closed]\r\n");
            this.term.blur();
            this.disconnect();
            break;
          case "exitStatus":
            this.term.write(`\r\n[process exited with code ${data.exitStatus}]\r\n`);
            break;
          case "exitSignal":
            this.term.write(`\r\n[terminated by signal ${data.signalName}]\r\n`);
            break;
          case "openFailure":
            this.term.write(`\r\n[channel open failed, code=${data.code}]\r\n`);
            break;
          default:
            console.debug("ssh event:", event);
        }
      }
      // 正式建立SSH连接
      await invoke("ssh_connect", {
        onEvent: onEvent,
        sessionId: this.sessionId,
        cols: 60,
        rows: 40,
        config: connectConfig
      });
      // Terminal 输入发送给 ssh
      this.term.onData(data => {
        if (this.closed) return;
        invoke('ssh_run_command', {
          sessionId: this.sessionId,
          command: data
        }).catch(err => {
          // TODO 这里的异常如何处理待考虑
        })
      });

      // 调整窗体大小
      await this.$nextTick()
      this.fitAddon.fit()
      invoke('ssh_window_change', {
        sessionId: this.sessionId,
        colWidth: this.term.cols,
        rowHeight: this.term.rows,
      }).catch()
      // Terminal resize 时通知 ssh
      this.term.onResize((event) => {
        invoke('ssh_window_change', {
          sessionId: this.sessionId,
          colWidth: event.cols,
          rowHeight: event.rows,
        }).catch()
      });
      // 监听 Tauri 窗口大小变化
      window.addEventListener('resize', () => {
        this.updateTerminalSize()
      });
      window.visualViewport.addEventListener('resize', () => {
        this.updateTerminalSize()
      });
      this.term.onKey(({key, domEvent}) => {
        this.handleAutocomplete(key)
      })
      this.updateTerminalSize()
      // 处理触摸事件
      this.bindTouchEvents()
    },

    pressKeyboard(code) {
      this.writeCode(code)
      this.term.scrollToBottom()
      this.term.focus()
      this.handleAutocomplete(code)
    },
    writeCode(code) {
      invoke('ssh_run_command', {
        sessionId: this.sessionId,
        command: code
      })
    },
    handleAutocomplete(data) {
      switch (data) {
        case '\r':
          this.currenLine = '';
          break;

        case '\x7f':
          this.currenLine = this.currenLine.slice(0, -1);
          break;

        case '\x03': // Ctrl+C
        case '\x15': // Ctrl+U
          this.currenLine = '';
          break;

        case '\x17': // Ctrl+W
          this.currenLine = this.currenLine.substring(0, this.currenLine.lastIndexOf(" "))
          break;

        default:
          if (data >= ' ' && data <= '~') {
            this.currenLine += data;
          }
      }

      if (this.currenLine.length > 0) {
        // 显示 autocomplete
        let pos = this.calcGetCursorScreenPosition()
        if (pos && pos.pageY) {
          // this.showAutocomplete.show = true
          // this.showAutocomplete.top = pos.pageY + 'px'
          // this.showAutocomplete.left = pos.pageX + 'px'
        }
      } else {
        this.showAutocomplete.show = false
      }
    },

    updateTerminalSize() {
      if (!this.term || !this.fitAddon) return
      const footerHeight = (this.enableKeyboard ? 350 : 0);
      // Terminal 距离底部
      this.termStyle.bottom = footerHeight + 'px';
      this.termStyle.height = footerHeight + 'px';
      this.$nextTick(async () => {
        this.term.focus()
        this.fitAddon.fit()
        this.term.scrollToBottom()
      })
    },

    /*触摸滚动支持*/
    bindTouchEvents () {
      const el = this.term.element
      if (!el) return
      const doc = el
      doc.addEventListener('touchstart', this.onTouchStart, { passive: true })
      doc.addEventListener('touchmove', this.onTouchMove, { passive: false })
      doc.addEventListener('touchend', this.onTouchEnd, { passive: false })
      // doc.addEventListener('mousedown', this.onMouseStart, { passive: true })
      // doc.addEventListener('mousemove', this.onTouchMove, { passive: false })
      // doc.addEventListener('mouseup', this.onTouchEnd, { passive: false })
      window.term = this.term
    },

    unbindTouchEvents () {
      const el = this.term && this.term.element
      if (!el) return
      const doc = el
      doc.removeEventListener('touchstart', this.onTouchStart)
      doc.removeEventListener('touchmove', this.onTouchMove)
      doc.removeEventListener('touchend', this.onTouchEnd)
      // doc.removeEventListener('mousedown', this.onMouseStart)
      // doc.removeEventListener('mousemove', this.onTouchMove)
      // doc.removeEventListener('mouseup', this.onTouchEnd)
    },
    fun_clientXY(event, name) {
      if (event[name]) {
        return event[name]
      }
      if (event?.touches?.length) {
        return event.touches[0][name]
      }
    },
    onMouseStart (event) {
      if (event.button === 1) this.onTouchStart(event)
    },
    onTouchStart (event) {
      const clientX = this.fun_clientXY(event, 'clientX')
      const clientY = this.fun_clientXY(event, 'clientY')
      this.lastY = clientY
      this.enScroll = true
      this.longTouchTimeout = setTimeout(() => {
        this.enScroll = false
        this.enSelect = true
        if (this.startSelect) {
          // 第二次拖选
          this.endSelect = this.startSelect
          this.term.select(this.startSelect.col, this.startSelect.row, 5)
        } else {
          // 显示一个开始选择光标
          this.startSelect = this.calcPositionToColRow(clientX, clientY)
          this.term.select(this.startSelect.col, this.startSelect.row, 1)
        }
      }, 1000);
    },
    calcPositionToColRow(clientX, clientY) {
      const x = clientX
      // 调一些位置，方便用户看到
      let y
      if (this.enableKeyboard) {
        y = clientY - 120
      } else {
        y = clientY - 120
      }
      const dims = this.term._core._renderService.dimensions.css;
      const cellWidth = dims.cell.width;
      const cellHeight = dims.cell.height;
      let col = Math.floor(x / cellWidth);
      // 加上当前滚动的行
      let row = Math.floor(y / cellHeight) + this.term.buffer.active.viewportY;
      return {col, row}
    },
    calcCharDistance(a, b) {
      const indexA = a.row * this.term.cols + a.col;
      const indexB = b.row * this.term.cols + b.col;
      return indexB - indexA;
    },
    calcGetCursorScreenPosition() {
      const term = this.term
      const terminalElement = this.term.element
      const buffer = term.buffer.active;
      const screenRow = buffer.cursorY - buffer.viewportY;
      const screenCol = buffer.cursorX;
      if (screenRow < 0 || screenRow >= term.rows) {
        return null; // 光标不在屏幕内
      }
      const dims = term._core._renderService.dimensions.css;
      const cellWidth = dims.cell.width;
      const cellHeight = dims.cell.height;
      const x = screenCol * cellWidth;
      const y = screenRow * cellHeight;
      const rect = terminalElement.getBoundingClientRect();
      return {
        screenRow,
        screenCol,
        x,
        y,
        pageX: rect.left + x,
        pageY: rect.top + y,
      };
    },
    onTouchEnd (e) {
      this.enSelect = false
      this.enScroll = false
      clearTimeout(this.longTouchTimeout)
      if (this.startSelect) {
        if (this.endSelect) {
          this.startSelect = null
          this.endSelect = null
          const selectionText = this.term.getSelection()
          writeText(selectionText).then(() => {
            this.notify.success('已复制到剪切板')
          }).catch(err => {
            this.notify.error('复制到剪切板失败：' + err)
          })
        } else {
          this.endSelect = this.startSelect
        }
      }
    },
    onTouchMove (event) {
      if (this.enSelect) {
        // 滑动 选择 功能
        const clientX = this.fun_clientXY(event, 'clientX')
        const clientY = this.fun_clientXY(event, 'clientY')
        // 1. 先计算新的位置
        let newPos = this.calcPositionToColRow(clientX, clientY)
        if (this.endSelect) {
          // 2. 再计算字符差
          let dist = this.calcCharDistance(this.startSelect, newPos)
          if (dist > 0) {
            // 正向选择
            this.term.select(this.startSelect.col, this.startSelect.row, dist)
          } else {
            // 反向选择
            this.term.select(newPos.col, newPos.row, Math.abs(dist) + 1)
          }
        } else {
          // 2. 仅移动光标
          this.startSelect = newPos
          this.term.select(newPos.col, newPos.row, 1)
        }
      } else if (this.enScroll){
        // 滑动 scroll 功能
        const currentY = this.fun_clientXY(event, 'clientY')
        const deltaY = this.lastY - currentY
        if (Math.abs(deltaY) > SCROLL_THRESHOLD) {
          const lines = Math.floor(deltaY / SCROLL_SPEED)
          if (lines !== 0) {
            // 禁止再触发选择
            clearTimeout(this.longTouchTimeout)
            // 开始移动
            this.term.scrollLines(lines)
            this.lastY = currentY
            event.preventDefault() // 阻止页面滚动
          }
        }
      }
    },
  }
}
</script>

<style scoped lang="scss">
.terminal-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 70px);
}

.show-autocomplete {
  position: fixed;
  display: flex;
  flex-direction: column;
  padding: 2px 0;
  background: #5995b3;
  border-radius: 3px;
  div {
    padding: 0 2px;
    border-bottom: 1px solid #DDD;

  }
}

.my-terminal {
  flex: 1;
  background: #000000;
  :deep(.xterm-decoration-overview-ruler) {
    display: none !important;
  }
}

.footer-keyboard {
  height: auto;
  background: #222;
  flex-shrink: 0;
  transition: max-height 0.3s ease;
  overflow: hidden;
}
.footer-keyboard.hide {
  max-height: 0;
  height: 0;
  padding: 0;
}
</style>

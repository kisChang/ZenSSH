<template>
  <div class="terminal-container" ref="container">
    <div ref="terminal" class="my-terminal" :style="termStyle"></div>

    <div v-if="enableKeyboard" class="footer-keyboard" v-show="showKeyboard">
      <keyboard @press="pressKeyboard" @click.stop="()=>{}"/>
    </div>

    <div v-if="showAutocomplete.show" class="show-autocomplete" :style="showAutocomplete">
      <div>ls</div>
      <div>ls -al</div>
    </div>

    <!-- TODO 端口转发面板  暂不支持 -->
    <div v-if="false" class="port-forward">
      <div v-if="portForwards.length > 0" class="port-forward-panel">
        <div class="panel-header">
          <span>端口转发</span>
          <el-button size="small" type="primary" @click="showPortForwardDialog">添加</el-button>
        </div>
        <div v-for="pf in portForwards" :key="pf.id" class="forward-item">
          <span>{{ pf.local_host }}:{{ pf.local_port }} -> {{ pf.remote_host }}:{{ pf.remote_port }}</span>
          <el-button size="small" type="danger" @click="closePortForward(pf)">关闭</el-button>
        </div>
      </div>
      <div v-else class="port-forward-empty">
        <el-button size="small" @click="showPortForwardDialog" v-if="!closed">添加端口转发</el-button>
      </div>

      <!-- 端口转发对话框 -->
      <el-dialog v-model="showPortForward" title="添加端口转发" width="400px">
        <el-form :model="forwardConfig" label-width="80px">
          <el-form-item label="本地端口">
            <el-input-number v-model="forwardConfig.local_port" :min="1024" :max="65535" style="width: 100%"/>
          </el-form-item>
          <el-form-item label="远程主机">
            <el-input v-model="forwardConfig.remote_host" placeholder="远程目标地址" />
          </el-form-item>
          <el-form-item label="远程端口">
            <el-input-number v-model="forwardConfig.remote_port" :min="1" :max="65535" style="width: 100%"/>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showPortForward = false">{{ $t('common.cancel') }}</el-button>
          <el-button type="primary" @click="createPortForward">确定</el-button>
        </template>
      </el-dialog>
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
      showKeyboard: true, enableKeyboard: false,
      currenLine: "", showAutocomplete: {show: false, left: '100px', top: '100px'},
      // 端口转发相关
      portForwards: [],
      showPortForward: false,
      forwardConfig: {
        local_host: '127.0.0.1',
        local_port: 0,
        remote_host: '',
        remote_port: 22,
      }
    }
  },
  watch: {
    showKeyboard(){
      this.updateTerminalSize()
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
        disableStdin: true,
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
      this.term.textarea.readOnly = true
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
          case "forwardSuccess":
            // 端口转发成功
            this.handleForwardSuccess(data);
            break;
          case "forwardClosed":
            // 端口转发关闭
            this.handleForwardClosed(data);
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
      // 加载现有端口转发
      await this.loadPortForwards();
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
      const footerHeight = (this.showKeyboard && this.enableKeyboard ? 350 : 0);
      // Terminal 距离底部
      this.termStyle.bottom = footerHeight + 'px';
      this.termStyle.height = footerHeight + 'px';
      this.$nextTick(async () => {
        this.term.focus()
        this.fitAddon.fit()
        this.term.scrollToBottom()
      })
    },

    async loadPortForwards() {
      try {
        const forwards = await invoke('ssh_list_port_forwards', {
          sessionId: this.sessionId
        });
        if (forwards && forwards.length > 0) {
          this.portForwards = forwards.map((f, idx) => ({
            id: 'pf_' + idx,
            session_id: this.sessionId,
            channel_id: f.channel_id,
            local_host: f.local_host,
            local_port: f.local_port,
            remote_host: f.remote_host,
            remote_port: f.remote_port,
            state: 'active'
          }));
        }
      } catch (e) {
        console.warn('加载端口转发列表失败:', e);
      }
    },
    handleForwardSuccess(data) {
      const forward = {
        id: 'pf_' + Math.random().toString(36).substring(2),
        session_id: this.sessionId,
        channel_id: data.channel_id,
        local_host: data.local_host,
        local_port: data.local_port,
        remote_host: data.remote_host,
        remote_port: data.remote_port,
        state: 'active'
      };
      this.portForwards.push(forward);
      this.tabStore.addPortForward(forward);
      this.term.write(`\r\n[端口转发已启动: ${data.local_host}:${data.local_port} -> ${data.remote_host}:${data.remote_port}]\r\n`);
    },
    handleForwardClosed(data) {
      const idx = this.portForwards.findIndex(f => f.channel_id === data.channel_id);
      if (idx >= 0) {
        const pf = this.portForwards[idx];
        this.portForwards.splice(idx, 1);
        this.tabStore.removePortForward(pf.id);
        this.term.write(`\r\n[端口转发已关闭: ${pf.local_host}:${pf.local_port}]\r\n`);
      }
    },
    showPortForwardDialog() {
      this.forwardConfig.local_port = 0;
      this.forwardConfig.remote_host = '';
      this.forwardConfig.remote_port = 22;
      this.showPortForward = true;
    },
    async createPortForward() {
      if (!this.forwardConfig.remote_host) {
        this.$message.warning('请输入远程主机地址');
        return;
      }
      try {
        await invoke('ssh_port_forward', {
          sessionId: this.sessionId,
          localHost: this.forwardConfig.local_host,
          localPort: this.forwardConfig.local_port,
          remoteHost: this.forwardConfig.remote_host,
          remotePort: this.forwardConfig.remote_port,
        });
        this.showPortForward = false;
        this.$message.success('端口转发创建成功');
      } catch (e) {
        this.$message.error('创建端口转发失败: ' + e);
      }
    },
    async closePortForward(pf) {
      try {
        await invoke('ssh_close_port_forward', {
          sessionId: this.sessionId,
          channelId: pf.channel_id,
        });
      } catch (e) {
        this.$message.error('关闭端口转发失败: ' + e);
      }
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
      if (this.showKeyboard && this.enableKeyboard) {
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
      } else {
        // 仅在未触发长按时才触发这个事件
        this.showKeyboard = !this.showKeyboard
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
  height: 330px;
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

.port-forward {
  position: fixed;
  top: 0;
  right: 0;
  width: 100px;
  height: 20px;
  display: none;
  z-index: 10;
}
.port-forward-panel {
  border-top: 1px solid #ddd;
  padding: 8px;
  background: #f5f5f5;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-weight: bold;
    font-size: 14px;
  }

  .forward-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: #fff;
    border-radius: 4px;
    margin-bottom: 4px;
    font-size: 13px;
  }
}

.port-forward-empty {
  border-top: 1px solid #ddd;
  padding: 8px;
  text-align: center;
  background: #f5f5f5;
}
</style>

<template>
  <div class="keyboard">
    <!-- 顶部功能行 -->
    <div class="row">
      <key-btn :code="'\x1b'" title="Esc" @press="onDown"/>
      <key-btn :code="'/'" title="/" @press="onDown"/>
      <key-btn :code="'|'" title="|" @press="onDown"/>
      <key-btn :code="'-'" title="-" @press="onDown"/>
      <key-btn :code="'\x1b[A'" title="↑" @press="onDown"/>
      <key-btn :code="'\x03'" title="⌃C" @press="onDown"/>
      <key-btn :code="'~'" title="~" @press="onDown"/>
      <key-btn :code="'&'" title="&" @press="onDown"/>
    </div>
    <div class="row">
      <key-btn :code="'\x09'" title="Tab" @press="onDown"/>
      <key-btn :code="'\x1b[5~'" title="PgUp" @press="onDown"/>
      <key-btn :code="'\x1b[6~'" title="PgDn" @press="onDown"/>
      <key-btn :code="'\x1b[D'" title="←" @press="onDown"/>
      <key-btn :code="'\x1b[B'" title="↓" @press="onDown"/>
      <key-btn :code="'\x1b[C'" title="→" @press="onDown"/>
      <key-btn :code="'.'" title="." @press="onDown"/>
      <key-btn @press="toggleShown">
        <el-icon :style="{rotate: showKeyboard ? '90deg' : '-90deg' }"><DArrowRight /></el-icon>
      </key-btn>
    </div>

    <!-- 可折叠区域（数字行 + 字母区 + 底部功能行） -->
    <Transition name="slide">
      <div v-show="showKeyboard" class="keyboard-body">
        <!-- 数字行 -->
        <div class="row">
          <key-btn v-for="key in currentNumbers"
                   :key="key"
                   :code="key" :title="key"
                   @press="onDown"/>
        </div>

        <!-- 字母区 -->
        <div class="row" v-for="row in currentLetters" :key="row.join('')">
          <key-btn v-for="key in row"
                   :disabled="key === ''"
                   :class="[keyClass(key)]"
                   :key="key"
                   :code="key" :title="key"
                   @press="onDown"/>
        </div>

        <!-- 底部功能行 -->
        <div class="row">
          <key-btn :class="[keyClass('Ctrl')]" :code="'Ctrl'" title="Ctrl" @press="onDown"/>


          <key-btn :code="'Symbol'" title="." @press="toggleSymbol">
            {{ mode === 'symbol' ? 'ABC' : '?123' }}
          </key-btn>

          <key-btn style="flex: 3;"
                   :code="' '"
                   title="Space" @press="onDown"/>

          <key-btn style="flex: 2;"
                   :class="[keyClass('Enter')]"
                   :code="'Enter'" title="Enter" @press="onDown"/>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script>
import { vibrate } from '@tauri-apps/plugin-haptics'
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import {appConfigStore} from "@/store.js";
import KeyBtn from "@/mobile/key-btn.vue";

const fnMap = {
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',
};


export default {
  name: "Keyboard",
  components: {KeyBtn},
  data() {
    return {
      shift: false,
      keepShift: false,
      ctrl: false,
      mode: 'letter', // letter | symbol

      showKeyboard: true,

      layouts: {
        letter: {
          numbers: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
          letters: [
            ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
            ["", "a", "s", "d", "f", "g", "h", "j", "k", "l", ""],
            ["Shift", "z", "x", "c", "v", "b", "n", "m", "⌫"]
          ]
        },
        shift: {
          numbers: ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
          letters: [
            ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
            ["", "A", "S", "D", "F", "G", "H", "J", "K", "L", ""],
            ["SHIFT", "Z", "X", "C", "V", "B", "N", "M", "⌫"]
          ]
        },
        symbol: {
          numbers: ["%", "^", ",", "?", "!", "¥", "€", "£", "°", "§"],
          letters: [
            ["-", "_", "/", "\\", ".", ":", ";", "@", "$", "#"],
            ["", "(", ")", "[", "]", "{", "}", "<", ">", "|", ""],
            ["", "!", "*", "'", "\"", "`", "~", "=", "+", "", "⌫"]
          ]
        }
      },

      setting: {
        vibrate: 0
      }
    };
  },
  mounted() {
    this.setting.vibrate = appConfigStore().virtualKeyboardVibrate;
  },
  computed: {
    currentNumbers() {
      if (this.mode === 'symbol') return this.layouts.symbol.numbers;
      if (this.shift || this.keepShift) return this.layouts.shift.numbers;
      return this.layouts.letter.numbers;
    },
    currentLetters() {
      if (this.mode === 'symbol') return this.layouts.symbol.letters;
      if (this.shift || this.keepShift) return this.layouts.shift.letters;
      return this.layouts.letter.letters;
    }
  },

  methods: {
    toggleShown() {
      this.showKeyboard = !this.showKeyboard
      this.onceVibrate()
      setTimeout(() => {
        this.$emit('toggleKeyboard')
      }, 300)
    },

    onceVibrate() {
      if (this.setting.vibrate > 0) {
        vibrate(this.setting.vibrate).catch(() => {})
      }
    },

    keyClass(key) {
      if (key === '') return 'placeholder';
      if (key === 'Ctrl') {
        return this.ctrl ? 'active' : '';
      }
      if (key === 'Shift' || key === 'SHIFT') {
        return this.shift ? (this.keepShift ? 'active keep' : 'active') : '';
      }
      return '';
    },

    onDown(key) {
      if (key === ''){
        return; // 这种的不处理
      }
      // 处理删除功能
      if (key === '⌫') {
        key = '\b';
      }
      this.press(key);
    },

    press(key) {
      this.onceVibrate();

      if (key === 'Shift' || key === 'SHIFT') return this.toggleShift();
      if (key === 'Ctrl') return this.toggleCtrl();
      if (key === 'Enter') return this.$emit("press", '\r');

      if (key.startsWith("F")) {
        key = fnMap[key]
      } else if (this.ctrl) {
        this.ctrl = false;
        if (key === 'v') { // 从剪贴板粘贴
          readText().then(clipboardText => {
            this.$confirm("确定从剪切板粘贴数据？<br/>" + clipboardText, {
              showClose: false,
              closeOnClickModal: false,
              dangerouslyUseHTMLString: true,
              inputValue: clipboardText
            }).then((action) => {
              this.$emit("press", clipboardText);
            }).catch(() => {
            })
          }).catch(() => {
            this.$message.error('读取剪切板失败')
          })
          return;
        }
        key = String.fromCharCode(key.charCodeAt(0) & 0x1F);
      }

      this.$emit("press", key);

      if (this.shift && !this.keepShift) {
        this.shift = this.keepShift = false
      }
      if (this.ctrl) {
        this.ctrl = false
      }
    },

    toggleCtrl() {
      this.ctrl = !this.ctrl;
    },
    toggleShift() {
      if (this.shift) {
        if (this.keepShift) {
          this.shift = this.keepShift = false;
        } else {
          this.keepShift = true;
        }
      } else {
        this.shift = true;
      }
    },
    toggleSymbol() {
      this.mode = this.mode === 'symbol' ? 'letter' : 'symbol';
      this.shift = false;
      this.keepShift = false;
    },
  }
};
</script>

<style scoped lang="scss">
.keyboard {
  background: #222;
  padding: 5px;
  margin-bottom: 10px;
  user-select: none;
  touch-action: manipulation;
}

.row {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

/* slide 过渡动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease-in-out;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateY(10px);
  opacity: 0;
}

.keyboard-body {
  overflow: hidden;
}

button {
  flex: 1;
  margin: 2px;
  padding: 6px 0;
  font-size: 16px;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 6px;
  height: 36px !important;
  max-height: 36px !important;

  &.placeholder {
    background: none;
    padding: 0;
    flex: 0.3;
  }

  &.active {
    background: #007bff;
    &.keep {
      font-size: 15px;
    }
  }
}

</style>

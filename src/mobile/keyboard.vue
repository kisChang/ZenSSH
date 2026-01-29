<template>
  <div class="keyboard">
    <!-- 顶部功能行 -->
    <div class="row">
      <button @pointerdown.prevent="onDown('\x1b')"
              @pointerup="onUp"
              @pointerleave="onUp">Esc</button>
      <button @pointerdown.prevent="onDown('/')"
              @pointerup="onUp"
              @pointerleave="onUp">/</button>
      <button @pointerdown.prevent="onDown('|')"
              @pointerup="onUp"
              @pointerleave="onUp">|</button>
      <button @pointerdown.prevent="onDown('-')"
              @pointerup="onUp"
              @pointerleave="onUp">-</button>
      <button @pointerdown.prevent="onDown('\x1b[A')"
              @pointerup="onUp"
              @pointerleave="onUp">↑</button>
      <button @pointerdown.prevent="onDown('\x03')"
              @pointerup="onUp"
              @pointerleave="onUp">⌃C</button>
      <button @pointerdown.prevent="onDown('~')"
              @pointerup="onUp"
              @pointerleave="onUp">~</button>
    </div>
    <div class="row">
      <button @pointerdown.prevent="onDown('\x09')"
              @pointerup="onUp"
              @pointerleave="onUp">Tab</button>
      <button @pointerdown.prevent="onDown('\x1b[5~')"
              @pointerup="onUp"
              @pointerleave="onUp">PgUp</button>
      <button @pointerdown.prevent="onDown('\x1b[6~')"
              @pointerup="onUp"
              @pointerleave="onUp">PgDn</button>
      <button @pointerdown.prevent="onDown('\x1b[D')"
              @pointerup="onUp"
              @pointerleave="onUp">←</button>
      <button @pointerdown.prevent="onDown('\x1b[B')"
              @pointerup="onUp"
              @pointerleave="onUp">↓</button>
      <button @pointerdown.prevent="onDown('\x1b[C')"
              @pointerup="onUp"
              @pointerleave="onUp">→</button>
      <button @pointerdown.prevent="onDown('.')"
              @pointerup="onUp"
              @pointerleave="onUp">.</button>
    </div>

    <!-- 数字行 -->
    <div class="row">
      <button v-for="key in currentNumbers"
              :key="key"
              :class="{ pressed: activeKey === key }"
              @pointerdown.prevent="onDown(key)"
              @pointerup="onUp"
              @pointerleave="onUp">
        {{ key }}
      </button>
    </div>

    <!-- 字母区 -->
    <div class="row" v-for="row in currentLetters" :key="row.join('')">
      <button v-for="key in row"
              :key="key"
              :class="[keyClass(key), { pressed: activeKey === key }]"
              @pointerdown.prevent="onDown(key)"
              @pointerup="onUp"
              @pointerleave="onUp">
        {{ key }}
      </button>
    </div>

    <!-- 底部功能行 -->
    <div class="row">
      <button :class="[keyClass('Ctrl'), { pressed: activeKey === 'Ctrl' }]" @pointerdown.prevent="onDown('Ctrl')">Ctrl</button>

      <button @pointerdown.prevent="toggleSymbol">
        {{ mode === 'symbol' ? 'ABC' : '?123' }}
      </button>

      <button style="flex: 3;"
              @pointerdown.prevent="onDown(' ')"
              @pointerup="onUp"
              @pointerleave="onUp">Space</button>

      <button style="flex: 2;"
              :class="keyClass('Enter')"
              @pointerdown.prevent="onDown('Enter')"
              @pointerup="onUp"
              @pointerleave="onUp">Enter</button>
    </div>
  </div>
</template>

<script>
import { vibrate } from '@tauri-apps/plugin-haptics'
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import {appConfigStore} from "@/store.js";

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
  data() {
    return {
      shift: false,
      keepShift: false,
      ctrl: false,
      showKeyboard: true,
      mode: 'letter', // letter | symbol

      activeKey: null,
      repeatTimer: null,
      repeatDelayTimer: null,

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
          numbers: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"],
          letters: [
            ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
            ["", "-", "+", "=", "/", "\\", "|", "<", ">", "?", ""],
            ["", "", "[", "]", "{", "}", "_", "~", "`", "⌫"]
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
      this.activeKey = key;

      if (key === '⌫') {
        // 处理删除功能
        key = '\b';
      }
      this.press(key);

      //这几个不触发repeat
      if (key === 'Shift' || key === 'SHIFT' ||key === 'Ctrl') return;

      this.repeatDelayTimer = setTimeout(() => {
        this.repeatTimer = setInterval(() => {
          this.onDown(key);
        }, 500);
      }, 300);
    },

    onUp() {
      this.activeKey = null;
      clearTimeout(this.repeatDelayTimer);
      clearInterval(this.repeatTimer);
    },

    press(key) {
      if (this.setting.vibrate > 0) {
        // 体验不好
        vibrate(this.setting.vibrate).catch(() => {});
      }

      if (key === 'Shift' || key === 'SHIFT') return this.toggleShift();
      if (key === 'Ctrl') return this.toggleCtrl();
      if (key === 'Enter') return this.$emit("press", '\r');

      if (key.startsWith("F")) {
        key = fnMap[key]
      } else if (this.ctrl) {
        if (key === 'v') { // 从剪贴板粘贴
          this.$confirm("从剪切板粘贴数据？", {showClose: false}).then(() => {
            readText().then(clipboardText => {
              this.$emit("press", clipboardText);
            }).catch(() => {})
          }).catch(() => {})
          return ;
        }
        key = String.fromCharCode(key.charCodeAt(0) & 0x1F);
        this.ctrl = false;
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
  padding: 4px;
  user-select: none;
  touch-action: manipulation;
}

.row {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
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

  &.pressed {
    background: #007bff !important;
    transform: scale(0.95);
  }

  &.active {
    background: #007bff;
    &.keep {
      font-weight: bold;
      font-size: 15px;
    }
  }
}

</style>

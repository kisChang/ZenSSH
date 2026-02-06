<template>
  <button
      :class="['key-btn', { [activeClass]: isActive } ]"
      :disabled="disabled"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
      @pointercancel="onPointerCancel"
      @mousedown="onPointerDown"
      @mouseup="onPointerUp"
      @mouseleave="onPointerLeave"
      @touchstart="onPointerDown"
      @touchend="onPointerUp"
      @touchcancel="onPointerCancel">
    <slot>{{ title || code }}</slot>
  </button>
</template>

<script>
export default {
  name: 'KeyBtn',
  props: {
    title: String,
    code: String,
    longPressDelay: {type: Number, default: 500}, // ms before repeating
    repeatInterval: {type: Number, default: 100}, // ms between repeats
    activeClass: {type: String, default: 'active'},
    disabled: {type: Boolean, default: false},
    moveCancelThreshold: {type: Number, default: 12} // px
  },
  data() {
    return {
      isActive: false,
      _longPressTimer: null,
      _repeatTimer: null,
      _pointerId: null,
      _startX: 0,
      _startY: 0,
      _usingPointer: typeof window !== 'undefined' && 'PointerEvent' in window,
      _keyboardActive: false
    };
  },
  methods: {
    onPointerDown(e) {
      if (this.disabled) return;
      // If we have pointer events available, ignore fallback mouse/touch events
      if (this._usingPointer && (e.type === 'mousedown' || e.type === 'touchstart')) return;

      // Support pointer event pointerId tracking
      if (e.pointerId != null) this._pointerId = e.pointerId;

      // Record start position to allow cancelling on move
      const p = this._getEventPoint(e);
      this._startX = p.x;
      this._startY = p.y;

      this._activateImmediate();

      // Start long-press timer that will start repeating
      this._longPressTimer = setTimeout(() => {
        // start repeating
        this._repeatTimer = setInterval(() => {
          this._keyDown();
        }, this.repeatInterval);
      }, this.longPressDelay);

      // Listen for move if pointer events are not present
      if (!this._usingPointer) {
        window.addEventListener('mousemove', this._onMoveFallback);
        window.addEventListener('touchmove', this._onMoveFallback, {passive: false});
      }
    },
    onPointerUp(e) {
      if (this.disabled) return;
      if (this._usingPointer && (e.type === 'mouseup' || e.type === 'touchend')) return;

      // if pointerId exists, ensure it's the same pointer
      if (this._pointerId != null && e.pointerId != null && e.pointerId !== this._pointerId) return;

      // Stop repeating and long-press timers
      this._clearTimers();

      // Emit keyUp
      this._keyUp();

      this._deactivate();

      // cleanup fallback move listeners
      if (!this._usingPointer) {
        window.removeEventListener('mousemove', this._onMoveFallback);
        window.removeEventListener('touchmove', this._onMoveFallback);
      }

      this._pointerId = null;
    },
    onPointerLeave(e) {
      // If pointer left while down, cancel
      if (this.isActive) {
        this._clearTimers();
        this._deactivate();
        this._keyUp();
      }
    },
    onPointerCancel(e) {
      if (this.isActive) {
        this._clearTimers();
        this._deactivate();
        this._keyUp();
      }
      this._pointerId = null;
    },
    _onMoveFallback(e) {
      // used only when pointer events not available
      const p = this._getEventPoint(e);
      const dx = Math.abs(p.x - this._startX);
      const dy = Math.abs(p.y - this._startY);
      if (dx > this.moveCancelThreshold || dy > this.moveCancelThreshold) {
        // consider it a cancel (user is scrolling/moving)
        this._clearTimers();
        if (this.isActive) {
          this._deactivate();
          this._keyUp();
        }
        window.removeEventListener('mousemove', this._onMoveFallback);
        window.removeEventListener('touchmove', this._onMoveFallback);
      }
    },
    _getEventPoint(e) {
      if (e.touches && e.touches[0]) return {x: e.touches[0].clientX, y: e.touches[0].clientY};
      if (e.changedTouches && e.changedTouches[0]) return {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY
      };
      return {x: e.clientX || 0, y: e.clientY || 0};
    },
    _activateImmediate() {
      // immediate visual and event
      this.isActive = true;
      this._keyDown();
    },
    _deactivate() {
      this.isActive = false;
    },
    _clearTimers() {
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }
      if (this._repeatTimer) {
        clearInterval(this._repeatTimer);
        this._repeatTimer = null;
      }
    },

    _keyUp() {
    },
    _keyDown() {
      this.$emit('press', this.code ? this.code : this.title)
    }
  },
  beforeDestroy() {
    this._clearTimers();
    if (!this._usingPointer) {
      window.removeEventListener('mousemove', this._onMoveFallback);
      window.removeEventListener('touchmove', this._onMoveFallback);
    }
  }
};
</script>

<style scoped>
.key-btn:disabled {
  opacity: 0;
  cursor: not-allowed;
}

/* active style, customizable via activeClass prop */
.key-btn.active {
  transform: translateY(1px) scale(0.998);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06) inset;
}
</style>

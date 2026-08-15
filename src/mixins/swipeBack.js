import {isIos} from '@/commons.js'

// 左边缘触发宽度(px)
const EDGE = 30
// 触发返回所需的水平位移占屏幕宽度比例（宽屏 0.3，窄屏 0.4）
const RATIO = window.innerWidth > 600 ? 0.3 : 0.4

// 返回箭头 SVG
const ARROW_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
     fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"
     stroke-linejoin="round" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4))">
  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
</svg>`

/**
 * 侧滑返回 Mixin
 *
 * 在组件根元素上监听左边缘触摸 / 鼠标按下，当滑动进度达到阈值时
 * 调用 `onSwipeBack()`。滑动过程中在屏幕左侧固定显示一个返回箭头标识。
 *
 * 组件可选钩子:
 *   - shouldSwipeBack(): Boolean  当前场景是否允许侧滑（默认 true）
 *   - onSwipeBack(): void         触发返回时的回调
 */
export default {
  mounted() {
    if (!isIos()) return
    this._swipeScreenW = window.innerWidth
    this._swipeOnResize = () => {
      this._swipeScreenW = window.innerWidth
    }
    window.addEventListener('resize', this._swipeOnResize)

    // 固定在屏幕左侧的返回箭头标识
    const arrow = document.createElement('div')
    Object.assign(arrow.style, {
      position: 'fixed',
      top: '50%',
      left: '16px',
      transform: 'translate(-50%, -50%) scale(0.8)',
      opacity: '0',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '9999',
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease, transform 0.2s ease, background 0.2s ease',
    })
    arrow.innerHTML = ARROW_SVG
    this._swipeArrow = arrow
    document.body.appendChild(arrow)

    this._swipeState = null

    // —— 统一的开始 / 移动 / 结束 ——
    this._swipeStart = (clientX, clientY) => {
      if (typeof this.shouldSwipeBack === 'function' && !this.shouldSwipeBack()) return
      if (clientX > EDGE) return
      this._swipeState = {
        startX: clientX,
        startY: clientY,
        x: 0,
        active: true,
        decided: false,
      }
    }

    this._swipeMove = (clientX, clientY, preventDefault) => {
      const s = this._swipeState
      if (!s || !s.active) return
      const dx = clientX - s.startX
      const dy = clientY - s.startY

      // 首次移动时判定方向：纵向主导则放弃，交给页面滚动
      if (!s.decided) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          s.active = false
          this._resetSwipeArrow()
          return
        }
        if (Math.abs(dx) > 8) {
          s.decided = true
        } else {
          return
        }
      }

      if (preventDefault) preventDefault()
      const x = Math.max(0, Math.min(dx, this._swipeScreenW))
      s.x = x
      const progress = x / this._swipeScreenW
      // 箭头固定在左侧，仅做淡入与缩放，不随手指移动
      const ar = this._swipeArrow
      ar.style.transition = 'none'
      const p = Math.min(1, progress / 0.5) // 0~50% 映射到 0~1
      ar.style.opacity = String(Math.min(1, progress * 8))
      ar.style.transform = `translate(-50%, -50%) scale(${0.8 + p * 0.8})`
      ar.style.background = `rgba(0,0,0,${0.25 + p * 0.2})`
    }

    this._swipeEnd = () => {
      const s = this._swipeState
      this._swipeState = null
      if (!s || !s.active) return
      const threshold = this._swipeScreenW * RATIO
      if (s.x > threshold) {
        this._animateSwipeArrow(() => {
          if (typeof this.onSwipeBack === 'function') this.onSwipeBack()
        })
      } else {
        this._resetSwipeArrow()
      }
    }

    // —— 触摸事件 ——
    this._swipeTouchStart = (e) => {
      const t = e.touches[0]
      this._swipeStart(t.clientX, t.clientY)
    }
    this._swipeTouchMove = (e) => {
      const t = e.touches[0]
      this._swipeMove(t.clientX, t.clientY, () => e.preventDefault())
    }
    this._swipeTouchEnd = () => this._swipeEnd()

    // —— 鼠标事件 ——
    this._swipeMouseDown = (e) => {
      if (e.button !== 0) return
      this._swipeStart(e.clientX, e.clientY)
    }
    this._swipeMouseMove = (e) => {
      this._swipeMove(e.clientX, e.clientY, null)
    }
    this._swipeMouseUp = () => this._swipeEnd()

    this.$el.addEventListener('touchstart', this._swipeTouchStart, {passive: true})
    window.addEventListener('touchmove', this._swipeTouchMove, {passive: false})
    window.addEventListener('touchend', this._swipeTouchEnd, {passive: true})
    window.addEventListener('touchcancel', this._swipeTouchEnd, {passive: true})

    this.$el.addEventListener('mousedown', this._swipeMouseDown)
    window.addEventListener('mousemove', this._swipeMouseMove)
    window.addEventListener('mouseup', this._swipeMouseUp)
  },

  unmounted() {
    window.removeEventListener('resize', this._swipeOnResize)
    window.removeEventListener('touchmove', this._swipeTouchMove)
    window.removeEventListener('touchend', this._swipeTouchEnd)
    window.removeEventListener('touchcancel', this._swipeTouchEnd)
    window.removeEventListener('mousemove', this._swipeMouseMove)
    window.removeEventListener('mouseup', this._swipeMouseUp)
    if (this.$el) {
      this.$el.removeEventListener('touchstart', this._swipeTouchStart)
      this.$el.removeEventListener('mousedown', this._swipeMouseDown)
    }
    if (this._swipeArrow && this._swipeArrow.parentNode) {
      this._swipeArrow.parentNode.removeChild(this._swipeArrow)
    }
  },

  methods: {
    _resetSwipeArrow() {
      if (!this._swipeArrow) return
      const ar = this._swipeArrow
      ar.style.transition = 'opacity 0.25s ease, transform 0.25s ease, background 0.25s ease'
      ar.style.opacity = '0'
      ar.style.transform = 'translate(-50%, -50%) scale(0.8)'
      ar.style.background = 'rgba(0,0,0,0.25)'
    },
    _animateSwipeArrow(cb) {
      if (!this._swipeArrow) {
        cb && cb()
        return
      }
      const ar = this._swipeArrow
      ar.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
      ar.style.opacity = '0'
      ar.style.transform = 'translate(-50%, -50%) scale(1.4)'
      setTimeout(cb, 200)
    },
  },
}

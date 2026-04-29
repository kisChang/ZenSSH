package io.kischang.zenssh

// src-tauri/gen/android/app/src/main/java/io/kischang/zenssh/MainActivity.kt
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
// 新增
import android.os.Build
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.OnApplyWindowInsetsListener
import kotlin.math.max

// 修正方案：封装到工具类（单例对象），全局复用
object WindowInsetsUtil {
  fun applySystemBarsPadding(view: View) {
    // 如果需要判断 api版本
    // if (android.os.Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
    //   return
    // }
    ViewCompat.setOnApplyWindowInsetsListener(
      view,
      OnApplyWindowInsetsListener { v: View?, windowInsets: WindowInsetsCompat? ->
        val systemBars = windowInsets!!.getInsets(WindowInsetsCompat.Type.systemBars())
        val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
        v!!.setPadding(
          systemBars.left,
          systemBars.top,
          systemBars.right,
          max(systemBars.bottom, ime.bottom)
        )
        WindowInsetsCompat.CONSUMED
      })
  }
}

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // 调用工具类函数 , 解决键盘被遮挡
    window.decorView?.let { WindowInsetsUtil.applySystemBarsPadding(it) }
  }
}

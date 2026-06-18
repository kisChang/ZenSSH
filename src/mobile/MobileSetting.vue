<template>
  <el-scrollbar class="content" style="text-align: center;">
    <setting-form />

    <footer class="mobile-footer">Version: {{ appVersion }}</footer>
    <footer class="mobile-footer">Copyright © 2026, by <a @click="showAbout">KisChang</a></footer>
  </el-scrollbar>
</template>

<script>
import SettingForm from "@/subs/SettingForm.vue";
import {openUrl} from "@tauri-apps/plugin-opener";
import {getVersion} from "@tauri-apps/api/app";

export default {
  name: "MobileSetting",
  components: {SettingForm},
  data() {
    return {
      appVersion: null,
    }
  },
  mounted() {
    getVersion().then(ver => {
      this.appVersion = ver;
    })
  },
  methods: {
    showAbout(){
      openUrl("https://blog.kischang.top").then()
    },
  }
}
</script>

<style scoped lang="scss">
.content {
  padding: 0 10px;
  height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 150px);
  overflow: hidden;
  .mobile-footer {
    font-size: 0.9rem;
    margin-top: 20px;
  }
}
</style>

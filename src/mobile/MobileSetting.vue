<template>
  <div class="content" style="text-align: center;">
    <setting-form />


    <footer class="mobile-footer">Copyright © 2026, by <a @click="showAbout">KisChang</a></footer>
  </div>
</template>

<script>
import SettingForm from "@/subs/SettingForm.vue";
import {openUrl} from "@tauri-apps/plugin-opener";

export default {
  name: "MobileSetting",
  components: {SettingForm},
  methods: {
    showAbout(){
      openUrl("https://blog.kischang.top").then()
    },
  }
}
</script>

<style scoped lang="scss">
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 10px;
  .mobile-footer {
    font-size: 0.9rem;
    margin-top: 50px;
  }
}
</style>

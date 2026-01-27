<template>
  <div class="content" style="text-align: center;">
    <setting-form />
  </div>
</template>

<script>
import SettingForm from "@/subs/SettingForm.vue";

export default {
  name: "MobileSetting",
  components: {SettingForm}
}
</script>

<style scoped lang="scss">
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 10px;
}
</style>

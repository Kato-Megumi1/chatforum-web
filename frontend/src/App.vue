<template>
  <BackendConnection />
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import BackendConnection from '@/components/BackendConnection.vue';
import { zhCn } from 'element-plus/es/locales.mjs';
</script>

<style lang="scss">
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>

<template>
  <div class="server-monitor" v-if="stats">
    <div class="stats-row">
      <span class="stat-item">
        <el-icon><Cpu /></el-icon>
        CPU: {{ stats.cpuUsage.toFixed(1) }}%
      </span>
      <span class="stat-item">
        <el-icon><Monitor /></el-icon>
        MEM: {{ formatBytes(stats.memUsedKb * 1024) }} / {{ formatBytes(stats.memTotalKb * 1024) }}
      </span>
      <template v-if="stats.netInterfaces.length > 0">
        <span v-for="iface in activeInterfaces" :key="iface.name" class="stat-item net-item">
          <el-icon><Connection /></el-icon>
          {{ iface.name }}
          <span class="net-rx"><el-icon :size="10"><ArrowDown /></el-icon> {{ formatSpeed(iface.rxSpeed) }}/s</span>
          <span class="net-tx"><el-icon :size="10"><ArrowUp /></el-icon> {{ formatSpeed(iface.txSpeed) }}/s</span>
        </span>
      </template>
    </div>
  </div>

  <div class="monitor-empty" v-else>
    <el-icon class="is-loading"><Loading /></el-icon>
    <span>Waiting for data...</span>
  </div>
</template>

<script>
import { listen } from '@tauri-apps/api/event';
import { Cpu, Connection, ArrowDown, ArrowUp, Loading } from '@element-plus/icons-vue';

// 按 sessionId 缓存最新的监控数据
const statsCache = {};

export default {
  name: "ServerMonitor",
  components: { Cpu, Connection, ArrowDown, ArrowUp, Loading },
  props: {
    sessionId: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      stats: statsCache[this.sessionId] || null,
      unlisten: null,
    };
  },
  computed: {
    // 过滤掉流量为0的lo接口（可选）
    activeInterfaces() {
      if (!this.stats || !this.stats.netInterfaces) return [];
      return this.stats.netInterfaces;
    }
  },
  async mounted() {
    // 监听后端发来的监控数据
    const eventName = `ssh_monitor_${this.sessionId}`;
    this.unlisten = await listen(eventName, (event) => {
      this.stats = event.payload;
      statsCache[this.sessionId] = event.payload;
    });
  },
  beforeUnmount() {
    if (this.unlisten) {
      this.unlisten();
    }
  },
  methods: {
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },
    formatSpeed(bytesPerSec) {
      return this.formatBytes(Math.round(bytesPerSec));
    }
  }
};
</script>

<style scoped lang="scss">
.server-monitor {
  font-size: 12px;
  color: #e2e8f0;
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: monospace;
  font-size: 11px;
  white-space: nowrap;

  .el-icon {
    color: #67C23A;
    flex-shrink: 0;
  }

  &.net-item {
    .net-rx {
      color: #22c55e;
      margin-left: 4px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .net-tx {
      color: #3b82f6;
      margin-left: 4px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
  }
}

.monitor-empty {
  display: flex;
  gap: 8px;
  color: #64748b;
  font-size: 12px;

  .is-loading {
    margin-top: 5px;
    animation: rotating 2s linear infinite;
  }
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

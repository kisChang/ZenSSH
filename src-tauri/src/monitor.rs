use log::{error, info};
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

/// 网络接口统计
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInterface {
    pub name: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    /// 接收速率 (bytes/s)
    pub rx_speed: f64,
    /// 发送速率 (bytes/s)
    pub tx_speed: f64,
}

/// 服务器统计信息
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStats {
    pub cpu_usage: f64,
    pub mem_total_kb: u64,
    pub mem_used_kb: u64,
    pub mem_available_kb: u64,
    pub mem_usage: f64,
    pub swap_total_kb: u64,
    pub swap_used_kb: u64,
    pub net_interfaces: Vec<NetInterface>,
    pub timestamp: u64,
}

impl Default for ServerStats {
    fn default() -> Self {
        ServerStats {
            cpu_usage: 0.0,
            mem_total_kb: 0,
            mem_used_kb: 0,
            mem_available_kb: 0,
            mem_usage: 0.0,
            swap_total_kb: 0,
            swap_used_kb: 0,
            net_interfaces: vec![],
            timestamp: 0,
        }
    }
}

/// CPU 统计（用于计算差值）
#[derive(Clone, Default)]
struct CpuStats {
    user: u64,
    nice: u64,
    system: u64,
    idle: u64,
    iowait: u64,
    irq: u64,
    softirq: u64,
    steal: u64,
}

impl CpuStats {
    fn total(&self) -> u64 {
        self.user + self.nice + self.system + self.idle + self.iowait + self.irq + self.softirq + self.steal
    }

    fn idle_total(&self) -> u64 {
        self.idle + self.iowait
    }
}

/// 解析 /proc/stat 第一行
fn parse_cpu_stat(line: &str) -> Option<CpuStats> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 8 || parts[0] != "cpu" {
        return None;
    }
    Some(CpuStats {
        user: parts[1].parse().ok()?,
        nice: parts[2].parse().ok()?,
        system: parts[3].parse().ok()?,
        idle: parts[4].parse().ok()?,
        iowait: parts.get(5).and_then(|s| s.parse().ok()).unwrap_or(0),
        irq: parts.get(6).and_then(|s| s.parse().ok()).unwrap_or(0),
        softirq: parts.get(7).and_then(|s| s.parse().ok()).unwrap_or(0),
        steal: parts.get(8).and_then(|s| s.parse().ok()).unwrap_or(0),
    })
}

/// 计算 CPU 使用率
fn calc_cpu_usage(prev: &CpuStats, curr: &CpuStats) -> f64 {
    let prev_total = prev.total();
    let curr_total = curr.total();
    let total_diff = curr_total - prev_total;
    if total_diff == 0 {
        return 0.0;
    }
    let idle_diff = curr.idle_total() - prev.idle_total();
    100.0 * (1.0 - idle_diff as f64 / total_diff as f64)
}

/// 解析 /proc/meminfo 行
fn parse_meminfo(text: &str) -> HashMap<String, u64> {
    let mut map = HashMap::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let key = parts[0].trim_end_matches(':').to_string();
            if let Ok(val) = parts[1].parse::<u64>() {
                map.insert(key, val);
            }
        }
    }
    map
}

/// 解析 /proc/net/dev
fn parse_net_dev(text: &str) -> HashMap<String, (u64, u64)> {
    let mut map = HashMap::new();
    for line in text.lines().skip(2) {
        // 跳过前两行表头
        let line = line.trim();
        if let Some(pos) = line.find(':') {
            let name = line[..pos].trim().to_string();
            let values: Vec<&str> = line[pos + 1..].split_whitespace().collect();
            if values.len() >= 10 {
                // 第1列=rx bytes, 第9列=tx bytes
                let rx: u64 = values[0].parse().unwrap_or(0);
                let tx: u64 = values[8].parse().unwrap_or(0);
                map.insert(name, (rx, tx));
            }
        }
    }
    map
}

/// 解析一轮输出，返回 ServerStats
fn parse_stats(
    output: &str,
    prev_cpu: &Option<CpuStats>,
    prev_net: &HashMap<String, (u64, u64)>,
    interval_secs: f64,
) -> (ServerStats, Option<CpuStats>) {
    let mut stats = ServerStats::default();
    let mut new_cpu: Option<CpuStats> = None;

    // 分割各段
    let stat_section = output
        .split("===MEMINFO===")
        .next()
        .unwrap_or("")
        .split("===STAT===")
        .last()
        .unwrap_or("");
    let mem_section = output
        .split("===NETDEV===")
        .next()
        .unwrap_or("")
        .split("===MEMINFO===")
        .last()
        .unwrap_or("");
    let net_section = output
        .split("===STAT===")
        .last()
        .unwrap_or("")
        .split("===NETDEV===")
        .next()
        .unwrap_or("");

    // 解析 CPU
    for line in stat_section.lines() {
        if let Some(cpu) = parse_cpu_stat(line) {
            if let Some(prev) = prev_cpu {
                stats.cpu_usage = calc_cpu_usage(prev, &cpu);
            }
            new_cpu = Some(cpu);
            break;
        }
    }

    // 解析内存
    let mem = parse_meminfo(mem_section);
    stats.mem_total_kb = *mem.get("MemTotal").unwrap_or(&0);
    stats.mem_available_kb = *mem.get("MemAvailable").unwrap_or(&0);
    stats.mem_used_kb = stats.mem_total_kb.saturating_sub(stats.mem_available_kb);
    stats.swap_total_kb = *mem.get("SwapTotal").unwrap_or(&0);
    stats.swap_used_kb = stats.swap_total_kb.saturating_sub(*mem.get("SwapFree").unwrap_or(&0));
    if stats.mem_total_kb > 0 {
        stats.mem_usage = 100.0 * stats.mem_used_kb as f64 / stats.mem_total_kb as f64;
    }

    // 解析网络
    let curr_net = parse_net_dev(net_section);
    for (name, (rx, tx)) in &curr_net {
        let prev_rx = prev_net.get(name).map(|(r, _)| *r).unwrap_or(*rx);
        let prev_tx = prev_net.get(name).map(|(_, t)| *t).unwrap_or(*tx);
        let rx_speed = if interval_secs > 0.0 {
            (*rx as f64 - prev_rx as f64) / interval_secs
        } else {
            0.0
        };
        let tx_speed = if interval_secs > 0.0 {
            (*tx as f64 - prev_tx as f64) / interval_secs
        } else {
            0.0
        };
        stats.net_interfaces.push(NetInterface {
            name: name.clone(),
            rx_bytes: *rx,
            tx_bytes: *tx,
            rx_speed: rx_speed.max(0.0),
            tx_speed: tx_speed.max(0.0),
        });
    }

    stats.timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    (stats, new_cpu)
}

/// 在 buffer 中查找 marker 的位置
fn find_marker(buffer: &[u8], marker: &[u8]) -> Option<usize> {
    if marker.is_empty() || buffer.len() < marker.len() {
        return None;
    }
    buffer.windows(marker.len()).position(|w| w == marker)
}

/// 启动监控通道
/// 在 SSH 连接建立后调用此方法，创建一个旁路 channel 持续读取服务器状态
pub async fn start_monitor(
    app: AppHandle,
    handle: std::sync::Arc<russh::client::Handle<crate::ssh::SshClient>>,
    session_id: String,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    let interval_secs = 5.0f64;

    // 打开一个新的 session channel
    let mut channel = match handle.channel_open_session().await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to open monitor channel for {}: {}", session_id, e);
            return;
        }
    };

    // 执行监控脚本（不请求 PTY，使用 exec 模式）
    let script = r#"while true; do
echo "===STAT==="
head -1 /proc/stat
echo "===MEMINFO==="
grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree):' /proc/meminfo
echo "===NETDEV==="
cat /proc/net/dev
sleep 2
done
"#;

    if let Err(e) = channel.exec(true, script.as_bytes()).await {
        error!("Failed to exec monitor script for {}: {}", session_id, e);
        return;
    }

    info!("Monitor channel started for session: {}", session_id);

    // 本地状态：累积缓冲区、上一轮 CPU/网络数据
    let mut buffer: Vec<u8> = Vec::new();
    let mut prev_cpu: Option<CpuStats> = None;
    let mut prev_net: HashMap<String, (u64, u64)> = HashMap::new();
    let mut shutdown_rx_mut = shutdown_rx;

    loop {
        tokio::select! {
            _ = shutdown_rx_mut.changed() => {
                if *shutdown_rx_mut.borrow() {
                    info!("Monitor channel stopping for session: {}", session_id);
                    let _ = channel.close().await;
                    break;
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(russh::ChannelMsg::Data { ref data }) => {
                        buffer.extend_from_slice(data);

                        // 按 ===STAT=== 分隔符切分，处理完整的数据块
                        while let Some(pos) = find_marker(&buffer, b"===STAT===") {
                            if pos == 0 {
                                // 去掉开头的 marker
                                buffer.drain(..10);
                                continue;
                            }
                            // 提取一个完整周期的数据
                            let chunk = String::from_utf8_lossy(&buffer[..pos]).to_string();
                            buffer.drain(..pos + 10);

                            if chunk.trim().is_empty() {
                                continue;
                            }

                            let (stats, new_cpu) = parse_stats(&chunk, &prev_cpu, &prev_net, interval_secs);

                            // 保存上一轮数据用于计算差值
                            if let Some(ref cpu) = new_cpu {
                                prev_cpu = Some(cpu.clone());
                            }
                            // 保存网络数据
                            for iface in &stats.net_interfaces {
                                prev_net.insert(iface.name.clone(), (iface.rx_bytes, iface.tx_bytes));
                            }

                            // 发送到前端
                            let event_name = format!("ssh_monitor_{}", session_id);
                            if let Err(e) = app.emit(&event_name, &stats) {
                                error!("Failed to emit monitor event: {}", e);
                            }
                        }
                    }
                    Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) => {
                        info!("Monitor channel closed for session: {}", session_id);
                        break;
                    }
                    Some(russh::ChannelMsg::ExitStatus { exit_status }) => {
                        info!("Monitor script exited with status: {} for session: {}", exit_status, session_id);
                        break;
                    }
                    None => {
                        info!("Monitor channel disconnected for session: {}", session_id);
                        break;
                    }
                    _ => {}
                }
            }
        }
    }
}

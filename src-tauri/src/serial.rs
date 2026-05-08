use anyhow::{bail, Result};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use tokio_serial::{DataBits, FlowControl, Parity, SerialPortBuilderExt, SerialStream, StopBits};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// 串口会话管理（key: session_id）
static SERIAL_MAP: LazyLock<Mutex<HashMap<String, Arc<SerialSession>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// 串口连接配置
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfig {
    /// 串口设备路径，如 "COM3" 或 "/dev/ttyUSB0"
    pub port_name: String,
    /// 波特率，默认 115200
    #[serde(default = "default_baud_rate")]
    pub baud_rate: u32,
    /// 数据位，默认 8
    #[serde(default = "default_data_bits")]
    pub data_bits: u8,
    /// 校验位，默认 None
    #[serde(default = "default_parity")]
    pub parity: String,
    /// 停止位，默认 1
    #[serde(default = "default_stop_bits")]
    pub stop_bits: u8,
    /// 流控，默认 None
    #[serde(default = "default_flow_control")]
    pub flow_control: String,
    /// 读取超时（毫秒）
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

fn default_baud_rate() -> u32 { 115200 }
fn default_data_bits() -> u8 { 8 }
fn default_parity() -> String { "None".to_string() }
fn default_stop_bits() -> u8 { 1 }
fn default_flow_control() -> String { "None".to_string() }
fn default_timeout() -> u64 { 100 }

/// 串口端口信息
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortInfo {
    /// 端口名称/路径
    pub port_name: String,
    /// 端口类型
    pub port_type: String,
}

/// 串口通道事件
#[derive(Clone, serde::Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum SerialChannelEvent {
    /// 连接已建立
    Connected,
    /// 接收到数据
    Data { data: Vec<u8> },
    /// 连接已关闭
    Closed,
    /// 发生错误
    Error { message: String },
}

/// 串口连接关闭事件（全局广播）
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialClosePayload {
    message: String,
    session_id: String,
}

fn build_serial_builder(config: &SerialConfig) -> Result<tokio_serial::SerialPortBuilder> {
    let data_bits = match config.data_bits {
        5 => DataBits::Five,
        6 => DataBits::Six,
        7 => DataBits::Seven,
        8 => DataBits::Eight,
        _ => bail!("Invalid data_bits: {}", config.data_bits),
    };

    let parity = match config.parity.as_str() {
        "None" => Parity::None,
        "Even" => Parity::Even,
        "Odd" => Parity::Odd,
        _ => Parity::None,
    };

    let stop_bits = match config.stop_bits {
        1 => StopBits::One,
        2 => StopBits::Two,
        _ => bail!("Invalid stop_bits: {}", config.stop_bits),
    };

    let flow_control = match config.flow_control.as_str() {
        "None" => FlowControl::None,
        "Software" => FlowControl::Software,
        "Hardware" => FlowControl::Hardware,
        _ => bail!("Invalid flow_control: {}", config.flow_control),
    };

    Ok(tokio_serial::new(&config.port_name, config.baud_rate)
        .timeout(Duration::from_millis(config.timeout))
        .data_bits(data_bits)
        .parity(parity)
        .stop_bits(stop_bits)
        .flow_control(flow_control))
}

/// 串口会话
pub struct SerialSession {
    /// 会话 ID
    pub session_id: String,
    /// 串口读取端
    read: Arc<Mutex<Option<tokio::io::ReadHalf<SerialStream>>>>,
    /// 串口写入端
    write: Arc<Mutex<Option<tokio::io::WriteHalf<SerialStream>>>>,
    /// 关闭标志
    closed: AtomicBool,
    /// 后台读取任务句柄
    read_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl SerialSession {
    /// 创建并初始化串口会话
    pub async fn new(
        app: AppHandle,
        config: SerialConfig,
        session_id: String,
        on_event: tauri::ipc::Channel<SerialChannelEvent>,
    ) -> Result<Self> {
        info!(
            "Opening serial port: {} @ {}",
            config.port_name, config.baud_rate
        );

        let builder = build_serial_builder(&config)?;
        let mut port = builder.open_native_async()?;
        #[cfg(unix)]
        port.set_exclusive(false)
            .expect("Unable to set serial port exclusive to false");

        // 发送连接成功事件
        let _ = on_event.send(SerialChannelEvent::Connected);

        let (read, write) = tokio::io::split(port);
        let read_mutex = Arc::new(Mutex::new(Some(read)));
        let write_mutex = Arc::new(Mutex::new(Some(write)));
        let closed = AtomicBool::new(false);

        // 启动后台异步读取循环
        let read_handle = Self::spawn_read_loop(
            app,
            read_mutex.clone(),
            session_id.clone(),
            on_event,
        );

        Ok(SerialSession {
            session_id,
            read: read_mutex,
            write: write_mutex,
            closed,
            read_handle: Mutex::new(Some(read_handle)),
        })
    }

    /// 启动后台异步读取循环
    fn spawn_read_loop(
        app: AppHandle,
        read: Arc<Mutex<Option<tokio::io::ReadHalf<SerialStream>>>>,
        session_id: String,
        on_event: tauri::ipc::Channel<SerialChannelEvent>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut buffer = [0u8; 4096];

            loop {
                let read_result = {
                    let mut port_guard = read.lock().await;
                    match port_guard.as_mut() {
                        Some(serial_port) => serial_port.read(&mut buffer).await,
                        None => {
                            break;
                        }
                    }
                };

                match read_result {
                    Ok(0) => {
                        // EOF — 串口断开
                        info!("Serial EOF detected: {}", session_id);
                        break;
                    }
                    Ok(n) => {
                        let _ = on_event.send(SerialChannelEvent::Data {
                            data: buffer[..n].to_vec(),
                        });
                    }
                    Err(e) => {
                        warn!("Serial read error on {}: {}", session_id, e);
                        let _ = on_event.send(SerialChannelEvent::Error {
                            message: e.to_string(),
                        });
                        break;
                    }
                }
            }

            info!("Serial connection closed: {}", session_id);
            let _ = on_event.send(SerialChannelEvent::Closed);
            let _ = app.emit(
                "serial_close",
                SerialClosePayload {
                    message: "connection closed".into(),
                    session_id: session_id.clone(),
                },
            );
        })
    }

    /// 向串口写入数据
    pub async fn write(&self, data: &[u8]) -> Result<usize> {
        let mut port_guard = self.write.lock().await;
        match port_guard.as_mut() {
            Some(port) => {
                port.write_all(data).await?;
                Ok(data.len())
            }
            None => bail!("Serial port not available"),
        }
    }

    /// 关闭串口连接
    pub async fn close(&self) -> Result<()> {
        info!("Closing serial session: {}", self.session_id);

        // 设置关闭标志
        self.closed.store(true, Ordering::Relaxed);

        // 释放读取端（读取任务会看到 None 并退出）
        {
            let mut read_guard = self.read.lock().await;
            *read_guard = None;
        }

        // 释放写入端
        {
            let mut write_guard = self.write.lock().await;
            *write_guard = None;
        }

        // 等待读取任务结束
        if let Some(handle) = self.read_handle.lock().await.take() {
            let _ = handle.await;
        }

        info!("Serial session closed: {}", self.session_id);
        Ok(())
    }
}

/// 枚举可用的串口设备列表
#[tauri::command]
pub fn serial_list() -> Result<Vec<SerialPortInfo>, String> {
    info!("Listing available serial ports");
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let result: Vec<SerialPortInfo> = ports
        .into_iter()
        .map(|p| SerialPortInfo {
            port_name: p.port_name,
            port_type: format!("{:?}", p.port_type),
        })
        .collect();
    info!("Available ports: {:?}", result);
    Ok(result)
}

/// 建立串口连接
#[tauri::command]
pub async fn serial_connect(
    app: AppHandle,
    config: SerialConfig,
    session_id: String,
    on_event: tauri::ipc::Channel<SerialChannelEvent>,
) -> Result<String, String> {
    info!("Connecting serial port: {:?}", config);

    match SerialSession::new(app, config, session_id.clone(), on_event).await {
        Ok(session) => {
            SERIAL_MAP
                .lock()
                .await
                .insert(session_id.clone(), Arc::new(session));
            info!("Serial connected: {}", session_id);
            Ok(session_id)
        }
        Err(e) => {
            error!("Serial connection failed: {:?}", e);
            Err(e.to_string())
        }
    }
}

/// 向串口写入数据
#[tauri::command]
pub async fn serial_write(session_id: &str, data: Vec<u8>) -> Result<usize, String> {
    let session: Option<Arc<SerialSession>> = {
        let map = SERIAL_MAP.lock().await;
        map.get(session_id).cloned()
    };

    match session {
        Some(sess) => sess.write(&data).await.map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

/// 关闭串口连接
#[tauri::command]
pub async fn serial_close(app: AppHandle, session_id: &str) -> Result<(), String> {
    let session: Option<Arc<SerialSession>> = {
        let mut map = SERIAL_MAP.lock().await;
        map.remove(session_id)
    };

    if let Some(sess) = session {
        let _ = sess.close().await;
        let _ = app.emit(
            "serial_close",
            SerialClosePayload {
                message: "connection closed".into(),
                session_id: session_id.to_string(),
            },
        );
    }

    Ok(())
}

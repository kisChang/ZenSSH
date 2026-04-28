use anyhow::{bail, Result};
use log::{error, info, warn};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// 串口会话管理（key: session_id）
static SERIAL_MAP: Lazy<Arc<Mutex<HashMap<String, Arc<SerialSession>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

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

/// 将前端配置转换为 serialport 配置
fn build_serial_port(config: &SerialConfig) -> Result<Box<dyn SerialPort>> {
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

    let builder = serialport::new(&config.port_name, config.baud_rate)
        .data_bits(data_bits)
        .parity(parity)
        .stop_bits(stop_bits)
        .flow_control(flow_control)
        .timeout(Duration::from_millis(config.timeout));

    let port = builder.open()?;
    Ok(port)
}

/// 串口会话
#[allow(dead_code)]
pub struct SerialSession {
    /// 会话 ID
    pub session_id: String,
    /// 串口设备路径
    pub port_name: String,
    /// 串口设备（线程安全）
    port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    /// 关闭信号发送端
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    /// 读取线程句柄（使用 Mutex 支持内部可变性）
    read_thread: Mutex<Option<thread::JoinHandle<()>>>,
}

impl SerialSession {
    /// 创建并初始化串口会话
    pub fn new(
        app: AppHandle,
        config: SerialConfig,
        session_id: String,
        on_event: tauri::ipc::Channel<SerialChannelEvent>,
    ) -> Result<Self> {
        info!(
            "Opening serial port: {} @ {}",
            config.port_name, config.baud_rate
        );

        let port = build_serial_port(&config)?;
        let port_name = config.port_name.clone();

        // 发送连接成功事件
        let _ = on_event.send(SerialChannelEvent::Connected);

        let port_arc: Arc<Mutex<Option<Box<dyn SerialPort>>>> =
            Arc::new(Mutex::new(Some(port)));
        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

        // 启动后台读取线程
        let read_thread = Self::spawn_read_loop(
            app,
            port_arc.clone(),
            session_id.clone(),
            on_event,
            shutdown_rx,
        );

        Ok(SerialSession {
            session_id,
            port_name,
            port: port_arc,
            shutdown_tx,
            read_thread: Mutex::new(Some(read_thread)),
        })
    }

    /// 启动后台读取循环（使用独立线程处理阻塞 I/O）
    fn spawn_read_loop(
        app: AppHandle,
        port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
        session_id: String,
        on_event: tauri::ipc::Channel<SerialChannelEvent>,
        shutdown_rx: tokio::sync::watch::Receiver<bool>,
    ) -> thread::JoinHandle<()> {
        let sess_id = session_id.clone();
        thread::spawn(move || {
            let mut buffer = vec![0u8; 4096];

            loop {
                // 检查是否收到关闭信号
                if *shutdown_rx.borrow() {
                    info!("Serial read loop exiting due to shutdown signal: {}", sess_id);
                    break;
                }

                // 获取端口读取锁
                let read_result = {
                    let mut port_guard = port.lock().unwrap();
                    match port_guard.as_mut() {
                        Some(port) => port.read(&mut buffer),
                        None => break, // 端口已被移除
                    }
                };

                match read_result {
                    Ok(n) if n > 0 => {
                        let data: Vec<u8> = buffer[..n].to_vec();
                        if let Err(e) = on_event.send(SerialChannelEvent::Data { data }) {
                            error!("Failed to send serial data event: {:?}", e);
                            break;
                        }
                    }
                    Ok(_) => {
                        // n == 0，读取超时，继续循环
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                        // 超时是预期行为，继续循环
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => {
                        // 中断，继续循环
                    }
                    Err(e) => {
                        // 其他错误（断开的管道、设备不存在等）
                        warn!("Serial read error on {}: {}", sess_id, e);
                        let _ = on_event.send(SerialChannelEvent::Error {
                            message: e.to_string(),
                        });

                        // 检查是否为致命错误
                        if e.kind() == std::io::ErrorKind::NotFound
                            || e.kind() == std::io::ErrorKind::BrokenPipe
                        {
                            break;
                        }
                    }
                }
            }

            // 读取循环结束，发送关闭事件
            info!("Serial connection closed: {}", sess_id);
            let _ = on_event.send(SerialChannelEvent::Closed);
            let _ = app.emit(
                "serial_close",
                SerialClosePayload {
                    message: "connection closed".into(),
                    session_id: sess_id.clone(),
                },
            );
        })
    }

    /// 向串口写入数据
    pub fn write(&self, data: &[u8]) -> Result<usize> {
        let mut port_guard = self.port.lock().unwrap();
        match port_guard.as_mut() {
            Some(port) => {
                // serialport 的 write 可能不会写入全部数据
                let mut written = 0;
                while written < data.len() {
                    let n = port.write(&data[written..])?;
                    if n == 0 {
                        break;
                    }
                    written += n;
                }
                info!(
                    "Serial write: {} bytes to {}",
                    written, self.session_id
                );
                Ok(written)
            }
            None => bail!("Serial port not available"),
        }
    }

    /// 关闭串口连接
    pub fn close(&self) -> Result<()> {
        info!("Closing serial session: {}", self.session_id);

        // 发送关闭信号
        let _ = self.shutdown_tx.send(true);

        // 释放端口（读取线程检测到后会退出）
        {
            let mut port_guard = self.port.lock().unwrap();
            *port_guard = None;
        }

        // 等待读取线程结束
        if let Some(handle) = self.read_thread.lock().unwrap().take() {
            let _ = handle.join();
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
pub fn serial_connect(
    app: AppHandle,
    config: SerialConfig,
    session_id: String,
    on_event: tauri::ipc::Channel<SerialChannelEvent>,
) -> Result<String, String> {
    info!("Connecting serial port: {:?}", config);

    match SerialSession::new(app, config, session_id.clone(), on_event) {
        Ok(session) => {
            SERIAL_MAP
                .lock()
                .unwrap()
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
pub fn serial_write(session_id: &str, data: Vec<u8>) -> Result<usize, String> {
    let session: Option<Arc<SerialSession>> = {
        let map = SERIAL_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };

    match session {
        Some(sess) => sess.write(&data).map_err(|e| e.to_string()),
        None => Err("Session not found".to_string()),
    }
}

/// 关闭串口连接
#[tauri::command]
pub fn serial_close(session_id: &str) -> Result<(), String> {
    let session: Option<Arc<SerialSession>> = {
        let mut map = SERIAL_MAP.lock().unwrap();
        map.remove(session_id)
    };

    if let Some(sess) = session {
        let _ = sess.close();
    }

    Ok(())
}

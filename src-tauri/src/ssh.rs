use anyhow::{bail, Result};
use log::{error, info};
use once_cell::sync::Lazy;
use russh::client::Msg;
use russh::keys::*;
use russh::*;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// 链接会话管理（key: session_id）
static SSH_MAP: Lazy<Arc<Mutex<HashMap<String, Arc<SshSession>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));
/// 链接Sftp会话（key: session_id）
static SFTP_MAP: Lazy<Arc<Mutex<HashMap<String, Arc<SftpSession>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));
/// 配置管理（key: config_id）
static CONFIG_MAP: Lazy<Arc<Mutex<HashMap<String, SshConfig>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// SSH 连接配置
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    /// 配置ID（由前端生成，唯一标识配置）
    pub config_id: String,
    /// 主机地址
    pub host: String,
    /// 端口号，默认 22
    #[serde(default)]
    pub port: u16,
    /// 用户名
    pub username: String,
    /// 密码认证
    pub password: Option<String>,
    /// 私钥路径（支持多种格式：OpenSSH, PEM, PKCS8 等）
    pub private_key_path: Option<String>,
    /// 私钥内容（直接提供密钥内容，优先级高于路径）
    pub private_key_data: Option<String>,
    /// 密钥密码（用于加密的私钥）
    pub key_password: Option<String>,
    /// 连接超时（秒）
    #[serde(default)]
    pub timeout: u64,
    /// 保持连接间隔（秒）
    #[serde(default)]
    pub keepalive_interval: u64,
    /// 跳板机配置
    pub bastion_config_id: Option<String>,
}

impl Default for SshConfig {
    fn default() -> Self {
        SshConfig {
            config_id: "".to_string(),
            host: "127.0.0.1".to_string(),
            port: 22,
            username: "root".to_string(),
            password: None,
            private_key_path: None,
            private_key_data: None,
            key_password: None,
            timeout: 30,
            keepalive_interval: 30,
            bastion_config_id: None,
        }
    }
}

/// 端口转发配置
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardConfig {
    /// 本地监听地址
    pub local_host: String,
    /// 本地监听端口
    pub local_port: u16,
    /// 远程目标地址
    pub remote_host: String,
    /// 远程目标端口
    pub remote_port: u16,
}

/// 端口转发结果
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardResult {
    /// 转发通道 ID
    pub channel_id: u32,
    /// 本地监听地址
    pub local_host: String,
    /// 本地监听端口
    pub local_port: u16,
}

#[derive(Clone, serde::Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum SshChannelEvent {
    Open {
        id: u32,
        max_packet_size: u32,
        window_size: u32,
    },
    Data {
        data: Vec<u8>,
    },
    ExtendedData {
        data: Vec<u8>,
        ext: u32,
    },
    Eof,
    Close,
    RequestPty {
        want_reply: bool,
        term: String,
        col_width: u32,
        row_height: u32,
        pix_width: u32,
        pix_height: u32,
        // terminal_modes: Vec<(Pty, u32)>,
    },
    RequestShell {
        want_reply: bool,
    },
    Exec {
        want_reply: bool,
        command: Vec<u8>,
    },
    Signal {
        signal: String,
    },
    RequestSubsystem {
        want_reply: bool,
        name: String,
    },
    RequestX11 {
        want_reply: bool,
        single_connection: bool,
        x11_authentication_protocol: String,
        x11_authentication_cookie: String,
        x11_screen_number: u32,
    },
    SetEnv {
        want_reply: bool,
        variable_name: String,
        variable_value: String,
    },
    WindowChange {
        col_width: u32,
        row_height: u32,
        pix_width: u32,
        pix_height: u32,
    },
    AgentForward {
        want_reply: bool,
    },
    OpenFailure {
        code: u8,
    },
    ExitStatus {
        exit_status: u32,
    },
    ExitSignal {
        signal_name: String,
        core_dumped: bool,
        error_message: String,
        lang_tag: String,
    },
    WindowAdjusted {
        new_size: u32,
    },
}

/// SSH 连接命令（使用配置结构体）
#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    config: SshConfig,
    session_id: String,
    cols: u32,
    rows: u32,
    on_event: tauri::ipc::Channel<SshChannelEvent>,
) -> Result<String, String> {
    info!("Connecting to {:?}", config);
    let config_id = config.config_id.clone();
    // 获取跳板机器配置
    let bastion_config = if let Some(config_id) = non_empty(config.bastion_config_id.as_ref()) {
        let map = CONFIG_MAP.lock().unwrap();
        Some(map.get(config_id).unwrap().clone())
    } else {
        None
    };

    match SshSession::connect_with_config(
        app,
        config,
        bastion_config,
        session_id.clone(),
        config_id,
        cols,
        rows,
        on_event,
    )
    .await
    {
        Ok(sess) => {
            SSH_MAP
                .lock()
                .unwrap()
                .insert(session_id.clone(), Arc::new(sess));
            info!("Connected: {}", session_id);
            Ok(session_id)
        }
        Err(e) => {
            error!("Connection failed: {:?}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn ssh_run_command(session_id: &str, command: &str) -> Result<(), String> {
    let sess: Option<Arc<SshSession>> = {
        let map = SSH_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };
    match sess {
        Some(sess) => {
            sess.send(command).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("Session not found".to_string()),
    }
}

pub async fn ssh_get_sftp(session_id: &str) -> Result<Arc<SftpSession>, String> {
    let sess: Option<Arc<SshSession>> = {
        let map = SSH_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };
    match sess {
        Some(sess) => {
            let sftp_session: Option<Arc<SftpSession>> = {
                let map = SFTP_MAP.lock().unwrap();
                map.get(session_id).cloned()
            };
            match sftp_session {
                Some(sftp) => Ok(sftp),
                None => {
                    let channel = sess.handle.channel_open_session().await.unwrap();
                    channel.request_subsystem(true, "sftp").await.unwrap();
                    let sftp = SftpSession::new(channel.into_stream()).await.unwrap();
                    let sftp = Arc::new(sftp);
                    SFTP_MAP
                        .lock()
                        .unwrap()
                        .insert(session_id.to_string(), sftp.clone());
                    Ok(sftp)
                }
            }
        }
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub async fn ssh_window_change(
    session_id: &str,
    col_width: u32,
    row_height: u32,
) -> Result<(), String> {
    let sess: Option<Arc<SshSession>> = {
        let map = SSH_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };
    match sess {
        Some(sess) => {
            sess.window_change(col_width, row_height, 0, 0)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("Session not found".to_string()),
    }
}

/// 端口转发命令
#[tauri::command]
pub async fn ssh_port_forward(
    session_id: &str,
    local_host: &str,
    local_port: u16,
    remote_host: &str,
    remote_port: u16,
) -> Result<PortForwardResult, String> {
    let sess: Option<Arc<SshSession>> = {
        let map = SSH_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };
    match sess {
        Some(sess) => {
            let config = PortForwardConfig {
                local_host: local_host.to_string(),
                local_port,
                remote_host: remote_host.to_string(),
                remote_port,
            };
            sess.local_port_forward(config)
                .await
                .map_err(|e| e.to_string())
        }
        None => Err("Session not found".to_string()),
    }
}

/// 关闭端口转发
#[tauri::command]
pub async fn ssh_close_port_forward(session_id: &str, channel_id: u32) -> Result<(), String> {
    let sess: Option<Arc<SshSession>> = {
        let map = SSH_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };
    match sess {
        Some(sess) => {
            sess.close_port_forward(channel_id)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("Session not found".to_string()),
    }
}

/// 列出所有活跃的端口转发
#[tauri::command]
pub async fn ssh_list_port_forwards(session_id: &str) -> Result<Vec<u32>, String> {
    let sess: Option<Arc<SshSession>> = {
        let map = SSH_MAP.lock().unwrap();
        map.get(session_id).cloned()
    };
    match sess {
        Some(sess) => Ok(sess.list_port_forwards()),
        None => Err("Session not found".to_string()),
    }
}

#[tauri::command]
pub async fn ssh_close(session_id: &str) -> Result<(), String> {
    let sess: Option<Arc<SshSession>> = {
        let mut map = SSH_MAP.lock().unwrap();
        map.remove(session_id)
    };
    if let Some(sess) = sess {
        // 关闭sftp链接
        SFTP_MAP.lock().unwrap().remove(session_id);
        // 断开链接
        sess.close().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 同步配置（前端配置修改后调用此方法同步到后端）
#[tauri::command]
pub fn sync_config(config_map: HashMap<String, SshConfig>) {
    let mut map = CONFIG_MAP.lock().unwrap();
    for once in config_map.iter() {
        map.insert(once.0.into(), once.1.clone());
    }
    info!("Sync: {:?}", map);
}

struct SshClient {}

impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

#[derive(Clone, serde::Serialize)]
struct SshClosePayload {
    message: String,
    session_id: String,
    exit_status: u32,
}

#[allow(dead_code)]
pub struct SshSession {
    /// 会话ID（连接时生成，唯一标识活跃连接）
    pub session_id: String,
    /// 配置ID（创建此会话的配置ID）
    pub config_id: String,
    handle: Arc<client::Handle<SshClient>>,
    write: Mutex<Option<russh::ChannelWriteHalf<Msg>>>,
    /// 活跃的端口转发通道
    port_forwards: Arc<Mutex<HashMap<u32, russh::Channel<Msg>>>>,
}

impl SshSession {
    async fn connect_base(
        config: &SshConfig,
        stream_opt: Option<ChannelStream<Msg>>,
    ) -> Result<client::Handle<SshClient>> {
        let client_config = client::Config {
            keepalive_interval: Some(Duration::from_secs(config.keepalive_interval)),
            ..Default::default()
        };

        let sh = SshClient {};
        let mut handle = if let Some(stream) = stream_opt {
            client::connect_stream(Arc::new(client_config), stream, sh).await?
        } else {
            client::connect(
                Arc::new(client_config),
                (config.host.clone(), config.port),
                sh,
            )
            .await?
        };

        // 认证
        let authenticated = if let Some(key_data) = non_empty(config.private_key_data.as_ref()) {
            // 私钥内容认证
            Self::authenticate_with_key(
                &mut handle,
                &config.username,
                key_data,
                config.key_password.as_deref(),
            )
            .await?
        } else if let Some(key_path) = non_empty(config.private_key_path.as_ref()) {
            // 私钥文件认证
            let key_data = std::fs::read_to_string(key_path)?;
            Self::authenticate_with_key(
                &mut handle,
                &config.username,
                &key_data,
                config.key_password.as_deref(),
            )
            .await?
        } else if let Some(password) = non_empty(config.password.as_ref()) {
            // 密码认证
            handle
                .authenticate_password(config.username.clone(), password)
                .await?
                .success()
        } else {
            bail!("No authentication method provided");
        };

        if !authenticated {
            bail!("Authentication failed");
        }

        Ok(handle)
    }

    /// 直接连接
    async fn connect_direct(
        app: AppHandle,
        config: &SshConfig,
        session_id: String,
        config_id: String,
        cols: u32,
        rows: u32,
        on_event: tauri::ipc::Channel<SshChannelEvent>,
    ) -> Result<Self> {
        let handle = Self::connect_base(config, None).await?;
        let channel = handle.channel_open_session().await?;
        channel
            .request_pty(true, "xterm", cols, rows, 0, 0, &[])
            .await?;
        channel.request_shell(true).await?;

        let (read, write) = channel.split();
        let session = Self {
            session_id,
            config_id,
            handle: Arc::new(handle),
            write: Mutex::new(Some(write)),
            port_forwards: Arc::new(Mutex::new(HashMap::new())),
        };

        session.init_shell(app, read, on_event).await;
        Ok(session)
    }

    /// 循环建立跳板连接 从最内层开始，逐层向外建立 SSH 跳板
    async fn connect_bastion_chain(
        bastion_config: SshConfig,
    ) -> anyhow::Result<client::Handle<SshClient>> {
        info!("connect_bastion_chain");
        let mut chain = Vec::new();
        let mut current = bastion_config.bastion_config_id.clone();
        // 第一层
        chain.push(bastion_config);

        // 这里只收集 bastion，不包含 entry
        while let Some(id) = current {
            info!("id >>>{:?}", id);
            if let Some(config_id) = non_empty(Some(&id)) {
                let map = CONFIG_MAP.lock().unwrap();
                let cfg = map.get(config_id).unwrap().clone();
                chain.push(cfg.clone());
                current = cfg.bastion_config_id.clone();
            } else {
                break;
            };
        }

        info!("Connecting bastion chain:{:?}", chain);
        let mut parent_client: Option<client::Handle<SshClient>> = None;

        for cfg in chain.into_iter().rev() {
            info!("Connecting bastion chain once:{:?}", cfg);
            let channel = match parent_client {
                None => {
                    // 1. 登录最后一层 bastion
                    Self::connect_base(&cfg, None).await?
                }
                Some(bastion_handle) => {
                    // 2. 从外层 bastion → 上一层 bastion
                    let stream = bastion_handle
                        .channel_open_direct_tcpip(
                            &cfg.host,
                            cfg.port as u32,
                            "127.0.0.1",
                            0,
                        )
                        .await?;
                    Self::connect_base(&cfg, Some(stream.into_stream())).await?
                }
            };
            parent_client = Option::from(channel);
        }

        Ok(parent_client.unwrap())
    }


    /// 通过跳板机连接
    async fn connect_via_bastion(
        app: AppHandle,
        config: &SshConfig,
        bastion_config: &SshConfig,
        session_id: String,
        config_id: String,
        cols: u32,
        rows: u32,
        on_event: tauri::ipc::Channel<SshChannelEvent>,
    ) -> Result<Self> {
        info!("Connect via bastion: {:?}", bastion_config);
        // 先建立跳板机会话(循环调用以实现多层叠甲)
        let bastion_handle =
            Self::connect_bastion_chain(bastion_config.to_owned()).await?;

        // 创建到目标机的通道
        let channel = bastion_handle
            .channel_open_direct_tcpip(&config.host, config.port as u32, "127.0.0.1", 0)
            .await?;
        let stream = channel.into_stream();

        // 建立目标链接
        let handle: russh::client::Handle<SshClient> =
            Self::connect_base(config, Some(stream)).await?;
        let channel = handle.channel_open_session().await?;
        // 在通道上请求 PTY 和 shell
        channel
            .request_pty(true, "xterm", cols, rows, 0, 0, &[])
            .await?;
        channel.request_shell(true).await?;

        let (read, write) = channel.split();
        let session = Self {
            session_id,
            config_id,
            handle: handle.into(),
            write: Mutex::new(Some(write)),
            port_forwards: Arc::new(Mutex::new(HashMap::new())),
        };
        session.init_shell(app, read, on_event).await;
        Ok(session)
    }

    /// 使用私钥认证
    async fn authenticate_with_key<H: client::Handler>(
        handle: &mut client::Handle<H>,
        username: &str,
        key_data: &str,
        password: Option<&str>,
    ) -> Result<bool> {
        info!("authenticate_with_key {}, key: {}", username, key_data);
        // 使用 russh 的 decode_secret_key 解析私钥
        let key = decode_secret_key(key_data, password)
            .map_err(|_| anyhow::anyhow!("Failed to parse private key"))?;

        // 使用 PrivateKeyWithHashAlg 包装密钥
        let key_with_hash = russh::keys::PrivateKeyWithHashAlg::new(std::sync::Arc::new(key), None);

        Ok(handle
            .authenticate_publickey(username, key_with_hash)
            .await?
            .success())
    }

    /// 通过配置创建连接（主入口）
    pub async fn connect_with_config(
        app: AppHandle,
        config: SshConfig,
        bastion_config: Option<SshConfig>,
        session_id: String,
        config_id: String,
        cols: u32,
        rows: u32,
        on_event: tauri::ipc::Channel<SshChannelEvent>,
    ) -> Result<Self> {
        let on_event_clone = on_event.clone();
        // 如果有跳板机配置，使用跳板机连接
        match bastion_config {
            Some(bastion_config) => {
                match Self::connect_via_bastion(
                    app,
                    &config,
                    &bastion_config,
                    session_id.clone(),
                    config_id,
                    cols,
                    rows,
                    on_event,
                )
                .await
                {
                    Ok(session) => Ok(session),
                    Err(e) => {
                        // 连接失败时发送错误事件到前端
                        let _ = on_event_clone.send(SshChannelEvent::OpenFailure { code: 255 });
                        Err(e)
                    }
                }
            }
            None => {
                // 直接连接
                match Self::connect_direct(
                    app,
                    &config,
                    session_id.clone(),
                    config_id,
                    cols,
                    rows,
                    on_event,
                )
                .await
                {
                    Ok(session) => Ok(session),
                    Err(e) => {
                        // 连接失败时发送错误事件到前端
                        let _ = on_event_clone.send(SshChannelEvent::OpenFailure { code: 255 });
                        Err(e)
                    }
                }
            }
        }
    }

    /// 启动事件处理循环
    async fn init_shell(
        &self,
        app: AppHandle,
        mut read: ChannelReadHalf,
        on_event: tauri::ipc::Channel<SshChannelEvent>,
    ) {
        let sess_id_clone = self.session_id.clone();
        tokio::spawn(async move {
            loop {
                let Some(msg) = read.wait().await else {
                    break;
                };
                let result = match msg {
                    ChannelMsg::Open {
                        id,
                        window_size,
                        max_packet_size,
                    } => on_event.send(SshChannelEvent::Open {
                        id: id.into(),
                        window_size,
                        max_packet_size,
                    }),

                    ChannelMsg::OpenFailure(reason) => {
                        on_event.send(SshChannelEvent::OpenFailure { code: reason as u8 })
                    }

                    ChannelMsg::Data { ref data } => on_event.send(SshChannelEvent::Data {
                        data: data.to_vec(),
                    }),

                    ChannelMsg::ExtendedData { ref data, ext } => {
                        on_event.send(SshChannelEvent::ExtendedData {
                            data: data.to_vec(),
                            ext,
                        })
                    }

                    ChannelMsg::Eof => on_event.send(SshChannelEvent::Eof),

                    ChannelMsg::Close => on_event.send(SshChannelEvent::Close),

                    ChannelMsg::RequestPty {
                        want_reply,
                        ref term,
                        col_width,
                        row_height,
                        pix_width,
                        pix_height,
                        ..
                    } => on_event.send(SshChannelEvent::RequestPty {
                        want_reply,
                        term: term.clone(),
                        col_width,
                        row_height,
                        pix_width,
                        pix_height,
                    }),

                    ChannelMsg::RequestShell { want_reply } => {
                        on_event.send(SshChannelEvent::RequestShell { want_reply })
                    }

                    ChannelMsg::Exec {
                        want_reply,
                        ref command,
                    } => on_event.send(SshChannelEvent::Exec {
                        want_reply,
                        command: command.to_vec(),
                    }),

                    ChannelMsg::Signal { ref signal } => on_event.send(SshChannelEvent::Signal {
                        signal: format!("{:?}", signal),
                    }),

                    ChannelMsg::RequestSubsystem {
                        want_reply,
                        ref name,
                    } => on_event.send(SshChannelEvent::RequestSubsystem {
                        want_reply,
                        name: name.clone(),
                    }),

                    ChannelMsg::RequestX11 {
                        want_reply,
                        single_connection,
                        ref x11_authentication_protocol,
                        ref x11_authentication_cookie,
                        x11_screen_number,
                    } => on_event.send(SshChannelEvent::RequestX11 {
                        want_reply,
                        single_connection,
                        x11_authentication_protocol: x11_authentication_protocol.clone(),
                        x11_authentication_cookie: x11_authentication_cookie.clone(),
                        x11_screen_number,
                    }),

                    ChannelMsg::SetEnv {
                        want_reply,
                        ref variable_name,
                        ref variable_value,
                    } => on_event.send(SshChannelEvent::SetEnv {
                        want_reply,
                        variable_name: variable_name.clone(),
                        variable_value: variable_value.clone(),
                    }),

                    ChannelMsg::WindowChange {
                        col_width,
                        row_height,
                        pix_width,
                        pix_height,
                    } => on_event.send(SshChannelEvent::WindowChange {
                        col_width,
                        row_height,
                        pix_width,
                        pix_height,
                    }),

                    ChannelMsg::AgentForward { want_reply } => {
                        on_event.send(SshChannelEvent::AgentForward { want_reply })
                    }

                    ChannelMsg::WindowAdjusted { new_size } => {
                        on_event.send(SshChannelEvent::WindowAdjusted { new_size })
                    }

                    ChannelMsg::ExitSignal {
                        signal_name,
                        core_dumped,
                        error_message,
                        lang_tag,
                    } => on_event.send(SshChannelEvent::ExitSignal {
                        signal_name: format!("{:?}", signal_name),
                        core_dumped,
                        error_message,
                        lang_tag,
                    }),

                    ChannelMsg::ExitStatus { exit_status } => {
                        app.emit(
                            "ssh_close",
                            SshClosePayload {
                                exit_status,
                                session_id: sess_id_clone.clone().into(),
                                message: "success".into(),
                            },
                        )
                        .unwrap();
                        on_event.send(SshChannelEvent::ExitStatus { exit_status })
                    }
                    _ => Ok(()),
                };

                if result.is_err() {
                    error!("SSH channel fail:{} ", result.err().unwrap());
                }
            }
        });
    }

    /// 端口转发（本地端口转发）
    pub async fn local_port_forward(&self, config: PortForwardConfig) -> Result<PortForwardResult> {
        let channel = self
            .handle
            .channel_open_direct_tcpip(
                &config.remote_host,
                config.remote_port as u32,
                &config.local_host,
                config.local_port as u32,
            )
            .await?;

        let channel_id: u32 = channel.id().into();

        // 保存通道引用
        {
            let mut forwards = self.port_forwards.lock().unwrap();
            // TODO 保持通道 channel 的数据通讯
            forwards.insert(channel_id, channel);
        }

        Ok(PortForwardResult {
            channel_id,
            local_host: config.local_host,
            local_port: config.local_port,
        })
    }

    /// 关闭端口转发
    pub async fn close_port_forward(&self, channel_id: u32) -> Result<()> {
        let channel = {
            let mut forwards = self.port_forwards.lock().unwrap();
            forwards.remove(&channel_id)
        };
        if let Some(channel) = channel {
            channel.close().await?;
        }
        Ok(())
    }

    /// 获取所有活跃的端口转发
    pub fn list_port_forwards(&self) -> Vec<u32> {
        let forwards = self.port_forwards.lock().unwrap();
        forwards.keys().cloned().collect()
    }

    pub async fn send(&self, cmd: &str) -> Result<()> {
        let mut write = {
            let mut guard = self.write.lock().unwrap();
            guard.take()
        };

        if let Some(ref mut write) = write {
            write.data(cmd.as_bytes()).await?;
        }
        {
            let mut guard = self.write.lock().unwrap();
            *guard = write;
        }
        Ok(())
    }

    pub async fn window_change(
        &self,
        col_width: u32,
        row_height: u32,
        pix_width: u32,
        pix_height: u32,
    ) -> Result<()> {
        let mut write = {
            let mut guard = self.write.lock().unwrap();
            guard.take()
        };
        if let Some(ref mut write) = write {
            write
                .window_change(col_width, row_height, pix_width, pix_height)
                .await?;
        }
        {
            let mut guard = self.write.lock().unwrap();
            *guard = write;
        }
        Ok(())
    }

    pub async fn close(&self) -> Result<()> {
        let channel = {
            let mut guard = self.write.lock().unwrap();
            guard.take()
        };
        if let Some(channel) = channel {
            channel.close().await?;
        }
        Ok(())
    }
}

fn non_empty(opt: Option<&String>) -> Option<&str> {
    opt.map(String::as_str).filter(|s| !s.is_empty())
}

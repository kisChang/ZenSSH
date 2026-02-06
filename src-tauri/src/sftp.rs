use crate::ssh::ssh_get_sftp;
use russh_sftp::client::SftpSession;
use serde::Serialize;
use std::sync::Arc;
use tokio::io::{AsyncReadExt};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;
use tokio::sync::Mutex;

#[tauri::command]
pub async fn ssh_sftp_open(session_id: &str) -> Result<(), String> {
    let sftp_session: Result<Arc<SftpSession>, String> = ssh_get_sftp(session_id).await;
    match sftp_session {
        Ok(_) => Ok(()),
        Err(err) => Err(err),
    }
}

#[derive(Serialize)]
pub struct SftpFileEntry {
    pub filename: String,
    pub is_dir: bool,
    pub size: u64,
}

#[tauri::command]
pub async fn ssh_sftp_listdir(session_id: &str, dir: &str) -> Result<Vec<SftpFileEntry>, String> {
    let sftp = ssh_get_sftp(session_id).await?;

    let entries = sftp.read_dir(dir).await.map_err(|e| e.to_string())?;

    let mut result = Vec::new();

    for file in entries {
        let filename = file.file_name().to_string();
        result.push(SftpFileEntry {
            filename,
            is_dir: file.file_type().is_dir(),
            size: file.metadata().size.unwrap(),
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn ssh_sftp_canonicalize(session_id: &str, file_path: &str) -> Result<String, String> {
    let sftp_session: Result<Arc<SftpSession>, String> = ssh_get_sftp(session_id).await;
    match sftp_session {
        Ok(sftp) => {
            let path = sftp
                .canonicalize(file_path)
                .await
                .map_err(|e| e.to_string())?;
            Ok(path)
        }
        Err(err) => Err(err),
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum SftpDownloadEvent {
    Process {
        val: u32,
    },
    Chunk {
        data: Vec<u8>,
    },
    Finished,
    Cancelled,
}

static DOWNLOAD_TASKS: Lazy<Mutex<HashMap<String, CancellationToken>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn ssh_sftp_read(
    task_id: &str,
    session_id: &str,
    file_path: &str,
    on_down_event: tauri::ipc::Channel<SftpDownloadEvent>,
) -> Result<String, String> {
    // 1. 获取 sftp 注册任务
    let sftp = ssh_get_sftp(session_id).await?;
    let token = CancellationToken::new();
    {
        let mut map = DOWNLOAD_TASKS.lock().await;
        map.insert(task_id.into(), token.clone());
    }

    // 2. 打开远端文件
    let mut remote_file = sftp
        .open(file_path)
        .await
        .map_err(|e| e.to_string())?;

    // 3. 获取远端文件大小（用于进度）
    let total_size = remote_file
        .metadata()
        .await
        .map_err(|e| e.to_string())?
        .len();

    // 4. 分块下载
    let mut buffer = vec![0u8; 32 * 1024]; // 32KB
    let mut downloaded: u64 = 0;
    let mut last_progress = 0;

    loop {
        tokio::select! {
            _ = token.cancelled() => {
                // 通知失败
                let _ = on_down_event.send(SftpDownloadEvent::Cancelled);
                return Err("下载已取消".to_string());
            }

            read_res = remote_file.read(&mut buffer) => {
                let n = read_res.map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }

                // 发给前端
                let _ = on_down_event.send(SftpDownloadEvent::Chunk {
                    data: buffer[..n].to_vec(),
                });

                // 计算下载进度
                downloaded += n as u64;
                let progress = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
                // 避免过于频繁发送（只在变化时发送）
                if progress != last_progress {
                    last_progress = progress;
                    let _ = on_down_event.send(SftpDownloadEvent::Process {
                        val: progress.min(100),
                    });
                }
            }
        }
    }
    // 结束 100%
    let _ = on_down_event.send(SftpDownloadEvent::Process { val: 100 });
    let _ = on_down_event.send(SftpDownloadEvent::Finished);
    Ok("ok".to_string())
}

#[tauri::command]
pub async fn ssh_sftp_read_cancel(task_id: String) -> Result<(), String> {
    let mut map = DOWNLOAD_TASKS.lock().await;

    if let Some(token) = map.remove(&task_id) {
        token.cancel();
        Ok(())
    } else {
        Err("任务不存在".to_string())
    }
}


#[tauri::command]
pub async fn ssh_sftp_write(
    session_id: &str,
    file_path: &str,
    data: Vec<u8>,
) -> Result<(), String> {
    let sftp = ssh_get_sftp(session_id).await?;

    let mut file = sftp.create(file_path).await.map_err(|e| e.to_string())?;

    use tokio::io::AsyncWriteExt;
    file.write_all(&data).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn ssh_sftp_mkdir(session_id: &str, dir: &str) -> Result<(), String> {
    let sftp = ssh_get_sftp(session_id).await?;
    sftp.create_dir(dir).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_sftp_remove_dir(session_id: &str, dir: &str) -> Result<(), String> {
    let sftp = ssh_get_sftp(session_id).await?;
    sftp.remove_dir(dir).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_sftp_remove_file(session_id: &str, file: &str) -> Result<(), String> {
    let sftp = ssh_get_sftp(session_id).await?;
    sftp.remove_file(file).await.map_err(|e| e.to_string())
}

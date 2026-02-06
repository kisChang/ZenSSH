mod encrypt;
mod sftp;
mod ssh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .setup(|_app| {
            #[cfg(desktop)]
            _app.handle().plugin(tauri_plugin_updater::Builder::new().build()).unwrap();
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_keep_screen_on::init())
        .plugin(tauri_plugin_android_battery_optimization::init())
        .plugin(tauri_plugin_keyring::init())
        .plugin(tauri_plugin_log::Builder::new().build());

    builder = builder.invoke_handler(tauri::generate_handler![
        // 连接命令
        ssh::sync_config,
        ssh::ssh_connect,
        // 会话管理
        ssh::ssh_close,
        ssh::ssh_run_command,
        ssh::ssh_window_change,
        // SFTP文件管理功能
        sftp::ssh_sftp_open,
        sftp::ssh_sftp_canonicalize,
        sftp::ssh_sftp_listdir,
        sftp::ssh_sftp_read,
        sftp::ssh_sftp_read_cancel,
        sftp::ssh_sftp_write,
        sftp::ssh_sftp_mkdir,
        sftp::ssh_sftp_remove_dir,
        sftp::ssh_sftp_remove_file,
        // 端口转发
        ssh::ssh_port_forward,
        ssh::ssh_close_port_forward,
        ssh::ssh_list_port_forwards,
        // 加解密支持
        encrypt::encrypt_derive_key,
        encrypt::encrypt_gen_salt,
        encrypt::encrypt_encrypt_data,
        encrypt::encrypt_decrypt_data,
    ]);

    #[cfg(debug_assertions)]
    {
        // let devtools = tauri_plugin_devtools::init();
        // builder = builder.plugin(devtools);
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

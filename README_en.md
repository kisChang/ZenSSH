ZenSSH
=======================

<p align="center">
  <img src="public/logo.png" alt="Logo" width="200px"/>
</p>

<p align="center">
<a href="README.md">中文</a> | 
<a href="README_en.md">English</a>
</p>

[![Build Status](https://github.com/kischang/ZenSSH/actions/workflows/win32.yaml/badge.svg)](https://github.com/kischang/ZenSSH/actions/workflows/win.yaml)
[![Build Status](https://github.com/kischang/ZenSSH/actions/workflows/linux.yaml/badge.svg)](https://github.com/kischang/ZenSSH/actions/workflows/linux.yaml)
[![Build Status](https://github.com/kischang/ZenSSH/actions/workflows/android.yaml/badge.svg)](https://github.com/kischang/ZenSSH/actions/workflows/android.yaml)
[![Build Status](https://github.com/kischang/ZenSSH/actions/workflows/macos.yaml/badge.svg)](https://github.com/kischang/ZenSSH/actions/workflows/macos.yaml)
[![License](https://img.shields.io/github/license/kischang/ZenSSH)](LICENSE)

ZenSSH is a cross-platform SSH client built with Tauri, supporting SSH connections and SFTP file transfers. It also supports jump servers, focusing on providing a **simple, stable, and user-friendly core experience**.

The goal of this project is to meet daily SSH usage needs **while keeping it lightweight and performant**, avoiding unnecessary complex features, making it ideal for developers and operations personnel.

## Features

* [x] SSH / SFTP / Jump Server
* [x] Configuration sync support: Github\Gitee Gist
* [x] Port Forwarding \Socks5 proxy
* [x] Shell-specific keyboard
* [x] Text file preview and editing
* [x] Server monitoring (basic)

## Screenshot (Android)

<table>
<tr>
<td><img src="screenshot/mobile_1.png"></td>
<td><img src="screenshot/mobile_2.png"></td>
<td><img src="screenshot/mobile_3.png"></td>
</tr>
</table>

## Screenshot (PC)

<table>

<tr>
<td><img src="screenshot/pc_1.png"></td>
<td><img src="screenshot/pc_2.png"></td>
<td><img src="screenshot/pc_3.png"></td>
</tr>
</table>

## IDE Setup

* [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Build step

```bash
1. Run `yarn tauri android|ios init` to initialize the mobile app.
2. Run `yarn icon` to initialize the icon.
3. Then you can compile and build the project.
```

## License

[MIT License with Commons Clause](LICENSE-COMMONS-CLAUSE.txt)

This project uses **MIT License + Commons Clause**.

* **Permitted:** Personal and non-commercial use, modification, and distribution
* **Not permitted:** Any commercial use

If you want to use this project for commercial purposes (including but not limited to commercial products, paid services, or any form of commercial use), please **contact the author for a commercial license**.

📧 Contact: [734615869@qq.com](mailto:734615869@qq.com)


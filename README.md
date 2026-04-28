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

ZenSSH 是一款基于 Tauri 构建的全平台 SSH 客户端，支持 SSH 连接与 SFTP 文件传输，支持跳板机，专注于提供简洁、稳定、易用的核心功能体验。

项目目标是在保证轻量与性能的前提下，满足日常 SSH 使用场景，避免复杂冗余的功能设计，适合开发者和运维人员的日常使用。

## Features 

- [x] SSH\Sftp\跳板机链接
- [x] 配置同步支持：Github\Gitee Gist
- [x] 端口转发\Socks5 代理
- [x] Shell专用键盘
- [x] 文本文件预览和编辑
- [x] 服务器性能监测(基础)

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

- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)


## 构建步骤


```bash
1. 运行 yarn tauri android|ios init 初始化移动端
2. 运行 yarn icon 初始化图标
3. 然后即可编译构建项目
```


## 开源协议 / 许可证（License）

[MIT License with Commons Clause](LICENSE-COMMONS-CLAUSE.txt)  

本项目采用 **MIT License + Commons Clause**。

- 允许个人及非商业用途的使用、修改和分发
- **不允许任何商业用途**

如需将本项目用于商业目的（包括但不限于商业产品、付费服务或其他任何形式），  
请联系作者获取**商业授权**。

📧 联系方式：734615869@qq.com


# HTTPS 简化部署验收（2026-11-23）

固定 DSH 上游仍为 2e39e70496aa02986ca6a820c5d497e816b69d7e / 0.2.2-rc.5，Node 24.22.3。本次更新安装/管理脚本，原生核心产物复用此前 IBM 原生验证包；未重编译 WebUI 或原生模块。

- Ubuntu 24.04 s390x 真机实际申请 Let’s Encrypt 公网 IPv4 证书；HTTP-01 测试 CA 与正式 CA 均成功。公网地址仅保存在私有测试材料中。
- 外部系统 TLS 校验成功，未认证 HTTPS 请求返回 401；80 端口跳转 HTTPS，验证路径保持可达。
- x64 Chromium 访问真机：受信任 TLS、安全上下文、Secure/HttpOnly cookie、登录、RPC、WSS PTY 输入输出/ANSI/尺寸、刷新保留、关闭和无 JS 错误通过。实际目录选择器加载远程目录并取消通过。
- 带有效凭据的跨站 Origin 请求返回 403。未关闭上游认证或 Host/Origin 策略。
- 真机升级测试：活动终端阻止升级；故障启动恢复旧程序和迁移前数据；手动恢复与最终升级健康检查通过。见 https-upgrade-ibm.json。
- 证书定时器每 6 小时检查，Persistent=true；手动触发首次 cron 返回 Result=success / ExecMainStatus=0。证书尚未到续期时间，这次跳过了实际重签；已验证签发/部署与 reload hook，不能宣称已观察到下一次自动续期。
- cron 与显式 Nginx reload 前后 DSH MainPID 不变；已有 WSS PTY 保持连接，重载后真实执行命令输出 s390x。见 https-renew-browser-ibm.json。
- start/stop/status/logs 真机通过；服务 enabled、active，用户 Linger=yes。证书私钥权限 600、root 所有。
- 本地 x64 14 项单元通过（含安装管理 6 项），上游请求信任 13 项通过，21 个 README Bash 代码块语法通过。

CI 只做 x64 源码/类型/模拟/ELF 与交叉构建，不申请证书、不连接测试机、不运行 s390x、QEMU 或 VM。此次真机与公网测试均由人工实施路径执行。无参数 ./install.sh 真机全新安装向导退出码 0，自动 HTTPS / 用户服务 / linger / timer 均成功；重装后公网 WebUI 与 WSS PTY 再验通过。见 https-clean-browser-ibm.json。

HTTPS Agent 与后台任务补验使用 mock 模型、真实工具执行：多轮文件写入/修改/读取与可见回复、浏览器断开后完成、界面主动停止后任务状态与不存在的结果文件、刷新持久化均通过。测试插件已移除并恢复原配置。见 https-agent-mock-ibm.json。

首轮托管 CI 在新增安装管理测试处失败：CI 工作目录为上游源码，测试错误地按 cwd 查找适配脚本。已改为 import.meta.dirname 定位，在相同工作目录重放 6 项全部通过；DSH artifacts、聚合类型检查和 105 项上游测试在失败轮均通过。最终托管 CI 45183414538 的 select / JavaScript+模拟 / cross-package / publish 全部成功；自动交叉包继续标为未经目标运行验收。见 https-ci-success.json。

最终手工真机包 SHA-256 校验与升级、服务器重启均通过；DSH enabled/active、Linger=yes、Nginx/timer active、本机 80/3080 规则保留，重启后外部可信 HTTPS 登录与 WSS PTY 再验通过。见 https-reboot-ibm.json 与 https-postreboot-browser-ibm.json。

正式 Latest 已发布：native-https-0.2.2-rc.5-s390x-45e0c674（draft=false / prerelease=false）。IBM 真机从公开 Latest 下载压缩包与 SHA-256，校验 OK，与最终验收包一致。见 https-release-final.json。

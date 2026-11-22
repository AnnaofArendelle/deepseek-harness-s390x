# 首版验收记录

日期：2026-11-22。上游 `0.2.2-rc.5` / `2e39e70496aa02986ca6a820c5d497e816b69d7e`，Node 24.22.3，pnpm 11.28.5。IBM Ubuntu 24.04 s390x 大端真机。首版原生和本地交叉包均已测试；[GitHub 托管 CI](https://github.com/AnnaofArendelle/deepseek-harness-s390x/actions/runs/44994504488) 已全部通过，自动交叉与原生真机验证 Release 已分别发布，详见 README。

| 验收面 | 结果与证据 |
|---|---|
| 原生可复现构建 | `native-build-entry-ibm.txt`：Rolldown/OXC 38 项、8 个 artifacts 阶段、逐项目类型编译和 84 项相关测试 |
| x64 构建与检查 | `build-check-poll-final-x64.txt`、`build-check-with-s390x-simulation-x64.txt`：Host/Client 聚合通过；`ci-focused-x64.txt`：105 项通过 |
| 交叉编译 | `cross-package-local-x64.txt`：干净官方提交检出、精确补丁、生产依赖部署、GCC/musl/node-pty、1,050 包、9 个 BE ELF、0 异架构、最大 GLIBC 2.36；远程下载慢时使用已有同一官方 Git 对象，不作为托管下载成功证据 |
| s390x 模拟 | `s390x-simulation-x64.txt`：6 项 syscall/fd_set/pollfd/unsigned -1 测试；`native-and-elf-simulation-x64.txt`：8 项 errno/execve/fcntl/ELF 通过 |
| WebUI/公网 | `browser-postreboot-ibm.json`：认证、RPC、WebSocket PTY、ANSI、resize、刷新保留、无浏览器 JS 错误 |
| 真实 Agent | `agent-installed-final-ibm.json`、`real-files-jobs-final-ibm.json`：用户提供的第三方兼容 API，自报 deepseek-v4.1-flash；多轮文件/命令、子任务、取消，独立核对文件与任务状态。接口有 8 请求/分钟限制，保留 429 记录 |
| 持久终端 | `runtime-final-package-ibm.json`、`pty-kernel-final-package-ibm.json`：输入输出、resize、Ctrl-C、退出、read/select/poll 真正内核等待与恢复；旧包 poll 负例曾失败，修复包通过 |
| 后台任务 | `jobs-ui-final-ibm.json`：断线后执行、实际 stdout、界面二次停止、SIGTERM 和结果文件不存在；`jobs-ui-initial-assertion-ibm.json` 保留最初文字断言误判，最终按真实状态验收 |
| 持久化 | `runtime-final-package-ibm.json`：SQLite、Zstd、文件锁竞争；`reboot-ibm.json`：19 个会话重启恢复且 idle |
| 插件/HMR | `plugin-final-package-ibm.json`、`hmr-live-ibm.txt`：安装、实际代码运行、watcher 更新、缓存失效、禁用/移除、资源释放 |
| 文件/图像/PDF/Office | `webui-file-ibm.json`、`office-public-ibm.json`、`office-system-ibm.json`、`directory-picker-public-ibm.json`：上传下载、Sharp PNG、PDF.js、远程目录、LibreOffice 实际转换与重算 |
| 沙箱/cgroup | `kernel-final-package-ibm.json`：允许路径、禁止路径、systemd 单元、后代清理；Landlock ABI 4 部分能力提示保留 |
| 运维 | `install-flow-ibm.json`、`uninstall-final-package-ibm.json`、`reboot-ibm.json`：活动任务阻止升级、故障恢复程序和迁移前数据、显式恢复、卸载保留数据、服务开机自启、iptables 持久化 |
| 首版交叉包人工复验 | `runtime-cross-package-ibm.json`、`pty-kernel-cross-package-ibm.json`、`kernel-cross-package-ibm.json`、`cross-browser-core-ibm.json`：目标模块/PTY/SQLite/Zstd/flock/内核/公网 WebUI 及 mock Agent 真实文件和后台任务通过 |

mock 仅脚本化模型响应，Agent 循环、bash、文件和后台任务均实际执行；真实模型记录单独列出。QEMU 用户态与完整 VM 未执行，按用户调整移出范围。自动 CI 只交叉编译并检查源码、类型、模拟和 ELF，不运行任何 s390x 程序，不连接 IBM；其 Release 标注未经目标运行验收。以上真机证据仅适用于首版固定基线。

附加功能：外部 Chrome DevTools MCP/CDP 浏览器控制真机通过；SenseVoice、Codex/Claude 独立子 Agent CLI、CUA 本机驱动缺可运行 s390x 实现，当前未支持。DSH 自身子 Agent 已经真实模型验证。Electron 不属于服务器发行包。Office 改用系统 LibreOffice/UNO/Poppler，字体及表格区域图片行为差异见 README。

测试服务器地址不公开，登录 token 只在服务器私有启动日志中。临时 3082 测试服务与规则在测试后删除。仓库/发行包不包含密钥、私钥或用户数据。

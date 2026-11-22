# 实施状态（2026-11-22）

总目标 G1–G7 活跃，首版尚未发布。

- 固定上游 SHA、Node 24.22.3、pnpm 11.28.5；精确补丁应用和 frozen-lockfile 安装已通过。
- s390x Node-API execve/fcntl、文件锁、Landlock、node-pty 已实际构建。OXC 大端 JSON 转义补丁通过 38 项回归和真机 Client 构建。
- 最新 x64 Host/Client 聚合类型检查通过。IBM 原生完整 8 阶段 artifacts 构建及逐项目 Host 类型编译通过；真机聚合 tests/scripts 类型检查因 4 GiB RAM 持续换页停止，该聚合检查没有成功结果。
- IBM 上终端、进程与 HMR 回归 201 项通过，3 项 PowerShell 因运行时缺失跳过。真实文件 watcher 的代码更新、imports/exports 缓存和资源释放通过。
- 真实模型接口为用户提供的兼容 API，自报 deepseek-v4.1-flash。文件多轮修改、后台任务、断线持续运行、前台转后台、停止、DSH 子 Agent、前台取消已通过，并核对了文件结果。
- 系统 LibreOffice + Poppler 通过真实 DOCX/XLSX/PPTX PDF、PNG、重算和安全边界测试；原 WASM 明确要求 little-endian。
- 最新包含 Node/pnpm，9 个目标 ELF 校验通过，实际依赖清单 1,050 包、10 个 native/WASM、无异架构 ELF。readelf 检出最大 GLIBC 版本 2.36，真机 Ubuntu 24.04 已验证。包内 PTY/SQLite/Zstd/flock 验收通过。用户目录/systemd 运行、活动终端阻止升级、故障启动恢复程序与数据、手动恢复及重新升级全部通过。
- 3080 防火墙规则已放行并保存；安装后公网浏览器复验已通过。测试数据与模型配置均在 Git 忽略或服务器私有目录。
- 用户调整：取消本地及 CI QEMU、完整 VM 和 CI 目标运行测试；保留自动交叉编译，仅做模拟单元、源码、类型及 ELF 检查。CI 不连接 IBM，自动产物明确标注未经目标运行验收。工作流尚未在托管环境执行。
- 已按用户要求清理可再生成缓存，释放约 6 GiB。保留源码、密钥和数据。
- 补充：文件、图片、Office/PDF 界面和下载通过；插件安装/HMR/禁用/移除通过；外部 Chrome DevTools MCP 浏览器控制通过。可选 Codex、Claude、SenseVoice、CUA 真机加载失败，明确列为未支持。
- 新增实际内核回归定位 poll(168) unsigned timeout=-1 解析失败；旧包负例失败、修复源码的 read/select/poll 与子进程退出通过。
- 最新固化原生入口使用独立目录从源码编译 Rolldown，通过 38 项 OXC、8 个 artifacts 阶段、Host/Client 逐项目编译和 84 项相关测试。4 GiB Client 聚合默认堆上限失败后，改用逐项目编译；x64 最新完整聚合检查通过。
- 最终包已升级至真机，包内 poll/read/select、插件生命周期、沙箱及 cgroup 清理通过；公网 token/RPC/WebSocket PTY 和刷新保留通过。
- 真实模型后台任务界面显示输出，二次确认停止后任务为 killed/SIGTERM，结果文件不存在；远程目录选择实测路径列表和取消通过。
- 服务器重启验收通过：19 会话恢复、服务自启、持久端口规则和公网终端复验通过。自动交叉包与真机原生首包的证据分别发布。
- x64 交叉打包干净检出重放通过：GCC/musl 系统绑定和 node-pty、官方 Node/Sharp/ripgrep，1,050 包、9 个 BE ELF、0 异架构，最大 GLIBC 2.36。首版交叉包人工 IBM PTY/SQLite/Zstd/flock、read/select/poll、Landlock/cgroup 和公网 mock Agent/WebUI/jobs/刷新测试通过。自动流水线不包含这些真机操作。
- 新增 s390x 模拟 6 项、native/ELF 单元 8 项、四组上游 105 项全部通过；包含模拟文件的 Host/Client 聚合类型检查通过。actionlint 和 shell 语法检查通过。剩余 GitHub 授权、实际托管 CI 和 Release，尚未标记完成。

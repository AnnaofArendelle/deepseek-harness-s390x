# DeepSeek Harness for s390x

独立适配 IBM LinuxONE / Linux s390x 的 DeepSeek Harness。上游固定为 `0.2.2-rc.5`，Node `24.22.3`，pnpm `11.28.5`。当前处于编写和验收阶段，尚无已通过完整验收的发行包。

## 全新安装顺序

### 1. 放行服务端口

以下适用于通过 iptables 管理 INPUT 规则的 Ubuntu 服务器。默认服务端口为 3080；更换端口时同时调整防火墙和启动参数。还需在云平台安全组中允许该 TCP 端口。

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT 2>/dev/null ||
  sudo iptables -I INPUT 1 -p tcp --dport 3080 -j ACCEPT

sudo env DEBIAN_FRONTEND=noninteractive \
  apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

安装 iptables-persistent 时保存规则；执行 `netfilter-persistent save` 后，在重启后使用 `sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT` 和外部浏览器重新验证。上述操作不会清空现有规则。撤销规则：

```bash
sudo iptables -D INPUT -p tcp --dport 3080 -j ACCEPT
sudo netfilter-persistent save
```

### 2. 安装压缩包

发行包和安装命令将在打包及干净安装测试通过后提供。程序安装在用户目录，DSH 数据目录独立保存。

### 3. 启动及认证

公网运行参数采用 `--host 0.0.0.0 --port 3080 --public-url http://SERVER_IP:3080/ --trusted-host SERVER_IP:3080 --no-open`。保留 DSH token/cookie、Host/Origin 和 WebSocket 认证。访问启动日志显示的认证入口后，在 WebUI 设置中配置 DeepSeek API key。

HTTP 初始部署按用户选择使用。已有域名和证书可通过上游 `--tls-cert` / `--tls-key` 参数配置 HTTPS；最终参数将在 CLI 实测后固定。

## 编译

```bash
sudo apt-get update
sudo apt-get install -y build-essential git curl python3 musl-tools pkg-config
./scripts/bootstrap-node.sh
node scripts/prepare-source.mjs build/upstream
# s390x 安装策略保留 node-pty 等功能性脚本：
.cache/toolchain/bin/node scripts/configure-platform.mjs build/upstream
cd build/upstream
PATH="../../.cache/toolchain/bin:$PATH" CI=true pnpm install --no-frozen-lockfile --child-concurrency=1
cd ../..
./scripts/native-build.sh build/upstream
```

当前构建诊断：s390x Host 类型编译已通过，node-pty / 文件锁 / Landlock / execve 原生构建通过；Rolldown 打包复杂 workspace 时段错误仍在定位。上面的流程会如实失败，不把不完整构建当成发行包。

## CI 与升级

最终 CI 在 x64 GitHub 托管 runner 与 QEMU s390x 用户态、完整 VM 中执行，不通过 SSH 连接任何外部测试服务器。跟随上游正式版及预发布版，必需检查失败时停止发布。已安装服务器手动升级。

调查与实际测试证据见 `reports/`。私钥、模型 key、运行数据、下载缓存和 build/dist 均不进入 Git。

# MinIO（Windows）快速使用说明

本目录包含 `minio.exe` 与 `mc.exe`，可用于在 Windows 上快速启动一个本地 MinIO 服务并通过 `mc` 进行管理。

## 目录结构

- **minio.exe**：MinIO Server
- **mc.exe**：MinIO Client（管理工具）
- **minio-data/**：默认数据目录（对象数据会写入这里）

## 启动 MinIO（本地单机）

在当前目录打开 PowerShell，执行：

```powershell
.\minio.exe server .\minio-data
```

如果 `minio-data` 目录不存在，可先创建：

```powershell
New-Item -ItemType Directory -Path .\minio-data -Force
```

启动后通常会输出：

- **API 地址**：如 `http://127.0.0.1:9000`
- **Console 地址**：如 `http://127.0.0.1:9001`
- **RootUser/RootPassword**：首次启动会给出默认账号密码（请妥善保存）

如果你希望自定义账号密码，可在启动前设置环境变量（示例）：

```powershell
$env:MINIO_ROOT_USER = "minioadmin"
$env:MINIO_ROOT_PASSWORD = "minioadmin123"
.\minio.exe server .\minio-data
```

## 使用 mc 连接与常用命令

### 1) 添加别名（连接到本地 MinIO）

把 `<ACCESS_KEY>` / `<SECRET_KEY>` 替换为你启动时的 RootUser/RootPassword：

```powershell
.\mc.exe alias set local http://127.0.0.1:9000 <ACCESS_KEY> <SECRET_KEY>
```

### 2) 查看服务信息

```powershell
.\mc.exe admin info local
```

### 3) 创建与查看 Bucket

```powershell
.\mc.exe mb local/my-bucket
.\mc.exe ls local
```

### 4) 上传/下载文件

```powershell
# 上传文件到 bucket
.\mc.exe cp .\example.txt local/my-bucket/

# 下载对象到本地
.\mc.exe cp local/my-bucket/example.txt .\
```

### 5) 生成临时访问链接（分享下载）

```powershell
.\mc.exe share download local/my-bucket/example.txt
```

## 常见问题

- **端口被占用**：确保 `9000/9001` 未被其它程序占用；或用参数/环境变量调整端口后再启动。
- **数据在哪里**：对象数据默认写入本目录下的 `minio-data/`。

## 开机自启动 MinIO（Windows）

下面提供两种方式，优先推荐 **方式 A（Windows 服务）**。

### 方式 A（推荐）：用 nssm 注册为 Windows 服务

`nssm`（Non-Sucking Service Manager）可以把普通程序包装成系统服务，稳定且易维护。

1) 准备固定目录（示例）

建议把 MinIO 放在固定路径，避免移动后服务失效，例如：

```text
C:\minio\minio.exe
C:\minio\minio-data\
```

2) 下载并安装 nssm

- 下载地址：[https://nssm.cc/download](https://nssm.cc/download)
- 将 `nssm.exe` 放到系统 `PATH`，或放在你当前命令目录中

3) 以管理员身份打开 PowerShell，创建服务

```powershell
# 1. 安装服务（服务名可自定义）
nssm install MinIO "C:\minio\minio.exe" server "C:\minio\minio-data"

# 2. 设置工作目录
nssm set MinIO AppDirectory "C:\minio"

# 3. 设置开机自动启动
nssm set MinIO Start SERVICE_AUTO_START
```

4) 配置 MinIO 账号密码（强烈建议）

```powershell
nssm set MinIO AppEnvironmentExtra MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=YourStrongPassword123!
```

5) 启动并验证

```powershell
nssm start MinIO
Get-Service MinIO
```

浏览器访问 `http://127.0.0.1:9001`，可进入管理控制台。

> 提示：如果你的机器重启后服务没起来，先检查服务是否为 `Automatic`，再看事件查看器或服务日志。

### 方式 B：使用“任务计划程序”开机启动（无额外工具）

如果你不想安装 nssm，可通过计划任务在开机时启动 MinIO。

1) 以管理员身份打开 PowerShell，创建启动脚本 `C:\minio\start-minio.ps1`

```powershell
$env:MINIO_ROOT_USER = "minioadmin"
$env:MINIO_ROOT_PASSWORD = "YourStrongPassword123!"
Set-Location "C:\minio"
.\minio.exe server .\minio-data
```

2) 创建计划任务（开机触发）

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\minio\start-minio.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "MinIO-Startup" -Action $action -Trigger $trigger -Description "Start MinIO at system startup" -RunLevel Highest -User "SYSTEM"
```

3) 立即测试任务

```powershell
Start-ScheduledTask -TaskName "MinIO-Startup"
Get-ScheduledTask -TaskName "MinIO-Startup"
```

### 自启动后的常用检查命令

```powershell
# 检查 9000/9001 端口是否监听
netstat -ano | findstr ":9000"
netstat -ano | findstr ":9001"

# 用 mc 检查服务状态
.\mc.exe admin info local
```

## 下一步（可选增强）

- 绑定局域网 IP（让其他设备访问）
- 配置 HTTPS（证书部署）
- 细化权限（创建非 root 用户并分配策略）
- 做数据盘与日志盘分离（更利于运维）

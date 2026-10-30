# MyImage

本地图片浏览与工具站：**Next.js** 前端 + **FastAPI** 后端 + **MinIO** 对象存储。

仓库地址：<https://github.com/IQmaster66/MyImage>

## 功能概览

| 模块 | 说明 |
|------|------|
| 工具箱 `/toolbox` | 裁剪/调色/导出、读 SD/ComfyUI 参数、WD/Camie 标签反推、存到临时插画 / 人物百科 |
| 临时插画 | 图片在 MinIO，条目在服务端 SQLite；可看大图与生成参数 |
| 人物百科 | 配图 + 双套提示词 + 出自分类；支持批量搭配、压缩配图为 JPG |
| 推荐 | 汇集临时插画与人物配图，等比浏览 |
| 提示词库 | 词库与工作台（服务端 SQLite + 可选预览图） |
| 后台 `/images` | 统一管理临时插画与人物图、存储体积、孤立对象清理 |

## 环境要求

- **Windows**（附带 `start-dev.bat` / MinIO exe；Linux/macOS 需自行安装 MinIO）
- **Node.js** 20+（前端）
- **Python** 3.11+（后端；建议用 `api/setup.bat` 建虚拟环境）
- **磁盘**：模型缓存约数 GB～10GB+；MinIO 数据随图片增长
- 可选 **NVIDIA GPU**（加速 WD ONNX / Torch；无 GPU 也可 CPU 运行）

## 快速启动（本机已配置过）

```bat
start-dev.bat
```

会分别打开：

- API：<http://127.0.0.1:8787>
- Web：<http://localhost:3000>（默认）

**首次克隆**请按下一节完整安装，并先启动 MinIO。

## 首次安装

### 1. 克隆仓库

```bash
git clone https://github.com/IQmaster66/MyImage.git
cd MyImage
```

### 2. MinIO（图片存储，必开）

可执行文件**不在 Git 中**（超过 GitHub 单文件 100MB 限制），需自行下载到 `minio/`：

1. 下载 [MinIO Server（Windows）](https://dl.min.io/server/minio/release/windows-amd64/minio.exe) → 保存为 `minio/minio.exe`
2. （可选）下载 [MinIO Client `mc`](https://dl.min.io/client/mc/release/windows-amd64/mc.exe) → 保存为 `minio/mc.exe`
3. 启动（账号示例与 `api/.env.example` 一致）：

```powershell
cd minio
$env:MINIO_ROOT_USER = "minioadmin"
$env:MINIO_ROOT_PASSWORD = "minioadmin123"
.\minio.exe server .\minio-data --console-address ":9001"
```

- API：`http://127.0.0.1:9000`
- Console：`http://127.0.0.1:9001`

首次使用请在 Console 或用 `mc` **创建 bucket：`myimage`**。更多说明见 [`minio/README.md`](minio/README.md)。

> `minio/minio-data/` 为本地对象数据，**不会**进 Git。换电脑后图片不会随仓库带走，需自行备份该目录或重新上传。

### 3. 后端 API

```bat
cd api
setup.bat
```

复制配置（不要提交自己的副本）：

```bat
copy .env.example .env
copy .hf.example .hf
```

按需编辑 `api/.env`（MinIO 账号需与上一步一致）。模型路径说明见 `api/.hf.example`。

启动：

```bat
start.bat
```

健康检查：`http://127.0.0.1:8787/health`（若路由存在）或打开文档 `http://127.0.0.1:8787/docs`。

**模型（`.hf/`）**：默认缓存在项目根目录 `.hf/`（数 GB～十余 GB）。**不能**用普通 Git 推送到 GitHub。首次在工具箱使用 BLIP / 翻译 / WD / Camie 时会自动从 Hugging Face 下载；也可事先填好 `api/.hf` 指向已有 snapshots。离线或内网请自行拷贝 `.hf/` 目录。

### 4. 前端

```bat
cd web
npm install
npm run dev
```

可选：在 `web/.env.local` 设置 API 地址（默认已是本机 8787）：

```env
NEXT_PUBLIC_ML_API_URL=http://127.0.0.1:8787
```

### 5. 可选：背景音乐

将自有音频放入 `web/public/music/`（见该目录 README）。仓库不提交音乐文件。

## 日常开发

```bat
REM 需已启动 MinIO
start-dev.bat
```

或分别运行 `api/start.bat` 与 `web/start.bat`。

## 哪些内容无法 / 不应上传到 GitHub

| 路径 | 原因 | 正确做法 |
|------|------|----------|
| `.hf/`（模型缓存） | 体积极大（常 10GB+），远超仓库能力 | 本机保留；换机重新下载或网盘拷贝 |
| `minio/minio.exe`、`minio/mc.exe` | 单文件约 100MB+，超 GitHub **100MB** 单文件上限 | 按上文链接自行下载 |
| `minio/minio-data/` | 用户图片与对象数据，体积大且属隐私/本机数据 | 本机备份；新环境空目录启动即可 |
| `api/data/*.db` | SQLite 运行时数据 | 本机保留；结构由程序自动建表 |
| `api/.env`、`api/.hf` | 密钥与本机路径 | 只提交 `.env.example` / `.hf.example` |
| `web/public/music/*`（音频） | 版权与体积 | 自备文件；仅提交 `.gitkeep` |
| `web/node_modules/`、`api/.venv/`、`web/.next/` | 依赖与构建产物 | `npm install` / `setup.bat` 生成 |

推送前可用：

```bash
git status
git check-ignore -v path/to/file
```

确认大文件与密钥未被加入暂存区。若误提交超大文件导致 `push` 被拒，需从历史中移除后再推（或改用 [Git LFS](https://git-lfs.com/)，一般仍不建议把模型放进仓库）。

## 目录结构（简）

```text
MyImage/
├── start-dev.bat          # 一键开 API + Web
├── api/                   # FastAPI（WD/Camie、MinIO、百科/临时插画/词库）
├── web/                   # Next.js 前端
├── minio/                 # MinIO 说明与数据目录占位（exe 需自备）
└── .hf/                   # 本机模型缓存（gitignore）
```

## 常见问题

1. **人物百科 / 临时插画打不开图**  
   确认 MinIO 已启动、bucket 为 `myimage`，且 `api/.env` 中 `MINIO_*` 与 Root 账号一致。

2. **标签反推 / 反推模型报错**  
   确认 API 进程正常；首次会下载模型，需能访问 Hugging Face（或已有 `.hf` 缓存）。可看 `api/.hf.example`。

3. **`git push` 报 file too large**  
   不要提交 `minio.exe`、模型或 `minio-data` 里的大对象。本仓库 `.gitignore` 已排除上述路径。

4. **克隆后没有图片**  
   正常。图片在 MinIO 与 SQLite，不在 Git。用工具箱重新上传，或恢复自己的 `minio-data` + `api/data` 备份。

## 许可证与第三方

- 本项目代码按仓库声明使用。
- WD / Camie / BLIP 等模型遵循各模型作者协议；请从官方 Hub 获取。
- 请勿将无授权的版权音乐或图片提交到公开仓库。

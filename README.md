# MyImage

图片浏览与工具站点（Next.js 前端 + Python API + MinIO）。

## 本地开发

```bat
start-dev.bat
```

- 前端：`web/` → 见 `web/package.json`
- 后端：`api/` → 见 `api/requirements.txt`

## 大文件夹与 GitHub 限制

| 路径 | 体积（约） | 能否普通 `git push` |
|------|------------|---------------------|
| `minio/` | ~160MB（含 exe） | **可推** `minio-data/`、脚本等；`minio.exe` / `mc.exe` 单文件过大，已在 `.gitignore` 排除，需本机保留或另下 |
| `.hf/` | **~10GB+** | **不能**用普通 Git 推送到 GitHub（超限且极慢） |

`.hf` 是 Hugging Face 模型缓存，换电脑后可在 `api` 里重新下载。若必须备份，请用网盘 / 移动硬盘，不要放进 Git 仓库。

## 连接 GitHub

1. 在 GitHub 新建**空仓库**（不要勾选 “Add a README”）。
2. 在本机项目根目录执行（将 URL 换成你的仓库地址）：

```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

若使用 SSH：

```bash
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
```

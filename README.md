# MyImage

图片浏览与工具站点（Next.js 前端 + Python API + MinIO）。

## 本地开发

```bat
start-dev.bat
```

- 前端：`web/` → 见 `web/package.json`
- 后端：`api/` → 见 `api/requirements.txt`

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

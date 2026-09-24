# Docker 一键部署：调研记录与阻塞结论（2026-09）

> 状态：**计划已取消**——实现已回滚（`630fbfb` / `37c16b6` → `f757b62`）。本文留档排查结论与可复用配置；待下述 Linux 原生库问题解决后可直接照附录恢复。

## 结论（TL;DR）

nginx 反代 + 多阶段构建的部署方案本身**已验证可行**（静态托管 / SPA 回退 / `/api` 反代 / 音频流透传链路全通），唯一阻塞：**pymusiclibrary（网易云 SDK）在 Linux 无可用原生库**——上游把 Windows DLL 发到了所有平台轮子，Linux 容器内 `MusicLibrary` 加载失败，SDK worker 一启动即崩，`/api/*` 全部 502。与 Docker 配置、网络、CsPlayer 代码无关。

## 症状

- 访问容器化站点提示「音乐服务内部错误」，`POST /api/auth/qr/key` 返回 502
- 后端日志：

```
INFO  csplayer.ncm SDK worker 已启动 pid=32
Process ncm-sdk-worker:                        ← 子进程 traceback 在此（被日志吞掉）
WARNING csplayer.ncm SDK worker 崩溃: login_qr_key (第 1 次尝试): worker 异常退出: [Errno 104] Connection reset by peer
ERROR csplayer.ncm SDK worker 连续崩溃 3 次，进入 30s 退避
```

## 因果链

1. `[Errno 104] Connection reset by peer` **不是网络问题**：`ncm_worker` 子进程猝死后，主进程读 multiprocessing Pipe 报断连（`ncm_client._invoke_once` 的兜底文案），重试 3 次耗尽 → 502
2. worker 死因（容器内实测）：

```
File ".../MusicLibrary/core.py", line 20, in <module>
    engine = CDLL(os.path.join(LIB_DIR, get_lib_filename("engine")))
OSError: .../MusicLibrary/lib/libengine.so: cannot open shared object file: No such file or directory
```

   `core.py` 在非 Windows 平台找 `lib{engine,ncm_music_api,kugou_music_api}.so`，但 wheel 的 `MusicLibrary/lib/` 只有 `engine.dll / kugou_music_api.dll / libcurl.dll / ncm_music_api.dll / zlib1.dll`
3. **上游打包缺陷（已实证）**：`pymusiclibrary` 仅 `0.0.4` 一版；解包其 `cp312-abi3-manylinux2014_x86_64` 与 `cp312-abi3-macosx_11_0_x86_64` 轮子，内容都是同一套 Windows DLL，**PyPI 上从未存在过 Linux/macOS 原生库**

即：Windows 开发一切正常（`engine.dll` 能加载），Linux 容器必崩。

## 网络环境注记（恢复取库时注意）

- GitHub 直连 TLS 被掐（`api.github.com` / `raw.githubusercontent.com` 均 `SSL: UNEXPECTED_EOF_WHILE_READING`），jsDelivr 亦不通
- `ghproxy.net` 可作 GitHub 代理：raw 内容可读；releases HTML / API 不稳或 403（通道时通时断）
- PyPI 可达（pip 偶发 SSL 重试后成功）；gitee 搜索无该项目镜像
- 上游构建链：webpack（JS 打包）+ CMake + vcpkg + quickjs-ng，preset 仅 `windows-x64-vcpkg`——源码构建 Linux 产物成本很高

## 恢复路线（按优先级）

1. **拿到 Linux 预编译库**（`libengine.so` / `libncm_music_api.so` / `libkugou_music_api.so`）：上游 [MusicLibrary](https://github.com/2061360308/MusicLibrary) Release 资产，或 [NeteaseCloudMusic_PythonSDK](https://github.com/2061360308/NeteaseCloudMusic_PythonSDK) 仓库 `lib/`；拿到后在 backend 镜像里替换 `site-packages/MusicLibrary/lib/` 即可——最省事
2. **源码构建**（multi-stage：pnpm webpack + cmake/vcpkg）——重，且取源码同样受 GitHub 网络制约
3. **换 SDK / 后端绕开该 SDK**——工作量最大

## 已验证可行的部分（恢复时无需重测）

- 首页 200、SPA 回退 200、`/api/health` 反代 ok、未登录 API 正确返回 401 JSON、`/api/stream` 401 透传
- compose 健康检查（`/api/health`）+ `depends_on: service_healthy` 编排正常
- 前端零改动：相对路径 `/api/*` + nginx 反代同源，`SameSite=Lax` 会话 cookie 直接可用

## 附录：回滚前的最终配置（可直接复用）

### `docker-compose.yml`

```yaml
# CsPlayer 一键部署：docker compose up -d --build
# web（nginx 托管前端 + 反代 /api）→ backend（FastAPI，零落盘，凭证只存浏览器）
services:
  backend:
    build: ./backend
    container_name: csplayer-backend
    restart: unless-stopped
    healthcheck:
      test:
        - CMD
        - python
        - -c
        - import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  web:
    build: ./frontend
    container_name: csplayer-web
    restart: unless-stopped
    ports:
      # 对外端口，可覆盖：CSPORT=9000 docker compose up -d
      - "${CSPORT:-7729}:80"
    depends_on:
      backend:
        condition: service_healthy
```

### `backend/Dockerfile`

```dockerfile
# CsPlayer 后端镜像：FastAPI + uvicorn（会话仅存内存，容器零落盘，凭证只在浏览器）
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 非 root 运行
RUN useradd --create-home --uid 10001 csplayer
USER csplayer

EXPOSE 8000

# 对外 0.0.0.0（容器外访问需监听所有网卡）；应用自身 host/port 配置不生效于此
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### `backend/.dockerignore`

```
__pycache__/
*.py[cod]
.venv/
venv/
*.log
```

### `frontend/Dockerfile`

```dockerfile
# CsPlayer 前端镜像：多阶段——node 构建 dist，nginx 托管并反代 /api 到 backend
FROM node:20-alpine AS build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80
```

### `frontend/.dockerignore`

```
node_modules/
dist/
vite.log
tsconfig.tsbuildinfo
```

### `frontend/nginx.conf`

```nginx
# CsPlayer 前端静态托管 + /api 反代（compose 内服务名 backend）
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # SPA 回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # index.html 不缓存（发新版后刷新即生效）；带 hash 的静态资源长缓存
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 音频流：透传 Range（拖拽进度）、关闭缓冲避免边下边播卡顿
    location /api/stream {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Range $http_range;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

## 备注

- 端口历史：默认端口 8080（本机被占）→ 3000 → 最终定 7729（更不常见）；对外端口用 `CSPORT` 覆盖
- SDK worker 崩溃语义见 `backend/app/core/ncm_client.py` / `ncm_worker.py` 模块注释（子进程隔离 + 换新进程重试是唯一恢复手段）

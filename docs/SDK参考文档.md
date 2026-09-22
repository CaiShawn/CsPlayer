# MusicLibrary Python 绑定

[![Python Version](https://img.shields.io/badge/python-3.6+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](https://github.com/2061360308/MusicLibrary)

这是 MusicLibrary 的 Python 语言绑定，提供了对网易云音乐、酷狗音乐等音乐平台 API 的 Python 接口访问。

## 📦 安装

### 从 PyPI 安装（推荐）

```bash
pip install pymusiclibrary
```

### 从源码安装

从源码安装需要先构建 wheel 包，详见下方 [构建指南](#-构建指南)。

```bash
# 克隆仓库
git clone https://github.com/2061360308/MusicLibrary.git
cd MusicLibrary/src/python

# 安装依赖
pip install -r requirements.txt

# 按照 [构建指南](#-构建指南) 构建完成后安装
pip install dist/musiclibrary-*.whl
```

## 🚀 快速开始

### 响应对象 Response

所有 API 请求返回统一的 `Response` 对象，自动解析 JSON 响应字符串。

**属性说明**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `status` | int | HTTP 状态码，200 表示成功，解析失败默认 500 |
| `headers` | dict | 响应头信息，解析失败默认空字典 |
| `body` / `data` | dict | 响应体数据，解析失败默认空字典 |
| `cookies` | str | 从 headers 获取的 `Set-Cookie` 值 |

```python
from MusicLibrary.neteaseCloudMusicApi import NeteaseCloudMusicApi

ncm = NeteaseCloudMusicApi()
response = ncm.playlist_mylike()

# 检查状态码
if response.status == 200:
    # 获取数据（body 和 data 等价）
    songs = response.body.get('playlist', {}).get('tracks', [])
    songs = response.data.get('playlist', {}).get('tracks', [])

# 获取 Cookie（登录接口返回）
cookies = response.cookies

# 查看完整响应（自动格式化打印）
print(response)
```

**错误处理**：当响应解析失败时，`Response` 会自动使用默认值（status=500, headers={}, body={}），不会抛出异常。

### 网易云音乐

```python
from MusicLibrary.neteaseCloudMusicApi import NeteaseCloudMusicApi, NcmProcessEnv

# 创建 API 实例
ncm = NeteaseCloudMusicApi()

# 使用封装好的方法
response = ncm.playlist_mylike()
print(response)

# 获取歌曲详情
response = ncm.song_detail(ids="347230")
print(response)

# 搜索歌曲
response = ncm.search_default()
print(response)
```

### 酷狗音乐

```python
from MusicLibrary.kuGouMusicApi import KuGouMusicApi, Platform, KugouProcessEnv

# 创建 API 实例（使用轻量版平台）
kugou = KuGouMusicApi(KugouProcessEnv(platform=Platform.LITE))

# 获取新歌速递
response1 = kugou.top_song()
print(response1)

# 获取专辑详情
response2 = kugou.album_detail(id='10729818')
print(response2)
```

## 📚 API 文档

### 网易云音乐 API

网易云音乐 API 已完整封装为方法，直接调用即可。

示例方法：
- `login_cellphone()` - 手机号登录
- `playlist_mylike()` - 获取用户歌单
- `song_detail()` - 获取歌曲详情
- `search_default()` - 搜索歌曲
- `lyric()` - 获取歌词
- `artist_detail()` - 获取艺术家详情
- `album()` - 获取专辑信息
- 更多方法请查看 `neteaseCloudMusicApi.py` 源码

### 酷狗音乐 API

酷狗音乐提供了封装好的方法，直接调用即可。

示例方法：
- `top_song()` - 获取新歌速递
- `album_detail()` - 获取专辑详情
- `search_default()` - 搜索歌曲
- 更多方法请查看 `kuGouMusicApi.py` 源码

### 平台配置

```python
from MusicLibrary.kuGouMusicApi import Platform, KugouProcessEnv

# 支持的平台类型
kugou = KuGouMusicApi(KugouProcessEnv(platform=Platform.LITE))   # 概念版
kugou = KuGouMusicApi(KugouProcessEnv(platform=Platform.WEB))    # 普通版
```

## ⚠️ 注意事项

### 线程安全

**重要**：`KuGouMusicApi`、`NeteaseCloudMusicApi` 等 API 对象不能跨线程使用。如果需要多线程访问，请为每个线程创建独立的实例。

```python
from MusicLibrary.neteaseCloudMusicApi import NeteaseCloudMusicApi

# 错误示例 - 不要这样做！
api = NeteaseCloudMusicApi(None)
Thread(target=api.request, args=('/api/path', '{}')).start()

# 正确做法
def worker():
    api = NeteaseCloudMusicApi()
    return api.login_cellphone(phone="xxx", password="yyy")

Thread(target=worker).start()
```

### 缓存

原始 Node.js 项目支持缓存功能，相同请求会返回缓存数据。当前 Python 绑定版本尚未实现缓存功能，请根据业务需求自行处理。

## 🔧 构建指南

> 上游仓库已完成预编译，只需要从对方 Release 下载对应平台的预编译库即可。

### Windows 平台

```bash
# 1. 下载并配置预编译库
python setLibArch.py win64  # 或 win32、winarm

# 2. 设置环境变量（CMD）
set MUSICLIB_ARCH=win64

# 3. 构建 wheel
python -m build --wheel
```

**PowerShell 设置环境变量：**
```powershell
$env:MUSICLIB_ARCH="win64"
python -m build --wheel
```

### Linux 平台

```bash
# 1. 下载并配置预编译库
python setLibArch.py linux64  # 或 linuxarm

# 2. 设置环境变量
export MUSICLIB_ARCH=linux64

# 3. 构建 wheel
python -m build --wheel
```

### macOS 平台

```bash
# 1. 下载并配置预编译库
python setLibArch.py macos64  # 或 macosarm

# 2. 设置环境变量
export MUSICLIB_ARCH=macos64

# 3. 构建 wheel
python -m build --wheel
```

### 支持的架构

| 架构参数 | 平台 | 说明 |
|---------|------|------|
| `win64` | Windows | 64 位 Windows |
| `win32` | Windows | 32 位 Windows |
| `winarm` | Windows | ARM64 Windows |
| `linux64` | Linux | x86_64 Linux |
| `linuxarm` | Linux | ARM64 Linux |
| `macos64` | macOS | Intel 芯片 macOS |
| `macosarm` | macOS | Apple Silicon (M1/M2/M3) |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

贡献指南：
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 🔗 相关链接

- [主仓库](https://github.com/2061360308/MusicLibrary) - C 语言核心库
- [总 README](../../README.md) - 项目总览
- [Dart 绑定](../dart/) - Dart 语言绑定
- [API 特性列表](../../README.md#-特性) - 完整 API 接口列表

## ⚖️ 许可证

本项目采用 MIT 许可证开源。详见 [LICENSE](../../LICENSE) 文件。

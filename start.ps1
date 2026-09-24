# CsPlayer 一键启动（Windows）：首次自动装依赖，后端 / 前端各开一个终端窗口，就绪后打开浏览器
# 用法：PowerShell 运行 .\start.ps1，或直接双击 start.bat
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# 后端：依赖就绪（已满足时秒过）→ uvicorn 热重载
Start-Process powershell -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command',
    "Set-Location '$root\backend'; pip install -r requirements.txt; uvicorn app.main:app --reload --port 8000"
)

# 前端：node_modules 缺失才 npm install → vite 开发服
Start-Process powershell -ArgumentList @(
    '-NoExit', '-NoProfile', '-Command',
    "Set-Location '$root\frontend'; if (-not (Test-Path node_modules)) { npm install }; npm run dev"
)

# 就绪后打开浏览器
Start-Sleep -Seconds 5
Start-Process 'http://localhost:5173'

Write-Host "后端 http://127.0.0.1:8000 · 前端 http://localhost:5173（已打开浏览器）"
Write-Host "关闭两个终端窗口即可停止服务。"

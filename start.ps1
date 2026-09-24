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

# 轮询就绪后才打开浏览器（首次 npm install 可能要几分钟）
function Test-Http($url) {
    try {
        return (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3).StatusCode -eq 200
    } catch {
        return $false
    }
}

Write-Host "等待后端 / 前端就绪（首次安装依赖耗时较长）..."
$backendOk = $false
$frontendOk = $false
$deadline = (Get-Date).AddMinutes(10)
while (-not ($backendOk -and $frontendOk) -and (Get-Date) -lt $deadline) {
    if (-not $backendOk -and (Test-Http 'http://127.0.0.1:8000/api/health')) {
        $backendOk = $true
        Write-Host "后端已就绪 http://127.0.0.1:8000"
    }
    if (-not $frontendOk -and (Test-Http 'http://localhost:5173')) {
        $frontendOk = $true
        Write-Host "前端已就绪 http://localhost:5173"
    }
    if (-not ($backendOk -and $frontendOk)) { Start-Sleep -Seconds 2 }
}

if ($backendOk -and $frontendOk) {
    Start-Process 'http://localhost:5173'
    Write-Host "全部就绪，已打开浏览器。"
} else {
    Write-Host "等待超时（10 分钟）：后端=$backendOk 前端=$frontendOk——就绪后可手动打开 http://localhost:5173"
}
Write-Host "关闭两个终端窗口即可停止服务。"

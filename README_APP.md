# WYY Player（P1）

第三方网易云 Web 播放器：二维码登录 · 我的/收藏歌单 · 收藏专辑 · 播放器。

## 启动

```powershell
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 。

设计文档见 [PHASE1_DESIGN.md](./PHASE1_DESIGN.md)。

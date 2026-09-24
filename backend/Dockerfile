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

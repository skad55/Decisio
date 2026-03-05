FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /app/pyproject.toml

RUN pip install --no-cache-dir -U pip \
 && python -c "import tomllib; d=tomllib.load(open('pyproject.toml','rb')); open('/tmp/req.txt','w',encoding='utf-8').write('\n'.join(d['project']['dependencies']))" \
 && pip install --no-cache-dir -r /tmp/req.txt

COPY . /app

EXPOSE 8000

CMD ["bash","-lc","alembic upgrade head && python -m app.db_init && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
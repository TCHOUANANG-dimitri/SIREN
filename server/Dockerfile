FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app

COPY requirements.txt ./

# Toutes les dépendances fournissent des wheels cp312 manylinux :
# aucun outillage de compilation (gcc) ni bibliothèque système à installer.
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data/osm && chown -R app:app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).read();" || exit 1

CMD ["gunicorn", "app.main:app", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "4", "--max-requests", "10000", "--max-requests-jitter", "1000"]

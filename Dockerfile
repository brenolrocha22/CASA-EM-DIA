FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Usuário sem privilégios; a pasta data/ guarda o banco SQLite (volume no compose).
RUN useradd --create-home --uid 1000 casa \
    && mkdir -p /app/data \
    && chown casa:casa /app/data

COPY --chown=casa:casa server.py index.html app.js styles.css casa_em_dia.ico transferir.jfif ./

USER casa

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/', timeout=2)"

# Dentro do container o servidor precisa escutar em 0.0.0.0; quem limita o acesso é o compose.yaml.
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8765"]

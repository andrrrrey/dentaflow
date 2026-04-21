FROM python:3.11-slim

WORKDIR /app

# Системные зависимости (если нужны для psycopg2 и пр.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# По умолчанию — продакшен (без --reload).
# В dev переопределяется через docker-compose.yml command.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

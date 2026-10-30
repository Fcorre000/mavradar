# Cloud Run image: python:3.12-slim, multi-stage, non-root, one uvicorn worker.

FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /srv
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev
COPY app ./app

FROM python:3.12-slim
RUN useradd --create-home --uid 10001 app
WORKDIR /srv
COPY --from=build --chown=app:app /srv /srv
ENV PATH="/srv/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PORT=8080
USER app
# One worker: each would hold its own copy of the in-memory state (backend guide, section 3).
# exec makes uvicorn PID 1, so it gets Cloud Run's SIGTERM and finishes in-flight requests.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\" --workers 1"]

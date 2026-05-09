FROM python:3.12-alpine

WORKDIR /app

COPY tools/template-preview /app/tools/template-preview
COPY artifacts/ui-templates /app/artifacts/ui-templates

EXPOSE 9999

CMD ["python", "tools/template-preview/server.py"]

# UI Template Preview Artifacts

This directory stores standalone HTML templates before the production frontend scaffold exists.

Run the preview server:

```bash
docker compose up -d template-preview
```

Open:

```text
http://localhost:9999
```

When a template issue creates an HTML file:

1. Put the file in this directory, for example `foundation-app-shell.html`.
2. Update `manifest.json`:
   - set `status` to `ready`
   - set `file` to the HTML filename
3. Open `/templates/<slug>` from the preview index.

The preview server is intentionally dependency-free and does not represent the production React app architecture.

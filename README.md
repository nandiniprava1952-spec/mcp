# MCP Card — Photo Kit (PWA)

1. Create a **public** GitHub repo and upload every file in this folder to its root.
2. Repo **Settings > Pages > Build and deployment**: Source = *Deploy from a branch*, Branch = `main` / `(root)`, Save.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.
4. On the phone, open that link and choose **Add to Home Screen** (iPhone: Share > Add to Home Screen; Android Chrome: menu > Install app).

Reference images load from `raw.githubusercontent.com/nandiniprava1952-spec/mcp/main/` (that repo must stay public). They are cached after first view, so open each page once while online to use them offline.

When you change any file, bump `V` in `sw.js` (e.g. `mcp-v2`) so phones pick up the update.

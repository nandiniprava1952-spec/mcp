# MCP Card — Photo Kit (PWA)

1. Create a **public** GitHub repo and upload every file in this folder to its root.
2. Repo **Settings > Pages > Build and deployment**: Source = *Deploy from a branch*, Branch = `main` / `(root)`, Save.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.
4. On the phone, open that link and choose **Add to Home Screen** (iPhone: Share > Add to Home Screen; Android Chrome: menu > Install app).

Reference images load from `raw.githubusercontent.com/nandiniprava1952-spec/mcp/main/` (that repo must stay public). They are cached after first view, so open each page once while online to use them offline.

## How updates reach users
The app checks for a new version when it opens, when the user comes back to it, and every 30 minutes
(logic in `update-kit.js`, which is the same file in all three apps).

1. **Update found** - a card appears at the top with a progress ring and percentage, "Downloading update…".
2. **Update ready** - at 100% it becomes "Update available" with **Update** and **Later**. *Later* hides the card until the next check.
3. **Installing** - *Update* shows a spinning ring, "Installing update…", then the app restarts on its own.
4. **After the restart** - "✔ Updated to the latest version".

**To release an update:** change your files, then bump the version name at the top of `sw.js` (`V`, e.g. `mcp-v17`).
That is the only thing phones look at. `update-kit.js` must stay listed in the file list at the top of `sw.js`.

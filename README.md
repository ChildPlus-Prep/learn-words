# Learn Words

A tap-to-hear picture site for kids. Tap a parrot, hear "Parrot."

- Kids' site: `index.html` (read-only for everyone)
- Admin page: `admin.html` (only people with write access to this repo can save)
- All pictures and sounds live in `media/`, and the list of everything is `data/catalog.json`

## How adding works

The admin page talks to the GitHub API straight from the browser. Each save (picture + sound + updated catalog) becomes one commit in this repo. GitHub Pages then redeploys, and the new item is live in about a minute.

Pictures are resized in the browser to 800px max (WebP, or JPEG as a fallback) before upload. Sounds can be recorded right on the page (up to 5 seconds) or uploaded (up to 2 MB). If an item has no sound, the site says the word using the device's built-in voice.

## Giving someone permission to add

1. Repo → **Settings → Collaborators** → add their GitHub account.
2. They create a token: GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories** → `learn-words`
   - Permissions → Repository permissions → **Contents: Read and write**
3. They open `https://<owner>.github.io/learn-words/admin.html`, paste the token and click **Connect**.

Anyone without write access can open the admin page, but every save will fail.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly as a file won't work, because the page needs to fetch `catalog.json`.)

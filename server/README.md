# Lumen server

Your own video server and website. Upload videos from a browser or the Lumen Android app,
watch them anywhere, and pick up where you left off on any device.

- **Website**: library, "Continue watching", drag-and-drop uploads, player that resumes where you stopped
- **Android app**: Server tab to stream, upload from your phone, shared watch progress
- **Uploads resume** after a dropped connection (sent in 8 MB pieces)
- **Instant seeking** in long videos (HTTP range streaming)
- **Thumbnails and lengths** are made automatically with ffmpeg
- **Password protected**; automatic HTTPS when you have a domain
- No database to manage: videos are plain files in `data/videos`, everything else is in `data/db.json`

## Quick install

On a fresh Ubuntu/Debian VPS, open a root shell (e.g. your provider's web console) and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/gamershoam-web/V1/ccr-bf2e92af-l5c6am/server/get.sh | bash
```

It downloads Lumen to `/opt/lumen`, installs Docker if needed, asks for a domain (Enter for none) and a
password (Enter to generate one), starts everything and prints the address. Run the same line again
later to update; your videos and settings are kept.

## Install on your VPS (step by step)

You need a Linux VPS (Ubuntu or Debian is easiest) and, ideally, a domain name.

1. **(Recommended) Point a domain at the VPS.** At your domain registrar, add an `A` record such as
   `videos.example.com` → your VPS IP address. With a domain you get free, automatic HTTPS.

2. **Copy this `server` folder to the VPS.** Either clone the repository:

   ```bash
   git clone https://github.com/gamershoam-web/V1.git
   cd V1/server
   ```

   or, from your computer: `scp -r server root@YOUR_VPS_IP:~/v1-server`, then `cd ~/v1-server` on the VPS.

3. **Run the installer:**

   ```bash
   sudo ./install.sh
   ```

   It installs Docker if needed, asks for your domain (or none) and a password, and starts everything.
   When it finishes it prints the address to open.

4. **Open the address** in a browser and sign in, e.g. `https://videos.example.com`
   (or `http://YOUR_VPS_IP:8080` without a domain).

5. **In the Android app**: open the **Server** tab → **Connect server** → enter the same address and password.

Ports used: 80 and 443 with a domain, 8080 without. If your VPS provider has a firewall in its
web panel, open those ports there too.

## Everyday use

| What | How |
| --- | --- |
| Upload from a computer | Drag videos onto the website, or press **Upload** |
| Upload from the phone | App → **This phone** → ⋮ on a video → **Upload to server** |
| Bulk copy | `scp` / `rsync` files into `data/videos/` — they appear within a minute |
| Continue watching | Shown at the top of the website and the app's Server tab; works across devices |
| Start a video over | ⋮ → **Start from beginning**, or **Start over** on the resume message |
| Rename / delete / download | ⋮ on a video (website), or the buttons under the player |

## Managing the server

Run these in the `server` folder on the VPS:

```bash
docker compose logs -f          # see what's happening
docker compose restart          # restart
docker compose down             # stop
git pull && docker compose up -d --build   # update to a new version
sudo ./install.sh               # change password or domain
```

**Backups**: copy the `data` folder. It contains your videos (`data/videos`), thumbnails and `db.json`
(titles and watch progress).

**Changing the password** (run `sudo ./install.sh` again) signs out every browser and phone;
sign in again with the new one. Your videos and watch progress are kept.

## Notes

- Browsers play MP4 (H.264/HEVC), WebM and MOV well. Files like MKV or AVI may not play in a browser;
  the website says so on the video page, and they still play in the Android app or can be downloaded.
- Without a domain the connection is plain HTTP, so the password and videos travel unencrypted.
  Use a domain for anything you care about.
- Login attempts are limited to 10 per 15 minutes per IP address.

## Running without Docker

Needs Node.js 20+ (and ffmpeg for thumbnails):

```bash
V1_PASSWORD='choose-a-good-password' PORT=8080 node server.js
```

Settings: `V1_PASSWORD` (required, 8+ characters), `PORT` (default 8080), `DATA_DIR` (default `./data`),
`TRUST_PROXY=1` when behind a reverse proxy such as Caddy or nginx.

## API (used by the website and the app)

All endpoints except `/api/health` and `/api/login` need `Authorization: Bearer <token>` or the session cookie.

| Method | Path | |
| --- | --- | --- |
| POST | `/api/login` | `{password}` → `{token}` |
| POST | `/api/logout` | |
| GET | `/api/videos` | list with `progress` |
| GET/PATCH/DELETE | `/api/videos/:id` | details, rename `{title}`, delete |
| GET | `/api/videos/:id/stream` | video bytes, supports `Range` |
| GET | `/api/videos/:id/thumb` | JPEG thumbnail |
| GET | `/api/videos/:id/download` | file as attachment |
| GET/PUT/DELETE | `/api/videos/:id/progress` | `{position, duration}` in ms |
| POST | `/api/uploads` | `{name, size}` → `{id}` |
| GET | `/api/uploads/:id` | `{offset}` — bytes received so far |
| PUT | `/api/uploads/:id` | chunk body with `Upload-Offset` header |
| POST | `/api/rescan` | pick up files copied into `data/videos` |

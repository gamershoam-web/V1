# Deploying to a VPS with backup

1. Build (`npm run build`) and commit `dist/` so the server needs no Node.js.
2. Ask the user to run the following on the VPS. Sandboxes usually can't SSH, so don't tunnel around that.
   ```bash
   git clone -b <branch> https://github.com/<owner>/<repo>.git /opt/site
   grep -R "root \|DocumentRoot" /etc/nginx/sites-enabled/ /etc/apache2/sites-enabled/ 2>/dev/null
   sudo bash /opt/site/deploy/install-on-server.sh <web_root_from_grep>
   ```
3. `install-on-server.sh` writes a verified tarball and SHA-256 to `/var/backups/website/`, refuses dangerous roots or a repo inside the web root, keeps `.well-known/`, fixes ownership, and reloads nginx or Apache.
4. To update: `cd /opt/site && git pull && sudo bash deploy/install-on-server.sh <web_root>`
5. To restore: `sudo bash deploy/rollback.sh <web_root> [backup.tar.gz]`. With no file it restores `latest.tar.gz`, which is the most recent backup. To get the original site back, pass the **oldest** backup explicitly.
6. Remind the user to change any password they pasted into chat.

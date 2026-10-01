# Portainer

Deploy the base stack as a Portainer **Stack** instead of running
`docker compose` by hand. The free Community Edition is enough. You need a
**Docker Standalone** environment: Swarm stacks have no `env_file` support.

Paste the compose file unchanged. Portainer saves the variables you enter as
`stack.env`, and the backend loads that file.

## Deploy

1. Download [`.env.example`](../.env.example), save it as `.env` on your
   computer and fill the **REQUIRED** section. The
   [setup guide](setup-guide.md#2-quickstart) explains each value.
2. In Portainer open **Stacks → Add stack** and name the stack, e.g.
   `moneymatter`.
3. Pick **Web editor** and paste the contents of
   [`docker-compose.yml`](../docker-compose.yml).
4. Under **Environment variables** click **Load variables from .env file** and
   select the `.env` from step 1.
5. Click **Deploy the stack**. The backend runs database migrations before it
   starts serving, so it shows as unhealthy for the first 30–60 seconds.
6. Open `http://<host>:8080`.

## Differences from the CLI setup

- **The stack name is the compose project name.** Portainer ignores the
  `name: budget-tracker-prod` line in the compose file and names the volumes
  `<stack name>_db_data`, `<stack name>_attachments_data`, and so on. If you
  are moving an existing CLI install into Portainer, name the stack
  `budget-tracker-prod`. With any other name you start with empty volumes.
- **`ATTACHMENTS_PATH`**: leave it unset to use the Docker volume, or set an
  absolute host path. Portainer resolves a `./relative` path inside its own
  data directory.
- **Changing a setting**: edit the variable on the stack's **Editor** tab and
  click **Update the stack**.
- **Reverse proxy**: put your own proxy in front, following
  [reverse-proxies.md](reverse-proxies.md). The bundled Traefik overlay and the
  build-from-source overlay are extra compose files for the CLI.

## Updating

Open the stack, go to the **Editor** tab, click **Update the stack** and
enable **Re-pull image and redeploy**. Take a backup first.

## Backups

The `docker compose exec` commands in the
[setup guide](setup-guide.md#5-backups) need the compose file on disk. With
Portainer, address the containers and volumes by name. Replace `moneymatter`
with your stack name:

```bash
# Database dump
docker exec moneymatter-db-1 \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "backup-$(date +%F).sql.gz"
```

```bash
# Attachments
docker run --rm -v moneymatter_attachments_data:/data:ro -v "$PWD":/backup \
  alpine tar czf "/backup/attachments-$(date +%F).tar.gz" -C /data .
```

```bash
# Restore
gunzip -c backup-2026-05-01.sql.gz | \
  docker exec -i moneymatter-db-1 \
  sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

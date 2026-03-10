# Deploying Knots with Docker

## How a release produces a new image

1. **Push to `main`** with a conventional commit: `feat: ...` or `fix: ...` (see [CONTRIBUTING.md](CONTRIBUTING.md#releases)).
2. The **Release** workflow runs: [semantic-release](https://github.com/semantic-release/semantic-release) bumps the version, updates `package.json` and `CHANGELOG.md`, creates a git tag (e.g. `v1.20.7`), and pushes.
3. The Release workflow then **triggers the CD workflow** with that tag.
4. The **CD** workflow builds the Docker image for that tag and pushes to **GitHub Container Registry**:
   - `ghcr.io/<owner>/knots:<version>` (e.g. `ghcr.io/rjdmacedo/knots:1.20.7`)
   - `ghcr.io/<owner>/knots:latest`

So every successful release results in a new image under both the version tag and `:latest`.

## Running on a VM using the pre-built image (GHCR)

Use the image from GHCR instead of building locally:

1. **One-time setup**

   - Copy `container.env.example` to `container.env` and set your values (e.g. `POSTGRES_PASSWORD`, DB URLs).
   - If the image is **private**, log in to GHCR (replace `YOUR_GITHUB_TOKEN` with a PAT with `read:packages`):
     ```bash
     echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
     ```

2. **Start (first time or after config change)**

   ```bash
   docker compose -f compose.ghcr.yaml --env-file container.env up -d
   ```

3. **Update the app when a new release is out**
   ```bash
   docker compose -f compose.ghcr.yaml --env-file container.env pull app
   docker compose -f compose.ghcr.yaml --env-file container.env up -d app
   ```
   This pulls the new `latest` (or the version you use) and recreates the app container. The entrypoint runs `prisma migrate deploy` on startup, so migrations are applied automatically.

### Optional: pin to a specific version

Edit `compose.ghcr.yaml` and set the image tag to a version instead of `latest`, e.g.:

```yaml
image: ghcr.io/rjdmacedo/knots:1.20.7
```

Then run `pull` and `up -d` when you want to move to a newer version.

### Optional: auto-update with Watchtower

To have the container update automatically when a new image is pushed:

```bash
docker run -d \
  --name watchtower \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 3600
```

Adjust `--interval` (seconds) as needed. Watchtower will pull the new image and recreate the Knots app container when it changes.

## Why the container wasn’t updating

- **Using `compose.yaml` with `build: .`** – Compose builds from source and tags the image as `knots:latest` locally. It never pulls from GHCR, so new releases don’t appear.
- **Not pulling / not recreating** – After a new image is pushed to GHCR, you must `docker compose pull` (or `docker pull`) and then `docker compose up -d` (or recreate the container) so the VM uses the new image.

Use **`compose.ghcr.yaml`** and the **pull + up -d** flow above so that each release results in an updated container when you run the update commands on the VM.

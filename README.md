# infra

Servers for Candylario in HCL for [OpenTofu](https://opentofu.org) (Terraform works too), at any cloud or on hardware you already have.

- `modules/host`: the provider-neutral bootstrap that every server runs.
- `existing`: runs the bootstrap over SSH on any server you have.
- `hetzner`: one Hetzner Cloud server that runs the bootstrap at first boot, with daily backups and cloud firewalls that let in SSH from `admin_cidrs` and HTTP(S) from anyone.

Another cloud gets its own small setup next to these. It only creates the machine and runs the same bootstrap at first boot.

Every server ends up the same:

- **Access:** a `deploy` user with your SSH keys. SSH takes keys only; root cannot log in.
- **Firewall:** SSH comes in only from `admin_cidrs`, and fail2ban watches it. Ports a service publishes, such as the app's HTTPS, are open to all.
- **Upkeep:** security updates install themselves, and the server gets swap.
- **Runtime:** Docker with Compose and log rotation.

## Use

```sh
cd existing
tofu init
tofu apply -var host=SERVER_IP -var 'ssh_public_keys=["ssh-ed25519 AAAA... you"]' -var 'admin_cidrs=["YOUR.IP/32"]'
```

The first run logs in as the provider's user, often root; from the second run on, add `-var user=deploy`.

At Hetzner, with an API token as `HCLOUD_TOKEN` in the settings file (see Settings):

```sh
cd hetzner
export HCLOUD_TOKEN=$(sed -n 's/^HCLOUD_TOKEN=//p' ../../.env)
tofu init
tofu apply -var 'ssh_public_keys=["ssh-ed25519 AAAA... you"]' -var 'admin_cidrs=["YOUR.IP/32"]'
tofu output -raw ip
```

The server is a cax11 (Arm, 2 vCPU, 4 GB) in Falkenstein, since Binance refuses US addresses; `-var location=hel1` and `-var server_type=...` change that. When your IP changes, apply again with the new one: only the cloud firewall changes, never the server.

Then allow the server's IP on the exchange API key and deploy services over SSH. For the engine, that is `./deploy.sh deploy@SERVER_IP` in [candylario/trader](https://github.com/candylario/trader); the notifier and the app deploy the same way.

State stays local and out of git. It holds no secrets: keys and settings reach the server through each service's deploy, never through here.

`tofu -chdir=modules/host test` checks the bootstrap.

## Settings

Every setting lives in one file, `../.env`, next to the repos: shared keys first, then `[trader]`, `[notifier]` and `[app]` sections for each service's own values, such as its database password. `[user]` holds your own keys as a platform user: they go into the app, never to a server. `./env.sh SERVICE` prints one service's part, only the keys its `.env.example` lists, and that service's `deploy.sh` ships it.

## Backups

Every night `backup/backup.sh` on the server copies the three databases and the engine's `data/` to S3-style object storage (Hetzner Object Storage), encrypted with [age](https://age-encryption.org) to `BACKUP_AGE_RECIPIENT`. The secret half, `BACKUP_AGE_IDENTITY`, stays in the central file and never reaches the server. Thirty days are kept, and a failed night emails the admin.

```sh
./backup/install.sh deploy@SERVER --now               # install, and back up once
./backup/restore.sh deploy@SERVER                     # the days stored
./backup/restore.sh deploy@SERVER DAY trader          # prove a backup in a scratch database
./backup/restore.sh deploy@SERVER DAY trader --live   # replace the live database, and the engine's data/
```

The `[backup]` section of the central file holds `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` and the age key pair.

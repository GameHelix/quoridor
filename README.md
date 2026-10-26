# infra

Servers for Candylario in HCL for [OpenTofu](https://opentofu.org) (Terraform works too), at any cloud or on hardware you already have.

- `modules/host`: the provider-neutral bootstrap that every server runs.
- `existing`: runs the bootstrap over SSH on any server you have.
- `hetzner`: one Hetzner Cloud server that runs the bootstrap at first boot, with daily backups and a cloud firewall for SSH only.

Another cloud gets its own small setup next to these. It only creates the machine and runs the same bootstrap at first boot.

Every server ends up the same:

- **Access:** a `deploy` user with your SSH keys. SSH takes keys only; root cannot log in.
- **Firewall:** only SSH comes in, and only from `admin_cidrs`. fail2ban watches it.
- **Upkeep:** security updates install themselves, and the server gets swap.
- **Runtime:** Docker with Compose and log rotation.

## Use

```sh
cd existing
tofu init
tofu apply -var host=SERVER_IP -var 'ssh_public_keys=["ssh-ed25519 AAAA... you"]' -var 'admin_cidrs=["YOUR.IP/32"]'
```

The first run logs in as the provider's user, often root; from the second run on, add `-var user=deploy`.

At Hetzner, with an API token in a gitignored `secret.auto.tfvars` (or in `HCLOUD_TOKEN`):

```sh
cd hetzner
echo 'hcloud_token = "..."' > secret.auto.tfvars
tofu init
tofu apply -var 'ssh_public_keys=["ssh-ed25519 AAAA... you"]' -var 'admin_cidrs=["YOUR.IP/32"]'
tofu output -raw ip
```

The server is a cx22 in Falkenstein, since Binance refuses US addresses; `-var location=nbg1` and `-var server_type=...` change that.

Then allow the server's IP on the exchange API key and deploy services over SSH. For the engine, that is `./deploy.sh deploy@SERVER_IP` in [candylario/trader](https://github.com/candylario/trader); the notifier and the app deploy the same way.

State stays local and out of git. It holds no secrets: keys and `.env` reach the server through each service's deploy, never through here.

`tofu -chdir=modules/host test` checks the bootstrap.

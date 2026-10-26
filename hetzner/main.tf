# One Candylario server at Hetzner Cloud: a server that runs the bootstrap at
# first boot, kept by daily backups, behind a cloud firewall that lets in
# only SSH from the admin networks. Services deploy onto it over SSH.

terraform {
  required_version = ">= 1.6"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.50"
    }
  }
}

variable "hcloud_token" {
  description = "A Hetzner Cloud API token with write access; HCLOUD_TOKEN in the environment also works."
  type        = string
  sensitive   = true
  default     = ""
}

variable "name" {
  description = "The server's name at Hetzner."
  type        = string
  default     = "candylario"
}

variable "location" {
  description = "A Hetzner location outside the US, which Binance refuses."
  type        = string
  default     = "fsn1"
  validation {
    condition     = !contains(["ash", "hil"], var.location)
    error_message = "Binance refuses US addresses; pick fsn1, nbg1, hel1 or sin."
  }
}

variable "server_type" {
  description = "The server type."
  type        = string
  default     = "cx22"
}

variable "ssh_public_keys" {
  type = list(string)
}

variable "admin_cidrs" {
  description = "Networks allowed to reach SSH."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

provider "hcloud" {
  token = var.hcloud_token != "" ? var.hcloud_token : null
}

# The server's own firewall lets SSH in from anywhere and the cloud firewall
# narrows it to admin_cidrs, so a new admin IP is one apply away and can never
# lock you out.
module "host" {
  source          = "../modules/host"
  ssh_public_keys = var.ssh_public_keys
}

resource "hcloud_ssh_key" "admin" {
  count      = length(var.ssh_public_keys)
  name       = "${var.name}-${count.index}"
  public_key = var.ssh_public_keys[count.index]
}

resource "hcloud_firewall" "ssh_only" {
  name = "${var.name}-ssh-only"
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.admin_cidrs
  }
}

resource "hcloud_server" "host" {
  name         = var.name
  server_type  = var.server_type
  location     = var.location
  image        = "ubuntu-24.04"
  ssh_keys     = hcloud_ssh_key.admin[*].id
  user_data    = module.host.user_data
  backups      = true
  firewall_ids = [hcloud_firewall.ssh_only.id]
  labels       = { project = "candylario" }

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  # The bootstrap and the keys count only at first boot; changing them later
  # must not replace the server and the data on it.
  lifecycle {
    ignore_changes = [user_data, ssh_keys]
  }
}

output "ip" {
  value = hcloud_server.host.ipv4_address
}

output "ssh" {
  value = "ssh deploy@${hcloud_server.host.ipv4_address}"
}

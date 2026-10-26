# One Candylario server at DigitalOcean: a Droplet that runs the bootstrap at
# first boot, kept by daily backups, behind a cloud firewall that lets in
# only SSH from the admin networks. Services deploy onto it over SSH.

terraform {
  required_version = ">= 1.6"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
  }
}

variable "do_token" {
  description = "A DigitalOcean API token with write access."
  type        = string
  sensitive   = true
}

variable "name" {
  description = "The server's name at DigitalOcean."
  type        = string
  default     = "candylario"
}

variable "region" {
  description = "A DigitalOcean region outside the US, which Binance refuses."
  type        = string
  default     = "fra1"
  validation {
    condition     = !startswith(var.region, "nyc") && !startswith(var.region, "sfo")
    error_message = "Binance refuses US addresses; pick fra1, ams3, lon1, sgp1, blr1 or syd1."
  }
}

variable "size" {
  description = "The Droplet size."
  type        = string
  default     = "s-1vcpu-2gb"
}

variable "ssh_public_keys" {
  type = list(string)
}

variable "admin_cidrs" {
  description = "Networks allowed to reach SSH."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

provider "digitalocean" {
  token = var.do_token
}

module "host" {
  source          = "../modules/host"
  ssh_public_keys = var.ssh_public_keys
  admin_cidrs     = var.admin_cidrs
}

resource "digitalocean_ssh_key" "admin" {
  count      = length(var.ssh_public_keys)
  name       = "${var.name}-${count.index}"
  public_key = var.ssh_public_keys[count.index]
}

resource "digitalocean_droplet" "host" {
  name       = var.name
  region     = var.region
  size       = var.size
  image      = "ubuntu-24-04-x64"
  ssh_keys   = digitalocean_ssh_key.admin[*].fingerprint
  user_data  = module.host.user_data
  monitoring = true
  backups    = true
  backup_policy {
    plan = "daily"
    hour = 4
  }
  tags = ["candylario"]
}

resource "digitalocean_firewall" "ssh_only" {
  name        = "${var.name}-ssh-only"
  droplet_ids = [digitalocean_droplet.host.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.admin_cidrs
  }
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

output "ip" {
  value = digitalocean_droplet.host.ipv4_address
}

output "ssh" {
  value = "ssh deploy@${digitalocean_droplet.host.ipv4_address}"
}

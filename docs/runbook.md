# Raspberry Pi Command Reference

Quick reference for managing Rokabot on the Raspberry Pi 5.

---

## SSH Access

```bash
# Via Ethernet (static IP, always works)
ssh adam@192.168.50.1

# Via WiFi (if both devices on same network — may not work on phone hotspots due to AP isolation)
ssh adam@<wifi-ip>
```

---

## Bot Management

```bash
# View live logs
sudo docker compose -f ~/rokabot/docker-compose.yml logs -f

# View last N lines of logs
sudo docker compose -f ~/rokabot/docker-compose.yml logs --tail 50

# Restart the bot
sudo docker compose -f ~/rokabot/docker-compose.yml restart

# Stop the bot
sudo docker compose -f ~/rokabot/docker-compose.yml down

# Start the bot (if stopped)
sudo docker compose -f ~/rokabot/docker-compose.yml up -d

# Deploy latest changes from GitHub
cd ~/rokabot && git pull && sudo docker compose up -d --build

# Check container status
sudo docker compose -f ~/rokabot/docker-compose.yml ps

# Check memory/CPU usage
sudo docker stats --no-stream
```

---

## Network

```bash
# Check all network interfaces
ip addr

# Check WiFi connection status
sudo wpa_cli -i wlan0 status

# Check DHCP leases (devices connected via Ethernet)
cat /var/lib/misc/dnsmasq.leases

# Restart networking (will drop SSH — reconnect after)
sudo netplan apply

# Scan for WiFi networks
sudo wpa_cli -i wlan0 scan && sleep 3 && sudo wpa_cli -i wlan0 scan_results

# Edit WiFi config (netplan)
sudo nano /etc/netplan/50-cloud-init.yaml
# After editing: sudo netplan apply
```

---

## System

```bash
# System info
uname -a
cat /etc/os-release

# Disk usage
df -h

# Memory usage
free -h

# CPU temperature
cat /sys/class/thermal/thermal_zone0/temp
# Divide by 1000 for Celsius (e.g., 45000 = 45.0C)

# Running processes (sorted by memory)
ps aux --sort=-%mem | head -15

# Reboot
sudo reboot

# Shutdown
sudo shutdown now

# Check uptime
uptime
```

---

## Docker

```bash
# List all containers (including stopped)
sudo docker ps -a

# List images
sudo docker images

# Remove unused images (free disk space)
sudo docker image prune -f

# Full cleanup (containers, images, networks, cache)
sudo docker system prune -af

# Rebuild from scratch (no cache)
cd ~/rokabot && sudo docker compose build --no-cache && sudo docker compose up -d
```

---

## Services

```bash
# Check Docker service
sudo systemctl status docker --no-pager

# Check DHCP server (dnsmasq)
sudo systemctl status dnsmasq --no-pager

# Restart DHCP server
sudo systemctl restart dnsmasq

# Check all enabled services
systemctl list-unit-files --state=enabled
```

---

## Logs & Troubleshooting

```bash
# System logs (last 50 lines)
sudo journalctl -n 50 --no-pager

# Docker daemon logs
sudo journalctl -u docker -n 30 --no-pager

# Kernel messages (hardware/driver issues)
sudo dmesg | tail -30

# Check if bot container is restarting
sudo docker compose -f ~/rokabot/docker-compose.yml ps
# STATUS should be "Up", not "Restarting"

# Enter the running container for debugging
sudo docker exec -it rokabot-roka-1 sh
```

---

## GitHub Actions Self-Hosted Runner

The Pi runs a self-hosted GitHub Actions runner that auto-deploys on push to `main`. The workflow (`.github/workflows/deploy.yml`) pulls latest code, rebuilds Docker, and runs a health check.

### Setting Up the Runner on a New Device

1. Go to https://github.com/AlaskanTuna/rokabot/settings/actions/runners/new
2. Copy the registration **token** (expires in 1 hour)
3. On the Pi:

```bash
# Download runner (ARM64)
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -sL https://github.com/actions/runner/releases/latest/download/actions-runner-linux-arm64-2.333.0.tar.gz | tar xz

# Register (paste your token)
./config.sh --url https://github.com/AlaskanTuna/rokabot --token <YOUR_TOKEN> --name rokabot-pi --labels self-hosted,linux,arm64 --unattended

# Install and start as systemd service
sudo ./svc.sh install $USER
sudo ./svc.sh start
```

4. Verify: push to `main` and check https://github.com/AlaskanTuna/rokabot/actions

### Managing the Runner

```bash
# Check status
sudo systemctl status actions.runner.AlaskanTuna-rokabot.rokabot-pi --no-pager

# View logs
sudo journalctl -u actions.runner.AlaskanTuna-rokabot.rokabot-pi -n 30 --no-pager

# Restart
sudo systemctl restart actions.runner.AlaskanTuna-rokabot.rokabot-pi

# Uninstall (if moving to a different device)
cd ~/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall
./config.sh remove --token <NEW_TOKEN>
```

### How It Works

- The runner polls GitHub outbound (works through any NAT/WiFi)
- On push to `main`, GitHub assigns the deploy job to the runner
- Runner executes: `git pull` → `docker compose up -d --build` → health check
- Results visible at https://github.com/AlaskanTuna/rokabot/actions
- If the build fails, the old container keeps running (no automatic rollback)

---

## SQLite Database

DB location: `~/rokabot/data/rokabot.db`

### User Memory

```bash
# All user facts
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM user_memory ORDER BY updated_at DESC;'

# Facts for a specific user ID
sqlite3 ~/rokabot/data/rokabot.db "SELECT * FROM user_memory WHERE user_id='USER_ID';"

# Count facts per user
sqlite3 ~/rokabot/data/rokabot.db 'SELECT user_id, COUNT(*) as facts FROM user_memory GROUP BY user_id;'

# Delete a specific fact
sqlite3 ~/rokabot/data/rokabot.db "DELETE FROM user_memory WHERE user_id='USER_ID' AND fact_key='KEY';"

# Delete all facts for a user
sqlite3 ~/rokabot/data/rokabot.db "DELETE FROM user_memory WHERE user_id='USER_ID';"
```

### Reminders

```bash
# Pending reminders (with local time)
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, user_id, reminder, datetime(due_at/1000, 'unixepoch', '+8 hours') as due_local FROM reminders WHERE delivered=0;"

# All reminders (last 20)
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM reminders ORDER BY created_at DESC LIMIT 20;'

# Delete a reminder
sqlite3 ~/rokabot/data/rokabot.db 'DELETE FROM reminders WHERE id=ID;'
```

### Session History

```bash
# Recent messages (last 20)
sqlite3 ~/rokabot/data/rokabot.db "SELECT channel_id, display_name, role, substr(content, 1, 80) as preview FROM session_history ORDER BY timestamp DESC LIMIT 20;"

# Messages from a specific channel
sqlite3 ~/rokabot/data/rokabot.db "SELECT display_name, role, content FROM session_history WHERE channel_id='CHANNEL_ID' ORDER BY timestamp DESC LIMIT 10;"

# Message count per channel
sqlite3 ~/rokabot/data/rokabot.db 'SELECT channel_id, COUNT(*) as msgs FROM session_history GROUP BY channel_id ORDER BY msgs DESC;'

# Clear history for a channel
sqlite3 ~/rokabot/data/rokabot.db "DELETE FROM session_history WHERE channel_id='CHANNEL_ID';"
```

### Buddy Pets

```bash
# All buddies
sqlite3 ~/rokabot/data/rokabot.db 'SELECT id, user_id, species, rarity, name, shiny FROM buddy ORDER BY hatched_at DESC;'

# Buddies for a specific user
sqlite3 ~/rokabot/data/rokabot.db "SELECT id, species, rarity, name, shiny, stats_json FROM buddy WHERE user_id='USER_ID';"

# Collection count per user
sqlite3 ~/rokabot/data/rokabot.db 'SELECT user_id, COUNT(*) as pets FROM buddy GROUP BY user_id ORDER BY pets DESC;'

# Daily hatch status and streaks
sqlite3 ~/rokabot/data/rokabot.db 'SELECT * FROM gacha_daily;'
```

### Game Scores

```bash
# Recent scores (with local time)
sqlite3 ~/rokabot/data/rokabot.db "SELECT user_id, game, score, datetime(played_at/1000, 'unixepoch', '+8 hours') as played FROM game_scores ORDER BY played_at DESC LIMIT 20;"

# Leaderboard by game
sqlite3 ~/rokabot/data/rokabot.db "SELECT user_id, SUM(score) as total, COUNT(*) as games FROM game_scores WHERE game='hangman' GROUP BY user_id ORDER BY total DESC;"
```

### Database Overview

```bash
# List all tables
sqlite3 ~/rokabot/data/rokabot.db '.tables'

# DB file size
ls -lh ~/rokabot/data/rokabot.db

# Schema for a table
sqlite3 ~/rokabot/data/rokabot.db '.schema user_memory'
```

### Dangerous Operations

```bash
# Truncate a single table (keep schema)
sqlite3 ~/rokabot/data/rokabot.db 'DELETE FROM user_memory;'

# Full DB wipe (stop bot first, it recreates on restart)
cd ~/rokabot && docker compose stop
rm -f data/rokabot.db data/rokabot.db-wal data/rokabot.db-shm
docker compose up -d
```

> **Note:** `+8 hours` in datetime queries is for Asia/Singapore (UTC+8). Adjust for your timezone.

---

## Network Config Files

| File                              | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `/etc/netplan/50-cloud-init.yaml` | Network config (eth0 static IP, WiFi)      |
| `/etc/dnsmasq.d/rokabot.conf`     | DHCP server config for Ethernet + AP       |
| `~/rokabot/.env`                  | Bot secrets (Discord token, API keys)      |
| `~/rokabot/config.yml`            | Bot tunables (model, timeout, rate limits) |
| `~/rokabot/data/rokabot.db`       | SQLite database (sessions, memory, games)  |

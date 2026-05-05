---
name: infrastructure-management
description: |
  Manage physical server infrastructure, bare metal systems, and OOB management.
  Handles iDRAC/iLO/IPMI access, SSH connectivity checks, boot time estimation,
  and hardware health monitoring. Triggers on "infrastructure", "bare metal",
  "server management", "idrac", "hardware check".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task
---

# Infrastructure Management Skill

## Overview

Manages physical and SBC infrastructure with awareness of hardware boot times,
access hierarchies, and out-of-band management capabilities.

## Access Strategy — Try in Order

1. **SSH key-based** — Primary access method
2. **SSH password** — Fallback if key fails
3. **Tailscale/VPN** — If direct SSH unreachable
4. **OOB management** (iDRAC/iLO/IPMI) — For power cycling, console when SSH down
5. **Serial console** — Last remote option
6. **Physical access** — Keyboard/monitor as final resort

Always maintain at least two working access methods per host.

## Phase 1: Connectivity Audit

For each managed host, check access:

```bash
# SSH connectivity check (2s timeout)
ssh -o ConnectTimeout=2 -o BatchMode=yes USER@HOST "echo ok" 2>&1

# Check SSH via password (if key fails)
# NOTE: sshpass usage requires explicit user approval

# Check if OOB/iDRAC is reachable
curl -sk --connect-timeout 5 https://IDRAC_IP/data?get=pwState 2>&1 || echo "iDRAC unreachable"

# IPMI ping check
ipmitool -I lanplus -H IPMI_IP -U root -P PASSWORD power status 2>&1
```

Report format:

```
Host: hostname (IP)
  SSH Key:     OK | FAIL (reason)
  SSH Pass:    OK | FAIL | NOT_TESTED
  OOB:         OK (iDRAC6/iLO4/IPMI) | UNREACHABLE
  Boot Time:   ~30s (SBC) | ~3min (desktop) | ~10min (enterprise)
  Status:      HEALTHY | DEGRADED | UNREACHABLE
```

## Phase 2: Hardware Health

Query available health data from each host:

```bash
# Temperature (via SSH)
ssh HOST "cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null || sensors 2>/dev/null"

# Disk health
ssh HOST "df -h && smartctl -a /dev/sda 2>/dev/null | grep -E 'Health|Temperature|Reallocated'"

# Memory
ssh HOST "free -h"

# Uptime and load
ssh HOST "uptime"

# Docker status (if applicable)
ssh HOST "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null"
```

For iDRAC-equipped servers:

```bash
# Sensor readings via REST API
curl -sk --cookie "session_cookie" "https://IDRAC_IP/data?get=tempprobes"
curl -sk --cookie "session_cookie" "https://IDRAC_IP/data?get=fanstatus"

# System Event Log
ssh IDRAC_IP "racadm getsel" 2>/dev/null
```

## Phase 3: Recovery Actions

When a host is unreachable:

1. **Wait for boot** — Enterprise servers with lots of RAM take 10-15 minutes
2. **Try OOB power cycle** — `ipmitool power cycle` or iDRAC web/API
3. **Check network** — ping gateway, check switch port
4. **Serial console** — If available via OOB
5. **Physical intervention** — Document what's needed, create issue

### Boot Time Reference

| Hardware Type              | Expected Boot Time |
| -------------------------- | ------------------ |
| Raspberry Pi / SBC         | 30-60 seconds      |
| Desktop / small server     | 1-3 minutes        |
| 1U/2U rack server (≤64GB)  | 3-5 minutes        |
| Enterprise server (128GB+) | 8-15 minutes       |
| High-memory (512GB+)       | 12-20 minutes      |

**Do NOT declare a server failed** until at least 2x the expected boot time has passed.

## Phase 4: Preventive Checks

For SBC hosts (Raspberry Pi):

- Check SD card health: `sudo dmesg | grep -i "mmc\|error\|read-only"`
- Verify USB boot if applicable
- Check power supply voltage: `vcgencmd measure_volts`
- Monitor temperature: `vcgencmd measure_temp`

For enterprise servers:

- Review System Event Log for predictive failures
- Check RAID status: `ssh HOST "cat /proc/mdstat 2>/dev/null || megacli -LDInfo -Lall -aALL 2>/dev/null"`
- Verify firmware versions against known-good baselines

## Output Format

Produce a summary with:

```
## Infrastructure Status Report

### Hosts Summary
| Host | IP | SSH | OOB | Health | Boot Est. |
|------|-----|-----|-----|--------|-----------|
| ...  | ... | ... | ... | ...    | ...       |

### Findings
- [CRITICAL] Host X unreachable via all methods
- [WARNING] Host Y disk SMART warning
- [INFO] Host Z uptime 45 days, consider updates

### Recommended Actions
1. ...
2. ...
```

## Phase 5: BOSH/CF Deployment Verification

For BOSH-managed infrastructure:

```bash
# Verify director health
source ~/deployments/bosh/env.sh
bosh env                            # Director reachable?

# Check all VMs running
bosh vms                            # All instances "running"?

# Check director processes
ssh -i <key> jumpbox@DIRECTOR_IP "sudo monit summary"
# Expected: nats, postgres, blobstore_nginx, director, workers, health_monitor, lxd_cpi

# Verify CredHub on director
curl -sk https://DIRECTOR_IP:8844/info    # Should return JSON with app name "CredHub"
credhub find                               # Should list credentials

# BBR readiness
bbr director --host DIRECTOR_IP --username bbr --private-key-path bbr.pem pre-backup-check
```

### Post-Deployment Checklist

After any `bosh create-env` or `bosh deploy`:

1. **Process check**: `monit summary` on affected VMs — all processes "running"
2. **Connectivity check**: curl service endpoints (CredHub :8844, UAA :8443)
3. **VM count**: `bosh vms` matches expected count
4. **Dependent services**: Verify services that depend on the updated component
5. **Smoke tests**: `bosh run-errand smoke-tests` if available
6. **Backup readiness**: `bbr pre-backup-check` still passes

### Common Ops File Dependencies

| Ops File              | Depends On | Provides                    |
| --------------------- | ---------- | --------------------------- |
| `credhub.yml`         | `uaa.yml`  | CredHub on director (:8844) |
| `uaa.yml`             | (base)     | UAA on director (:8443)     |
| `bbr.yml`             | (base)     | backup-and-restore-sdk      |
| CPI ops (e.g., Incus) | (base)     | VM lifecycle management     |

CRITICAL: Missing `uaa.yml` when `credhub.yml` is included causes CredHub to silently not start. Always check `monit summary` after ops file changes.

## Phase 6: Documentation-Reality Drift Check

Verify documentation against live system:

```bash
# VM count
bosh vms 2>/dev/null | grep -c running    # Compare against README

# Service inventory
systemctl list-units --state=running --type=service | grep -E "podman|grafana|loki"

# Tool availability (verify before referencing in docs)
which terraform terragrunt make 2>/dev/null

# Network topology
ip -br addr show | grep -E "bond|vlan"

# Storage
zpool list; df -h /srv/nfs
```

Flag any discrepancies between docs and live output. Live system is always authoritative.

## Important Notes

- Never store credentials in skill output or issues — reference vault/config
- Always prefer non-destructive actions (check before restart)
- Power cycle is a last resort — data loss risk on unclean shutdown
- Create GitHub issues for persistent problems requiring physical access
- SBC SD cards wear out — check for read-only filesystem warnings
- When fixing one system, verify adjacent systems (discovery pattern)
- Missing ops file dependencies cause **silent failures** — always verify all processes after deploy

## Anti-rationalization — Infrastructure

| Excuse                         | Counter                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| "Skip the OOB check, just SSH" | OOB is the source of truth — SSH state can disagree with hardware reality (BMC firmware, fan curves, thermal). Verify both.           |
| "It's just the homelab"        | Per the UFW + Podman incident (March 2026) — homelab outages cost real time and cascade across services. Apply production discipline. |
| "I'll restart and see"         | Restart-and-see destroys the diagnostic window. Capture state first (logs, dmesg, OOB sensor data), then restart if the issue allows. |

## Red flags

- Hardware changes pushed without OOB verification
- Firewall rule added without testing FORWARD chain (per memory note on UFW + Podman)
- iDRAC/iLO/IPMI credentials in plaintext or non-rotated
- Boot-time estimate skipped (long-boot R910 surprises if forgotten)

## Verification checklist

- [ ] OOB shows healthy hardware (fan/thermal/PSU)
- [ ] SSH connectivity verified via the canonical path (jump host if applicable)
- [ ] `dmesg` and journal captured before any restart
- [ ] Boot-time estimate documented if hardware change requires a reboot
- [ ] Post-change: services back up and monitored for the appropriate burn-in window

#!/usr/bin/env node
"use strict";

/**
 * pm-workflow auto-update check — runs as a Claude Code SessionStart hook.
 *
 * Behavior:
 *  - Throttled to once / 24h (timestamp file), so it adds ~no latency to most sessions.
 *  - Fail-silent: any error is swallowed so it can NEVER block session start.
 *  - Real-dir install (consumer): if a newer version is published, reinstalls via npx.
 *  - Symlink install (maintainer/dev): notify only — never touches your working repo.
 *  - Plugin install (marketplace): not handled here. Claude Code updates plugins itself
 *    via `/plugin marketplace update`, so this checker governs ONLY the npx / skills-dir
 *    install under ~/.claude/skills/pm-workflow and no-ops when that directory is absent.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const REPO = "AlaskanTuna/pm-workflow";
const RAW_PKG = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
const SKILL_DIR = path.join(os.homedir(), ".claude", "skills", "pm-workflow");
const STAMP = path.join(SKILL_DIR, ".last-update-check");
const THROTTLE_MS = 24 * 60 * 60 * 1000;

function note(msg) {
  process.stdout.write(`[pm-workflow] ${msg}\n`);
}

function isSymlink() {
  try {
    return fs.lstatSync(SKILL_DIR).isSymbolicLink();
  } catch {
    return false;
  }
}

function localVersion() {
  try {
    return fs.readFileSync(path.join(SKILL_DIR, ".version"), "utf8").trim();
  } catch {}
  try {
    const real = fs.realpathSync(SKILL_DIR); // .../repo/pm-workflow
    const pkg = path.join(real, "..", "package.json"); // .../repo/package.json
    return JSON.parse(fs.readFileSync(pkg, "utf8")).version;
  } catch {}
  return null;
}

function fetchRemoteVersion() {
  return new Promise((resolve) => {
    const req = https.get(RAW_PKG, { timeout: 4000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body).version);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function newer(remote, local) {
  const a = String(remote).split(".").map(Number);
  const b = String(local).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function throttled() {
  try {
    return (
      Date.now() - Number(fs.readFileSync(STAMP, "utf8").trim()) < THROTTLE_MS
    );
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(SKILL_DIR)) return; // not installed → nothing to do
  if (throttled()) return;
  try {
    fs.writeFileSync(STAMP, String(Date.now()));
  } catch {}

  const local = localVersion();
  const remote = await fetchRemoteVersion();
  if (!local || !remote || !newer(remote, local)) return;

  if (isSymlink()) {
    note(
      `v${remote} available (you're on v${local}). Symlink/dev install — pull it in your repo manually.`,
    );
    return;
  }
  try {
    // shell:true on Windows — npx is npx.cmd there, which execFile can't spawn directly.
    execFileSync("npx", ["-y", `github:${REPO}#main`, "-g", "-y"], {
      timeout: 60000,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    note(`auto-updated v${local} → v${remote}.`);
  } catch {
    note(
      `v${remote} available (you're on v${local}). Update: npx github:${REPO}#main`,
    );
  }
}

main().catch(() => {});

import { spawn } from "node:child_process";
import type { GitStatus } from "./types.js";

interface CachedGitStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  timestamp: number;
}

const CACHE_TTL_MS = 1000; // 1 second
let cachedStatus: CachedGitStatus | null = null;
let pendingFetch: Promise<void> | null = null;
let invalidationCounter = 0; // Track invalidations to prevent stale updates

/**
 * Parse git status --porcelain output
 * 
 * Format: XY filename
 * X = index status, Y = working tree status
 * ?? = untracked
 * Other X values = staged
 * Other Y values = unstaged
 */
function parseGitStatusOutput(output: string): { staged: number; unstaged: number; untracked: number } {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of output.split("\n")) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];

    if (x === "?" && y === "?") {
      untracked++;
      continue;
    }

    // X position (index/staged)
    if (x && x !== " " && x !== "?") {
      staged++;
    }

    // Y position (working tree/unstaged)
    if (y && y !== " ") {
      unstaged++;
    }
  }

  return { staged, unstaged, untracked };
}

/**
 * Fetch git status asynchronously
 */
async function fetchGitStatus(): Promise<{ staged: number; unstaged: number; untracked: number } | null> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["status", "--porcelain"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let resolved = false;

    const finish = (result: { staged: number; unstaged: number; untracked: number } | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      finish(parseGitStatusOutput(stdout));
    });

    proc.on("error", () => {
      finish(null);
    });

    // Timeout after 500ms
    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(null);
    }, 500);
  });
}

/**
 * Get git status with caching.
 * Returns cached value if within TTL, otherwise triggers async fetch.
 * This is designed for synchronous render() calls - returns last known value
 * while refreshing in background.
 * 
 * Note: branch is passed in from the footer data provider and NOT cached,
 * since the provider handles branch change detection separately.
 */
export function getGitStatus(branch: string | null): GitStatus {
  const now = Date.now();

  // Return cached if fresh (branch is always current, not from cache)
  if (cachedStatus && now - cachedStatus.timestamp < CACHE_TTL_MS) {
    return { 
      branch, 
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
    };
  }

  // Trigger background fetch if not already pending
  if (!pendingFetch) {
    const fetchId = invalidationCounter; // Capture current counter
    pendingFetch = fetchGitStatus().then((result) => {
      // Only update cache if no invalidation happened since fetch started
      if (result && fetchId === invalidationCounter) {
        cachedStatus = {
          staged: result.staged,
          unstaged: result.unstaged,
          untracked: result.untracked,
          timestamp: Date.now(),
        };
      }
      pendingFetch = null;
    });
  }

  // Return last cached or empty (always use current branch)
  if (cachedStatus) {
    return { 
      branch, 
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
    };
  }

  return { branch, staged: 0, unstaged: 0, untracked: 0 };
}

/**
 * Force refresh git status (call when you know files changed)
 */
export function invalidateGitStatus(): void {
  cachedStatus = null;
  invalidationCounter++; // Increment to invalidate any pending fetches
}

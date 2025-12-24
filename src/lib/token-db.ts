/**
 * TokenDatabase facade for fetching SpawnCamp user stats.
 * - Provides a minimal implementation so production builds don't fail.
 * - If SPawncamp API envs are not configured, returns an empty list gracefully.
 *
 * Optional environment variables:
 *   - SPAWNCAMP_API_URL or NEXT_PUBLIC_SPAWNCAMP_API_URL
 *   - SPAWNCAMP_API_KEY or NEXT_PUBLIC_SPAWNCAMP_API_KEY
 *
 * Expected response shape (flexible):
 *   - Either an array of users, or { top: User[] }
 *   - Each user should have at least: wallet, totalXP
 */

declare const process: any;

export interface SpawncampUser {
  wallet: string;
  totalXP: number;
  displayName?: string;
  pfpUrl?: string;
  lastSeen?: number;
}

export class TokenDatabase {
  private static instance: TokenDatabase | null = null;

  private constructor() {}

  static async getInstance(): Promise<TokenDatabase> {
    if (!TokenDatabase.instance) {
      TokenDatabase.instance = new TokenDatabase();
    }
    return TokenDatabase.instance;
  }

  async getTopUsers(limit: number): Promise<SpawncampUser[]> {
    const baseUrl =
      process.env.SPAWNCAMP_API_URL ||
      process.env.NEXT_PUBLIC_SPAWNCAMP_API_URL;
    const apiKey =
      process.env.SPAWNCAMP_API_KEY ||
      process.env.NEXT_PUBLIC_SPAWNCAMP_API_KEY;

    // If not configured, gracefully degrade to no users
    if (!baseUrl) {
      return [];
    }

    try {
      const url = `${String(baseUrl).replace(/\/+$/, "")}/api/users/top?limit=${encodeURIComponent(
        limit
      )}`;
      const res = await fetch(url, {
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });

      if (!res.ok) {
        // Degrade gracefully if the endpoint is unavailable
        return [];
      }

      const data: any = await res.json();
      const arr: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.top)
          ? data.top
          : [];

      return arr
        .map(normalizeSpawncampUser)
        .filter((u) => /^0x[a-f0-9]{40}$/.test(String(u.wallet)));
    } catch (e) {
      try {
        console.warn(
          "TokenDatabase.getTopUsers: spawncamp unavailable",
          (e as any)?.message || e
        );
      } catch {}
      return [];
    }
  }
}

function normalizeSpawncampUser(u: any): SpawncampUser {
  const wallet = String(u.wallet ?? u.address ?? "").toLowerCase();
  const totalXP = Number(u.totalXP ?? u.xp ?? 0);
  const displayName = u.displayName ?? u.name;
  const pfpUrl = u.pfpUrl ?? u.avatarUrl ?? u.imageUrl;
  const lastSeenRaw = u.lastSeen ?? u.last_seen ?? u.lastSeenAt;

  let lastSeen: number | undefined = undefined;
  if (typeof lastSeenRaw === "number") {
    lastSeen = lastSeenRaw;
  } else if (typeof lastSeenRaw === "string") {
    const t = Date.parse(lastSeenRaw);
    if (!Number.isNaN(t)) lastSeen = Math.floor(t / 1000);
  }

  return { wallet, totalXP, displayName, pfpUrl, lastSeen };
}

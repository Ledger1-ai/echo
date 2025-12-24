import LiveListClient from "./live-list-client";

type LiveItem = {
  wallet: string;
  displayName?: string;
  pfpUrl?: string;
  spaceUrl?: string;
  liveSince?: number;
  lastHeartbeat?: number;
  languages?: string[];
  domains?: string[];
};

async function fetchLive(): Promise<LiveItem[]> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/users/live`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  return Array.isArray(j.live) ? (j.live as LiveItem[]) : [];
}

export default async function LiveNowPage() {
  const items = await fetchLive();
  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <LiveListClient initialItems={items} />
    </div>
  );
}



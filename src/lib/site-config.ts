import { getContainer } from "@/lib/cosmos";

const DOC_ID = "site:config";

export type SiteConfig = {
  story: string;
  storyHtml: string;
  defiEnabled: boolean;
  [key: string]: any;
};

function normalize(raw?: any): SiteConfig {
  const base: any = { story: "", storyHtml: "", defiEnabled: true };
  if (raw && typeof raw === "object") Object.assign(base, raw);
  base.story = typeof base.story === "string" ? base.story : "";
  base.storyHtml = typeof base.storyHtml === "string" ? base.storyHtml : "";
  base.defiEnabled = base.defiEnabled !== false;
  return base as SiteConfig;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const c = await getContainer();
    const { resource } = await c.item(DOC_ID, DOC_ID).read<any>();
    return normalize(resource);
  } catch {
    return normalize();
  }
}

export async function isDefiEnabled(): Promise<boolean> {
  const cfg = await getSiteConfig();
  return cfg.defiEnabled !== false;
}


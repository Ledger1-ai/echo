import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

type PushBody = {
  prompt?: string;
  meta?: any;
};

type StoreRecord = {
  prompt: string;
  meta?: any;
  ts: string;
  wallet: string;
  source?: string;
};

type PromptStore = {
  [wallet: string]: StoreRecord;
};

const STORE_RELATIVE_PATH = '.data/prompts.json';

async function ensureStoreDir(filePath: string) {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

async function loadStore(): Promise<PromptStore> {
  try {
    const filePath = path.resolve(process.cwd(), STORE_RELATIVE_PATH);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object') return parsed as PromptStore;
    return {};
  } catch {
    return {};
  }
}

async function saveStore(store: PromptStore): Promise<void> {
  const filePath = path.resolve(process.cwd(), STORE_RELATIVE_PATH);
  await ensureStoreDir(filePath);
  const data = JSON.stringify(store, null, 2);
  await fs.writeFile(filePath, data, 'utf8');
}

/**
 * VoiceHub-side endpoint to receive a generated System Prompt pushed from Ledger1CRM.
 * Persists the latest prompt per wallet in a simple JSON file under voice/.data/prompts.json.
 *
 * Expects:
 *  - Header: x-wallet (string, required)
 *  - Body: { prompt: string, meta?: any }
 *
 * Returns:
 *  { ok: true, stored: { wallet, prompt, meta, ts } }
 */
export async function POST(req: Request) {
  try {
    const wallet = (req.headers.get('x-wallet') || '').trim().toLowerCase();
    if (!wallet) {
      return NextResponse.json({ ok: false, error: 'Missing wallet (x-wallet header required)' }, { status: 400 });
    }

    let body: PushBody = {};
    try {
      body = (await req.json()) as PushBody;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const prompt = String(body?.prompt || '').trim();
    const meta = body?.meta ?? {};
    if (!prompt) {
      return NextResponse.json({ ok: false, error: 'Missing prompt' }, { status: 400 });
    }

    const record: StoreRecord = {
      wallet,
      prompt,
      meta,
      ts: new Date().toISOString(),
      source: 'ledger1crm',
    };

    const store = await loadStore();
    store[wallet] = record;
    await saveStore(store);

    return NextResponse.json({ ok: true, stored: record }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unhandled error' }, { status: 500 });
  }
}

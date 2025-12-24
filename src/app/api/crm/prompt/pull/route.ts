import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

/**
 * VoiceHub-side endpoint to retrieve the latest System Prompt for a wallet.
 * Expects:
 *  - Header: x-wallet (string, required)
 *
 * Returns:
 *  { ok: true, stored: { wallet, prompt, meta, ts } } when found
 *  { ok: false, error: 'No prompt stored for wallet' } with status 200 if none
 */
export async function GET(req: Request) {
  try {
    const wallet = (req.headers.get('x-wallet') || '').trim().toLowerCase();
    if (!wallet) {
      return NextResponse.json({ ok: false, error: 'Missing wallet (x-wallet header required)' }, { status: 400 });
    }

    const store = await loadStore();
    const record = store[wallet];
    if (!record) {
      return NextResponse.json({ ok: false, error: 'No prompt stored for wallet' }, { status: 200 });
    }

    return NextResponse.json({ ok: true, stored: record }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unhandled error' }, { status: 500 });
  }
}

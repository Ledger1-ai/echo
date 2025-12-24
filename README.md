This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open http://localhost:3000 with your browser to see the result.

## Web3 Configuration

Set the following environment variables (e.g., in `.env.local`):

```
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your_thirdweb_client_id
NEXT_PUBLIC_RECIPIENT_ADDRESS=0xYourRecipientEthAddress
```

- Get a Client ID from thirdweb dashboard.
- `NEXT_PUBLIC_RECIPIENT_ADDRESS` is where subscription ETH is sent.

## Authentication

- Uses thirdweb in-app wallet with social login (Twitter/X, Google, Discord, Telegram, Email) via the Connect button in the navbar.

## Subscriptions

- Basic: 0.05 ETH / month, capped at 15 minutes/day
- Unlimited: 1 ETH / month

Payments use thirdweb BuyButton and activate local plan access for 30 days.

## Usage Gating

- Client-side tracker enforces the daily cap for the Basic plan.
- See `src/lib/usage.ts` and `src/components/usage-gate.tsx`.

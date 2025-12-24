"use client";

import { createThirdwebClient } from "thirdweb";
import { base, baseSepolia, optimism, arbitrum, polygon, sepolia } from "thirdweb/chains";
import { inAppWallet, createWallet, smartWallet } from "thirdweb/wallets";

export const client = createThirdwebClient({
	clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});

const DEFAULT_CHAIN = base;

function resolveChain() {
  const envId = process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID;
  const id = envId ? Number(envId) : undefined;
  switch (id) {
    case 8453:
      return base;
    case 84532:
      return baseSepolia;
    case 10:
      return optimism;
    case 42161:
      return arbitrum;
    case 137:
      return polygon;
    case 11155111:
      return sepolia;
    default:
      return DEFAULT_CHAIN;
  }
}

export const chain = base;

export const wallets = [
    inAppWallet({
        auth: {
            options: ["x", "google", "discord", "telegram", "email"],
        },
        // Enable EIP-4337 smart account with sponsored gas
        executionMode: {
            mode: "EIP4337",
            smartAccount: {
                chain: chain, // env-driven
                sponsorGas: true,
            },
        },
    }),
    createWallet("io.metamask"),
    createWallet("com.coinbase.wallet"),
];

export function getRecipientAddress(): `0x${string}` {
	const addr = process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "";
	return addr as `0x${string}`;
}

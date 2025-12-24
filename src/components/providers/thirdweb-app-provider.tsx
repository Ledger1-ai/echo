"use client";

import dynamic from "next/dynamic";

const ThirdwebProviderDynamic = dynamic(() => import("thirdweb/react").then(m => m.ThirdwebProvider), { ssr: false });

export function ThirdwebAppProvider({ children }: { children: React.ReactNode }) {
	return (
		<ThirdwebProviderDynamic>
			{children}
		</ThirdwebProviderDynamic>
	);
}

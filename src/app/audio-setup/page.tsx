import InteractiveChecklist from "@/components/ui/interactive-checklist";

export default function AudioSetupPage() {
	return (
		<div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
			<h1 className="text-3xl font-bold">Audio Setup (Windows)</h1>
			<p className="text-muted-foreground">Use VB-Audio virtual cables and route per‑app audio with Volume Mixer. Two browsers are required: run <b>BasaltEcho by BasaltHQ.com</b> on <b>Edge</b>, and run your <b>Space/Meeting/Stream</b> on <b>Chrome</b>.</p>

			<div className="rounded-md border p-4 bg-background/50 space-y-2">
				<p className="text-sm font-semibold">Downloads</p>
				<ul className="list-disc pl-5 text-sm space-y-1">
					<li><a className="underline" href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">VB-CABLE Virtual Audio Device</a></li>
					<li><a className="underline" href="https://vb-audio.com/Cable/index.htm#DownloadASIOBridge" target="_blank" rel="noreferrer">HiFi-CABLE & ASIO Bridge</a></li>
				</ul>
				<p className="text-xs text-muted-foreground">Download the ZIP/installer from the official site. Run installers as Administrator and reboot after installation.</p>
			</div>

			<InteractiveChecklist
				title="Interactive Checklist"
				storageKey="cb:audio:setup-checklist"
				steps={[
					"Install VB-CABLE Virtual Audio Device",
					"Install HiFi-CABLE & ASIO Bridge",
					"Reboot Windows after installation",
					"Open System → Sound → More sound settings",
					"Set Hi-Fi Cable Input (Playback) to 1 ch, 16-bit, 48000 Hz",
					"Set CABLE Input (Playback) to 1 ch, 16-bit, 48000 Hz",
					"Set Hi-Fi Cable Output (Recording) to 1 ch, 16-bit, 48000 Hz",
					"Set CABLE Output (Recording) to 1 ch, 16-bit, 48000 Hz",
					"Volume Mixer: Edge (BasaltEcho) Input → CABLE Output",
					"Volume Mixer: Edge (BasaltEcho) Output → Hi-Fi Cable Input",
					"Volume Mixer: Chrome (Space) Input → Hi-Fi Cable Output",
					"Volume Mixer: Chrome (Space) Output → CABLE Input",
					"Open BasaltEcho Console in Edge",
					"Join space/meeting/stream in Chrome",
					"Start the agent and verify meters move",
					"If stuck, join Discord: discord.gg/q4tFymyAnx",
				]}
			/>

			<div className="rounded-md border p-4 bg-background/50 space-y-3">
				<p className="text-sm font-semibold">Configure device properties (legacy sound settings)</p>
				<ol className="list-decimal pl-5 text-sm space-y-2">
					<li>Right-click the speaker icon in the taskbar → <b>Sound settings</b> → <b>More sound settings</b>.</li>
					<li><b>Playback</b> tab → set both of these to <b>1 channel, 16 bit, 48000 Hz (DVD Quality)</b> under <b>Properties → Advanced</b>:
						<ul className="list-disc pl-5 mt-1 space-y-1">
							<li><b>Hi-Fi Cable Input (VB-Audio Hi-Fi Cable)</b></li>
							<li><b>CABLE Input (VB-Audio Virtual Cable)</b></li>
						</ul>
					</li>
					<li><b>Recording</b> tab → set both of these to <b>1 channel, 16 bit, 48000 Hz (DVD Quality)</b> under <b>Properties → Advanced</b>:
						<ul className="list-disc pl-5 mt-1 space-y-1">
							<li><b>Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)</b></li>
							<li><b>CABLE Output (VB-Audio Virtual Cable)</b></li>
						</ul>
					</li>
					<li>Click <b>Apply</b> and <b>OK</b> to close each dialog.</li>
				</ol>
				<p className="text-xs text-muted-foreground">Do not change your Windows default devices; we will route per‑app in Volume Mixer.</p>
			</div>

			<div className="rounded-md border p-4 bg-background/50 space-y-3">
				<p className="text-sm font-semibold">Route apps with Volume Mixer (two browsers)</p>
				<ol className="list-decimal pl-5 text-sm space-y-2">
					<li>Open <b>System → Sound → Volume Mixer</b>.</li>
					<li><b>Edge (CB)</b> app settings:
						<ul className="list-disc pl-5 mt-1 space-y-1">
							<li><b>Input device</b>: <b>CABLE Output (VB-Audio Virtual Cable)</b></li>
							<li><b>Output device</b>: <b>Hi-Fi Cable Input (VB-Audio Hi-Fi Cable)</b></li>
						</ul>
					</li>
					<li><b>Chrome (Space/Meeting/Stream)</b> app settings:
						<ul className="list-disc pl-5 mt-1 space-y-1">
							<li><b>Input device</b>: <b>Hi-Fi Cable Output (VB-Audio Hi-Fi Cable)</b></li>
							<li><b>Output device</b>: <b>CABLE Input (VB-Audio Virtual Cable)</b></li>
						</ul>
					</li>
				</ol>
				<p className="text-xs text-muted-foreground">Open <b>Console</b> in Edge for VoiceHub. Join your space/meeting/stream in Chrome.</p>
			</div>

			<div className="rounded-md border p-4 bg-background/50 space-y-2">
				<p className="text-sm font-semibold">Need help?</p>
				<p className="text-sm">Join our Discord: <a className="underline" target="_blank" rel="noreferrer" href="https://discord.gg/q4tFymyAnx">discord.gg/q4tFymyAnx</a></p>
			</div>
		</div>
	);
}

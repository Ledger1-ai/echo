"use client";

import Link from "next/link";
import React from "react";

type Metrics = {
  totalUsers: number;
  totalSeconds: number;
  totalSecondsAllTime?: number;
  totalSummarizedSecondsAllTime?: number;
  activeNowCount?: number;
  totalLiveSecondsNow?: number;
  topDomain: string;
  topLanguage: string;
  topPlatform?: string;
  topTopic?: string;
  sessionsCount?: number;
  averageSeconds?: number;
  sessionsCount24h?: number;
  averageSeconds24h?: number;
  xpTotal?: number;
  purchasedSecondsTotal?: number;
  p50Seconds7d?: number;
  p95Seconds7d?: number;
};

function fmtHM(totalSeconds?: number): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtNum(n?: number): string {
  if (!n) return '0';
  return n.toLocaleString();
}

export default function Home() {
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  
  React.useEffect(() => {
    fetch('/api/site/metrics')
      .then(r => r.json())
      .then(j => setMetrics(j?.metrics || null))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/5 via-transparent to-[var(--primary)]/5" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-32">
          <div className="text-center max-w-5xl mx-auto">
            <div className="inline-flex items-center justify-center mb-8">
              <img
                src="/BasaltEchoWide.png"
                alt="BasaltEcho by BasaltHQ"
                className="h-24 w-auto object-contain"
              />
            </div>
            
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Real-Time AI Voice Conversations
              <span className="block text-[var(--primary)] mt-2">
                Powered by Enterprise Intelligence
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-10 max-w-5xl mx-auto leading-relaxed">
              BasaltEcho by BasaltHQ delivers professional-grade AI voice interactions with ultra-low latency. 
              Connect, customize, and communicate with advanced AI assistants in real-time through any platform.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link 
                href="/console" 
                className="px-8 py-4 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold text-lg hover:opacity-90 transition-opacity w-full sm:w-auto text-center"
              >
                Start Free Trial
              </Link>
              <Link 
                href="/pricing" 
                className="px-8 py-4 rounded-lg border-2 border-[var(--primary)] text-[var(--primary)] font-semibold text-lg hover:bg-[var(--primary)]/10 transition-colors w-full sm:w-auto text-center"
              >
                View Pricing
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Enterprise-Grade Security</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Azure OpenAI Powered</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Pay-Per-Use Pricing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Metrics */}
      {metrics && (
        <section className="py-12 border-y bg-muted/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl font-bold text-[var(--primary)]">{fmtNum(metrics.totalUsers)}</div>
                <div className="text-sm text-muted-foreground mt-2">Active Users</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-[var(--primary)]">{fmtHM(metrics.totalSeconds)}</div>
                <div className="text-sm text-muted-foreground mt-2">Total Conversation Time</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-[var(--primary)]">{fmtNum(metrics.sessionsCount)}</div>
                <div className="text-sm text-muted-foreground mt-2">Sessions Completed</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-[var(--primary)]">{metrics.activeNowCount || 0}</div>
                <div className="text-sm text-muted-foreground mt-2">Live Right Now</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Key Features */}
      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Enterprise Features for Modern Teams</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to integrate intelligent voice AI into your workflow
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="glass-pane rounded-xl border p-8 hover:border-[var(--primary)]/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Real-Time Voice AI</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ultra-low latency voice conversations powered by Azure OpenAI with advanced voice activity detection and WebRTC streaming.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="glass-pane rounded-xl border p-8 hover:border-[var(--primary)]/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Customizable AI Personas</h3>
              <p className="text-muted-foreground leading-relaxed">
                Configure AI assistants with custom domains, languages, styles, and expertise areas. Adapt conversations dynamically to your needs.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="glass-pane rounded-xl border p-8 hover:border-[var(--primary)]/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Universal Platform Integration</h3>
              <p className="text-muted-foreground leading-relaxed">
                Stream to Twitter Spaces, Zoom, Discord, or any platform. Go live anywhere with seamless audio routing and presence management.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="glass-pane rounded-xl border p-8 hover:border-[var(--primary)]/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Transparent Usage-Based Billing</h3>
              <p className="text-muted-foreground leading-relaxed">
                Pay only for what you use with per-second billing. Purchase minutes via ETH with no subscriptions or hidden fees.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="glass-pane rounded-xl border p-8 hover:border-[var(--primary)]/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Analytics & Insights</h3>
              <p className="text-muted-foreground leading-relaxed">
                Track engagement, session quality, and usage patterns. Comprehensive metrics and leaderboards to measure performance.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="glass-pane rounded-xl border p-8 hover:border-[var(--primary)]/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-3">Profile & Presence System</h3>
              <p className="text-muted-foreground leading-relaxed">
                Build your professional profile with custom avatars, bios, and activity feeds. See who's live and connect with your network.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 lg:py-32 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Powerful Workflow</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get started with AI voice conversations in minutes
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold mb-3">Connect</h3>
              <p className="text-muted-foreground">
                Sign in with your wallet or social account. Secure authentication in seconds.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold mb-3">Configure</h3>
              <p className="text-muted-foreground">
                Choose your AI voice, language, domain expertise, and conversation parameters.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold mb-3">Engage</h3>
              <p className="text-muted-foreground">
                Start your conversation. Go live on any platform or use privately for your needs.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-2xl font-bold flex items-center justify-center mx-auto mb-6">
                4
              </div>
              <h3 className="text-xl font-semibold mb-3">Analyze</h3>
              <p className="text-muted-foreground">
                Review session summaries, track usage, and optimize your AI interactions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Built for Professionals</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              BasaltEcho serves diverse industries and use cases
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-pane rounded-xl border p-8">
              <h3 className="text-xl font-semibold mb-3">Content Creators</h3>
              <p className="text-muted-foreground mb-4">
                Enhance streams, podcasts, and social media with AI co-hosts. Create engaging content with real-time voice interactions.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Twitter Spaces integration</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Custom AI personalities</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Live audience engagement</span>
                </li>
              </ul>
            </div>

            <div className="glass-pane rounded-xl border p-8">
              <h3 className="text-xl font-semibold mb-3">Business Teams</h3>
              <p className="text-muted-foreground mb-4">
                Deploy AI assistants for customer support, training, and internal communications. Scale your voice capabilities.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Domain-specific training</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Multi-language support</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Usage analytics & reporting</span>
                </li>
              </ul>
            </div>

            <div className="glass-pane rounded-xl border p-8">
              <h3 className="text-xl font-semibold mb-3">Developers</h3>
              <p className="text-muted-foreground mb-4">
                Integrate advanced voice AI into your applications. Build the next generation of voice-enabled products.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>RESTful API access</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>WebRTC streaming</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--primary)] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Flexible deployment options</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 bg-gradient-to-br from-[var(--primary)]/10 via-transparent to-[var(--primary)]/10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">
            Ready to Transform Your Voice Interactions?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Join the future of AI-powered voice communication. Start your free trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/console" 
              className="px-8 py-4 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold text-lg hover:opacity-90 transition-opacity w-full sm:w-auto text-center"
            >
              Get Started Free
            </Link>
            <Link 
              href="/pricing" 
              className="px-8 py-4 rounded-lg border-2 font-semibold text-lg hover:bg-muted/50 transition-colors w-full sm:w-auto text-center"
            >
              View Pricing Plans
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            No credit card required • Pay only for what you use • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer Links */}
      <section className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <Link href="/live" className="text-muted-foreground hover:text-foreground transition-colors">
              Live Sessions
            </Link>
            <Link href="/leaderboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Leaderboard
            </Link>
            <Link href="/audio-setup" className="text-muted-foreground hover:text-foreground transition-colors">
              Audio Setup Guide
            </Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/console" className="text-muted-foreground hover:text-foreground transition-colors">
              Console
            </Link>
          </div>
          <div className="text-center mt-8 text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} BasaltEcho by BasaltHQ. All rights reserved.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

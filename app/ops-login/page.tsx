'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { HardHat, ArrowLeft, Mail } from 'lucide-react';

type Step = 'email' | 'code';

export default function OpsLoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'Failed to send code. Please try again.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep('code');
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('otp', {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid or expired code. Please try again.');
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center">
              <HardHat className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Live<span className="text-cyan-400">Edge</span></h1>
          <p className="text-slate-400 text-sm mt-1">Ops &amp; Warehouse Sign In</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@beisserlumber.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Sending code...
                  </>
                ) : (
                  'Send Sign-In Code'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    6-Digit Code
                  </label>
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setCode(''); setError(''); }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Change email
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Code sent to <span className="text-slate-300">{email}</span>. Check your inbox — it expires in 10 minutes.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-full px-3 py-3 bg-slate-950/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-2xl tracking-[0.5em] text-center font-mono"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-2.5 rounded-lg font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={() => handleEmailSubmit({ preventDefault: () => {} } as React.FormEvent)}
                disabled={loading}
                className="w-full text-xs text-slate-500 hover:text-slate-300 transition py-1 disabled:opacity-40"
              >
                Didn&apos;t receive it? Resend code
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center">
              Estimating staff? <a href="/login" className="text-cyan-400 hover:text-cyan-300 transition">Sign in with username</a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          LiveEdge · Beisser Lumber Co.
        </p>
      </div>
    </div>
  );
}

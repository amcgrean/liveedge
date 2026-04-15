'use client';

import React, { useState, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Hammer, Eye, EyeOff, ArrowLeft } from 'lucide-react';

type Step = 'identifier' | 'password' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);

  const isEmail = identifier.includes('@');

  // Step 1: "Continue" — detect flow based on identifier
  async function handleIdentifierSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError('');

    if (isEmail) {
      // OTP flow: send the code, then advance
      setLoading(true);
      try {
        const res = await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier.trim().toLowerCase() }),
        });
        // Always advance — don't reveal whether email exists
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          // Only surface hard errors (rate limit, server error)
          if (res.status === 429 || res.status >= 500) {
            setError(data.error ?? 'Failed to send code. Please try again.');
            return;
          }
        }
      } catch {
        // Network error — still advance; user can retry from OTP step
      } finally {
        setLoading(false);
      }
      setStep('otp');
    } else {
      // Password flow: go straight to password input
      setStep('password');
    }
  }

  // Step 2a: OTP verify
  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      identifier: identifier.trim().toLowerCase(),
      otp_code: otpCode.trim(),
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

  // Resend OTP
  async function handleResend() {
    setLoading(true);
    setError('');
    try {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier.trim().toLowerCase() }),
      });
    } catch { /* ignore */ }
    setLoading(false);
  }

  // Step 2b: Password sign in
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      identifier: identifier.trim(),
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid username or password. Please try again.');
      setLoading(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  function goBack() {
    setStep('identifier');
    setPassword('');
    setOtpCode('');
    setError('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/20 border border-cyan-400/30 flex items-center justify-center">
              <Hammer className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Live<span className="text-cyan-400">Edge</span></h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur">

          {/* Step 1: Email or username */}
          {step === 'identifier' && (
            <form onSubmit={handleIdentifierSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email or username
                </label>
                <input
                  ref={identifierRef}
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="username or you@beisserlumber.com"
                  className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !identifier.trim()}
                className="w-full py-2.5 rounded-lg font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    {isEmail ? 'Sending code…' : 'Continue…'}
                  </>
                ) : (
                  'Continue'
                )}
              </button>

              <p className="text-xs text-slate-500 text-center pt-1">
                Contact your administrator to request an account.
              </p>
            </form>
          )}

          {/* Step 2a: OTP code entry */}
          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    6-Digit Code
                  </label>
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Change
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Code sent to{' '}
                  <span className="text-slate-300">{identifier.trim().toLowerCase()}</span>.
                  Check your inbox — it expires in 10 minutes.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
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
                disabled={loading || otpCode.length !== 6}
                className="w-full py-2.5 rounded-lg font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Verify & Sign In'
                )}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-xs text-slate-500 hover:text-slate-300 transition py-1 disabled:opacity-40"
              >
                Didn&apos;t receive it? Resend code
              </button>
            </form>
          )}

          {/* Step 2b: Password */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Change
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Signing in as{' '}
                  <span className="text-slate-300">{identifier.trim()}</span>
                </p>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
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
                    Signing in…
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          LiveEdge · Beisser Lumber Co.
        </p>
      </div>
    </div>
  );
}

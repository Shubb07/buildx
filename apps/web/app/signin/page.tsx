'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth/AuthProvider';
import { AuthShell } from '../../components/auth/AuthShell';
import { OtpInput } from '../../components/auth/OtpInput';

const RESEND_SECONDS = 30;

export default function SignInPage() {
  const { status, error, sendOtp, signInWithGoogle, confirmOtp, phoneInFlight, resetOtp } = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (status === 'signed-in') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const validPhone = /^[6-9]\d{9}$/.test(phone);

  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (!validPhone) return;
    setSubmitting(true);
    await sendOtp(phone);
    setSubmitting(false);
    setResendIn(RESEND_SECONDS);
  }

  async function verify(value: string) {
    if (value.length !== 6 || submitting) return;
    setSubmitting(true);
    await confirmOtp(value);
    setSubmitting(false);
  }

  if (status === 'otp-sent') {
    return (
      <AuthShell step="Step 2 of 2">
        <h1 className="font-display text-[clamp(2.25rem,5vw,3rem)] font-bold leading-[0.95] tracking-tightest">Enter the code</h1>
        <p className="mt-4 text-[16px] text-stone">
          We sent a 6-digit code to <span className="font-mono text-ink">{phoneInFlight}</span>.{' '}
          <button type="button" onClick={() => { resetOtp(); setCode(''); }} className="font-medium text-cobalt hover:underline">Change number</button>
        </p>
        <form onSubmit={(e) => { e.preventDefault(); verify(code); }} className="mt-8 flex flex-col gap-5">
          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); if (v.length === 6) verify(v); }}
            invalid={!!error}
            disabled={submitting}
          />
          {error && <p role="alert" className="text-[14px] text-error">{error}</p>}
          <button type="submit" disabled={submitting || code.length !== 6} className="btn-ink h-14 w-full text-[16px]">
            {submitting ? 'Verifying' : 'Verify and continue'}
          </button>
          <p className="text-center text-[14px] text-stone">
            {resendIn > 0 ? (
              <>Resend code in <span className="font-mono text-ink">0:{String(resendIn).padStart(2, '0')}</span></>
            ) : (
              <button type="button" onClick={() => handleSendOtp()} className="font-medium text-cobalt hover:underline">Resend code</button>
            )}
          </p>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell step="Sign in">
      <h1 className="font-display text-[clamp(2.25rem,5vw,3rem)] font-bold leading-[0.95] tracking-tightest">Operations sign in</h1>
      <p className="mt-4 text-[16px] text-stone">For the Sthiva operations team. Sign in with the Google account an admin gave access to.</p>
      <button
        type="button"
        disabled={googleBusy}
        onClick={async () => { setGoogleBusy(true); await signInWithGoogle(); setGoogleBusy(false); }}
        className="btn mt-8 h-14 w-full gap-3 border border-sand-4 bg-white text-[16px] text-ink hover:border-ink"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
        </svg>
        {googleBusy ? 'Signing in' : 'Continue with Google'}
      </button>
      {error && <p role="alert" className="mt-4 text-[14px] text-error">{error}</p>}
      <p className="mt-8 flex items-center gap-3 text-[13px] text-stone"><span className="h-px flex-1 bg-sand-4" />Or with a registered mobile number<span className="h-px flex-1 bg-sand-4" /></p>
      <form onSubmit={handleSendOtp} className="mt-5 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">Mobile number</span>
          <span className="flex items-center gap-3 rounded-xl border border-sand-4 bg-sand-2 pl-4 transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(243,184,6,0.55)]">
            <span className="flex items-center gap-2 border-r border-sand-4 pr-3 font-mono text-[15px]">
              <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-lime">IN</span>+91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              required
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="98765 43210"
              className="h-14 w-full bg-transparent pr-4 font-mono text-[18px] tracking-wide outline-none"
            />
          </span>
          <span className="text-[13px] text-stone">Indian mobile numbers starting with 6, 7, 8 or 9.</span>
        </label>
        <button type="submit" disabled={submitting || !validPhone} className="btn-ghost h-14 w-full text-[16px]">
          {submitting ? 'Sending code' : 'Send code'}
          {!submitting && <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>}
        </button>
      </form>
    </AuthShell>
  );
}

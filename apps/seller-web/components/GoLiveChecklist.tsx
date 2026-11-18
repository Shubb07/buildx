'use client';

import Link from 'next/link';
import type { GoLive, GoLiveStep } from '../lib/go-live';

// Everything a seller hands over before going live, in order, like a food-delivery partner's
// onboarding: each step shows where it stands and opens the page that finishes it.

const LOOK: Record<GoLiveStep['status'], { icon: string; circle: string; tag: string; tagClass: string }> = {
  DONE: { icon: 'check', circle: 'bg-lime text-ink', tag: 'Done', tagClass: 'bg-[#E3F4E8] text-tertiary' },
  WAITING: { icon: 'hourglass_top', circle: 'bg-[#FFF4D6] text-[#5C4300]', tag: 'Being checked', tagClass: 'bg-[#FFF4D6] text-[#5C4300]' },
  PROBLEM: { icon: 'error', circle: 'bg-error-container text-error', tag: 'Fix this', tagClass: 'bg-error-container text-error' },
  TODO: { icon: '', circle: 'bg-sand-3 text-ink', tag: 'To do', tagClass: 'bg-sand-3 text-stone' },
};

export function GoLiveChecklist({ data }: { data: GoLive }) {
  const next = data.steps.find((s) => s.status === 'TODO' || s.status === 'PROBLEM');
  const pct = Math.round((data.done / data.total) * 100);
  const reviewing = data.review.status === 'PENDING';

  return (
    <section aria-labelledby="golive-title" className="card overflow-hidden">
      <div className="flex flex-col gap-4 bg-ink p-5 text-sand sm:flex-row sm:items-center sm:p-6">
        <div className="flex-1">
          <p className="eyebrow text-stone-light">Go live on Sthiva</p>
          <h2 id="golive-title" className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {data.done} of {data.total} steps done
          </h2>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done} aria-label="Setup progress">
            <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {next && (
          <Link href={next.href} className="btn-lime self-start px-6 sm:self-auto">
            {next.status === 'PROBLEM' ? 'Fix' : 'Next'}: {next.label.toLowerCase()}
          </Link>
        )}
      </div>

      <ol className="divide-y divide-sand-4">
        {data.steps.map((s, i) => {
          const look = LOOK[s.status];
          return (
            <li key={s.key}>
              <Link href={s.href} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-sand-3/50 sm:px-6">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[13px] ${look.circle}`}>
                  {look.icon ? <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{look.icon}</span> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{s.label}</span>
                  <span className="block text-[14px] text-stone">{s.detail}</span>
                </span>
                <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium sm:inline ${look.tagClass}`}>{look.tag}</span>
                <span className="material-symbols-outlined shrink-0 text-[20px] text-stone" aria-hidden="true">chevron_right</span>
              </Link>
            </li>
          );
        })}
        <li className="flex items-center gap-4 bg-sand-2 px-5 py-4 sm:px-6">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${data.review.status === 'VERIFIED' ? 'bg-lime text-ink' : data.review.status === 'REJECTED' ? 'bg-error-container text-error' : 'bg-sand-3 text-ink'}`}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{data.review.status === 'VERIFIED' ? 'verified' : data.review.status === 'REJECTED' ? 'error' : 'fact_check'}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{data.review.status === 'VERIFIED' ? 'Live on Sthiva' : 'Sthiva checks your details'}</span>
            <span className="block text-[14px] text-stone">{data.review.detail}</span>
          </span>
          {reviewing && <span className="hidden shrink-0 rounded-full bg-sand-3 px-2.5 py-1 text-[12px] font-medium text-stone sm:inline">Last step</span>}
        </li>
      </ol>
    </section>
  );
}

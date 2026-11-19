'use client';

import { useState } from 'react';
import { tx, useApiClient, useT } from '@sthiva/web-core';
import { submitOrderReview, useOrderReview } from '@/lib/reviews';

// After delivery: "How was your order?" One review per order. It counts for the seller who delivered
// and shows on each item's page, with the buyer's first name and initial only.

const LABELS = ['', tx('Poor'), tx('Not good'), tx('Okay'), tx('Good'), tx('Excellent')];

function YesNo({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[220px] text-[15px]">{t(label)}</span>
      {([[true, tx('Yes')], [false, tx('No')]] as const).map(([v, l]) => (
        <button key={l} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-full px-4 py-1.5 text-[14px] font-medium ${value === v ? 'bg-ink text-sand' : 'border border-sand-4 bg-sand hover:border-ink'}`}>
          {t(l)}
        </button>
      ))}
    </div>
  );
}

export function OrderReview({ orderId }: { orderId: string }) {
  const client = useApiClient();
  const mine = useOrderReview(orderId, true);
  const t = useT();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [onTime, setOnTime] = useState<boolean | undefined>();
  const [asListed, setAsListed] = useState<boolean | undefined>();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mine.status !== 'success') return null;

  if (mine.review) {
    return (
      <section className="card flex flex-col gap-2 p-5 sm:p-6" aria-label="Your review">
        <p className="eyebrow text-stone">{t('Your review')}</p>
        <p className="text-[18px] tracking-wider text-[#E0A100]" aria-label={t('{n} out of 5 stars', { n: mine.review.rating })}>
          {'★'.repeat(mine.review.rating)}<span className="text-sand-4">{'★'.repeat(5 - mine.review.rating)}</span>
        </p>
        {mine.review.comment && <p className="text-[15px] text-stone">{mine.review.comment}</p>}
        <p className="text-[13px] text-stone">{t('Thank you. It helps other people building in your area.')}</p>
      </section>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await submitOrderReview(client, orderId, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}), ...(onTime !== undefined ? { onTime } : {}), ...(asListed !== undefined ? { asListed } : {}) });
      mine.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not send. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="review-title">
      <div>
        <h2 id="review-title" className="font-display text-xl font-semibold tracking-tight">{t('How was your order?')}</h2>
        <p className="text-[14px] text-stone">{t('Your review helps other people building in your area. Only your first name and initial are shown.')}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex" role="radiogroup" aria-label={t('Rating')} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={n === 1 ? t('1 star') : t('{n} stars', { n })}
              onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
              className={`px-0.5 text-[34px] leading-none transition-transform hover:scale-110 ${n <= shown ? 'text-[#E0A100]' : 'text-sand-4'}`}>
              ★
            </button>
          ))}
        </div>
        {shown > 0 && <span className="text-[15px] font-medium">{t(LABELS[shown])}</span>}
      </div>
      <YesNo label={tx('Delivered on the promised date?')} value={onTime} onChange={setOnTime} />
      <YesNo label={tx('Quality and quantity as listed?')} value={asListed} onChange={setAsListed} />
      <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} rows={3} placeholder={t('Anything others should know? (optional)')} className="field resize-none" aria-label={t('Your comment')} />
      {error && <p role="alert" className="text-[14px] text-error">{error}</p>}
      <button type="button" disabled={!rating || busy} onClick={send} className="btn-ink self-start px-7">{busy ? t('Sending') : t('Send review')}</button>
    </section>
  );
}

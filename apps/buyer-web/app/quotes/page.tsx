'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApiClient } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { EmptyState, ErrorNote, PageHead } from '@/components/account/AccountUI';
import { fetchQuoteRequests, type QuoteSummary } from '@/lib/quotes';

const STATUS: Record<string, string> = { OPEN: 'Waiting for replies', ACCEPTED: 'Accepted', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };

function List() {
  const client = useApiClient();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; rows: QuoteSummary[] }>({ status: 'loading' });
  useEffect(() => { fetchQuoteRequests(client).then((rows) => setState({ status: 'ok', rows })).catch(() => setState({ status: 'error' })); }, [client]);
  if (state.status === 'loading') return <div className="skeleton h-40" role="status" aria-label="Loading" />;
  if (state.status === 'error') return <ErrorNote>Could not load your requests. Try again.</ErrorNote>;
  if (!state.rows.length) return <EmptyState icon="request_quote" title="No bulk quotes yet" body="For big jobs, put your items in the cart and ask nearby sellers for one price." cta={{ href: '/quotes/new', label: 'Get a bulk quote' }} />;
  return (
    <ul className="flex flex-col gap-3">
      {state.rows.map((r) => (
        <li key={r._id}>
          <Link href={`/quotes/${r._id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 hover:border-ink">
            <span>
              <span className="block font-mono text-[14px] font-medium">{r.number}</span>
              <span className="block text-[14px] text-stone">{r.items} item{r.items === 1 ? '' : 's'} · needed by {r.neededBy}</span>
            </span>
            <span className="text-[14px]">
              <span className="font-semibold">{r.replies} repl{r.replies === 1 ? 'y' : 'ies'}</span> · {STATUS[r.status] ?? r.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function QuotesPage() {
  return (
    <>
      <Header />
      <main id="main" className="container-x min-h-[70vh] max-w-4xl pb-32 pt-[calc(var(--header-h)+40px)]">
        <PageHead eyebrow="Bulk quotes" title="Your" accent="quotes" />
        <div className="mt-10"><RequireAuth><List /></RequireAuth></div>
      </main>
      <BottomNav />
    </>
  );
}

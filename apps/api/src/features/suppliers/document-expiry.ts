// Reminders before a seller's verification paper expires (owner decision 2026-11-10, part of "free first"
// seller verification). Three notices per paper, each sent once: 30 days before, 7 days before, and on
// expiry. Expiry does not hide the seller by itself; ops sees "expired" in the review checks and decides.
// Uploading a new paper starts over (the new entry has no expiryNotice).

import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { logger } from '../../shared/logger/logger';
import { notifyUser } from '../../shared/services/notification.service';
import { logEntry, pushLog } from './verification';

const DAY = 86400000;
const LABEL: Record<string, string> = { GST: 'GST certificate', SHOP_LICENSE: 'shop licence', UDYAM: 'Udyam certificate' };
type Stage = 'D30' | 'D7' | 'EXPIRED';
const ORDER: Record<Stage, number> = { D30: 1, D7: 2, EXPIRED: 3 };

/** Which notice a paper is due for now, or null */
export function dueStage(expiresOn: Date, now: Date): Stage | null {
  const left = expiresOn.getTime() - now.getTime();
  if (left <= 0) return 'EXPIRED';
  if (left <= 7 * DAY) return 'D7';
  if (left <= 30 * DAY) return 'D30';
  return null;
}

const dayText = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

let lastRun = 0;

/**
 * Sends due notices. Safe to call often: it runs at most once an hour (it is called from the
 * one-minute sweeper) and each notice is claimed atomically, so two servers never send it twice.
 */
export async function sendDocumentExpiryReminders(now = new Date(), { force = false } = {}) {
  if (!force && now.getTime() - lastRun < 60 * 60 * 1000) return 0;
  lastRun = now.getTime();

  const profiles = await SupplierProfile.find({
    isActive: { $ne: false },
    kycDocuments: { $elemMatch: { expiresOn: { $lte: new Date(now.getTime() + 30 * DAY) }, publicId: { $exists: true } } },
  }).select('_id userId kycDocuments').limit(500).lean();

  let sent = 0;
  for (const p of profiles) {
    for (const d of p.kycDocuments ?? []) {
      if (!d.expiresOn || !d.publicId || d.status === 'REJECTED') continue;
      const stage = dueStage(new Date(d.expiresOn), now);
      if (!stage || (d.expiryNotice && ORDER[d.expiryNotice] >= ORDER[stage])) continue;
      // Claim: only if this same paper (publicId) has not had this notice or a later one
      const claimed = await SupplierProfile.updateOne(
        { _id: p._id, kycDocuments: { $elemMatch: { publicId: d.publicId, expiryNotice: { $in: [null, ...Object.keys(ORDER).filter((s) => ORDER[s as Stage] < ORDER[stage])] } } } },
        {
          $set: { 'kycDocuments.$[doc].expiryNotice': stage },
          ...(stage === 'EXPIRED' ? { $push: pushLog(logEntry('SYSTEM', 'DOC_EXPIRED', undefined, LABEL[d.type] ?? d.type)) } : {}),
        },
        { arrayFilters: [{ 'doc.publicId': d.publicId }] }
      );
      if (!claimed.modifiedCount) continue;
      const label = LABEL[d.type] ?? 'document';
      const on = dayText(new Date(d.expiresOn));
      notifyUser(String(p.userId), stage === 'EXPIRED'
        ? { title: `Your ${label} has expired`, body: `It expired on ${on}. Upload the renewed one on the Setup page so Sthiva can keep you verified.`, data: { screen: 'supplier_profile' } }
        : { title: `Your ${label} expires ${stage === 'D7' ? 'this week' : 'soon'}`, body: `It is valid until ${on}. Upload the renewed one on the Setup page when you have it.`, data: { screen: 'supplier_profile' } });
      sent++;
    }
  }
  if (sent) logger.info('[documents] expiry notices sent', { sent });
  return sent;
}

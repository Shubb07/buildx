// Seller verification, free checks only (owner decision 2026-11-10: "free first"; a paid GST lookup
// can be added later). What this covers:
//   - GSTIN is checked properly (format, state code, check character), not just by shape
//   - one GSTIN per seller: a second seller cannot reuse a GSTIN already on Sthiva
//   - a verified seller who changes GSTIN or business name goes back to review
//   - every verification step is written to the profile's audit trail (verificationLog)
//   - ops sees the checks (GSTIN state vs the states of the PINs the seller serves)

import { Types } from 'mongoose';
import { SupplierProfile, type ISupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { AppError } from '../../shared/errors/AppError';
import { checkGstin, sameGstState, GST_STATES } from '../../shared/gstin';
import { summarisePincodes } from '../locations/postal-directory.service';

export type LogEntry = ISupplierProfile['verificationLog'][number];
const LOG_LIMIT = 100;

export function logEntry(actor: LogEntry['actor'], action: string, by?: string | Types.ObjectId, note?: string): LogEntry {
  return {
    at: new Date(),
    actor,
    action,
    ...(by ? { by: new Types.ObjectId(String(by)) } : {}),
    ...(note ? { note: note.slice(0, 300) } : {}),
  };
}

/** $push fragment that appends entries and keeps the newest LOG_LIMIT */
export function pushLog(...entries: LogEntry[]) {
  return { verificationLog: { $each: entries, $slice: -LOG_LIMIT } };
}

/** 409 when another seller already uses this GSTIN */
export async function assertGstinFree(gstin: string, ownProfileId?: Types.ObjectId | string) {
  const other = await SupplierProfile.findOne({
    gstin: gstin.toUpperCase(),
    ...(ownProfileId ? { _id: { $ne: ownProfileId } } : {}),
  }).select('_id').lean();
  if (other) {
    throw new AppError(
      'This GSTIN is already used by another seller on Sthiva. If it is your business, contact Sthiva support.',
      'GSTIN_TAKEN', 409, { field: 'gstin' }
    );
  }
}

/** Does this profile change need a fresh review? Only for sellers already verified. */
export function reviewReasons(
  current: Pick<ISupplierProfile, 'gstin' | 'businessName' | 'verificationStatus'>,
  next: { gstin?: string | null; businessName?: string }
): string[] {
  if (current.verificationStatus !== 'VERIFIED') return [];
  const reasons: string[] = [];
  if (next.gstin !== undefined && (next.gstin || '') !== (current.gstin || '')) reasons.push('GSTIN changed');
  if (next.businessName !== undefined && next.businessName.trim().toLowerCase() !== current.businessName.trim().toLowerCase()) {
    reasons.push('Business name changed');
  }
  return reasons;
}

export type VerificationChecks = {
  gstin: { status: 'NONE' | 'OK' | 'PROBLEM'; state?: string; pan?: string; problem?: string };
  /** another seller profile with the same GSTIN (only possible for data saved before this check) */
  duplicateGstin: boolean;
  /** states of the PINs the seller serves that differ from the GSTIN's state */
  otherStates: string[];
  /** true when the postal directory could not be read, so otherStates is unknown */
  statesUnknown: boolean;
  documents: { accepted: string[]; waiting: string[]; rejected: string[] };
};

type CheckInput = Pick<ISupplierProfile, '_id' | 'gstin' | 'servicePincodes' | 'kycDocuments'>;

/** Checks for the ops review screen, for many profiles at once (two queries in total) */
export async function verificationChecks(profiles: CheckInput[]): Promise<Map<string, VerificationChecks>> {
  const gstins = profiles.map((p) => p.gstin).filter((g): g is string => !!g);
  const dupRows = gstins.length
    ? await SupplierProfile.aggregate<{ _id: string; n: number }>([
        { $match: { gstin: { $in: gstins } } },
        { $group: { _id: '$gstin', n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ])
    : [];
  const dups = new Set(dupRows.map((r) => r._id));

  // Only sellers with a GSTIN need PIN states; a sample of 30 PINs each is plenty to spot a mismatch
  const pins = [...new Set(profiles.filter((p) => p.gstin).flatMap((p) => (p.servicePincodes ?? []).slice(0, 30)))];
  let pinStates: Map<string, { state: string }> | null = new Map();
  try {
    if (pins.length) pinStates = await summarisePincodes(pins);
  } catch {
    pinStates = null;
  }

  const out = new Map<string, VerificationChecks>();
  for (const p of profiles) {
    const g = p.gstin ? checkGstin(p.gstin) : null;
    const otherStates = new Set<string>();
    if (g?.ok && pinStates) {
      for (const pin of (p.servicePincodes ?? []).slice(0, 30)) {
        const s = pinStates.get(pin)?.state;
        if (s && !sameGstState(g.stateCode, s)) otherStates.add(s);
      }
    }
    const docs = (p.kycDocuments ?? []).filter((d) => d.publicId);
    const status = (d: (typeof docs)[number]) => d.status ?? (d.verified ? 'ACCEPTED' : 'SUBMITTED');
    out.set(String(p._id), {
      gstin: !g ? { status: 'NONE' } : g.ok
        ? { status: 'OK', state: GST_STATES[g.stateCode], pan: g.pan }
        : { status: 'PROBLEM', problem: g.problem },
      duplicateGstin: !!p.gstin && dups.has(p.gstin),
      otherStates: [...otherStates].sort(),
      statesUnknown: !!g?.ok && pinStates === null,
      documents: {
        accepted: docs.filter((d) => status(d) === 'ACCEPTED').map((d) => d.type),
        waiting: docs.filter((d) => status(d) === 'SUBMITTED').map((d) => d.type),
        rejected: docs.filter((d) => status(d) === 'REJECTED').map((d) => d.type),
      },
    });
  }
  return out;
}

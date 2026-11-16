// Supplier verification documents (owner decision 2026-11-05): GST certificate if the supplier is
// GST-registered, and a shop licence or Udyam certificate. Files are private on Cloudinary; the ops team
// opens them through links that expire after 10 minutes. Suppliers never get a file link back.

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { isValidObjectId } from 'mongoose';
import { ok } from '@sthiva/shared';
import { SupplierProfile, type ISupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { StorageService } from '../../infrastructure/storage/cloudinary.client';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { notifyUser } from '../../shared/services/notification.service';
import { logEntry, pushLog } from './verification';

export const DOCUMENT_TYPES = ['GST', 'SHOP_LICENSE', 'UDYAM'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
const LABEL: Record<string, string> = { GST: 'GST certificate', SHOP_LICENSE: 'Shop licence', UDYAM: 'Udyam certificate' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.mimetype)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    cb(null, true);
  },
});

/** multer for field "file", with its errors in the API's normal shape */
export function documentUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(AppError.badRequest(
        err.code === 'LIMIT_FILE_SIZE' ? 'The file must be 5 MB or smaller' : 'Upload a JPEG, PNG or PDF file'
      ));
    }
    next(err);
  });
}

type Doc = ISupplierProfile['kycDocuments'][number];
/** What anyone outside ops sees about a document: never a file link */
const summary = (d: Doc) => ({
  type: d.type, label: LABEL[d.type] ?? d.type, status: d.status ?? (d.verified ? 'ACCEPTED' : 'SUBMITTED'),
  note: d.note, uploadedAt: d.uploadedAt, reviewedAt: d.reviewedAt, format: d.format,
  expiresOn: d.expiresOn ? istDay(d.expiresOn) : undefined,
});

/** YYYY-MM-DD for a stored expiry date (kept as the start of that day, IST) */
const istDay = (d: Date) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);

/**
 * Optional expiry date from a form field: '' or missing = none. Must be a real date from today
 * up to 30 years ahead. Stored as the start of that day in IST.
 */
export function parseExpiry(raw: unknown): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const v = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const date = m ? new Date(`${v}T00:00:00+05:30`) : null;
  if (!date || Number.isNaN(date.getTime()) || istDay(date) !== v) throw AppError.badRequest('Enter the expiry date as a real date (YYYY-MM-DD)');
  const today = new Date(`${istDay(new Date())}T00:00:00+05:30`);
  if (date < today) throw AppError.badRequest('This paper has already expired. Upload the renewed one.');
  if (date.getTime() > today.getTime() + 30 * 366 * 86400000) throw AppError.badRequest('Check the expiry date: it is too far ahead');
  return date;
}

// GET /suppliers/me/documents
export async function myDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('kycDocuments gstin').lean();
    if (!profile) throw AppError.notFound('Supplier profile');
    res.json(ok({ documents: (profile.kycDocuments ?? []).filter((d) => d.publicId).map(summary), types: DOCUMENT_TYPES }));
  } catch (err) { next(err); }
}

// POST /suppliers/me/documents (multipart: type, file) — adds or replaces the document of that type
export async function uploadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const type = String(req.body?.type ?? '') as DocumentType;
    if (!DOCUMENT_TYPES.includes(type)) throw AppError.badRequest('Choose GST certificate, shop licence or Udyam certificate');
    if (!req.file) throw AppError.badRequest('Attach the file (field name: "file")');
    const expiresOn = parseExpiry(req.body?.expiresOn);
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('_id kycDocuments').lean();
    if (!profile) throw AppError.notFound('Supplier profile');

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const stored = await StorageService.uploadPrivate(dataUri, `kyc/${profile._id}`);
    const doc = {
      type, publicId: stored.publicId, format: stored.format, status: 'SUBMITTED' as const, uploadedAt: new Date(), verified: false,
      ...(expiresOn ? { expiresOn } : {}),
    };

    const updated = await SupplierProfile.findOneAndUpdate(
      { _id: profile._id },
      [{ $set: {
        kycDocuments: { $concatArrays: [{ $filter: { input: { $ifNull: ['$kycDocuments', []] }, cond: { $ne: ['$$this.type', type] } } }, [doc]] },
        // audit trail, newest 100 (pipeline form of pushLog)
        verificationLog: { $slice: [{ $concatArrays: [{ $ifNull: ['$verificationLog', []] }, [{ $literal: logEntry('SUPPLIER', 'DOC_UPLOADED', req.auth!.userId, LABEL[type]) }]] }, -100] },
      } }],
      { new: true }
    ).select('kycDocuments').lean();
    // The replaced file is no longer needed
    const old = (profile.kycDocuments ?? []).find((d) => d.type === type);
    if (old?.publicId && old.publicId !== stored.publicId) await StorageService.deletePrivate(old.publicId);

    logger.info('[documents] uploaded', { supplierId: String(profile._id), type });
    res.status(201).json(ok({ documents: (updated?.kycDocuments ?? []).filter((d) => d.publicId).map(summary) }));
  } catch (err) { next(err); }
}

// GET /ops/suppliers/:id/documents — with 10-minute view links
export async function opsDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw AppError.badRequest('Invalid supplier ID');
    const profile = await SupplierProfile.findById(id).select('kycDocuments gstin businessName').lean();
    if (!profile) throw AppError.notFound('Supplier');
    logger.info('[documents] viewed by ops', { opsUserId: req.auth!.userId, supplierId: id });
    res.json(ok({
      gstin: profile.gstin ?? null,
      documents: (profile.kycDocuments ?? []).filter((d) => d.publicId).map((d) => ({
        ...summary(d),
        viewUrl: StorageService.privateViewUrl(d.publicId, d.format ?? 'jpg'),
      })),
    }));
  } catch (err) { next(err); }
}

// PATCH /ops/suppliers/:id/documents/:type { status: ACCEPTED|REJECTED, note? }
export async function reviewDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const type = String(req.params.type);
    if (!isValidObjectId(id)) throw AppError.badRequest('Invalid supplier ID');
    const { status, note, expiresOn: rawExpiry } = req.body as { status: 'ACCEPTED' | 'REJECTED'; note?: string; expiresOn?: string | null };
    // Ops can record or correct the expiry date they read on the paper; null clears it
    const expiresOn = rawExpiry === null ? null : parseExpiry(rawExpiry);
    const profile = await SupplierProfile.findOneAndUpdate(
      { _id: id, 'kycDocuments.type': type },
      {
        $set: {
          'kycDocuments.$.status': status, 'kycDocuments.$.verified': status === 'ACCEPTED', 'kycDocuments.$.note': note ?? '', 'kycDocuments.$.reviewedAt': new Date(),
          ...(expiresOn ? { 'kycDocuments.$.expiresOn': expiresOn } : {}),
        },
        ...(expiresOn === null ? { $unset: { 'kycDocuments.$.expiresOn': '' } } : {}),
        $push: pushLog(logEntry('OPS', status === 'ACCEPTED' ? 'DOC_ACCEPTED' : 'DOC_REJECTED', req.auth!.userId, [LABEL[type] ?? type, note].filter(Boolean).join(': '))),
      },
      { new: true }
    ).select('kycDocuments userId').lean();
    if (!profile) throw AppError.notFound('Document');
    logger.info('[documents] reviewed', { opsUserId: req.auth!.userId, supplierId: id, type, status });
    if (status === 'REJECTED') {
      notifyUser(profile.userId.toString(), {
        title: 'Please upload the document again',
        body: `Sthiva could not accept your ${LABEL[type] ?? 'document'}.${note ? ` ${note}` : ''}`,
        data: { screen: 'supplier_profile' },
      });
    }
    res.json(ok({ documents: profile.kycDocuments.filter((d) => d.publicId).map(summary) }));
  } catch (err) { next(err); }
}

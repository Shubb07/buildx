// Quick add (owner request 2026-11-20, "like a laundry app"): a seller picks a category and sees
// Sthiva's standard items as one list, each with a price box and a stock stepper, and saves many
// listings in one go instead of filling one long form per product.
//
// A new listing takes its name, brand, unit, category, GST rate, photos and description from the
// Sthiva catalogue item, so every seller's listing of an item stays comparable. The seller can add
// their own photos, bulk prices and details later on the full product form. An item they already
// list just gets the new price and stock. Everything is saved together or not at all.

import { Request, Response, NextFunction } from 'express';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { CatalogItem } from '../../infrastructure/database/models/CatalogItem.model';
import { Category } from '../../infrastructure/database/models/Category.model';
import { Product } from '../../infrastructure/database/models/Product.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';

export const MAX_QUICK_ITEMS = 100;

export const quickAddSchema = z.object({
  // Are the prices typed including GST? Sellers usually quote shop prices with GST.
  isGstInclusive: z.boolean().default(true),
  items: z.array(z.object({
    catalogItemId: z.string().refine((v) => isValidObjectId(v), 'Invalid item'),
    price: z.number().positive('Price must be more than 0').max(10_000_000),
    stock: z.number().int('Stock must be a whole number').min(0).max(10_000_000),
  }).strict()).min(1, 'Add a price to at least one item').max(MAX_QUICK_ITEMS)
    .refine((items) => new Set(items.map((i) => i.catalogItemId)).size === items.length, 'Each item can appear once'),
}).strict();

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function profileFor(userId: string) {
  const p = await SupplierProfile.findOne({ userId }).select('_id categories').lean();
  if (!p) throw AppError.notFound('Supplier profile');
  return p;
}

// GET /suppliers/me/quick-add?category=<slug>
// Categories (the seller's own first) and, for the chosen one, every active item with the seller's
// current listing of it, if any.
export async function quickAddList(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileFor(req.auth!.userId);
    const counts = await CatalogItem.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: '$categoryId', n: { $sum: 1 } } },
    ]);
    const cats = await Category.find({ _id: { $in: counts.map((c) => c._id) } }).select('name slug').lean();
    const mine = new Set(profile.categories ?? []);
    const categories = cats
      .map((c) => ({ _id: String(c._id), name: c.name, slug: c.slug, items: counts.find((x) => x._id.equals(c._id))?.n ?? 0, yours: mine.has(c.slug) }))
      .sort((a, b) => Number(b.yours) - Number(a.yours) || a.name.localeCompare(b.name));

    const wanted = String(req.query.category ?? '') || categories[0]?.slug;
    const category = categories.find((c) => c.slug === wanted) ?? null;
    let items: unknown[] = [];
    if (category) {
      const list = await CatalogItem.find({ categoryId: category._id, status: 'ACTIVE' })
        .select('name brand unit images gstRate weightKgPerUnit').sort({ brand: 1, name: 1 }).limit(300).lean();
      const listings = await Product.find({ supplierId: profile._id, catalogItemId: { $in: list.map((i) => i._id) }, status: { $ne: 'DISCONTINUED' } })
        .select('catalogItemId basePrice stockQuantity status isGstInclusive supply').lean();
      const byItem = new Map(listings.map((l) => [String(l.catalogItemId), l]));
      items = list.map((i) => {
        const l = byItem.get(String(i._id));
        return {
          _id: String(i._id), name: i.name, brand: i.brand, unit: i.unit, gstRate: i.gstRate,
          weightKgPerUnit: i.weightKgPerUnit, image: i.images?.[0]?.url,
          mine: l ? { productId: String(l._id), price: l.basePrice, stock: l.stockQuantity, status: l.status, isGstInclusive: l.isGstInclusive, onOrder: l.supply === 'ON_ORDER' } : null,
        };
      });
    }
    res.json(ok({ categories, category: category?.slug ?? null, items }));
  } catch (err) { next(err); }
}

// POST /suppliers/me/quick-add { isGstInclusive, items: [{ catalogItemId, price, stock }] }
export async function quickAddSave(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await profileFor(req.auth!.userId);
    const { isGstInclusive, items } = req.body as z.infer<typeof quickAddSchema>;
    const catalog = await CatalogItem.find({ _id: { $in: items.map((i) => i.catalogItemId) }, status: 'ACTIVE' }).lean();
    const byId = new Map(catalog.map((c) => [String(c._id), c]));
    const missing = items.find((i) => !byId.has(i.catalogItemId));
    if (missing) throw AppError.badRequest('One of the items is no longer in the Sthiva catalogue. Reload the list.');

    const now = new Date();
    let created = 0;
    let updated = 0;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        created = 0; updated = 0;
        for (const it of items) {
          const item = byId.get(it.catalogItemId)!;
          // One listing per item per seller (even a discontinued one): reuse it
          const existing = await Product.findOne({ supplierId: profile._id, catalogItemId: item._id })
            .select('status supply').session(session).lean();
          if (existing) {
            // Same rules as editing: ON_ORDER keeps its stock; stock decides live vs out of stock
            const set: Record<string, unknown> = { basePrice: it.price, isGstInclusive };
            if (existing.supply !== 'ON_ORDER') {
              set.stockQuantity = it.stock;
              if (it.stock <= 0 && existing.status === 'ACTIVE') set.status = 'OUT_OF_STOCK';
              if (it.stock > 0 && existing.status === 'OUT_OF_STOCK') set.status = 'ACTIVE';
            }
            // A discontinued listing or a draft comes back on sale; a paused one (INACTIVE) stays paused
            if (existing.status === 'DISCONTINUED' || existing.status === 'DRAFT') {
              set.status = existing.supply === 'ON_ORDER' || it.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';
            }
            set.availabilityConfirmedAt = now;
            await Product.updateOne({ _id: existing._id }, { $set: set }, { session, runValidators: true });
            updated++;
          } else {
            let slug = slugify(`${item.brand ? `${item.brand} ` : ''}${item.name}`) || 'item';
            for (let n = 1; await Product.exists({ slug }).session(session); n++) slug = `${slugify(item.name)}-${n}`;
            await Product.create([{
              supplierId: profile._id,
              catalogItemId: item._id,
              categoryId: item.categoryId,
              name: item.name,
              slug,
              description: item.description?.trim() || [item.brand, item.name].filter(Boolean).join(' '),
              unit: item.unit,
              basePrice: it.price,
              gstRate: item.gstRate ?? 18,
              isGstInclusive,
              stockQuantity: it.stock,
              minOrderQuantity: 1,
              deliveryDays: 2,
              supply: 'IN_STOCK',
              specifications: { ...(item.specifications ?? {}), ...(item.brand ? { Brand: item.brand } : {}) },
              images: (item.images ?? []).map((img, i) => ({ url: img.url, publicId: img.publicId, altText: img.altText, isPrimary: i === 0, sortOrder: i })),
              status: it.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
              availabilityConfirmedAt: now,
            }], { session });
            created++;
          }
        }
      });
    } finally {
      await session.endSession();
    }
    logger.info('[quick-add] saved', { supplierId: String(profile._id), created, updated });
    res.json(ok({ created, updated }));
  } catch (err) { next(err); }
}

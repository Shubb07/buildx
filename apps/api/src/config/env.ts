import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Hosting platforms (Render, Railway, Cloud Run) provide PORT; API_PORT overrides it
  API_PORT: z.coerce.number().default(Number(process.env.PORT) || 4000),
  API_VERSION: z.string().default('v1'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Firebase Admin SDK — optional when using Application Default Credentials (gcloud auth application-default login)
  FIREBASE_PROJECT_ID: z.string().optional().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(''),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(''),

  // Cloudinary — required in production, optional for local dev
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),

  // Razorpay — required in production, optional for local dev
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

  // WhatsApp order alerts through Meta's WhatsApp Cloud API (owner decision 2026-11-18: Meta directly).
  // Off unless WHATSAPP_ENABLED=true and the token and phone number ID are set. See docs/WHATSAPP.md.
  WHATSAPP_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  WHATSAPP_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_GRAPH_VERSION: z.string().default('v23.0'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),

  // Anthropic — optional, AI chat disabled if not set
  ANTHROPIC_API_KEY: z.string().default(''),

  // Google Maps
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Compatibility switch: while older mobile builds (which send no PIN code) are in use, orders
  // without a delivery PIN are accepted and flagged for ops. Set to "true" to require a PIN.
  ORDERS_REQUIRE_DELIVERY_PINCODE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  // Encrypts seller payout accounts (shared/secret-box.ts): 32 random bytes, base64. Without it
  // sellers cannot save payout details and Sthiva cannot mark supplier payouts paid.
  PAYOUT_ENCRYPTION_KEY: z.string().default('').refine(
    (v) => !v || Buffer.from(v, 'base64').length === 32,
    'PAYOUT_ENCRYPTION_KEY must be 32 random bytes in base64'
  ),

  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  API_RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// In production, sign-in needs the Firebase service account. Without it firebase-admin falls back
// to default credentials that hosts like Render don't have, so the API would start and then reject
// every login. Fail the deploy instead.
if (parsed.data.NODE_ENV === 'production') {
  const missing = (['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'] as const).filter(
    (key) => !parsed.data[key]
  );
  if (missing.length > 0) {
    console.error(`Missing required production environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

export const env = parsed.data;
export type Env = typeof env;
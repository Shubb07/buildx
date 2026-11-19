// Runs before each test file's imports, so src/config/env.ts parses these values.
// No real credentials: Firebase, FCM and Anthropic are mocked in test/helpers.ts,
// and MongoDB is an in-memory server started per test file.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder-overridden-by-memory-server';
process.env.API_RATE_LIMIT_MAX = '100000';
process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
// Fixed test key for payout account encryption (shared/secret-box.ts); not used anywhere real
process.env.PAYOUT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
// Fake Razorpay test keys (shared/services/razorpay.ts); tests replace the HTTP calls with a stub
process.env.RAZORPAY_KEY_ID = 'rzp_test_notreal';
process.env.RAZORPAY_KEY_SECRET = 'test-secret-not-real';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';

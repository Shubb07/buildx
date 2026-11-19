# Sthiva (formerly BuildX) session log

Live memory for Claude sessions. Read this first. Newest entries at the bottom of the timeline.
Times are IST.

## CURRENT STATE (2026-11-20 IST)
- Brand **Sthiva**. Live: shop https://sthiva.com, sellers https://seller.sthiva.com, ops https://ops.sthiva.com,
  API https://api.sthiva.com (Render). DNS at Cloudflare. support@sthiva.com routes to the owner's Gmail.
- Launch city is **Chitradurga** (not Tumakuru). Location changes in code are PAUSED until the owner picks the exact
  area (then: launch PINs, area price pages = market-study step 8, pitch deck + technical PDFs).
- WEBSITES ONLY until the owner says otherwise: no mobile app / APK / OTA work.
- Built and merged on 19-20 Nov: seller payout account (encrypted, PAYOUT_ENCRYPTION_KEY on Render), Zomato-style
  order alerts, pause single products, optional delivery slots, go-live checklist + seller agreement, quick add,
  warranty + reviews, market-study steps 1-7 (sizes on one page, order by list, split orders, board prices,
  bulk quotes, made to measure, returns per product), product page guidance, Report a problem (#129).
- Vercel Hobby build limit was hit on 19 Nov (too many preview builds): the websites stopped at #125 while the API
  has everything. Fix: preview builds off (vercel.json git.deploymentEnabled + production-only ignoreCommand).
- No real sellers or products yet. Seller agreement, refunds and returns pages need a lawyer/CA review before
  real sellers and buyers rely on them.
- Docs: Execution plan https://claude.ai/artifact/LZrL8BeG3MUa4pPQdjBre4 · Marketing plan + Meta ads playbook
  https://claude.ai/artifact/DdJ7uHqit36Xz5KLmFGDjN · Market study https://claude.ai/artifact/8cyNnKtSeu9BRhcEMb7MZt

## NEXT STEPS
0. (Claude) Make sure all three websites are live on the latest main (Vercel redeploy if a build was rate limited;
   untick "Use project's Ignore Build Step"). Then check the new pages on the live sites.
Waiting on the owner:
1. Exact launch area in Chitradurga (unblocks area pages, launch PINs, PDFs).
2. Sign the first real sellers on seller.sthiva.com; verify their documents in ops.
3. Ops Settings: commission per category, answer times, driver share, vehicles; support phone.
4. Lawyer/CA review of the seller agreement, refunds and returns pages.
5. Cloudflare keep-alive cron (see 2026-11-07 notes), Vultr server, Vercel 2FA, new MongoDB credentials.

## DOMAIN PLAN: sthiva.com (brand renamed BuildX -> Sthiva on 2026-11-05)
BOUGHT 2026-11-05 on Cloudflare Registrar (account harishrs21082006, nameservers jillian/sean.ns.cloudflare.com).
CONNECTED 2026-11-05 ~17:30 IST (see timeline). Remaining: web NEXT_PUBLIC_API_URL still onrender (editing a Vercel
var needs an emailed code: user can switch it to https://api.sthiva.com), ALLOW_INDEXING after launch details.
Original plan:
1. Vercel (Claude in Chrome): sthiva.com + www.sthiva.com -> buyer project (buildx-vgud),
   seller.sthiva.com -> seller project (buildx-48kc), ops.sthiva.com -> ops project (buildx-ops).
2. Render: custom domain api.sthiva.com on the API service (free plan allows it).
3. DNS at the user's registrar: records Vercel and Render show (A/CNAME). Keep the old *.vercel.app URLs working.
4. Env: buyer NEXT_PUBLIC_SITE_URL=https://sthiva.com, NEXT_PUBLIC_SELLER_PORTAL_URL=https://seller.sthiva.com,
   NEXT_PUBLIC_ALLOW_INDEXING=true; all web apps NEXT_PUBLIC_API_URL=https://api.sthiva.com; API FRONTEND_URL add
   the three new origins (keep old ones). Mobile: EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WEB_URL in the next APK.
   keep-api-awake.yml can keep pinging onrender.com.
5. DONE already: Firebase Auth authorized domains include sthiva.com, www., seller., ops. (2026-11-05).

## RULES (also in ~/.claude/CLAUDE.md and buildx/CLAUDE.md)
- No Claude co-author / contributor lines, ever.
- No em dashes in UI copy. No fabricated data (PRD).

## TIMELINE
### 2026-10-28
- 15:10 Session start. Read PRD, repo, deployed site (buildx-vgud.vercel.app = apps/buyer-web).
- 15:14 Local `main` had diverged old commits; saved as branch `backup/local-main-old`, created
  `feat/web-redesign` from origin/main.
- 15:15 Contributors check: origin/main has 0 Claude trailers; GitHub API contributors = Harishrs2006, Shubb07.
  Sidebar "claude" entry is a stale cache that refreshes after the next push to main. No history rewrite needed.
- 15:16 Saved global rules: ~/.claude/CLAUDE.md, ~/.claude/settings.json (includeCoAuthoredBy=false,
  attribution empty), Claude memory files, Desktop/BuildX/CLAUDE.md, buildx/CLAUDE.md.
- 15:20 Cloned to ~/tools: ui-ux-pro-max-skill, VoiceStudio, OmniVoice, Handy. Installed into ~/.claude/skills:
  ui-ux-pro-max (+ design, design-system, brand, banner-design, slides, ui-styling), voicestudio,
  omnivoice + handy (reference skills; those two are apps/models, not Claude skills).
- 15:22 User reference images saved to docs/design-references/ (local only, pending approval, excluded via .git/info/exclude).
- 15:25 User asked: rebuild site from scratch, trillion-dollar UI/UX, excellent animations, update deployed link.
- 15:28 Design system "Hi-Vis": ink #0B0C0A, sand #F2EFE7, signal lime #C8FF3D, cobalt #2457FF. Fonts (all OFL via
  next/font): Bricolage Grotesque (display), Geist (UI), Geist Mono (labels), Instrument Serif italic (accents).
  NOTE: Fontshare fonts (Switzer/Clash) rejected: their licence forbids distribution via a repository (public repo).
- 15:35 Built: tailwind tokens (old Material names remapped), globals.css motion, Logo (two crossing beams), Reveal/SplitLines/
  Spotlight motion, Header (dark-over-hero glass), BottomNav (mobile pill), SiteFooter, CategoryGrid, HeroVisual (isometric SVG stack),
  landing page (hero, marquee, PIN check via web-core LocationSelector, categories, how it works, principles, suppliers, CTA).
- 15:45 Sign-in rebuilt: split AuthShell, +91 phone field, 6-box OTP (paste/SMS autofill/auto-submit), 30s resend, change number
  (AuthProvider.resetOtp), safeNext() open-redirect guard. Onboarding with 18+ and terms consent.
- 15:46 Saved user brief + 21 images + links to Desktop/BuildX/user-brief/ (and docs/USER_BRIEF.md in repo).
- 16:00 Added: /search, /terms, /privacy, /refunds, /cookies (honest, match real data flows), StorageNotice, custom 404,
  robots.ts (noindex until NEXT_PUBLIC_ALLOW_INDEXING=true), sitemap.ts, icon.svg, opengraph-image, security headers in
  next.config.ts (CSP intentionally deferred: would break Firebase reCAPTCHA). `npm run build` passes (19 routes).
- 16:05 Found: Vercel git integration (team buildx9, projects buildx-vgud/buildx/buildx-48kc) deploys main; previews are
  login protected. Live API = https://buildx-api.onrender.com. Live bundle has no Firebase web config (sign-in broken in prod).
- 16:15 Screenshot QA: fixed logo tile invisible on dark (LogoMark onDark), mobile horizontal overflow (grid minmax(0,1fr) +
  overflow-x clip), hero capped at min(100svh,980px), hero blocks rebuilt as a clean stacked tower.
- 16:35 CDP screenshot script (scratchpad/shot.mjs) for true mobile widths; mobile has no overflow. Reveal now also
  shows elements already scrolled past. Storage notice hidden on /signin and /onboard. Em dashes removed from inner pages.
  New ProductListCard, category page header/skeletons/footer, product page footer, alt text on product images.
  docs/DESIGN_SYSTEM.md written (web + Expo mapping). Build passes.
- 16:40 User: full autonomy (deploy, env keys, auth via Claude in Chrome extension). Saved globally + memory.
- 16:20 Saved global prefs: decide technical things myself; questions need (Recommended) + chat option; commit+push after
  every sub-task because usage limits / shutdowns can cut a session; "continue" = read log and resume.
- 16:50 PR #25 opened, all CI + Vercel checks green, squash-merged to main (author Harish R S, no Claude trailer).
- 16:55 Verified live: new title, security headers, /privacy 200, custom 404, categories load from production API,
  mobile layout OK. Contributors widget should drop "claude" now that main has a fresh push (API already clean).
- 17:00 Claude in Chrome tools unavailable in this session. Private backup repo upload denied by permission classifier.
- 17:10 User decision: keep PRD + reference images local in Desktop/BuildX/user-brief (consolidated there, incl. PRD and Stitch zip).
- 17:30 User: product cards had no photos. Image sites unreachable from this machine, so drew 12 original isometric
  material illustrations (apps/buyer-web/public/illustrations/*.svg, generator scripts/generate-illustrations.py). lib/illustrations.ts
  maps product name/category to one; shown with an 'Illustration' label on cards, product page and cart when no supplier photo.
- 17:45 PR #26 merged (4faa314), live: category pages show labelled illustrations. TODO: product/supplier names in the
  production DB (seed data) contain em dashes, e.g. 'BuildX Demo Supplier (placeholder — not a real business)'; fix in
  apps/api/src/scripts/seed.ts and the live DB. Next session: Firebase keys in Vercel (needs /chrome).
- 18:00 User ran /chrome; extension installed + signed in, but browser tools still not loaded in this session. Fix: restart
  Claude Code with `claude --chrome` in Desktop/BuildX, then say 'continue'. FIRST TASK THEN: Firebase web keys into Vercel
  buildx-vgud env (Production) + add buildx-vgud.vercel.app to Firebase Auth authorized domains + redeploy + test OTP screen.
- 18:15 New session with `claude --chrome`, browser tools work. Firebase had no web app: registered 'BuildX Web'.
  Phone provider already enabled (Spark plan: 10 SMS/day). Added buildx-vgud.vercel.app to authorized domains via the
  Identity Toolkit admin API (service-account script in scratchpad; console form rejected the input). Added the 4
  NEXT_PUBLIC_FIREBASE_* vars to Vercel Production. Vercel asked to set up 2FA (skipped; user may want to enable it) and
  manual redeploy needs an email code, so pushed this log to main to trigger the production build.
- 18:30 Production build with Firebase config is live (key found in bundle). /signin works, reCAPTCHA loads.
  Next: real-phone OTP test by the user, then NEXT STEPS 4 (restyle cart/checkout/orders/profile).
- 18:45 User: OTP not arriving, page said 'Something went wrong'. Ran the same Firebase call in the live page: error is
  auth/billing-not-enabled (Spark plan cannot send real SMS; console '10/day' banner is misleading). Test numbers
  +917019282018/19 (code 123456) are configured in Firebase and skip SMS. Mapped billing-not-enabled + quota-exceeded to
  a clear message in buyer-web and seller-web AuthProvider. Asked user about upgrading to Blaze (money: user decides).
- 18:50 User chose: test numbers only for now, no Blaze yet. Next: NEXT STEPS 4 (restyle cart/checkout/orders/profile).
- 19:20 Restyled cart/checkout/orders/order detail/profile on branch feat/buyer-pages-restyle. Build passes, mobile cart
  390px no overflow (scratchpad/shot.mjs recreated: node shot.mjs <url> <w> <h> <out> [full] [localStorageJSON]).
- 19:40 User: test number + 123456 does not sign in. Render logs: POST /auth/sync -> 'secretOrPrivateKey must be an
  asymmetric key when using RS256'. Render FIREBASE_PRIVATE_KEY (project buildx-15494, correct) is wrapped in a quote
  and has stray text after the END line ('"whi'). Fix on branch fix/api-firebase-key: normalizePrivateKey() keeps only the
  PEM block (+ vitest). PR #27 merged by user; this fix needs the user to merge (auto-merge blocked by permission
  classifier). Render deploys main automatically.
- 19:55 User merged PR #27 (buyer pages live). Resolved SESSION_LOG conflict on PR #28 for the user to merge.
- 20:10 User merged PR #28: sign-in with test number works. Onboarding showed 'Could not complete onboarding': API
  /auth/onboard reply had no `phone`, web syncedUserSchema requires it, so a successful save was shown as an error (the
  user IS onboarded server-side). Fix: PR fix/onboard-response adds phone to the reply + test. Needs user merge.
- 21:30 User asked for a Zomato-style cinematic landing with a scroll-driven construction story (trucks, concrete,
  bricks, tiles, paint, electrical lights, luxury bathroom plumbing, skyline), 3D/WebGL/shader effects. Saved refs to
  user-brief (landing-ref-1..4.png). Stock video unreachable (pexels 403) -> built an ORIGINAL real-time 3D site in
  three.js/R3F: components/cinematic/ (chapters.ts, motionTier.ts, useChapterScroll.ts [Lenis + idle rAF],
  CinematicLanding.tsx, SiteScene.tsx, scene/World|Stations|parts|shaders). Chapter buttons link only to categories
  returned by GET /categories. Tiers: full (desktop WebGL), lite (phones: rendered WebP posters with CSS 3D
  crossfade), static (reduced motion). 18 posters in public/cinematic (rendered from the scene). Header gets
  darkUntilId. Removed HeroVisual/Spotlight. Vitest added to buyer-web (10 tests). ASSETS.md written.
  Lighthouse mobile (simulated, like PageSpeed): 84 perf / 96 a11y / 96 best practices, CLS 0.011, LCP 3.5 s
  (live baseline with old landing: 55, LCP 16.5 s). Devtools-throttled run: 56. Desktop preset run fails with
  NO_NAVSTART in headless (WebGL), not measured. SEO 66 is the intentional noindex.
- 22:40 User: 3D workers look "AI"/toy-like, wants real photographic scenes (refs photo-ref-1..3 in user-brief).
  Removed the three.js/R3F scene + deps + 3D posters. Generated 5 photoreal images with Canva AI (hero site at golden
  hour, steel truck at gate, concrete pour, brick toss, tile laying), exported full-size via Canva design export
  (Open in editor -> export-design jpg 1680x944) into apps/buyer-web/public/cinematic. Canva quota exceeded for paint,
  electrical, plumbing, skyline: those chapters auto-hide until photo exists (chapters.ts filters on photo).
  New PhotoStage.tsx: raw WebGL1 shader (cover crop + focus, scroll push-in, pointer parallax, fbm liquid dissolve,
  lime seam). Phones: next/image photos with CSS 3D crossfade. Bug fixed: loseContext in effect cleanup broke React
  Strict Mode remount. Tests 12 pass. Lighthouse mobile: simulated 62-65 (lantern cannot find LCP element, observed
  LCP 0.77 s), devtools-throttled 78 (LCP 3.5 s, CLS 0.022), accessibility 100.
- 23:00 User showed PR #30 merged 2 h ago (3D version live); photo commits came after. Opened feat/photo-landing
  from main with the photo version (identical tree) as a new PR.
- 23:30 User: "try those image things other ways". Figma generate_image (gemini-3.1-flash-image, Starter plan) worked:
  paint, electrical, plumbing, skyline at 1376x768, converted to JPG with sharp. Plumbing image had a hotel-style crest +
  name badge on the uniform: painted out (ring-sampled navy fill, feathered). Branch feat/landing-all-chapters switches
  on all 4 chapters; ASSETS.md lists sources. Tests 12 pass, build OK.
- 23:10 User: PIN check belongs on product info; images for category cards; complete Indian-market catalogue (bricks,
  blocks, jelly sizes, M/P-sand in tonnes/brass, electrical + plumbing materials with brands like V-Guard, Lisha...).
  Branch feat/catalog, PR #33: 10 category photos (Figma AI, unbranded) in public/categories; lib/catalog (57 material
  types, BIS standards, sizes, trade units, brands, aliases; NO prices/stock); units.ts (brass=100 cft=2.83 m3, TMT
  D^2/162, bags, coils); /materials/[id] pages with choices, brand chips, QuantityHelper, DeliveryCheck, offers that
  really match (matchCatalogItem on real listing names); category page = banner + catalogue + live listings; product
  page rebuilt with PIN check in the buy box (add to cart blocked when not deliverable); home PIN block removed.
  Facts checked online (brass, TMT weight, 90 m coils, brick/AAC sizes). Removed brands I could not verify.
  Note: another local Claude session ("E-commerce codebase health audit") committed ddef1fd in this folder; it has
  moved to its own worktree (Desktop/BuildX/readme-update) and is updating README + this log in a separate PR.
  Preview can't call the live API (CORS allows production only), so product/offers were checked by tests only.
- 23:15 PR #33 (catalogue) merged and live; verified M-sand material page shows only the real M-sand listing.
  Live PIN checks were ALL failing: GET /locations/pincode/:pin -> 503 LOOKUP_UNAVAILABLE because the India Post
  directory had never been imported into production (cluster0.xkcruay, db buildx; same cluster as apps/api/.env).
  With user approval: downloaded the GODL-licensed mirror (ndp.ckan.civicdatalab.in, pincode_30052019.csv, 16 MB;
  official data.gov.in download needs a CAPTCHA form), dry run OK, then imported:
  155,525 offices / 19,252 PINs, version "2019-05" active. Verified: 572101 serviceable (1 supplier), 560001 NO_SUPPLIERS,
  product page shows "Delivers to 572101". TODO: import a current monthly file from data.gov.in when the user downloads
  it (npm run import-postal --workspace=apps/api -- --file <csv> --version YYYY-MM --yes); PINs created after 2019
  currently return not found. Em dashes: see 23:30 entry.
- 23:30 Em dashes in data: seed.ts strings fixed (18 lines). New script apps/api/src/scripts/fix-dashes.ts
  (npm run fix-dashes --workspace=apps/api -- --dry-run | --yes) with test. Dry run on production: 4 fields
  (supplier "placeholder, not a real business", 1 product name, 2 descriptions). Writing to the live DB was blocked by
  the permission classifier: USER must run `npm run fix-dashes --workspace=apps/api -- --yes` (or approve it).
### 2026-10-29
- 00:30 Supplier portal redesign (branch feat/seller-hivis): catalogue moved to packages/web-core/src/catalog (shared by
  buyer + seller; buyer imports from @buildx/web-core; new helpers suggestedListingUnit / suggestedListingName; matcher
  also matches the material name). Test: every one of the 57 items round-trips choices -> name -> same item.
  seller-web: buyer tokens/fonts/globals, Logo, components/ui.tsx (PageHead, Chip, Pill, Pager, EmptyState),
  dark top bar + floating pill tab bar, Overview (greeting, verification banner, live stats, new-orders list, quick
  actions), Orders (cards, tel link, in-page cancel confirm, inline errors, no alert/confirm), Products (rows, in-page
  discontinue confirm), ProductForm rebuilt around the catalogue (category -> material -> options/brand -> auto name with
  "buyers will find this" check -> price/unit/stock/MOQ/delivery days -> photos; sticky save bar), sign-in with 6-box OTP,
  resend timer and Change number (resetOtp added), onboarding on the split AuthShell. lib/categoryTemplates.ts removed.
  Friendly sign-in config error (dev detail goes to console). Signed-in screens verified by type-check + build only.
- 01:20 Vercel Hobby build-rate-limit hit (3 projects build per push: buildx, buildx-48kc, buildx-vgud). Offered to
  disconnect the 2 likely-duplicate projects (needs user OK). PR #37 merged by user.
- 01:40 Mobile pass 1 (feat/mobile-hivis): read apps/mobile AGENTS.md (Expo v56 docs first). colors.ts remapped to
  Hi-Vis (same keys + brand names) so all 37 screens re-skin; src/components/ui.tsx (TabItem/tabBarStyle, Button, Card,
  Eyebrow, Pill, type); 4 role tab bars: ink bar + lime active pill, emoji icons removed (no icon lib installed; adding
  @expo/vector-icons/expo-font needs a native rebuild, so not done). Auth phone + OTP rebuilt (dark brand panel, inline
  errors, SMS autofill oneTimeCode/sms-otp). Buyer home: real categories via new useCategories (old hard-coded slugs
  like 'materials'/'services' did not exist), category photos from the web app, removed invented "HEAVY MACHINERY
  RENTALS NOW OPEN in Tumakuru" promo. app.json splash/icon bg -> ink (applies on next native build).
  tsc: only the 2 pre-existing typed-route errors in app/_layout.tsx (same on main locally; CI passes).
- 02:30 User: landing images should move ("works doing"), change automatically, and NOT change on touch/scroll;
  must run smoothly. Branch feat/hero-slideshow: replaced the scroll-pinned story + WebGL PhotoStage + Lenis with
  components/cinematic/HeroSlideshow.tsx: full-screen, timer-driven (the progress bar's CSS animation is the clock),
  Ken Burns push-in towards each photo's focus point, 1.4 s crossfade, next photo preloaded and required before
  switching, pauses when off-screen / tab hidden / user presses pause, reduced motion = one still photo, no controls.
  Removed CinematicLanding, PhotoStage, useChapterScroll, motionTier, lenis. Measured (scratchpad perf.mjs, headless
  Chrome, 20 s): desktop 60 fps, 0 frames >33 ms, no long tasks, CLS 0.002; phone 390px with 4x CPU throttle 59.8 fps,
  1 frame >33 ms, no long tasks; slide every ~6.5 s; scroll/click/touch never changed the slide.
  Real worker motion needs AI video (Figma Weave not linked to the user's account), so camera motion only for now.
- 07:29 Supplier onboarding UI on feat/supplier-onboarding: app/(dashboard)/setup (3-step wizard using lib/setup.ts),
  products/new gated on isSetupComplete, ProductForm brands = supplier's brands that make the material (else all),
  new /stock page (+/- and input per product, save via PATCH stockQuantity, server flips ACTIVE/OUT_OF_STOCK),
  nav tabs Stock + Business, Overview banner 'Finish your business setup (n of 3 done)'. docs/BACKEND.md written.
  seller-web tsc + next build clean; API tests 265 pass (backend commit 0286061).
- 16:28 PR #40 merged. Branch feat/admin-panel: apps/web rebuilt (old Clerk shell removed) as the ops console on
  Firebase OTP, OPERATOR/ADMIN only: Today (status counts + 6 stuck-order queues), Suppliers (verify/reject with
  reason, shows type/GSTIN/address/PINs/categories/brands), Orders (filter, search, detail with assign/unassign
  driver, record COD, cancel with restock choice, notes, history), Drivers. tsc + next build clean.
- New official logo from the user (house roof + BUILDX + grey X, tagline EXCELLENCE IN BUILDING), redrawn as SVG in
  packages/web-core/src/brand/BuildXLogo.tsx (BuildXLogo, BuildXMark). Used in all 3 sites' Logo.tsx, buyer hero
  (with tagline), footer, and app/icon.svg tab icons. Screenshots checked at 1440 and 390 px.
- 16:51 Ops console hosting: Vercel import form filled (project buildx-ops, root apps/web, Next.js, env
  NEXT_PUBLIC_API_URL=https://buildx-api.onrender.com + 4 NEXT_PUBLIC_FIREBASE_* copied from the live seller bundle);
  Deploy blocked by Vercel email-code re-auth (user must do it). buildx-ops.vercel.app ADDED to Firebase authorized
  domains. BLOCKED: Render FRONTEND_URL must add https://buildx-ops.vercel.app (CORS test: not allowed yet); Render
  not signed in on Chrome. Admin phone number for grant-role still needed from user (never use a test number:
  fixed code 123456 = anyone could sign in as admin).
- 13:42 User said 'run this': ran fix-dashes on prod (cluster0.xkcruay/buildx). Dry run showed 4 fields (3 products,
  1 demo supplier name); applied with --yes; re-check finds 0 em dashes. DONE.
- 16:59 Vercel project buildx-ops created by user (re-auth done). PR #42 SESSION_LOG conflict fixed by merging main.
  User chose +917019282018 as ADMIN (was BUYER, 0 orders): grant-role done. Because it is a Firebase test number,
  its fixed code was changed from 123456 to a private random code (Identity Toolkit testPhoneNumbers), stored ONLY in
  Desktop/BuildX/buildx-secrets/ADMIN_SIGNIN.txt (outside the repo). +917019282019 keeps 123456 for buyer/supplier tests.
  Still pending: Render FRONTEND_URL += https://buildx-ops.vercel.app (user must sign in to Render), merge #42.
- 2026-10-30 19:16 User: console sign-in stuck on 'Sending code'. Cause: after 'Change number' / 'Resend', all 3
  AuthProviders reused the used invisible RecaptchaVerifier, so signInWithPhoneNumber never settled. Fix (branch
  fix/otp-resend-hang): fresh verifier in a fresh element per send + 45 s timeout with a clear message, in buyer-web,
  seller-web and web. Tested on localhost console with +917019282019: send, Change number, send again -> both reach
  the code step. Note: a first send takes ~10 s (Firebase falls back from reCAPTCHA Enterprise to v2).
- 17:06 PR #42 merged. Render signed in via Google (harishrs21082006@gmail.com); buildx-api FRONTEND_URL is now
  vgud,48kc,ops (saved + redeployed). Verified: CORS allows all 3 origins; buildx-ops.vercel.app serves the new console.
  Admin signs in with +917019282018 and the private code in buildx-secrets/ADMIN_SIGNIN.txt (not tested by me: I do not
  enter credentials on production). Next: mobile pass 2 / new logo in app (native rebuild, ask), real SMS (Blaze, ask).
- 2026-10-30 20:43 User: seller website UX must be 10/10 for listing and updating products (auth parked).
  Branch feat/seller-ux (based on fix/otp-resend-hang, so PR #44 should merge first). API: product create/edit now
  Zod-validated (GST slab 0/5/12/18/28, whole stock, bulk tiers rule in features/suppliers/product-rules.ts, max 8
  photos, strict keys); create with stock 0 = OUT_OF_STOCK, DRAFT allowed; isGstInclusive/bulkPricing/lowStockAlert
  editable; create/edit responses populate categoryId (web schema needed it: saves used to error after succeeding);
  list supports q= and lowStock=1. 280 tests pass. Seller web: ProductForm rewrite (GST rate + included/on-top switch
  with live breakdown, bulk prices editor, low-stock level, live buyer preview, missing-items bar, Save draft,
  unsaved-changes guard, ?from= 'list another size', own categories first/preselected); products page (saved banner +
  List another size, search, Running low/Paused filters, inline Price & stock, Pause/Resume); stock page (+10/+50/+100,
  Save all, Undo, low-stock by lowStockAlert, search); setup PINs add the valid ones and keep refused ones; plurals.
  Tested end to end on localhost with an in-memory DB sandbox (test number 7019282019, nothing written to prod).
  Not visually checked at phone width (Chrome window would not resize).
- 2026-10-30 21:14 PR #45 merged (seller listing/stock UX; #44 closed as included). Branch feat/seller-orders:
  seller Orders page rebuilt around next actions (To dispatch, Cash to confirm, With BuildX driver, On the way,
  Delivered, Cancelled). Fixes: 'New'/PENDING never used (orders start CONFIRMED) so New tab + overview 'Needs your
  action' were always empty; own-vehicle COD had no confirm button (POST /me/orders/:id/cod now in UI with confirm);
  status PATCH returns bare buyerId so every action showed an error after succeeding (schema accepts id); take over a
  READY_FOR_PICKUP order with no driver; cancel needs a reason; delivered needs confirmation; PIN/district, call and
  WhatsApp buttons. API: orders list accepts status=A,B and cashPending=1. Also restored line endings flipped by my
  Windows python edits in #45 (open(...,'w') writes CRLF: always pass newline=''). 281 tests pass. Tested on a local
  in-memory sandbox seeded with demo orders.
- 2026-10-31 00:55 IST: #46 merged by user. Verified: Vercel buildx-48kc/vgud/ops production deploys succeeded, seller
  /orders returns 200, API /health ok and /suppliers/me/orders answers 401 without a token. Seller website flow is
  complete (setup, listing, stock, orders to cash collected). Next: wait for user (auth/SMS and mobile pass 2 parked).
- 2026-10-31 01:35 IST: User chose free Google sign-in for the seller website (SMS needs Blaze). Enabled the Google
  provider in Firebase (public name BuildX). API: accepts verified-phone OR Google verified-email tokens only;
  User.phone optional, new email field, partial unique indexes; server start drops the old phone_1 index. Seller
  sign-in is now "Continue with Google" (phone form behind NEXT_PUBLIC_PHONE_SIGNIN=true). 288 tests pass.
  CLAUDE.md auth rule updated. Branch feat/seller-google-signin.
- 2026-10-31 02:20 IST: Google sign-in for the BUYER website too (same pattern as seller; phone form behind
  NEXT_PUBLIC_PHONE_SIGNIN=true; checkout asks contact phone; profile shows email). Ops console shows owner email
  when there is no phone. Rule in CLAUDE.md updated. NOTE: I overwrote apps/buyer-web/.env.local by mistake and
  restored it from apps/web/.env.local (same Firebase project, API = Render). Branch feat/buyer-google-signin.
- 2026-10-31 15:55 IST: #49 merged by user; Vercel prod deploys OK. Live buyer /signin in my Chrome showed the new
  "not a buyer account" screen (session from a seller/admin account), which had no way out. Added a Sign out button
  and account-neutral copy to wrong-role screens on buyer (signin + RequireAuth) and seller (RequireSupplier).
  Firebase has 1 Google user so far. Branch fix/wrong-role-signout.
- 2026-11-04 IST: User chose NEXT STEP "mobile app Google sign-in". Branch feat/mobile-google-signin. Firebase Android
  app already had the debug keystore SHA-1 (5e8f...f625); downloaded fresh google-services.json and
  GoogleService-Info.plist via Firebase Management API with gcloud (both gitignored, local only). Added
  @react-native-google-signin/google-signin 17 (Firebase-mode config plugin), src/lib/googleAuth.ts (web client
  5ibngc...), sign-in screen: Continue with Google first, "Use mobile number instead" second (billing-not-enabled
  mapped to a clear message), sign-out also signs out of Google, profiles show email when no phone, checkout
  requires a contact phone. Needs a native rebuild (expo run:android). Claude in Chrome was not connected.
- 2026-11-04 IST: Native Android build NOT verified yet. Code typechecks. Problems hit: emulator Pixel_8 first stuck
  "offline" (fixed by cold boot -no-snapshot); Gradle could not delete build folders inside node_modules because the
  repo lives in OneDrive (cleared 22 stale Gradle build dirs, only folders next to a build.gradle). Then Claude Code
  stopped both the emulator and the clean Gradle build because the laptop ran low on memory. NEXT: when the user says
  so, run the build alone (no emulator), e.g. `cd apps/mobile/android && ./gradlew assembleDebug`, then boot the
  emulator and install; test Google sign-in + phone test number. If OneDrive locks continue, pause OneDrive sync or
  build from a copy outside OneDrive. Then open the PR.
- 2026-11-04 16:45 IST: Android build VERIFIED on emulator Pixel_8. OneDrive breaks Gradle (turns new build files into
  cloud placeholders: "not a regular file"), so build from a copy OUTSIDE OneDrive: robocopy apps/mobile to C:/bx/mobile
  (exclude android build dirs), then `cd C:/bx/mobile/android && ./gradlew assembleDebug --max-workers=2
  -PreactNativeArchitectures=x86_64`; run Metro from the real repo (`npx expo start`), `adb reverse tcp:8081 tcp:8081`.
  Emulator: use -no-snapshot (snapshot boot hangs "offline"), -memory 2048. Checked: new sign-in screen renders,
  Continue with Google opens Google's account flow (no DEVELOPER_ERROR, so client IDs + SHA-1 are right), mobile number
  option opens, a real number shows "Text message codes are not available yet..." (Android sends BILLING_NOT_ENABLED
  inside auth/internal-error, now handled). NOT checked: finishing a Google sign-in (needs the user's Google account on
  the emulator) and the checkout phone step. PR opened for the user to merge.
- 2026-11-04 18:00 IST: Emulator too heavy for this laptop (Google sign-in page stuck rendering, ~1.7 GB free). Built a
  standalone release APK for real phones instead: in C:/bx/mobile/android, `EXPO_PUBLIC_API_URL=https://buildx-api.onrender.com
  ./gradlew assembleRelease --max-workers=2 -PreactNativeArchitectures=arm64-v8a` (apps/mobile/.env points at
  10.0.2.2:4000 = emulator-local API, so the env var override matters). Verified: bundle has the live API URL and new
  sign-in screen, signed with SHA-1 5e8f...f625 (registered in Firebase). Copied to Desktop/BuildX/BuildX-test.apk
  (not in git). Waiting for the user to install it on their Android phone and try Continue with Google.
- 2026-11-04 18:12 IST: User: Google sign-in "not happening" on their phone. Firebase showed their Google account signed in
  at 18:06, so Google worked; the API /auth/sync failed (Render free host asleep, app timeout 15s) and the app stayed on
  the sign-in screen silently. Fix (pushed to PR #52): sync waits 60s and retries once, sign-in screen shows a
  "Try again" / "Use a different account" box (auth.store syncError). New APK at Desktop/BuildX/BuildX-test.apk.
  NEXT: user installs it and confirms; then user merges PR #52.
- 2026-11-04 18:30 IST: Still spinning on the user's phone (Google sign-in at 18:14, API awake). Root cause (old bug):
  AuthGate in app/_layout.tsx never navigated out of (auth) for onboarded users (every branch required !inAuth), so
  set-up accounts stayed on the sign-in screen after both Google and OTP sign-in. Fixed: route each role to its home
  whenever it is outside its group (also removed the 2 old typed-route TS errors). Reading the user's DB record was
  blocked by the permission classifier (not attempted further). New APK at Desktop/BuildX/BuildX-test.apk.
- 2026-11-04 18:40 IST: User installed the 18:17 APK: sign-in works. Updated CURRENT STATE / NEXT STEPS.
- 2026-11-04 18:45 IST: Found PR #52 was squash-merged at 17:19 before the 3 fixes; opened follow-up PR from origin/main.
- 2026-11-04 IST: Mobile pass 2 started, branch feat/mobile-hivis-2. Foundation: brand fonts (Bricolage Grotesque,
  Geist, Geist Mono, Instrument Serif italic; OFL, TTFs + licences in apps/mobile/assets/fonts, loaded in
  app/_layout.tsx via useFonts under the names in src/constants/typography.ts `Font`), @expo/vector-icons
  (MaterialCommunityIcons = Material family like the websites) and react-native-svg (needs native rebuild).
  ui.tsx: Icon, BuildXMark (real roof logo), Notice (replaces error/success Alerts), ConfirmSheet (replaces confirm
  Alerts), EmptyState, ScreenHeader, TabItem icons. Codemod: 419 StyleSheet text styles -> Font.* (fontWeight
  dropped; Android ignores custom fonts with fontWeight). npm installs need --legacy-peer-deps (old react-dom peer clash).
  Next: per-role screens (emoji -> Icon, Alert -> Notice/ConfirmSheet), then a phone test APK.
- 2026-11-04 IST: Mobile pass 2, buyer side done on feat/mobile-hivis-2: cart, checkout, orders, order detail,
  order placed, products, product detail, search, review, AI chat, buyer profile; shared Profile pieces for all 4
  roles. Fixed along the way: hard-coded "Delivery FREE" (now the server's deliveryCharge), timeline missing
  IN_TRANSIT, product min order qty ignored, "+GST" shown for GST-inclusive prices, description never shown,
  "Add anyway" for a second supplier (API refuses mixed carts: now asks to start a new cart; cart warns and blocks
  checkout when the AI assistant mixed suppliers), dead profile buttons removed, "Popular searches" -> "Try searching for".
  Next: driver (available, deliveries, order), supplier (home, orders, products, add/edit, analytics), ops
  (attention, orders, order, suppliers), onboarding role, OTP screen; then build a phone APK for the user.
- 2026-11-04 19:10 IST: Mobile pass 2 code COMPLETE on feat/mobile-hivis-2 (all pushed): supplier (home, orders with
  ChoiceSheet/ConfirmSheet, products with photos + plain status names, shared src/components/ProductForm.tsx for
  add/edit matching API rules incl. GST 0%, draft, full fields on edit via GET /suppliers/me/products/:id, sales),
  driver (pickups, deliveries, order: list now sends on-the-way/delivered/cash steps to the order screen so cash is
  always recorded; Route component), ops (suppliers, order: Notice + cancel sheet, attention), onboarding (name
  prefilled from Google, "Use a different account"), real logo on sign-in, app icons rendered from the logo vectors
  (assets/icon.png, android-icon-foreground/monochrome.png, adaptive bg sand). Zero emojis and zero Alert.alert left.
  Typecheck clean. Building a phone APK now (C:/bx/mobile, prebuild regenerated for icons/svg).
  NEXT: user installs APK and checks; open PR feat/mobile-hivis-2 for the user to merge.
- 2026-11-04 19:40 IST: Redesign APK built (PR #54 branch) and copied to Desktop/BuildX/BuildX-test.apk. Build notes:
  run gradle in the foreground (the idle-memory reaper kills background builds), skip lint
  (`-x lintVitalRelease -x lintVitalAnalyzeRelease`) and use -Xmx1536m -XX:MaxMetaspaceSize=640m (384m ran out).
  Verified: live API URL, new screens and fonts in the bundle, signed with SHA-1 5e8f...f625.
  NEXT: user installs and checks the redesign on their phone, then merges PR #54.
- 2026-11-04 21:30 IST: User merged PR #54. OneDrive still showed 4 GB: local OneDrive is 0.43 GB, the rest is the
  OneDrive online recycle bin (deleted files count for 30 days); told the user to empty it themselves.
  Fix on branch fix/ai-one-supplier: AI price list pre-selects the supplier covering most items; "Add selected to
  cart" refuses picks from several suppliers or a cart holding another supplier, with a plain explanation.
  Typecheck clean (in C:/bx/mobile).
- 2026-11-04 22:55 IST: User: do everything that is free; DB credentials and a government sign-in method come later;
  they will buy a domain; asked about separate buyer and seller apps. Decided: one codebase, two apps (Swiggy/Zomato
  pattern): "BuildX" com.buildx.app (buyers) and "BuildX Partner" com.buildx.partner (suppliers, delivery partners,
  ops). Branch feat/partner-app:
  - apps/mobile/app.config.ts picks the variant from APP_VARIANT=partner (name, package, scheme, icon, extra.appVariant).
    src/lib/appVariant.ts: IS_PARTNER, roleBelongsHere(). AuthGate sends an account opened in the wrong app to
    (auth)/other-app ("Please use BuildX Partner" + Use a different account). Onboarding shows only this app's roles.
  - Firebase: registered Android app com.buildx.partner (1:1054722710633:android:2ced70d7255ece14b696f8) with debug
    SHA-1 5e8f...f625; new google-services.json holds both packages (gitignored; copy in buildx-secrets/firebase/
    and C:/bx/mobile). iOS partner build would need its own GoogleService-Info.plist (not done, no iOS builds yet).
  - Push: Android 13 notification permission requested; notifications that arrive while the app is open now show an
    in-app banner (src/components/AlertBanner.tsx), they were silently dropped before; taps open the order screen.
  - API push texts: emojis and em dash removed.
  - .github/workflows/keep-api-awake.yml pings /health every 10 min (free; Render gives 750 h/month).
  - Partner icons: ink background, sand mark, lime bar (assets/partner, make-icons.cjs needs sharp).
  Build: in C:/bx/mobile run `APP_VARIANT=partner npx expo prebuild -p android --clean --no-install` then gradle.
- 2026-11-04 23:05 IST: Built and verified both APKs from C:/bx/mobile (includes PR #55 and #56 changes):
  C:/dev/BuildX/BuildX.apk (com.buildx.app) and C:/dev/BuildX/BuildX-Partner.apk (com.buildx.partner), both live API,
  SHA-1 5e8f...f625, partner has POST_NOTIFICATIONS. Old BuildX-test.apk removed. The user's Google account is a
  seller, so it now belongs in BuildX Partner (BuildX shows the "use BuildX Partner" screen).
  Domains (RDAP check): buildx.in, buildx.co.in, buildx.com, buildx.store are taken; free: buildxapp.in, getbuildx.in,
  getbuildx.com, buildxapp.com, usebuildx.com, buildxhq.com/.in. Waiting for the user to buy one (money).
  Waiting on user: MongoDB credentials (they will send), government sign-in method later (likely DigiLocker /
  Aadhaar based: decide when they give details), support email/phone/legal name for the websites.
- 2026-11-04 23:40 IST: User looked for a new company name (Sthambha, Mestrikart, Plinthkart etc. were free) and
  chose getbuildx.com (brand stays BuildX). Not bought yet. Code needs no change (all URLs come from env). Added the
  four getbuildx.com hosts to Firebase authorized domains. Plan in "DOMAIN PLAN" above.
- 2026-11-05 01:55 IST: BRAND RENAMED BuildX -> Sthiva (user decision). Name research: buildx.in/.com taken, BuildX
  Technologies Pvt Ltd (Gujarat, 2026) and BuildX.Homes (Bangalore construction) make "BuildX Pvt Ltd" unlikely at MCA.
  Sthiva: sthiva.com/.in free, no company or trademark found; similar: Sthira Technovations (Dharwad), Sthir-X Systems
  (Bangalore). User to register "Sthiva Private Limited" (backup Setuzo/Udvora) and buy sthiva.com.
  Branch feat/sthiva (includes feat/partner-app #56 and the domain-plan log #57):
  - Every user-facing BuildX -> Sthiva; packages @buildx/* -> @sthiva/*; BuildXLogo/BuildXMark -> SthivaLogo/SthivaMark;
    storage keys sthiva.*; apps "Sthiva" com.sthiva.app and "Sthiva Partner" com.sthiva.partner (registered in Firebase
    with SHA-1 5e8f...; google-services.json now holds 4 packages). Firebase project display name "Sthiva".
  - KEPT on purpose (live services/data): MongoDB dbName 'buildx', Cloudinary cloud/folder buildx, buildx-15494 Firebase
    project id, buildx-api.onrender.com, buildx-vgud/48kc/ops Vercel URLs, GitHub repo name buildx, logger service name.
  - New logo: S of two solid blocks with a lime beam (packages/web-core/src/brand/SthivaLogo.tsx; mobile ui.tsx;
    favicons apps/*/app/icon.svg; app icons via apps/mobile/scripts/make-icons.cjs). Wordmark "sthiva" in the display font,
    tagline "SOLID MATERIALS, STEADY SUPPLY".
  - Checks: API tsc + 288 tests + build, web-core 81 tests, buyer/seller typecheck, mobile tsc all pass.
  - GitHub contributors: only Harishrs2006 and Shubb07; no Claude trailers on any remote branch. Old LOCAL backup
    branches (backup/local-main-old, backup/stash-main-lockfile, feat/pincode-lookup, feat/rn-mongodb-rewrite) contain
    Claude trailers but were never pushed; do not push them.
- 2026-11-05 02:20 IST: User merged #58. Vercel (3 sites) and Render redeployed; all show Sthiva, CI green, API healthy.
  Checked the live home page in Chrome: new S mark and "sthiva" wordmark render correctly. First Sthiva-Partner build
  still said BuildX (copy to C:/bx failed silently); fixed copy, re-typechecked, rebuilt: bundle now has "Sthiva Partner".
- 2026-11-05 IST: User supplied the real Sthiva logo (yellow rounded tile, S of two halves: top ink, bottom white).
  Saved to docs/brand/sthiva-logo-original.png (+ user-brief/images). Vectorised exactly (two arcs r270/r90, centres
  588,588 and 948,948 on the 1536 canvas; 180 px edge difference vs the PNG). Replaced my S mark everywhere:
  web-core SthivaLogo/SthivaMark (tile + "sthiva" wordmark), favicons, OG image, mobile SthivaMark, app icons
  (buyer: yellow bg, ink/white S, adaptive bg #F3B806; partner: ink bg, yellow/white S). Brand accent lime -> logo
  yellow #F3B806 (deep #D49E00, soft #FDF0C4) in all tailwind configs, globals.css, mobile colors, design doc.
- 2026-11-05 02:45 IST: User merged #59 and #60. Vercel production deploys of #60 failed: daily deployment limit on the
  free plan (too many branch pushes today). APKs rebuilt with the owner's logo and verified: C:/dev/BuildX/Sthiva.apk
  (com.sthiva.app) and Sthiva-Partner.apk (com.sthiva.partner); bundles contain Sthiva and #F3B806.
- 2026-11-04 IST (launch prep, branch feat/launch-ready in worktree C:\Users\Harish\buildx-launch, outside OneDrive):
  User asked to get everything ready for a real launch BEFORE paying for anything. Done so far:
  SECURITY: Firebase test number +917019282019 no longer uses the public code 123456 (it was in this public log).
  New private code is ONLY in C:/dev/BuildX/buildx-secrets/TEST_SIGNIN.txt (outside the repo). Admin test number
  untouched. STOREFRONT: real page titles for product, category and material pages (server layouts with
  generateMetadata; product title fetched from the API with a 4 s timeout, generic title if the API is asleep);
  sitemap now lists 10 categories, every material guide and every live product, drops /signin; search fixes typos
  and trade words (cemnt -> cement, saria -> TMT) and shows matching material guides above supplier listings
  (packages/web-core/src/catalog/search.ts + 6 tests, 87 web-core tests pass); phone buy bar on the product page
  (price + Add to cart, hides when the real button is on screen, turns into View cart after adding).
  Verified on a local production build at 375 px through a read-only local CORS proxy (Render CORS no longer allows
  localhost). Note: the other session's branch feat/mobile-google-signin (mobile Google sign-in, Android build not
  verified) is untouched in the OneDrive checkout.
- 2026-11-04 IST: ACCOUNT DELETION (both app stores require it; privacy policy already promised it). API: DELETE
  /api/v1/users/me for BUYER and SUPPLIER (staff/drivers get 403, ops closes them). Refused with 409 while any order is
  open (as buyer or as supplier). Erases name/phone/email/addresses/GST/bank/avatar, firebaseUid -> deleted:<id>,
  isActive false, deletedAt set; supplier listings -> DISCONTINUED and profile inactive; orders kept (tax records);
  Firebase login deleted (user-not-found tolerated). 7 tests, API 295/295 pass. Buyer web: Account page has
  "Delete my account" with in-page confirm; public page /account-deletion (link it in the Play and App Store
  listings), linked from the footer, legal pages and sitemap. TODO: same button in seller-web and the mobile app
  (mobile is on the other session's branch feat/mobile-google-signin; add it after that merges).
- 2026-11-04 IST: apps/mobile/eas.json (preview APK, production AAB with remote version numbers, live API URL)
  and docs/LAUNCH.md (launch runbook: free owner steps, paid switches with prices, domain switch env vars,
  Play Store steps incl. SHA fingerprints, google-services.json for EAS, data safety answers). PR opened for
  feat/launch-ready. NEXT: user merges; then the paid switches in LAUNCH.md section 2 when the user says yes;
  demo supplier removal needs the user's OK; delete-account button still missing in seller-web and mobile app.
- 2026-11-05 03:00 IST: Revived PR #51 (launch prep + account deletion + LAUNCH.md + eas.json) on branch
  feat/launch-ready-sthiva: merged main, resolved 4 conflicts (imports, footer: kept main + "Delete your account"
  link), applied the Sthiva rename and yellow colour to its files. API 295 tests, web-core 87 tests, buyer and seller
  typecheck pass. Log merge had duplicated the whole file (CRLF vs LF): restored main's log and re-added #51's entries.
  Same branch: delete-account added to the seller portal (Business page) and both mobile apps (profile footer, buyers
  and suppliers only; mobile api errors now keep the HTTP status). apps/*/vercel.json ignoreCommand: websites rebuild
  only when their folder, packages/web-core or the root package files change (Vercel project roots are apps/<name>,
  "skip unchanged" was already on). LAUNCH.md updated for the Sthiva name decision.
- 2026-11-05 IST: BRAND SYSTEM v2 (user sent 5 reference logos: hexagon split by an S, "STHIVA PARTNER / SELLER
  PLATFORM", block-S tile; refs in user-brief/images/logo-research). Decision (one master mark, two colourways, like
  Swiggy/Swiggy Partner): pointy-top hexagon (bolt head) split by a point-symmetric S into two halves (buyer + seller).
  Sharp corners so the S gap cuts cleanly through the edges (rounded corners left slivers; a vertex-to-vertex S broke
  the outline: both tried and rejected). Wordmark: Geist Bold outlines, 0.16em tracking; PARTNER Geist SemiBold 0.36em.
  Sthiva: ink+yellow mark, ink word (white on dark); app icon yellow tile, ink/white mark. Sthiva Partner: white+yellow
  mark on ink, PARTNER in yellow; app icon ink tile. Kit + generator: docs/brand (node docs/brand/generate.cjs
  docs/brand with BRAND_NODE_MODULES pointing at sharp + opentype.js). Code: web-core brand/paths.ts (generated) +
  SthivaLogo (partner prop, SVG mask with useId), seller portal uses the partner lockup + partner favicon, OG image
  uses an SVG data URI, mobile src/constants/brand.ts copy + SthivaMark (react-native-svg Mask; tile follows the app
  variant), app icons via apps/mobile/scripts/make-icons.cjs. Checked the real component on a local dev server.
- 2026-11-05 IST: OVER-THE-AIR UPDATES (EAS Update). Expo account is "hatish_r_s" (with a t; user typed harish_r_s).
  User logged in eas-cli on this laptop themselves. Project @hatish_r_s/sthiva, id 26067cb1-d12d-4279-9bda-bb3fc6f6eca3
  (app.config.ts EAS_PROJECT_ID). expo-updates ~56.0.28; runtimeVersion policy appVersion (bump app.json version for
  native changes); channels buyer-production / partner-production via updates.requestHeaders (works with our local
  gradle builds). Publish: from apps/mobile `npm run update:buyer -- "note"` / `npm run update:partner -- "note"`
  (scripts/publish-update.cjs sets live API URL + variant). UpdateBanner: "A new version is ready. Tap to restart.";
  profile footer shows "update <id>" when running an OTA update.
  User created the Expo organisation "sthiva" and transferred the project: now @sthiva/sthiva (same id). app.config.ts
  owner: 'sthiva'. Personal Expo usernames cannot be renamed (the typo account hatish_r_s stays as the login).
- 2026-11-05 07:50 IST: User pasted the full Sthiva business model (buyer, supplier, delivery partner, admin). Audited
  the code against it: docs/PLATFORM_CHECKLIST.md (DONE/PART/TODO + 8 phases). User answered the 4 business rules
  (see NEXT STEPS). Phase 1 built: Category.commission (percent, Sthiva-delivers / supplier-delivers), VehicleType model
  (code, name, maxLoadKg, baseFare, perKmRate), PlatformSettings (offerTimeoutMinutes, null = off), pure rates.ts
  (commissionPercent, commissionPaise, pickVehicle, deliveryChargePaise; integer paise). API: GET /ops/settings
  (ops), PATCH /ops/settings/commission/:id, POST+PATCH /ops/settings/vehicles, PATCH /ops/settings/general (ADMIN).
  Ops console: new Settings tab. 304 API tests pass (9 new), API + ops typecheck clean. No default numbers anywhere.
- 2026-11-05 07:20 IST: GitHub sidebar still listed "claude" as contributor (stale cache; API and history are clean).
  Toggled default branch main -> tmp-refresh -> main to force a recount; added local commit-msg hook that blocks
  Claude/AI co-author lines. If still shown, user asks GitHub Support to refresh the contributors cache.
- 2026-11-05 08:20 IST: User merged #66. Phase 2 on feat/catalog-items: CatalogItem model (name, brand, category, unit,
  weightKgPerUnit, needsReview, mergedInto); Product.catalogItemId (one listing per item per supplier, partial unique
  index). Supplier create: pick catalogItemId, or auto-match by normalised name + category + unit, or a new item
  (needsReview). Startup linkUnlinkedProducts() links old listings. API: GET /suppliers/me/catalog; ops GET/POST
  /ops/catalog, GET/PATCH /ops/catalog/:id, POST /ops/catalog/:id/merge. SupplierProfile.canDeliver. Seller web:
  "Already on Sthiva" suggestions in the product form, delivery choice in setup; ops console: Catalog tab.
  316 API tests pass (12 new), both sites build. Note: Python here defaults to cp1252: always pass encoding='utf-8'.
- 2026-11-05 08:25 IST: User merged #67. Phase 3 on feat/supplier-offers: new orders are PENDING with
  allocation {state OFFERED|ACCEPTED|NEEDS_OPS, expiresAt, attempts[]}; order items carry catalogItemId.
  allocation.service.ts: acceptOffer, rejectOffer (reason), expireOverdueOffers (60 s sweeper in server.ts, uses
  admin offerTimeoutMinutes; off = never expires), opsOfferTo (any supplier with stock, no price rule), opsFindNext.
  Next supplier = verified/active, serves PIN, lists every item with stock, not tried before, line price <= buyer
  line price; cheapest first. Stock moves with the offer; NEEDS_OPS holds none (inventoryState NONE). Buyer view
  hides allocation + supplier reasons. Seller web + Partner app: Accept/Reject; ops: Needs a supplier queue and
  supplier options panel. 324 API tests pass (8 new); 3 sites build; mobile typechecks.
- 2026-11-05 08:35 IST: User merged #68. OTA publish failed: new eas-cli needs --environment in --non-interactive mode.
  Added '--environment production' to scripts/publish-update.cjs (copied to C:/bx/mobile).
- 2026-11-05 08:50 IST: User merged #69. Phase 4 on feat/one-price: commission.ts (ratesFor, addPercent,
  buyerProduct, payoutFor, supplierEarnings). Buyer price = supplier listed price x (1 + "Sthiva delivers" %);
  supplier earns their listed price; if they deliver themselves Sthiva keeps only the lower % and the rest goes to
  them. Categories without a commission are hidden and can't be ordered. /products shows one entry per catalog item
  (cheapest eligible listing, sellerCount), prices with commission; AI estimate too. Orders: Sthiva picks the
  cheapest supplier that has the whole cart and serves the PIN; items store supplierUnitPrice, supplierLineTotal,
  commissionPercent, supplierDeliveryPercent; order supplierTotal + commissionTotal. Re-offer compares with the
  supplier side. Supplier order list + ops order detail return earnings. Buyer web/app carts can mix listings.
  332 API tests pass (8 new); 3 sites build; mobile typechecks.
- 2026-11-05 09:20 IST: Phase 5a on feat/delivery-pricing: delivery-pricing.ts (straight-line km supplier
  location -> pinned point or delivery PIN post office; weight from CatalogItem.weightKgPerUnit; smallest vehicle;
  charge = base + perKm x km). OFF until a vehicle type exists; when ON, unpriceable orders are refused with
  DELIVERY_NOT_PRICED. Supplier choice ranks goods + delivery. Order.delivery {vehicle, weightKg, distanceKm,
  driverSharePercent}; total includes delivery. Earnings: supplier keeps full charge when self-delivering; driver
  payout = charge x driverSharePercent. SupplierProfile.location (seller setup "Use where I am now"); driver
  verification (ops Drivers tab Verify/Reject; unverified drivers get 403 on jobs; old drivers grandfathered);
  Settings: driver share %. Buyer web + app checkout show vehicle/km and block unpriced; app checkout now asks PIN.
  339 API tests pass (7 new); 3 sites build; mobile typechecks + address tests pass.
- 2026-11-05 09:50 IST: Phase 5b on feat/driver-offers: driver-offers.ts (rank: verified, active, on duty, vehicle
  capacity >= weight, not tried; smallest vehicle then fewest jobs; no GPS yet), Order.driverOffer {state OFFERED|
  ASSIGNED|NEEDS_OPS, attempts}, driverOfferTimeoutMinutes setting + sweeper. Supplier dispatch starts offers; driver
  accept/decline; ops assign closes offers; ops unassign re-offers. Orders before offers stay open to any verified
  driver. Order.deliveryOtp (4 digits, select:false) shown to buyer until delivered; driver/supplier must send it to
  mark DELIVERED; 5 wrong tries lock; ops /deliver confirms without it. deliveryIssue reports (driver/supplier) ->
  ops "Delivery problem" queue -> resolve-problem. UI: ops queues/actions/settings, seller code + problem, buyer web
  + app show code, Partner app Accept/Decline + code + problem. 349 API tests pass (10 new); 3 sites build.
- 2026-11-05 17:30 IST: DOMAIN sthiva.com bought by the user on Cloudflare and connected:
  - Vercel domains: buildx-vgud gets www.sthiva.com (primary) + sthiva.com (308 to www); buildx-48kc gets
    seller.sthiva.com; buildx-ops gets ops.sthiva.com. Old *.vercel.app URLs still work.
  - Cloudflare DNS (all DNS only, not proxied): @ and www CNAME 48ebdc9dc4500567.vercel-dns-017.com,
    seller CNAME 685c82bf411f661b.vercel-dns-017.com, ops CNAME 8e7f76325dd7bc05.vercel-dns-017.com,
    api CNAME buildx-api.onrender.com.
  - Render: api.sthiva.com custom domain verified, HTTPS works (/health 200). FRONTEND_URL now also allows
    https://sthiva.com, www., seller., ops. (old vercel.app origins kept); API redeployed.
  - Vercel buyer env: NEXT_PUBLIC_SITE_URL=https://www.sthiva.com (new), NEXT_PUBLIC_SELLER_PORTAL_URL=
    https://seller.sthiva.com (deleted + re-added; editing needs an email code). NEXT_PUBLIC_API_URL left on onrender.
  - Code (branch feat/sthiva-domain): buyer site.ts default URL, mobile home WEB_URL, eas.json and
    publish-update.cjs now use https://api.sthiva.com and https://www.sthiva.com.
  - PR #72 (phase 5b) was merged by the user.
- 2026-11-05 20:15 IST: PHASE 6 settlements (branch feat/settlements). User merged #73 (domain).
  - Settlement model (ST-yymmdd-xxxxxx): one supplier or driver, order lines (earned, cash kept), totals, net
    (positive = Sthiva pays them, negative = they pay Sthiva), PENDING -> PAID (reference) or CANCELLED (frees orders).
  - Orders count once DELIVERED and cash confirmed (CAPTURED/PARTIAL); Order.supplierSettlementId / driverSettlementId
    stop double counting (claimed in a transaction). Earnings reuse commission.ts: supplier expectedPayout by
    delivery mode, driver = driverSharePercent of the delivery charge. Cash kept = codAmountCollected when the
    supplier or the assigned driver confirmed it; ops-recorded cash counts as Sthiva's.
  - API: GET /ops/settlements/balances?party, GET /ops/settlements, GET /ops/settlements/:id (operators);
    POST /ops/settlements, /:id/paid, /:id/cancel (ADMIN). GET /suppliers/me/settlements, /delivery/me/settlements.
  - UI: ops console Payouts tab; seller website Payouts tab; Sthiva Partner app Payouts tab (supplier and driver).
  - No payment schedule invented: an admin settles whenever they choose. 355 API tests pass (6 new); ops and
    seller sites build; mobile tsc clean.
- 2026-11-05 22:45 IST: PHASE 7 admin analytics + people (branch feat/admin-analytics, stacked on feat/settlements #74).
  - GET /ops/analytics?days=7|30|90 (IST days): placed, cancelled (by who), delivered, sales, supplier and driver
    earnings, Sthiva share (sales - partner earnings, via settlement orderAmounts), daily series, top 10 items,
    supplier and driver offer answers (offers/took/rejected/no answer, accept %) and deliveries.
  - GET /ops/users?role&q&page: every account (deleted hidden), regex-safe search on name/email/phone, buyer order counts.
    Suspend/reinstate uses the existing ADMIN-only PATCH /ops/users/:id/active (reason required).
  - Ops console: Insights tab (stat tiles, sales-per-day bar chart with hover + table view, top items, supplier and
    driver tables) and People tab. Desktop tabs show icons only below xl; phone tab bar scrolls.
  - 359 API tests pass (4 new); ops site builds. Not yet seen in a browser with real data (needs ops sign-in).
- 2026-11-05 23:15 IST: User merged #74 and #75. #75 had been merged into feat/settlements, but #74's squash already
  included it, so main has phase 7 (empty PR #76 closed).
- 2026-11-05 23:20 IST: PHASE 8 Sthiva Driver app (branch feat/driver-app).
  - APP_VARIANT=driver -> "Sthiva Driver", com.sthiva.driver, scheme sthivadriver, EAS channel driver-production,
    icon assets/driver (light tile, ink + yellow S; scripts/make-icons.cjs), adaptive bg #FAF8F3.
  - src/lib/appVariant.ts: buyer | partner | driver. Driver app accepts only DELIVERY_PARTNER accounts and onboards
    only drivers; other accounts see the other-app screen naming the right app. Sthiva Partner still serves drivers.
  - Firebase: Android app com.sthiva.driver registered (app id 1:1054722710633:android:cde8c73c8e6f50c8b696f8),
    SHA-1 5e8f...f625; Google created its Android OAuth client. Local google-services.json (gitignored) now has 5
    packages; copy in buildx-secrets/firebase.
  - publish-update.cjs and npm run update:driver handle the driver channel.
  - Built C:/dev/BuildX/Sthiva-Driver.apk (not in git): package com.sthiva.driver, label Sthiva Driver, signed
    5e8f...f625, bundle uses https://api.sthiva.com, appVariant driver. NOTE: C:/bx/mobile/android is now prebuilt
    for the driver variant; run `APP_VARIANT=<variant> npx expo prebuild -p android --clean --no-install` before
    building another app.
- 2026-11-05 23:30 IST: User merged #77 (phase 8). Polish branch chore/polish:
  - Supplier orders show straight-line km from the supplier's pickup point (stored delivery distance, else address or
    PIN post office); seller website + Partner app.
  - Ops Settings: Categories section (add, rename, order, show/hide; slug fixed). Hidden categories are now off sale
    in listings and orders (isActive checked in sellableCategoryIds and ratesFor).
  - Vercel ignored-build step was already in place. Session log CURRENT STATE / NEXT STEPS rewritten.
  - 363 API tests pass (2 new files + 1 settings test); ops and seller sites build; mobile tsc clean.
- 2026-11-05 23:55 IST: Owner decisions: verification documents = GST certificate (if registered) + shop licence or
  Udyam certificate (no Aadhaar, no bank proof for now); next build = weekly availability.
  - Documents (same PR #78): POST/GET /suppliers/me/documents (multipart type+file, JPEG/PNG/PDF <= 5 MB, one per
    type, replacing deletes the old file); GET /ops/suppliers/:id/documents (10-minute signed links, each view
    logged), PATCH /ops/suppliers/:id/documents/:type (accept / reject with reason, supplier gets a push).
    Files are Cloudinary type=private (StorageService.uploadPrivate / privateViewUrl); no public URL stored or sent.
  - UI: seller website Business page "Verification documents"; ops Suppliers card "Documents" panel.
  - 4 new API tests pass; ops and seller sites build.
- 2026-11-06 00:20 IST: WEEKLY AVAILABILITY (same PR #78).
  - GET/POST /suppliers/me/weekly: every ACTIVE/OUT_OF_STOCK listing; POST must include all of them (quantity +
    price), checks bulk tiers first, applies stock-driven status, sets Product.availabilityConfirmedAt and
    SupplierProfile.weeklyConfirmedAt. Weeks start Monday 00:00 IST.
  - Reminder: sendWeeklyReminders in the one-minute sweeper; Monday 09:00-24:00 IST, verified active suppliers with
    listings who have not confirmed; one per week (weeklyReminderFor claimed atomically). Push opens the weekly screen.
  - No automatic pausing of suppliers who skip it (would be a new business rule; owner decides).
  - UI: seller website Weekly check tab; Partner app Weekly check (from Overview); ops supplier card shows last check.
  - Fixed: Partner app supplier and driver tab bars showed blank tabs for pushed screens (analytics, product add/edit,
    driver order); now href:null like the buyer and ops layouts.
  - 371 API tests pass (5 new); ops + seller sites build; mobile tsc clean. Needs partner OTA after merge.
- 2026-11-06 00:45 IST: Owner: suppliers update whenever they need, but every Monday the check is compulsory.
  Branch feat/weekly-compulsory:
  - Deadline end of Monday IST; on Monday last week's check still counts; from Tuesday a supplier without this week's
    check is left out of eligibleProfileFilter (not listed, not offered orders) until they confirm (immediate).
  - Starts with the week of 9 Nov 2026 (ENFORCED_FROM; env WEEKLY_ENFORCED_FROM overrides for tests).
  - Reminders: Monday 09:00 (says items hide at midnight once enforced) + one "your items are hidden" notice after
    the deadline (weeklyHiddenNoticeFor). Seller website + Partner app show the hidden banner; ops card shows
    "Hidden from buyers". Test helper seedSupplier now starts confirmed; full suite also passes with the rule on.
  - Renames: API log service sthiva-api; keep-awake pings https://api.sthiva.com/health; Dockerfile tag.
  - 375 API tests pass; ops + seller build; mobile tsc clean.
- 2026-11-06 01:30 IST: Owner asked why vercel.app links remain and why names still say buildx. Done:
  - Vercel: buildx-vgud/48kc/ops.vercel.app now 308-redirect to www./seller./ops.sthiva.com. Projects renamed
    sthiva-shop, sthiva-seller, sthiva-ops; team renamed Sthiva, URL vercel.com/sthiva (was buildx9).
  - Firebase public-facing name BuildX -> Sthiva (Google consent app name was already Sthiva).
  - Google sign-in window on the websites showed buildx-15494.firebaseapp.com: buyer-web and seller-web now rewrite
    /__/:path* to Firebase and use their own host as authDomain on *.sthiva.com (lib/firebase.ts authDomainFor);
    buyer-web lets /__/ pages be framed SAMEORIGIN. Web OAuth client now allows https://www.sthiva.com/__/auth/handler
    and https://seller.sthiva.com/__/auth/handler. Ops console is phone sign-in only (unchanged).
  - GitHub repo renamed Harishrs2006/buildx -> Harishrs2006/sthiva (old URLs redirect; Vercel/Render follow).
    Docs links updated. Local folder stays C:/dev/BuildX/buildx.
  - Left on purpose (fixed IDs, never shown to customers): Firebase project id buildx-15494, MongoDB db 'buildx',
    Cloudinary cloud/folder buildx, Render service buildx-api (render.yaml blueprint name; renaming risks a second
    service) and its buildx-api.onrender.com address (api.sthiva.com is the public one), Android packages com.buildx.*
    (old builds) in Firebase.
- 2026-11-06 IST: Owner merged #79; wants a real launch in a couple of days and will give Vultr credits.
  Branch feat/vultr-deploy: deploy/vultr (docker-compose: api + shop + seller + ops + Caddy auto-HTTPS; one
  web.Dockerfile for the three Next sites via STANDALONE=1 output; bootstrap.sh for Ubuntu 24.04 with firewall,
  swap, auto updates; deploy.sh; .env.example; README runbook) and .github/workflows/deploy-vultr.yml (SSH deploy
  on push to main, idle until VULTR_HOST / VULTR_SSH_KEY secrets exist). Tested: standalone shop server serves
  pages, CSS, images and the /__/auth Firebase proxy; compose config valid; normal Vercel builds unaffected.
  Docker Desktop was not running, so images were not built locally.
  docs/LAUNCH.md now starts with a two-day launch plan. Waiting on the owner: demo supplier removal OK, support
  phone/email/legal name, first real suppliers, Settings values, Vultr server.
- 2026-11-06 IST: Owner OK: removed the demo supplier now. Live DB: "BuildX Demo Supplier (placeholder...)" set
  isActive=false and its 10 listings DISCONTINUED (soft, reversible; no open orders). Live /products now 0.
  Owner chose to show their name until the company exists: Vercel sthiva-shop NEXT_PUBLIC_LEGAL_NAME =
  "Sthiva, operated by Harish R S" (live after the next shop deploy). Support phone/email still to come from owner.
- 2026-11-06 IST: Owner asked for launch SEO: Search Console, GA, noindex, robots, www -> non-www, sitemap, Bing, Product Hunt + badge. Branch feat/seo-launch: opt-in GA4 (NEXT_PUBLIC_GA_ID; loads only after 'Allow analytics'; ads signals off), notice becomes a choice when GA is set, cookie + privacy pages updated, 'Change my analytics choice' on /cookies, Product Hunt badge in footer (NEXT_PUBLIC_PRODUCTHUNT_POST_ID/URL), SITE.url default https://sthiva.com, Vultr Caddy/compose flipped to non-www.
- 2026-11-06 IST: Search Console: sthiva.com domain property verified (TXT google-site-verification in Cloudflare). GA4 account Sthiva / property 'Sthiva website' (India, INR), stream https://sthiva.com, Measurement ID G-9RH1C5X0WN (owner accepted GA terms). Vercel sthiva-shop env: NEXT_PUBLIC_SITE_URL=https://sthiva.com, NEXT_PUBLIC_ALLOW_INDEXING=true, NEXT_PUBLIC_SUPPORT_EMAIL=support@sthiva.com, NEXT_PUBLIC_GA_ID=G-9RH1C5X0WN. Google OAuth web client allows https://sthiva.com/__/auth/handler. NEXT after #81 merge: flip Vercel domains (sthiva.com primary, www 308 -> apex, vercel.app -> apex), submit sitemap in GSC, Bing import, Product Hunt kit.
- 2026-11-06 IST: #81 merged and live. Vercel: sthiva.com is Production, www.sthiva.com and buildx-vgud.vercel.app 308 -> sthiva.com. Verified live: robots allows, meta robots index,follow, canonical https://sthiva.com, sitemap 83 URLs on sthiva.com, footer support@sthiva.com + legal name. Sitemap submitted in Google Search Console (sc-domain:sthiva.com). docs/PRODUCT_HUNT.md launch kit written. Waiting on owner: Bing Webmaster import from GSC, Product Hunt post (then badge env vars), Vercel 2FA.
- 2026-11-06 IST: #82 merged. Owner imported sthiva.com into Bing Webmaster Tools from GSC; sitemap was not imported, so submitted https://sthiva.com/sitemap.xml in Bing (status Processing). Search setup complete: Google + Bing verified with sitemaps, GA4 opt-in live. Remaining owner items: Product Hunt post after first real suppliers, Vercel 2FA, Vultr server, supplier onboarding, ops Settings values.
- 2026-11-06 IST: Added robots.txt (disallow all) to seller-web and ops web (they already send noindex). EAS CLI on this laptop is logged in as the owner, but publishing OTA updates from Claude was blocked by the permission check; owner runs the publish commands.
- 2026-11-06 IST: #84 live (seller/ops robots.txt Disallow: /). Switched NEXT_PUBLIC_API_URL to https://api.sthiva.com on Vercel sthiva-shop, sthiva-seller, sthiva-ops (Production + Preview, deleted + re-added as Config type) and redeployed each with the ignore build step off. CORS checked: api.sthiva.com allows https://sthiva.com.
- 2026-11-06 15:34 IST: #85 merged; ops also confirmed on api.sthiva.com. README rewritten for today (sites, three apps, how it works, layout, run locally); removed the MIT claim (no LICENSE file exists; licensing is the owner's call). Added apps/api/.env.example (blank values). Old PR #34 (previous README refresh) is replaced by this; owner can close it.
- 2026-11-06 15:40 IST: #86 merged. SEO audit of all 83 sitemap URLs on sthiva.com: all 200, 87 internal links none broken. Fixed: 15 material guide descriptions were 29-46 chars (now summary + what the page covers, max 160); /search was in the sitemap but canonical to home (now its own title, noindex,follow, out of sitemap); home description 175 -> 149 chars.
- 2026-11-06 15:55 IST: #87 merged and live (sitemap 82, new descriptions). Lighthouse on sthiva.com (mobile): perf 73, a11y/best-practices/SEO 100, LCP 15.8 s; cause: full Material Symbols font (2.3 MB, render-blocking). Fix (PR perf/icon-font-subset): packages/web-core/icons (official name list + icon-names.mjs) scans each site's code at build time and requests only the icons used (icon_names=). Shop font 2317 KB -> 45 KB; local mobile LCP 15.8 -> 4.7 s, page 3.2 MB -> 654 KB. Every icon on 6 shop pages checked in Chrome (renders as a glyph, not text). Seller and ops get the same subset (display block).
- 2026-11-06 16:12 IST: #88 merged and live. Live Lighthouse: desktop perf 98 (LCP 3.1 -> 1.0 s), mobile 74 (LCP 15.8 -> 5.2 s). Next PR perf/self-host-icons: icon subset downloaded at build (selfHostIcons) into public/fonts/icons-<hash>.woff2 (gitignored, cached 1 year), stylesheet inlined, preload; falls back to Google's link if the download fails. Shop images AVIF first (sand photo 71 -> 35 KB). All icons rechecked in Chrome; shop, seller, ops builds pass.
- 2026-11-06 ~16:20 IST: #89 merged; Vercel refused the main deploys (Hobby daily deployment limit, retry in 24 h). Live sites stay on #88 (fine). Redeploy tomorrow; this log is committed locally on docs/vercel-rate-limit and pushed with that redeploy.
- 2026-11-06 22:55 IST: Found: GitHub keep-api-awake cron actually runs only every 5-7 h, so Render sleeps and the seller sign-in showed "Could not reach Sthiva" (10 s client timeout vs 30-60 s wake). Fixes: (1) Cloudflare Worker sthiva-api-keepalive deployed (owner to add 5-min cron); (2) PR fix/api-wake-retry: web-core request option timeoutMs; buyer + seller syncAuth retries once with 60 s on TIMEOUT/NETWORK_ERROR (mobile already does). web-core tests 88 pass. NOTE: Git Bash `TZ=Asia/Kolkata date` prints UTC; use node for IST (fixed 4 times above).
- 2026-11-06 23:00 IST: Owner closed old PR #34. Gave owner a link list for all their pending tasks.
- 2026-11-06 23:10 IST: Verified: Vercel 2FA active (authenticator app). Cloudflare worker sthiva-api-keepalive still has NO cron trigger (owner thought it was added; asked to retry). OTA not yet published (latest updates are from 2026-11-05).
- 2026-11-06 23:22 IST: Owner asked for a growth/catalogue plan (refs home-run.co and IndiaMART, saved in user-brief). Wrote docs/GROWTH_PLAN.md: reference comparison, 7 new categories + room/stage browsing, brands/distributors (brand pages, dealer badge), add-by-photo product recognition (AI vision + web lookup, barcode/GS1 DataKart), buyer experience list (calculator, send-your-list, bulk tiers, WhatsApp, Kannada), growth plan (supply first, trade programme), build order.
- 2026-11-07 00:45 IST: Owner: start new categories + room browsing; interiors (woodwork designs, tiles) with catalogue options; delivery date confirmed by the supplier after accepting (expected range first, e.g. 2-3). Branch feat/interiors-rooms (on top of #90):
  - Catalogue (packages/web-core/src/catalog/interiors.ts): 6 new categories Modular & Woodwork, Walls & Ceilings, Hardware & Fittings, Doors & Windows, Bath & Kitchen, Roofing & Waterproofing + wood/vinyl flooring in Tiles: 43 new material types (made-to-order flag on kitchens, wardrobes, windows, glass...). rooms.ts: Kitchen, Bathroom, Bedroom, Living and dining, Pooja room, Exterior and terrace. 12 photos (Figma AI, unbranded; saw logo painted out), ASSETS.md.
  - Shop: /rooms, /rooms/[slug], Shop by room on home, Rooms in header/footer, Made to order tag + 3-step explainer, Used in links, sitemap.
  - Delivery dates: listing deliveryDays + deliveryDaysMax (0-90); order.expectedDelivery (follows the supplier if the order moves); supplier sends deliveryDate (YYYY-MM-DD) on accept (optional for old apps) and PATCH /suppliers/me/orders/:id/delivery-date (buyer notified). Shop shows usual time on product + checkout, confirmed date on order page/list. Seller: delivery-time presets on listing form, date picker on accept, Change date.
  - Tests: API 383 pass (8 new), web-core 111 pass, builds OK.
  - AFTER DEPLOY: create the 6 categories in ops Settings > Categories with these exact names (slugs must match): Modular & Woodwork, Walls & Ceilings, Hardware & Fittings, Doors & Windows, Bath & Kitchen, Roofing & Waterproofing. Mobile Partner app accept has no date yet (needs app update).
  - NEXT: design catalogues (suppliers upload real designs; buyers browse and request) as a separate PR.
- 2026-11-07 01:03 IST: Design catalogue added to the same branch/PR #91: models Design (IN_REVIEW -> LIVE/REJECTED by ops; supplier can hide/show; editing photos/words re-reviews) and DesignRequest (NEW -> CONTACTED -> QUOTED (price + date) -> ACCEPTED/CLOSED). API /designs (public list by category/kinds/style/PIN, detail, buyer requests), /suppliers/me/designs + design-requests, /ops/designs + design-requests; notifications. Shop: /designs gallery with type/style filters, /designs/[id] with quote form, /quotes, designs strip on room pages, Designs in header (How it works moved out of header to fit). Seller: Designs (add/edit/hide/delete, photo upload) and Enquiries (call/WhatsApp, quote with date). Ops: Designs review queue + enquiries table. Tests: API designs 6 new; all builds pass; previewed locally with an in-memory DB (Cloudinary demo photos, nothing live).
- 2026-11-07 01:11 IST: Owner asked to see it before deploying. Vercel previews of PR #91 built: sthiva-shop-git-feat-interiors-rooms-sthiva.vercel.app (and -seller, -ops). They use the live API, so designs and delivery dates only work after merge. Local full preview with 3 sample designs (in-memory DB, Cloudinary demo photos) at localhost:3123 (shop) / localhost:4100 (API); stops when the laptop restarts.
- 2026-11-07 01:45 IST: OWNER REJECTED Shop by room (AI room photos = "fancy"; wants real, material-first). DECISIONS (do not merge #91 until rebuilt and owner reviews):
  1. Remove room pages/section/links/photos fully.
  2. New interior items go into existing categories (sinks/showers/bath -> Plumbing, chimneys -> Electricals, texture/wallpaper/terrace waterproofing/POP -> Paints & Chemicals, modular furniture/doors/windows/glass/ceilings/panels -> Plywood & Timber, cladding/wood/vinyl floors -> Tiles, roof tiles -> Bricks & Blocks, polycarbonate/steel doors/grills -> Steel) + ONE new category Hardware & Fittings.
  3. Drop the separate Design/DesignRequest system. One system: listings marked IN_STOCK (delivery = seller's days, shown as a range; single value d shows d to d+1) or ON_ORDER (brand catalogue, custom work: "In process, confirmed within 24 hours, you will be notified").
  4. "Catalogue" in the top menu + "See catalogue" on category pages: seller listings with photos, nearby sellers first, popular brands first.
  5. Out-of-area PIN: allow the order, "In process: finding a supplier for your area, notified within 24 hours" (ops queue).
  6. Allocation: lower price wins; same price -> nearest seller first.
  Rule from owner: ask before building big UX ideas; think as founder/CEO/CTO/marketing.
- 2026-11-08 00:39 IST: Rework per owner decisions DONE on feat/interiors-rooms (PR #91): rooms + design-request system removed; interior items filed under existing categories + Hardware & Fittings; listings IN_STOCK / ON_ORDER (ON_ORDER stock held at 1,000,000, weekly check price only); BOX and SHEET units; buyer sees a single seller number as a range (2 -> 2 to 3 days); on-order and out-of-area orders show "in process, confirmed within 24 hours"; out-of-area orders accepted into the ops queue (NEEDS_OPS, no stock held; ops can offer to any supplier incl. the one picked); equal price -> nearest supplier (order + allocation); product lists nearest-first with "about N km" when a PIN is set; /catalogue (seller listings with photos, type chips) + "See catalogue" on category pages; seller form In stock / On order; seller Stock/Products/Weekly show "On order". Tests: API 388, web-core 110, shop 21; 3 sites build.
  NEXT: owner reviews preview, merge #90 then #91; after deploy add category "Hardware & Fittings" in ops Settings (exact name). Partner app: on-order listings + date on accept need an app update.
- 2026-11-08 01:06 IST: Owner did not like the Catalogue rework either; wants the LIVE sthiva.com look as base, made 10/10. Kept only behind-the-scenes parts (new materials in existing categories + Hardware & Fittings, delivery dates, in stock / on order, nearby first, out-of-area to ops). Removed /catalogue, Catalogue links, See catalogue button, dark made-to-order box; header, footer, home, category and material pages are byte-identical to live. Next: owner approves a 10/10 plan (real photos, faster ordering, trust, home polish) before building.
- 2026-11-08 14:18 IST: Owner chose: live look as base; REAL photos only (no generated material photos; drawings stay until real photos); start with home polish. Branch feat/home-polish (on #91): PIN check in the hero first screen (HeroPinCheck, same saved PIN as the rest of the site); categories two per row on phones (page 9,700 -> 7,100 px tall); honest copy (sign-in says Google account, phone only when NEXT_PUBLIC_PHONE_SIGNIN; 'No false promises' matches out-of-area rule; final CTA 'Sign in'); seller photo checklist under Photos. Checked with scroll screenshots (puppeteer from the lighthouse npx cache, scratchpad shoot.cjs) at 390x844 and 1440x900.
- 2026-11-08 14:39 IST: Owner reported live bugs: phone logo overlap in hero; desktop 'We could not load the catalogue'. Fix PR #93 (from main, #90 already merged): safe hero centring + one logo on phones; categories render instantly from built-in CATALOG_CATEGORIES and live list replaces it (patient 60 s retry). ALSO: API DOWN since between 04:25 and 07:46 IST today (buildx-api.onrender.com and api.sthiva.com accept TCP but never answer; Render status page all operational). Needs Render dashboard logs (Chrome extension disconnected). Same fixes are on feat/home-polish (#92).
- 2026-11-09 23:58 IST: PHASE 1 of the marketplace redesign (timetable P1 9-10 Nov header+menu+home, P2 materials page with type/brand/size chips, P3 product page, P4 3-step checkout, P5 orders/notifications, P6 polish) on branch feat/phase1-header-categories. 14 categories in the owner's building order (Cement & Concrete; Sand, Jelly & Stone; Bricks & Blocks; Steel, UPVC & Aluminium; Tiles & Flooring; Plywood & Wood; Interiors; Paints & Textures; Plumbing & Sanitary; Electricals; Hardware; Glass; Furnishing; Tools & Machines). New solid two-row header (logo, Deliver to PIN, search, account, orders, cart; desktop category row + All materials menu panel; phone search row). Home: short banner with PIN check (replaces full-screen slideshow, HeroSlideshow deleted), marquee removed, 'Shop by material' grid of all 14 from built-in data. --header-h 118/113 px.
  AFTER MERGE (owner signed in to ops): create categories Interiors, 'Hardware & Fittings' (then rename to Hardware), Glass, Furnishing; rename Sand, Jelly & Stone / Steel, UPVC & Aluminium / Plywood & Wood / Paints & Textures / Plumbing & Sanitary / Tools & Machines; sortOrder per the 14 order.
  Owner also asked (2026-11-09): plan for accounts, GSTIN check, seller verification and keeping seller data. Proposal sent in chat, waiting for the owner's choice.
- 2026-11-10 00:07 IST: #95 (Phase 1) MERGED. Ops category create/rename still pending: ops needs the owner's SMS sign-in (ops tab left open in Chrome). Owner chose "free first" for seller verification: build free GSTIN checks (check digit, state code vs PIN, one GSTIN/phone per seller), clear seller steps, ops review screen, audit trail, re-review on GSTIN/name change, document expiry reminders, optional buyer GSTIN at checkout; paid GST lookup later. Planned right after Phase 2.
- 2026-11-10 00:07 IST: PHASE 2 on feat/phase2-materials-page: category page rebuilt as the materials page. Compact title with breadcrumb and photo; sticky type chips at the top (catalogue options); left filter column on computers (Brand checkboxes + option groups such as Size, Insulation, Colour from the items' variants), bottom sheet on phones/tablets with 'Show N types'; removable filter chips; filters in the address (?type=&brand=&opt=Label:Option); supplier listings below follow the same filters. Material cards show the size range. Brand catalogues from owner PDFs plug into the same brand filter later.
- 2026-11-15 20:01 IST: SELLER VERIFICATION (free first), branch feat/seller-verification, API part done. Shared GSTIN checker (packages/web-core/src/gstin.ts + apps/api/src/shared/gstin.ts, keep in step): format, state code, check character, India Post state match. API: profile PATCH explains GSTIN mistakes; one GSTIN per seller (409 GSTIN_TAKEN); verified seller changing GSTIN or business name (not just case) goes back to PENDING (items hidden) + notification, and the GST certificate goes back to review; SupplierProfile.verificationLog audit trail (newest 100: name/GSTIN change, doc upload, doc review, ops verify/reject with note, RE_REVIEW); ops cannot verify a wrong or duplicate GSTIN; GET /ops/suppliers adds checks (GSTIN state/PAN, duplicate, PIN states outside the GSTIN state, documents accepted/waiting/rejected). API 395 tests pass. NEXT: seller setup steps + live GSTIN message; ops review screen (checks + audit trail); then PR. Later PR: document expiry reminders, optional buyer GSTIN at checkout.
- 2026-11-15 20:03 IST: Seller verification screens done. Seller setup: GSTIN checked as you type ("Looks right: registered in Karnataka, PAN ..." or the exact mistake), warning that a verified seller changing GSTIN is checked again; documents card now shows 3 steps (Your business, Your papers, Sthiva checks + status). Ops suppliers: GSTIN state/PAN or problem, a "check before approving" box (wrong/duplicate GSTIN, PIN states outside the GSTIN state, no papers, GSTIN without certificate), Verification history (audit trail). API 395, web-core 114 pass; seller build OK, ops typecheck OK. Not checked visually (needs a seller sign-in and the owner's ops SMS sign-in). PR opened. NEXT: owner merges; then PR 2: document expiry reminders + optional buyer GSTIN at checkout; then Phase 3 (product page).
- 2026-11-16 11:41 IST: #97 merged by owner. Branch feat/doc-expiry-buyer-gstin (PR 2 of seller verification), API part: papers get an optional expiry date (seller on upload, ops on review; null clears); reminders 30 days before, 7 days before and on expiry, each once per paper, from the 1-minute sweeper but at most hourly (features/suppliers/document-expiry.ts); expiry is logged (DOC_EXPIRED) but does not unverify; ops checks list expired / expiring soon. Buyer GST invoice: optional buyerGst {gstin, businessName} on POST /orders (full GSTIN check), stored on the order, remembered on User.gstNumber/gstBusinessName, visible to buyer and seller. API 400/401 (ops "unassigns a no-show driver" is flaky under full-suite load, passes alone 3/3). NEXT: seller upload date field, ops date + expiry warnings, buyer checkout GST box + order pages, then PR.
- 2026-11-16 11:46 IST: Screens for PR 2 done. Seller: "Valid until" date on the shop licence upload, "Valid until / expires soon / expired" on each paper. Ops: expiry date field when accepting (or "Save date"), valid-until line, expired / expiring-soon warnings, "Document expired" in history. Shop checkout: "I need a GST invoice" with GSTIN checked as you type + business name, prefilled from the last one (GET /users/me); order page shows "GST invoice to ...". Seller orders: "GST invoice needed: bill ..., GSTIN ...". Shop and seller builds OK, ops typecheck OK. Not checked visually (sign-in needed). PR opened. NEXT: owner merges; then Phase 3 (product page) of the redesign timetable.
- 2026-11-16 12:25 IST: #98 merged by owner. PHASE 3 (product page), branch feat/phase3-product-page, live look kept. (1) Phones: photos, then name/price/Add to cart, then details (before, price came after description, specs and helpers). Computers unchanged (buy box sticky on the right). (2) Big price follows the chosen quantity (bulk price with the list price struck through); bulk rows are buttons that set that quantity. (3) API GET /products/:id adds sellerCount (verified sellers with an ACTIVE listing of the same catalogue item, serving the PIN when given); page says "N verified sellers carry this / deliver to PIN" when more than 1. NOT built: an "other sellers" list, because the one-price model (2026-11-05) has Sthiva pick the supplier per order. Checked by eye at 390 and 1440 px on a local in-memory sample database (scratchpad sandbox/db.ts: the API always uses database name "buildx"; NEXT_PUBLIC_API_URL is the host only, the client adds /api/v1). NEXT: owner merges; then Phase 4 (3-step checkout).
- 2026-11-16 14:56 IST: #99 merged by owner. PHASE 4 (3-step checkout), branch feat/phase4-checkout. Steps fold into summaries with Change: 1 Delivery address (saved addresses from the account as radio cards with Remove, or a new one; site PIN shown with Change/Check using the shared PIN check, picking a saved address brings its PIN; phone), 2 Check your order (items, bulk price note, link to cart, GST invoice option), 3 Pay and place order (COD; phones get the button in the step, computers in the summary). Enter in an earlier field cannot place the order. API: each order's address saved on the account (newest first, 5 kept, same text+PIN moves to top), DELETE /users/me/addresses/:id. Replaces the device-only remembered address in old PR #94. API 402 pass, shop build OK. NOT checked in a browser: local API has no Firebase private key (apps/api/.env FIREBASE_PRIVATE_KEY empty) and using the production admin key locally was blocked; Vercel preview uses the live API, which has no products yet. NEXT: owner reviews/merges; Phase 5 (orders and notifications).
- 2026-11-16 15:13 IST: OWNER DECISIONS (after reviewing github.com/amzn and github.com/zomato: neither publishes marketplace code; useful patterns are Amazon Selling Partner API feeds/invoices/tracking/notifications and Zomato pulse (live MQTT), espresso (PDF invoices), MCP ordering). Owner chose ALL of, "clean and perfect, no rush", one PR each in this order: (1) GST invoice PDF, SUPPLIER bills the buyer (marketplace model; Sthiva bills the supplier for commission separately, later); (2) seller bulk price/stock upload by Excel; (3) live delivery tracking, driver location shared ONLY from pickup to delivered, nothing kept after; (4) WhatsApp order alerts for sellers/drivers, build switched off, show provider prices before any spend. These replace Phase 5. PR #100 (Phase 4) waiting for owner.
- 2026-11-16 15:25 IST: GST INVOICES, API part (branch feat/gst-invoices). HSN: listing field hsn (4/6/8 digits, '' clears); suggested 4-digit codes for 85 of 115 catalogue items (apps/api/src/shared/hsn.ts = packages/web-core/src/catalog/hsn.ts, keep in step); order lines copy hsn (listing's, else catalogue suggestion by CatalogItem slug). Invoice model + InvoiceCounter: issued once when goods leave the supplier (transitionOrder to PICKED_UP/IN_TRANSIT/DELIVERED, background, never blocks), in a transaction (gap-free numbers INV/<FY>/00001 per supplier; BOS/ series = bill of supply when supplier has no valid GSTIN). CGST+SGST same state (supplier GSTIN state vs delivery state from PIN; else buyer GSTIN state), IGST across states, split to the paisa. Snapshot of seller/buyer/lines/totals; delivery charge only as a note. PDF (pdfkit 0.15.2, Geist fonts in apps/api/assets/fonts, Dockerfile copies them): A4, all GST invoice fields, amount in words (Indian lakh/crore). GET /orders/:id/invoice, /suppliers/me/orders/:id/invoice, /ops/orders/:id/invoice (issues lazily for older dispatched orders). API 410 tests pass. OPEN QUESTIONS FOR OWNER/CA: unregistered suppliers still get GST added to buyer price (should be 0); Sthiva as e-commerce operator must collect TCS under GST once registered; e-invoicing (IRN) for suppliers over Rs 5 crore turnover; credit notes for cancellations after dispatch. NEXT: download buttons (shop, seller, ops) + HSN field on seller listing form.
- 2026-11-16 15:29 IST: GST invoices, screens: web-core client.requestFile + downloadFile + hasInvoice (PICKED_UP/IN_TRANSIT/DELIVERED). Shop order page "Download invoice" card; seller order card "Invoice PDF" (and the buyer-GST note now says Sthiva puts it on the invoice); ops order header "Invoice PDF"; seller listing form HSN field with the catalogue's usual code and a "Use it" button. Shop + seller builds OK, ops typecheck OK, web-core 114 pass. Sample invoice checked by eye (A4, CGST/SGST columns, amount in words). Screens not checked signed in (no local Firebase key). PR opened. NEXT: owner merges; then bulk upload (Excel) for sellers.
- 2026-11-16 15:41 IST: #101 merged by owner. BULK UPLOAD, API part (branch feat/bulk-upload, exceljs 4.4.0; not SheetJS: npm version has a known vulnerability). GET /suppliers/me/bulk.xlsx (Live, Out of stock, Paused and Draft listings; editable: price, stock, minimum order, HSN, Live/Paused; grey info columns: ID, item, unit, GST, bulk prices). POST /suppliers/me/bulk (multipart file .xlsx/.csv up to 2 MB / 2000 rows; apply=true saves): preview of changes per row and every mistake with its row number; columns found by header name; all or nothing, nothing saved while any row is wrong; same rules as the weekly check (bulk prices stay below the price, stock drives out of stock, on-order stock ignored, drafts only published on the website, another seller's ID refused). A file covering every listed item also confirms the Monday check. API tests pass (6 new). NEXT: seller website page.
- 2026-11-16 15:42 IST: Bulk upload screens: seller /bulk "Excel sheet" page (1 download, 2 upload: preview with changes as old -> new and mistakes by row number, 3 save; says when it counts as the weekly check), linked from Products ("Excel sheet" button), Stock and Weekly check. Seller build OK. Not checked signed in. PR opened. NEXT: owner merges; then live delivery tracking (driver location only from pickup to delivered).
- 2026-11-16 15:53 IST: #102 merged by owner. LIVE TRACKING, API part (branch feat/live-tracking). order.liveLocation {lat,lng,accuracy,at}: latest only, no history. POST /delivery/orders/:id/location (assigned driver, only PICKED_UP/IN_TRANSIT, at most every 10 s, India bounds; 409 tells the app to stop). GET /orders/:id/tracking (order's buyer only): sharing, location, straight-line km to the site, stale after 2 min. Erased on DELIVERED (transitionOrder) and on cancel; one-minute sweeper clears any position on orders not on the way. Hidden from the normal buyer order view and the supplier order list. Sthiva drivers only (supplier own-vehicle deliveries: status only, for now). API tests pass (4 new). NEXT: shop order page card, buyer app card, driver app sharing (needs expo-location = NEW APK BUILD by owner).
- 2026-11-16 16:00 IST: Live tracking screens. Shop order page: "On the way" card (polls every 15 s while visible: km from site, updated X ago, stale note, Open in Google Maps; no embedded map, no paid key). Buyer app: TrackingCard (react-query refetch 15 s). Driver app: useShareLocation (expo-location ~56.0.26, foreground watchPosition every 15 s / 30 m, stops on 409/leave; notices for sharing / location off with Open settings / old app). app.config.ts: expo-location plugin only for APP_VARIANT=driver, background location blocked for all, fine/coarse blocked for buyer and partner. Old installs: requireOptionalNativeModule('ExpoLocation') guard, so OTA updates are safe without bumping the app version. OWNER MUST: build a new Sthiva Driver APK (C:/bx/mobile: npm install, APP_VARIANT=driver prebuild --clean, gradle); Play listing for the driver app: declare foreground location in Data safety. PR opened.
- 2026-11-18 21:01 IST: OWNER DECISION: WhatsApp alerts through Meta directly (Cloud API, no middleman fee). Branch feat/whatsapp-alerts, built SWITCHED OFF (WHATSAPP_ENABLED=false). shared/services/whatsapp.service.ts sends approved templates sthiva_supplier_new_order (supplier's setup WhatsApp number = opt-in) and sthiva_driver_new_job (only drivers with DeliveryPartner.whatsappAlerts=true; PATCH /delivery/me whatsappAlerts; Driver app profile switch, OTA-able). No phone numbers or text in logs; failures never block orders. Removed unused INTERAKT_API_KEY. docs/WHATSAPP.md: costs (about Rs 0.115 + GST per utility message, charged even in the 24h window since 1 Oct 2026), Meta setup steps, exact template texts. 6 new tests. NEXT (owner): Meta Business verification, number, payment method, templates, system-user token; then set env vars on the API host.
- 2026-11-16 18:56 IST: OWNER DECISION: keep Google sign-in, leave SMS off (free). Branch feat/ops-google-signin: ops console gets "Continue with Google" (phone form stays below for registered test numbers), "no operations access" screen shows the email/phone to grant, ops user schema phone optional; grant-role accepts --email (Google accounts) or --phone. Apps unchanged (Google first, phone behind "Use mobile number instead" with a "use Google" message when SMS is unavailable). CLAUDE.md auth rule updated. Technical overview PDF updated. Ops tests 20 pass (1 new). AFTER MERGE: owner signs in to ops.sthiva.com with Google once, then run grant-role --email <gmail> --role ADMIN (Claude can run it against the live DB with owner OK).
- 2026-11-18 20:54 IST: PR #105 ops Vercel preview had failed once (Vercel-side; local build OK, CLI not logged in); empty commit rebuilt it green. Waiting for owner to merge #104 and #105; next: WhatsApp alerts (provider prices first).
- 2026-11-16 16:10 IST: #103 merged by owner. Owner asked for FREE pincode/location/maps. Chose: free GPS->PIN + free maps (MapLibre + OpenFreeMap, OSM data), then WhatsApp. Branch feat/free-location. API: POST /locations/reverse now uses the nearest India Post office with coordinates from our own directory (box search 5/11/22 km, max 20 km, delivery offices first at equal distance; new partial index datasetVersion+location); Google only as optional fallback if GOOGLE_MAPS_API_KEY is set. Works only where the imported data.gov.in file has office coordinates. Location tests 33 pass.
- 2026-11-16 16:22 IST: Free maps: packages/web-core/src/location/SiteMap.tsx (import by path, NOT from the package index, so only map pages load it): MapLibre GL 5.24.0 (v6 splits its worker into files Next does not serve: "Worker failed to load") + OpenFreeMap liberty style (free, no key, OSM credit kept visible). Gotcha: maplibre CSS makes the map box position:relative, so size it with width/height 100%, never absolute inset-0. Shop tracking card: map with driver + site (tracking API now returns site). Seller setup: pickup point map, tap or drag the pin to save. Checked by eye at 700 and 390 px (headless Chrome here crashes on WebGL after ~5 s; screenshots taken before that). API 37 location/tracking tests, web-core 114, shop + seller builds OK. PR opened. NEXT: owner merges; then WhatsApp alerts (switched off, show provider prices first).
- 2026-11-16 17:55 IST: Owner asked for a pitch deck PDF. Made it OUTSIDE the repo (repo is public): C:/dev/BuildX/pitch-deck/Sthiva-Pitch-Deck.pdf, 18 slides 16:9, brand fonts and logo, real screenshots of sthiva.com. Source deck.html + build.cjs (node build.cjs --preview rebuilds the PDF and slide previews). No invented numbers; competition shown honestly as how people buy today (not "no competitors").
- 2026-11-16 18:15 IST: Pitch deck changed per owner: not raising money now (raise after it works, while scaling), cover says Company overview, LinkedIn on team slide. Also made a technical overview for the tech team, OUTSIDE the repo: C:/dev/BuildX/tech-doc/Sthiva-Technical-Overview.pdf (11 A4 pages: system, stack, code layout, roles, flows, data model, API, hosting, quality, known limits, requirements tables with an answer column for the team, roadmap, glossary). Rebuild: node build.cjs in that folder. No secrets or values in it, env var names only.
- 2026-11-16 18:49 IST: Both PDFs: every link clickable (LinkedIn without trailing slash, sthiva.com, seller.sthiva.com, mailto support). Technical overview now 14 pages with section 09A Technical requirements (server spec from deploy/vultr, Atlas replica set, Flex/M10, daily backups, network access, services, environments incl. missing staging, mobile build machine, deploy steps, monthly cost) and a staging question in 11.1.
- 2026-11-16 18:51 IST: Technical overview: added 09B PIN codes, location and email (India Post 2019-05 directory live, import steps; GPS to PIN, maps, tracking, distances; Google sign-in, support@ forwarding to Gmail, no platform emails yet, SPF/DKIM needed) plus questions 11.4 and two known limits. 17 pages.
- 2026-11-18 21:40 IST: #104 merged by owner. #105/#106 had conflicts after #104: merged main into both (clean). #105 ops Vercel build kept failing because my earlier 'git add apps/web' had committed the owner's old untracked leftovers (apps/web/app/(admin)/*, apps/web/lib/api-client.ts, importing packages the project lacks); removed from the branch (local files kept) and listed in .git/info/exclude. RULE: never 'git add' a whole app folder here; add files by name. Both PRs green and mergeable.
- 2026-11-18 21:41 IST: #105 merged but the squash included 4 old untracked leftovers (apps/web/app/(admin)/*, apps/web/lib/api-client.ts) that I had committed by mistake; the ops production build failed (live ops site stayed on the previous build). PR fix/remove-leftover-files removes them from git (local copies kept, ignored via .git/info/exclude). RULE: add files by name, never a whole app folder.
- 2026-11-18 21:47 IST: Owner merged #105 and #106. #106 already contained the leftover-file removal, so main is clean (0 leftover files) and the ops production build succeeded; ops.sthiva.com/signin shows Continue with Google. Closed #107 as redundant. All four chosen features merged (invoices, Excel upload, tracking, WhatsApp off). NEXT (owner): grant own Gmail ADMIN on ops (sign in once, then grant-role --email), Meta WhatsApp setup (docs/WHATSAPP.md), new Driver APK, import current India Post file, Vultr server, real suppliers.
- 2026-11-19 IST: Wrote the Sthiva Execution Plan (Claude Docs, https://claude.ai/artifact/LZrL8BeG3MUa4pPQdjBre4): scorecard, 12 ranked failure points with fixes, 9 reliability rules + targets (99.5% then 99.9%), team of 6 owned seats on intern/low budget with org chart, team working rules (board, protected main, 3 environments, Tue/Thu releases, on-call), 5-phase gated roadmap, Phase 0 two-week checklist, budget (~Rs 3,000-5,000/month), 12 weekly numbers, 10 founder decisions. NEXT (owner): read it, name a person per seat, approve the week-1 decisions (private repo + GitHub Pro, Vultr server, Atlas Flex backups); then Claude executes Phase 0.
- 2026-11-20 01:30 IST: Phase 1 of the order-alert work (branch feat/order-alert). Research (public sources only; the Zomato APK was NOT decompiled): Zomato merchants accept/reject within a time limit with auto-reject; Swiggy/POS tools pause single items with timed return; Zepto pilots same-day slots with cancel up to 30 min before. Built: new-order alert says items (2 named + 'and N more'), delivery PIN/district, what the seller EARNS after commission (both figures if they can deliver), minutes left (features/orders/offer-alert.ts); WhatsApp template sthiva_supplier_new_order now 4 variables (docs/WHATSAPP.md updated, not yet submitted to Meta). Seller website: NewOrderWatcher on every page checks every 20 s, sticky banner, rings every 15 s until answered (Web Audio, after first tap), count in tab title, optional browser notification; orders page refreshes in place. NEXT: Phase 2 per-product pause (back on a date), Phase 3 optional delivery slots per product; mobile loud 'new orders' channel needs a new APK (expo-notifications channel).
- 2026-11-20 00:55 IST: Seller payout account (branch feat/seller-payout-account). Sellers add a bank account (with cancelled cheque/passbook photo, private) or UPI ID on seller.sthiva.com/payouts; number stored AES-256-GCM encrypted (shared/secret-box.ts, env PAYOUT_ENCRYPTION_KEY), only masked shown back. Ops verify on the supplier page (full details + 10-min proof link, each view logged; review carries submittedAt so a changed account cannot be approved unseen). Changing a verified account pauses payouts 48 h + alerts the seller. Supplier settlements with net > 0 can only be marked paid to a verified account outside the pause; statement records paidTo. 435 API tests pass. NEXT: set PAYOUT_ENCRYPTION_KEY on Render (and later Vultr, same value) after merge; then shop open/closed switch, seller terms acceptance.
- 2026-11-20 01:50 IST: Phase 2, pause ONE product until a date (branch feat/product-pause). Product.pausedUntil (start of that IST day); shared rule features/products/availability.ts (orderable(), isPaused) used by buyer list, product page, order supplier choice, stock claim, allocation moves and AI search. Paused listing is hidden; orders for that item go to other sellers; when nobody else has it the product page shows 'Available again <date>' and ordering is refused clearly. Comes back by itself, no job needed. Seller site Products: Pause opens Until tomorrow / 3 days / 1 week / pick a date (up to 90 days) / until I turn it back on; 'Paused, back <date>' pill and Resume now. 439 API tests pass, seller and buyer builds pass. NEXT: Phase 3 optional delivery slots per product; Partner app pause (JS-only, can go out by OTA).
- 2026-11-20 01:45 IST: Phase 3, optional delivery slots per product (branch feat/delivery-slots). Seller ticks 'Offer delivery slots' per listing (Product.slotDelivery). Fixed windows Morning 7-11, Midday 11-3, Evening 3-7; bookable tomorrow to 14 days, from the listing's shortest delivery time (features/orders/delivery-slots.ts). Quote returns slots {available, earliest, latest}; checkout step 2 shows Standard vs Book a slot (day chips + window). Slot orders go only to sellers offering slots on every item who can make the date, at creation and when moved; accepting confirms the slot date, seller cannot move it. Alert and buyer push name the slot. Buyer order page shows the slot; product page shows 'Book a delivery slot at checkout'; ops order page shows it. 449 API tests pass; seller, buyer and ops builds pass. NEXT: owner merges; Partner app (mobile) shows slot and pause (OTA); encryption key on Render.
- 2026-11-20 IST: Owner merged #113 (delivery slots). OWNER RULE (2026-11-20): no mobile app work (no apps/mobile changes, OTA or APK) until the owner says; build everything on the websites and test on the live subdomains (sthiva.com, seller.sthiva.com, ops.sthiva.com, api.sthiva.com). Verified live: pause, payout account, ops payout check. Waiting for Vercel to deploy slots. Open: PAYOUT_ENCRYPTION_KEY on Render (needs Chrome extension connected).
- 2026-11-20 IST: Marketing Plan doc https://claude.ai/artifact/DdJ7uHqit36Xz5KLmFGDjN (tab 'Meta ads playbook' built from the owner's IIM course prompts PDF). NEXT (first thing in a session started with Chrome connected, e.g. 'claude --chrome'): run the PDF's Facebook Ads Library prompt via Claude in Chrome for HomeRun, Infra.Market, UltraTech/ACC/Dalmia, Asian Paints/Astral, Tumakuru dealers; write the findings into section 9 of that tab (and an HTML report page if wanted). Also with Chrome: set PAYOUT_ENCRYPTION_KEY on Render.
- 2026-11-20 03:10 IST: Go-live checklist like a food-delivery partner's onboarding (branch feat/go-live-checklist). API GET /suppliers/me/go-live (features/suppliers/go-live.ts): 7 steps (business, area, range, papers, payout, agreement, products) with TODO/WAITING/DONE/PROBLEM, then Sthiva review. Seller agreement page seller.sthiva.com/agreement (10 plain sections from the rules the code enforces; version SELLER_TERMS_VERSION=2026-11-20; acceptance stores version, time, IP, browser; bump version to make everyone re-accept). Overview shows the checklist until live and complete. Ops supplier card shows the same steps. 454 API tests pass; seller and ops builds pass. Agreement text should be reviewed by a lawyer/CA before real sellers sign. NEXT (owner asked): quick product picker like a laundry app (+/- per standard item) and warranty/review details on listings.
- 2026-11-20 03:15 IST: Quick add, laundry-app style (branch feat/quick-add). seller.sthiva.com/products/quick: category chips, search, 'My prices include GST', one row per Sthiva catalogue item (photo, brand, approx kg per unit, GST, current listing) with a price box and a - stock + counter (bags/pieces by 10); sticky 'Save all (N)'. API GET/POST /suppliers/me/quick-add (features/suppliers/quick-add.ts): new listings take name, brand, unit, GST, photos, description from the catalogue item; existing ones get price and stock; discontinued or draft ones revive; all or nothing. Products page gets a Quick add button; go-live 'Your products' step opens it. 458 API tests pass; seller build passes. NEXT: warranty field, buyer reviews screen.
- 2026-11-20 03:25 IST: Warranty and buyer reviews (branch feat/warranty-reviews). Product.warranty {months 1-360, by MANUFACTURER|SELLER, note}; seller product form section 'This product has a warranty' (quick 6 mo/1/2/5 yr); buyer product page warranty card. Reviews rewritten (features/reviews): zod-checked input (1-5 stars, comment <=500, onTime, asListed), one per delivered order, counts for the seller (avgRating + totalReviews) and for every item in the order across all sellers (one-price model); names shown as 'Ravi K.' (reviewerId.name kept in that short form for installed apps); new GET /reviews/products/:id with summary (average, count, % on time, % as listed). Buyer order page: 'How was your order?' card after delivery; product page shows item reviews and summary. 462 API tests pass; buyer and seller builds pass.
- 2026-11-20 10:00 IST: Sizes on one product page (branch feat/product-variants), step 1 of the market study. CatalogItem.family + variant details (up to 3, e.g. Thickness 18 mm, Size 8 x 4 ft), set by ops on ops.sthiva.com/catalog ('Group sizes'). Buyer product page shows a chip row per detail; each chip opens that size at its best buyer price near the PIN (orderable listings only); sizes nobody sells nearby show as Unavailable. 464 API tests pass; buyer and ops builds pass. NEXT: step 2 material-list order for buyers; optionally collapse a family into one card in listings ('3 sizes').
- 2026-11-20 10:20 IST: Order by list for buyers (branch feat/material-list), step 2 of the market study. sthiva.com/order-by-list: category tabs (a dot marks categories with picked items), search, one row per item at its best price near the PIN (photo, per-unit price, top bulk tier, minimum), a - qty + counter (respects minimum and stock), line total; picks kept across categories; sticky bar 'N items, about Rs X before delivery' and 'Add all to cart'. Links from the header (desktop) and every category page. Uses the existing /products API (up to 150 items per category). Buyer build passes. NEXT: step 3 split orders across sellers (big lists often won't fit one seller).
- 2026-11-20 10:40 IST: Split orders across sellers (branch feat/split-orders), step 3 of the market study. order.service: priceCart now returns parts; one seller for the whole cart is still tried first; if none, splitCart picks the fewest sellers (max 3, most lines first, cheaper on a tie) who together cover the list; each part priced and given a delivery charge on its own. createOrder makes one order per part in ONE transaction (all or nothing), linked by orderGroup {id, part, parts}; later parts get key~N so the idempotency index holds; replay returns the whole group. Quote returns parts + per-line part; response returns totals over all parts and orders[]. Buyer checkout shows 'Delivered in N parts' and Part tags; order page and list show 'Part 1 of 2'; ops order page shows the group. 469 API tests pass (5 new); buyer and ops builds pass.
- 2026-11-20 13:00 IST: Step 5, bulk quotes (branch feat/bulk-quotes). API features/quotes + QuoteRequest model: buyer POST /quotes (cart items, site address with PIN, needed-by 1-60 days, note) invites verified sellers serving the PIN who list any item or sell the category; sellers see PIN/district only and reply within 48 h (price per line, GST incl or not, delivery charge, date <= needed-by), can change or withdraw; buyer GET /quotes/:id sees replies with commission + GST added, sorted by total, seller name/rating/distance; accept (one transaction) creates a CONFIRMED order at quoted prices with the seller's date, stock not reserved, others told NOT_CHOSEN. Buyer pages /quotes/new (cart button 'Big job? Get a bulk quote'), /quotes, /quotes/[id]; seller page /quotes (nav 'Quotes'). 4 new API tests (all pass; full suite passes, a few files flaky on DB start when run all together). Buyer and seller builds pass.
- 2026-11-20 11:00 IST: Step 4 of the market study (branch feat/bulk-price-cards). Product cards show 'Bulk price Rs X (N+)' (the lowest tier; all tiers on hover) and, for SHEET listings, 'Rs Y per sq ft'. Product page price shows per sq ft (follows the bulk price for the chosen quantity); Order by list rows too. lib/sheet-area.ts reads the sheet size from the Size detail or name (8x4, 8 x 4 ft, 8' x 4', 2440 x 1220 mm; a lone thickness is ignored). Buyer tests 24 pass (3 new); build passes. Owner: launch area is Chitradurga but location changes in code are PAUSED until the owner picks the exact area (PR #122 closed).
- 2026-11-20 13:40 IST: Step 6, made to measure (branch feat/made-to-measure). Reuses bulk quotes: QuoteRequest.kind LIST|CUSTOM, custom {workType, workName, spec, siteVisit}, lines may have no catalogue item and carry label + widthMm/heightMm. POST /quotes/custom (work type from the shared catalogue's 17 made-to-order items: glass, fluted glass, uPVC/aluminium windows, main doors, shower partitions, kitchens, wardrobes, mesh...; pieces with sizes; material; site visit) invites verified sellers serving the PIN whose categories include the work's category; GST 18%; accept makes a CONFIRMED order with sizes in item names and the material in the notes. Buyer page /made-to-measure (feet/inches/mm, pieces list, spec hints), header link, 'Get it made to your sizes' on made-to-order material pages; quotes pages show the work. Seller Quotes page shows the work, material and site-visit request. 5 quote tests pass; buyer and seller builds pass.
- 2026-11-20 15:00 IST: Step 7 returns and refunds (branch feat/returns-policy). OWNER DECISIONS 2026-11-20: problem reporting and change-of-mind returns depend on the product and the seller (on-spot notice by default); refunds to UPI or bank within 3 working days (never coupons); the seller pays refund and return trip when at fault. Product.returnPolicy {problemWindow AT_DELIVERY|H24|H48|D7, changeOfMind NONE|UNOPENED_1D|UNOPENED_7D}, default strict; seller sets it on the product form; buyer product page shows it in the price box; order items keep the policy as promised when ordered. Refunds page rewritten (per-product returns, 3 working days, seller pays when at fault), legal date 20 November 2026. Seller agreement updated (returns per product, seller pays when at fault, refunds in 3 working days); SELLER_TERMS_VERSION 2026-11-20.2 so every seller accepts again. 476 API tests pass; buyer and seller builds pass. NEXT: a buyer 'Report a problem' button on delivered orders within the window.
- 2026-11-20 14:10 IST: Product page ideas from Wakefit (branch feat/product-page-guidance). CatalogItem.variantNote (ops 'Guide for buyers who pick this option'), shown under the size chips with a bulb icon; 'Need a size not shown? Order it made to measure' link on made-to-order products; 'Get it by <date> to <PIN>, if ordered today' from the usual delivery time; trust strip under Add to cart (Pay on delivery; Check before you pay -> /refunds; warranty or Verified sellers; Any size -> made to measure, or GST invoice). Buyer and ops builds pass. NEXT: step 7 returns/refund rule needs the owner's decision.
- 2026-11-20 15:10 IST: Fixed flaky API tests (branch fix/test-db-ports). Cause: parallel test workers each started an in-memory MongoDB on a random port and sometimes picked the same one ('Port ... already in use'), failing a whole file at random (seen on #124 and #126 CI and locally). test/helpers.ts startDb now gives each worker its own port range (VITEST_POOL_ID) and retries a busy port; stopDb clears the handle. 3 full local runs in a row: 474/474. #127 Vercel failures were the free plan's build rate limit, not code.
- 2026-11-20 15:40 IST: #128 merged (test port fix). #126 conflicted with main after that; merged main in, CI tests green (only Vercel preview builds fail: free-plan daily build limit). #127 rebuilt on top of #126 (resolved the product page by taking #126's page and re-adding the returns lines) so both merge cleanly in order 126 then 127. Buyer build passes.
- 2026-11-20 16:05 IST: #126 merged (squash). #127 then conflicted on the product page; kept #127's page (main's page was identical to #126's, plus the returns lines). Also found 3 files in #127 saved with Windows line endings while main uses Unix ones (product page, refunds page, seller agreement page), which made the PR look like ~760 changed lines per file; converted to Unix. #127 now 15 files, +143/-11, mergeable, all tests green; Vercel previews still on the free-plan daily build limit. LESSON: scripts writing files on Windows must keep the file's original line endings (open with newline='').
- 2026-11-20 16:45 IST: Report a problem, API part (branch feat/report-problem). ProblemReport model; features/problems (service + routes): buyer GET/POST /problems/orders/:orderId, POST /problems/:id/withdraw; seller /suppliers/me/problems (+ /:id/reply); ops /ops/problems (?status=OPEN|REFUND_DUE|...), /:id/resolve, /:id/refund-paid. Windows from each order line's returnPolicy; AT_DELIVERY lines can be put on record for 2 hours after delivery (what was seen on the spot); change of mind only where allowed, refund only. Refund due in 3 working days (Mon-Fri). Seller charge default: seller's share of the refund (+ return trip when at fault); ops can override. Settlements take pending charges off the seller's next statement (Settlement.deductions/deducted; cancel frees them). Buyers can upload photos (folder problems, not cropped). 9 new tests. NEXT: buyer, seller and ops screens.
- 2026-11-20 17:30 IST: Report a problem, screens. Buyer: components/account/ReportProblem.tsx on delivered orders (kind, items + how many with each item's deadline, photos via /upload/image, description, replace or refund, UPI ID; report status and withdraw); lib/problems.ts; refunds page points to it (2 hours to put on record, longer where the product allows). Seller: /problems page (photos, agree/disagree with reason) + nav 'Problems'; payouts page shows problem charges. Ops: /problems page (To decide / Refunds to send / Resolved / Not accepted), decision form with standard seller charge (editable), mark refund sent with UPI reference; payouts show charges and allow a statement with only charges. upload test updated (buyers allowed, drivers not). 485 API tests pass; buyer, seller, ops builds pass.
- 2026-11-20 18:10 IST: Websites were stuck at #125 (Vercel 'Deployment rate limited' on #126-#129 merges; API on Render is current). Branch fix/agreement-version-and-builds: (1) seller agreement page now sends its own TEXT_VERSION, not the API's, and shows 'reload' if they differ, so a stale site can't record acceptance of text it didn't show; API test keeps TEXT_VERSION == SELLER_TERMS_VERSION. (2) vercel.json in all three sites: no deployments for feat/fix/docs/chore/test branches, ignoreCommand skips non-production builds. Rewrote CURRENT STATE and NEXT STEPS.
- 2026-11-20 18:30 IST: #130 CI hit another random test failure: MongoDB took over 10 s to start on a busy GitHub runner. test/helpers.ts: launchTimeout 40 s, 3 attempts; vitest hookTimeout 150 s. 487/487 locally.

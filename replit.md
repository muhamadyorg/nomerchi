# MapVizit — O'zbekiston xaritasi va raqamli vizitka platformasi

O'zbek tilidagi to'liq funksional platforma: interaktiv xarita, raqamli vizitka sahifalari (QR kod bilan), 4 ta foydalanuvchi roli, Telegram backup boti.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API serverni ishga tushirish (port 8080)
- `pnpm --filter @workspace/mapvizit run dev` — Frontend (port 23573)
- `pnpm run typecheck` — barcha paketlar uchun to'liq typecheck
- `pnpm run build` — typecheck + build barcha paketlar
- `pnpm --filter @workspace/api-spec run codegen` — API hooks va Zod schemalarni qayta generatsiya qilish
- `pnpm --filter @workspace/db run push` — DB sxemasini push qilish (faqat dev)
- Majburiy env: `DATABASE_URL` — Postgres ulanish string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Wouter + TailwindCSS + shadcn/ui
- Xarita: react-leaflet (OpenStreetMap, CARTO dark tiles)
- Vizitka: qrcode.react (QRCodeSVG)
- Charts: recharts (sudo dashboard)

## Where things live

- `artifacts/api-server/src/routes/` — barcha API route'lar
- `artifacts/api-server/src/lib/auth.ts` — JWT autentifikatsiya middleware
- `artifacts/mapvizit/src/pages/` — frontend sahifalari
- `lib/db/src/lib/schema.ts` — DB sxemasi (source of truth)
- `lib/db/src/lib/telegram-backup.ts` — Telegram backup scheduler
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/src/generated/api.ts` — generatsiya qilingan React Query hooks

## Architecture decisions

- JWT tokenlar `localStorage`ga `mapvizit_token` kaliti bilan saqlanadi
- `customFetch.ts` har so'rovga Bearer token qo'shadi
- Vizitka kodlari nanoid bilan 6 ta belgi (URL-safe)
- Telegram backup har daqiqada ishga tushadi (sozlamalar bo'lsa)
- Barcha hooks'lar orval generatsiyasi — ochiq API spec bilan sinxron

## Product

- **Login** — foydalanuvchi nomi + parol bilan kirish
- **Xarita** — OpenStreetMap/CARTO, nuqtalar, kategoriya filtrlari, real-time qidiruv
- **Vizitka** — `/vizitka/[6char]` — QR kod, kontaktlar, rasm, ulashish
- **Saqlangan** — `/saved` — yoqtirgan nuqtalar
- **Profil** — rol, ma'lumotlar, navigatsiya
- **Sudo Panel** — to'liq CRUD: nuqtalar, kategoriyalar, foydalanuvchilar, sozlamalar, eksport/import
- **Admin Panel** — biriktirilgan nuqtani tahrirlash (nom, tavsif, kontaktlar, rasmlar)

## User preferences

- O'zbek tili interfeysi (barcha sahifalar)
- Dark mode default
- Uzbek map tiles (OpenStreetMap yoki CARTO dark)

## Gotchas

- `queryKey` majburiy — barcha `query` optsiyalarida `queryKey: getXxxQueryKey()` ham berish kerak
- `useListPoints({})` — birinchi argument params (bo'sh ob'ekt ham yaxshi)
- CSS `@import` Vite warning bor lekin xato emas

## Test credentials

- Sudo: `sudo` / `sudo123`
- To'rtta namunaviy Toshkent nuqtasi seeded (Korzinka, Apteka, Choyxona, Hamkor Bank)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

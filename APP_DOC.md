# AI Receipt Scanner — App Documentation

## 1) Overview
AI Receipt Scanner is an Expo/React Native mobile app that captures receipt/invoice images and extracts structured financial data using Groq Vision (Llama 4 Scout). Extracted data is normalized, stored locally in SQLite, and can be exported as JSON or Google‑Sheets‑friendly CSV.

**Primary users**: accounting / finance teams who want to reduce manual receipt entry.

---

## 2) Tech Stack
- **Framework**: Expo SDK 54, React Native
- **Navigation**: Expo Router (file-based routes)
- **Camera / Media**: `expo-camera`, `expo-image-picker`, `expo-image`
- **Storage**: `expo-sqlite`
- **Filesystem / Export**: `expo-file-system/legacy`, `expo-sharing`
- **AI / OCR**: Groq Vision via OpenAI-compatible Chat Completions endpoint

---

## 3) App Structure

### 3.1 Routing (`app/`)
- `app/(tabs)/index.tsx`: Dashboard
- `app/(tabs)/capture.tsx`: Capture + AI processing flow
- `app/(tabs)/history.tsx`: Receipt list + search/filter
- `app/receipt/[id].tsx`: Receipt detail, JSON preview, export
- `app/(tabs)/_layout.tsx`: Bottom tabs (Home / Scan / History)

### 3.2 Services (`services/`)
- `services/groq-vision.ts`: Groq Vision request + response normalization
- `services/storage.ts`: SQLite schema + CRUD + stats queries
- `services/export.ts`: JSON/CSV export + share

### 3.3 Reusable UI (`components/`)
- `components/receipt/camera-capture.tsx`: Camera + gallery picker UI
- `components/receipt/receipt-card.tsx`: Receipt list item
- `components/receipt/receipt-preview.tsx`: Receipt detail display
- `components/receipt/line-item.tsx`: Line item row
- `components/ui/icon-symbol.tsx`: iOS SF Symbols → Android/Web MaterialIcons mapping

### 3.4 Types (`types/`)
- `types/receipt.ts`: `Receipt`, `LineItem`, filters, stats, export types

---

## 4) Data Model

### 4.1 Receipt Type (runtime shape)
The app stores receipts using this core shape (see `types/receipt.ts`):
- `merchant_name: string | null`
- `receipt_date: string | null` (ISO `YYYY-MM-DD`)
- `receipt_number: string | null`
- `invoice_type: 'retail' | 'restaurant' | 'utility' | 'service' | 'unknown'`
- `items: { name: string; quantity: number | null; price: number }[]`
- `subtotal: number | null`
- `tax: number | null`
- `total: number` (required for storage; API may return null → app defaults)
- `currency: string` (e.g., `BDT`)
- `payment_method: string | null`
- `confidence_score: number` (0..1)
- `image_uri: string`
- `raw_text: string | null` (reserved for future OCR text)
- `error_message: string | null`
- `created_at: string` (ISO timestamp)

### 4.2 SQLite Schema
The SQLite table is created in `services/storage.ts`:
- Table: `receipts`
- `items` is stored as JSON text
- Indexes exist for `created_at`, `invoice_type`, and `merchant_name`

---

## 5) AI Extraction (Groq Vision)

### 5.1 Model
Default model:
- `meta-llama/llama-4-scout-17b-16e-instruct`

### 5.2 Request Format
The app calls Groq’s OpenAI-compatible endpoint:
- `POST https://api.groq.com/openai/v1/chat/completions`
- Sends:
  - A strict instruction prompt requesting **valid JSON only**
  - An `image_url` with `data:image/jpeg;base64,...`
  - `response_format: { "type": "json_object" }` for JSON mode

### 5.3 Normalization & Safety
After response:
- Coerces invalid `invoice_type` to `unknown`
- Normalizes `receipt_date` into ISO `YYYY-MM-DD` when possible
- Normalizes `confidence_score` into 0..1
- Ensures `items` is always an array
- Missing values become `null`
- If parsing fails, returns a safe object with `invoice_type: 'unknown'` and `error_message`

### 5.4 Image Constraints
Groq Vision constraints (per Groq docs):
- Max base64 payload: **4MB**
- Max image resolution: **33 megapixels**
- Max image URL size: **20MB**

The app validates file existence and checks resolution. If the base64 is too large, it errors with a clear message (future improvement: auto-resize with `expo-image-manipulator`).

Docs: `https://console.groq.com/docs/vision`

---

## 6) Main User Flows

### 6.1 Capture → Parse → Save
1. User opens **Scan** tab.
2. User captures a photo or selects from gallery.
3. App validates image (exists, resolution, size constraints).
4. App calls Groq Vision to extract structured JSON.
5. App stores the receipt in SQLite.
6. App shows a success screen with a preview and link to details.

### 6.2 History → Detail → Export
1. User opens **History** tab.
2. User filters by `invoice_type` and/or searches by merchant name.
3. User opens a receipt detail page.
4. User can:
   - View image
   - Preview JSON schema in-app
   - Export JSON or CSV and share

---

## 7) Screens

### 7.1 Dashboard (`app/(tabs)/index.tsx`)
- High-level stats (total receipts, this month, total amount)
- Quick actions (Scan Receipt, View History)
- Recent receipts list

### 7.2 Capture (`app/(tabs)/capture.tsx`)
- Camera/gallery capture via `CameraCapture`
- Loading state during AI processing
- Error state with “Try Again” or “Save Anyway”

### 7.3 History (`app/(tabs)/history.tsx`)
- FlatList of receipts
- Filter chips by invoice type
- Search by merchant name
- Export all as JSON/CSV

### 7.4 Receipt Detail (`app/receipt/[id].tsx`)
- Image preview (tap to enlarge)
- JSON schema preview (modal)
- Export actions: JSON / CSV / New scan

---

## 8) Environment & Secrets

### 8.1 Local Dev
Set your Groq key in your environment (Expo public env vars are preferred for client-side use):
- `EXPO_PUBLIC_GROQ_API_KEY=...`

Note: If you change the key name in code, ensure your `.env` and EAS secrets match.

### 8.2 Production (EAS)
Use EAS Secrets to provide the API key at build time.

---

## 9) Development Builds
This project uses `expo-dev-client` for development builds.

Typical commands:
- `pnpm start`
- `npm run development-builds` (workflow) or `eas build --profile development --platform android`

---

## 10) Troubleshooting

### 10.1 “expo-dev-client not installed”
Install:
- `npx expo install expo-dev-client`

### 10.2 SQLite NativeDatabase.execAsync rejected / NullPointerException
This can happen if the DB handle becomes stale. The storage layer includes connection re-initialization and retry logic. If you still see it:
- Restart the app
- Clear the dev client cache
- Ensure `expo-sqlite` is installed and the config plugin is present in `app.json`

### 10.3 Icons missing on Android
Ensure SF Symbol names used in `IconSymbol` are mapped to MaterialIcons in:
- `components/ui/icon-symbol.tsx`

---

## 11) Future Improvements (Suggested)
- Auto-resize/compress images using `expo-image-manipulator` to stay under 4MB
- Add manual edit UI for extracted fields (especially for low confidence)
- Add optional cloud sync (Supabase/Firebase) for team workflows
- Add batch import and background processing queue
- Add per-field confidence scores (not just a global score)


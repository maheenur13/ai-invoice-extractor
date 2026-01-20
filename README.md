# AI Receipt Scanner

A mobile application that captures receipt images and automatically extracts structured financial data using AI-powered OCR (Groq Vision API with Llama 4 Scout model).

## Features

- **Capture Receipts**: Take photos using the camera or import from gallery
- **AI-Powered Extraction**: Automatically extracts merchant name, date, line items, totals, and more
- **Invoice Type Detection**: Classifies receipts as retail, restaurant, utility, service, or unknown
- **Local Storage**: Stores all receipts locally using SQLite
- **Export Options**: Export data as JSON or CSV (Google Sheets compatible)
- **Dashboard**: View statistics and recent receipts at a glance
- **Search & Filter**: Find receipts by merchant name or filter by type

## Extracted Data Fields

For each receipt, the app extracts:
- Merchant/Store Name
- Date
- Receipt Number
- Invoice Type
- Line Items (name, quantity, price)
- Subtotal, Tax, Total
- Currency
- Payment Method
- Confidence Score

## Setup

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Expo CLI
- iOS Simulator or Android Emulator (for development builds)
- Groq API Key (get one from [console.groq.com](https://console.groq.com/keys))

### Installation

1. Clone the repository and install dependencies:

```bash
pnpm install
```

2. Create a `.env` file in the project root:

```env
EXPO_PUBLIC_GROQ_API_KEY=your_groq_api_key_here
```

3. Start the development server:

```bash
pnpm start
```

### Development Build

This app requires native camera access, so you'll need a development build (Expo Go won't work for full functionality):

```bash
npm run development-builds
```

## Project Structure

```
app/
├── (tabs)/
│   ├── _layout.tsx      # Tab navigation
│   ├── index.tsx        # Dashboard screen
│   ├── capture.tsx      # Camera/upload screen
│   └── history.tsx      # Receipt history
├── receipt/
│   └── [id].tsx         # Receipt detail view
└── _layout.tsx          # Root layout

services/
├── groq-vision.ts       # Groq API integration
├── storage.ts           # SQLite database operations
└── export.ts            # JSON/CSV export

components/
├── receipt/
│   ├── camera-capture.tsx
│   ├── receipt-card.tsx
│   ├── receipt-preview.tsx
│   └── line-item.tsx
└── ui/

types/
└── receipt.ts           # TypeScript interfaces
```

## API Reference

### Groq Vision API

This app uses the Llama 4 Scout model (`meta-llama/llama-4-scout-17b-16e-instruct`) for receipt extraction.

**Limitations:**
- Max image size: 4MB (base64 encoded)
- Max resolution: 33 megapixels
- Max 5 images per request

## Sample Output

```json
{
  "merchant_name": "ABC Store",
  "receipt_date": "2025-01-12",
  "receipt_number": "R-93821",
  "invoice_type": "retail",
  "items": [
    {
      "name": "Milk",
      "quantity": 1,
      "price": 50
    }
  ],
  "subtotal": 50,
  "tax": 5,
  "total": 55,
  "currency": "BDT",
  "payment_method": "Cash",
  "confidence_score": 0.92
}
```

## Scripts

- `pnpm start` - Start the development server
- `pnpm run development-builds` - Create development builds
- `pnpm run draft` - Publish preview update
- `pnpm run deploy` - Deploy to production

## Technologies

- **Framework**: Expo SDK 54 / React Native
- **Navigation**: Expo Router (file-based routing)
- **Database**: expo-sqlite
- **AI/OCR**: Groq Vision API (Llama 4 Scout)
- **Camera**: expo-camera, expo-image-picker
- **Export**: expo-file-system, expo-sharing

## License

0BSD

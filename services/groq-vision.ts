
import * as FileSystem from 'expo-file-system/legacy';
import { Image as RNImage } from 'react-native';
import {
  GroqReceiptResponse,
  ImageProcessingResult,
  InvoiceType,
} from '../types/receipt';

// Groq API configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_ID = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Image constraints from Groq API
const MAX_BASE64_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_IMAGE_DIMENSION = 2048;
const JPEG_QUALITY = 0.8;

/**
 * Get Groq API key from environment
 * Prefer EXPO_PUBLIC_GROQ_API_KEY for client builds; GROQ_API_KEY for server/dev
 */
function getApiKey(): string {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY not found. Please set EXPO_PUBLIC_GROQ_API_KEY or GROQ_API_KEY.');
  }
  return apiKey;
}

/**
 * Receipt extraction prompt
 */
const EXTRACTION_PROMPT = `You are an expert multilingual receipt/invoice data extraction system with specialized support for Bengali/Bangla language and handwriting recognition. You excel at reading both printed and handwritten text in English and Bangla, even when handwriting is poor, messy, or difficult to read.

LANGUAGE SUPPORT - CRITICAL:
- This receipt may be in English, Bengali/Bangla, or a mix of both languages
- You MUST detect and read Bangla script (বাংলা) characters accurately
- DO NOT hallucinate or invent Bangla text - only extract what you can actually see in the image
- If Bangla text is unclear, extract what you can see, but do not make up words or characters

BANGLA ALPHABET REFERENCE - Use this to recognize characters:
- Bangla Vowels (স্বরবর্ণ): অ, আ, ই, ঈ, উ, ঊ, ঋ, এ, ঐ, ও, ঔ
- Bangla Consonants (ব্যঞ্জনবর্ণ): 
  - ক, খ, গ, ঘ, ঙ
  - চ, ছ, জ, ঝ, ঞ
  - ট, ঠ, ড, ঢ, ণ
  - ত, থ, দ, ধ, ন
  - প, ফ, ব, ভ, ম
  - য, র, ল, শ, ষ, স, হ
  - ড়, ঢ়, য়, ৎ
- Vowel Signs (কার): া, ি, ী, ু, ূ, ৃ, ে, ৈ, ো, ৌ
- Special Characters: ্ (হসন্ত), ঁ (চন্দ্রবিন্দু), ঃ (বিসর্গ), ং (অনুস্বার)
- Common Character Combinations:
  - ক্ষ (ক + ষ), জ্ঞ (জ + ঞ), ত্র (ত + র), শ্র (শ + র)
  - ষ্ঠ (ষ + ঠ), ষ্প (ষ + প), ষ্ম (ষ + ম), ন্ত (ন + ত), ন্দ (ন + দ)

Common Bangla Receipt Words (for context, but extract what you actually see):
- দোকান/দোকানী (shop/store), রেস্তোরাঁ (restaurant), বিল (bill)
- তারিখ (date), নাম (name), পরিমাণ (quantity), মূল্য (price)
- মোট (total), কর (tax), পরিশোধ (payment), নগদ (cash)
- দোকানের নাম (shop name), ঠিকানা (address), ফোন (phone)
- আইটেম (item), পণ্য (product), পরিমাণ (quantity), ইউনিট (unit)

IMPORTANT - Accuracy Rules:
- Read Bangla characters carefully - each character has distinct shapes
- Do NOT confuse similar-looking characters (e.g., ত vs থ, দ vs ধ, প vs ফ)
- Preserve exact Bangla spelling as written - do not correct or modify
- If a character is unclear, use context but do not invent characters
- For merchant_name and item names, preserve Bangla text exactly as written (don't translate to English)
- If you cannot read a Bangla word clearly, extract what you can see rather than guessing

HANDWRITING RECOGNITION - CRITICAL:
- This receipt may contain poor, messy, or difficult-to-read handwriting
- Apply advanced handwriting recognition techniques:
  - Look for character patterns even when strokes are incomplete or overlapping
  - Recognize common handwriting variations and sloppy writing styles
  - Use context clues (surrounding text, typical receipt formats) to interpret unclear characters
  - For numbers: recognize handwritten digits even if they're poorly formed, slanted, or partially obscured
  - For text: use linguistic context to fill in unclear Bangla or English characters
- Handle various handwriting issues:
  - Faint or light ink (barely visible strokes)
  - Overlapping or touching characters
  - Irregular spacing between words/characters
  - Slanted or rotated text
  - Incomplete characters (missing strokes)
  - Smudged or blurred writing
- If handwriting is extremely unclear, make your best educated guess based on context and typical receipt patterns
- Set confidence_score lower (0.3-0.6) for poor handwriting, but still extract what you can

IMAGE QUALITY HANDLING:
- Handle skewed, rotated, blurry, low-light, or low-resolution images
- Apply image enhancement techniques mentally to read text in poor conditions
- Look for text even when image quality is degraded
- If text is partially obscured or cut off, extract what's visible

CRITICAL: Bangla/Bengali Number Conversion
- The receipt may contain Bangla numerals (০, ১, ২, ৩, ৪, ৫, ৬, ৭, ৮, ৯) in both printed and handwritten form
- You MUST convert ALL Bangla numerals to their English equivalents:
  - ০ → 0, ১ → 1, ২ → 2, ৩ → 3, ৪ → 4
  - ৫ → 5, ৬ → 6, ৭ → 7, ৮ → 8, ৯ → 9
- ALL numeric fields (quantity, price, subtotal, tax, total) MUST be returned as numbers using English digits (0-9)
- Even if numbers appear in Bangla script (printed or handwritten), convert them to English numerals in the JSON response
- For example: "৫০০" or handwritten "৫০০" should be converted to 500, "১২৩৪" should be converted to 1234
- Handle handwritten Bangla numerals even when poorly written - use context and typical number patterns to interpret them

Return a JSON object with EXACTLY these fields:
{
  "merchant_name": "string or null - the store/business name",
  "receipt_date": "string or null - date in ISO format (YYYY-MM-DD)",
  "receipt_number": "string or null - receipt/invoice number if visible",
  "invoice_type": "one of: retail, restaurant, utility, service, unknown",
  "items": [
    {
      "name": "string - item description",
      "quantity": "number or null - MUST be English numerals",
      "price": "number - item total price, MUST be English numerals"
    }
  ],
  "subtotal": "number or null - MUST be English numerals",
  "tax": "number or null - MUST be English numerals", 
  "total": "number - the final total amount, MUST be English numerals",
  "currency": "string - currency code like BDT, USD, EUR",
  "payment_method": "string or null - Cash, Card, Mobile, etc.",
  "confidence_score": "number between 0 and 1 based on image quality and text clarity",
  "error_message": "string or null - only if image is not a valid receipt"
}

Rules:
- ACCURACY FIRST: Only extract text you can actually see in the image. DO NOT hallucinate, invent, or guess Bangla words. If text is unclear, extract partial text or use null rather than making up words.
- LANGUAGE: Read and extract text in both English and Bangla/Bengali. Use the Bangla alphabet reference above to recognize characters accurately. Preserve Bangla text in merchant_name and item names exactly as written (don't translate or modify).
- HANDWRITING: Apply advanced recognition for poor handwriting - use context, patterns, and educated guesses. Even messy handwriting should be extracted with appropriate confidence scores. However, if handwriting is too unclear to read, use null or partial text rather than guessing.
- If a field cannot be determined, use null (except required fields)
- total is required - estimate if not clearly visible, even from poor handwriting
- currency defaults to "BDT" if not detectable (common for Bangla receipts)
- confidence_score should reflect:
  - Image quality (blurry, low-light, skewed)
  - Text clarity (printed vs handwritten, handwriting quality)
  - Language complexity (mixed languages, unclear characters)
  - Range: 0.9-1.0 for clear printed text, 0.7-0.8 for clear handwriting, 0.4-0.6 for poor handwriting, 0.2-0.3 for very unclear text
- ALL numbers must be in English numerals (0-9), never Bangla numerals (০-৯), even if handwritten in Bangla
- For invoice_type:
  - "retail" for stores, supermarkets, shops (দোকান, সুপারমার্কেট)
  - "restaurant" for food establishments (রেস্তোরাঁ, হোটেল)
  - "utility" for electricity, water, gas, internet bills (বিদ্যুৎ, পানি, গ্যাস বিল)
  - "service" for services like repairs, maintenance
  - "unknown" if cannot determine or not a valid receipt
- If the image is NOT a receipt/invoice, set invoice_type to "unknown" and provide a clear error_message
- For poor handwriting: Extract best-effort values even if uncertain - it's better to have approximate data than null values

Return ONLY valid JSON, no markdown or explanation.`;

/**
 * Get image dimensions
 */
async function getImageDimensions(
  uri: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

/**
 * Process and resize image for API upload
 */
export async function processImageForUpload(
  imageUri: string
): Promise<ImageProcessingResult> {
  // Read the original file
  const fileInfo = await FileSystem.getInfoAsync(imageUri);

  if (!fileInfo.exists) {
    throw new Error('Image file not found');
  }

  // Get original dimensions
  const dimensions = await getImageDimensions(imageUri);
  let { width, height } = dimensions;

  // Calculate resize ratio if needed
  const maxDimension = Math.max(width, height);
  let resizeRatio = 1;

  if (maxDimension > MAX_IMAGE_DIMENSION) {
    resizeRatio = MAX_IMAGE_DIMENSION / maxDimension;
    width = Math.round(width * resizeRatio);
    height = Math.round(height * resizeRatio);
  }

  // Read as base64
  let base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Check size - if too large, we need to handle it
  // Note: In a full implementation, you would use expo-image-manipulator
  // to resize the image. For now, we'll throw an error if too large.
  const base64Size = base64.length * 0.75; // Approximate decoded size

  if (base64Size > MAX_BASE64_SIZE) {
    throw new Error(
      `Image too large (${Math.round(base64Size / 1024 / 1024)}MB). Maximum size is 4MB. Please use a smaller image.`
    );
  }

  return {
    uri: imageUri,
    base64,
    width,
    height,
    fileSize: base64Size,
  };
}

/**
 * Parse receipt image using Groq Vision API
 */
export async function parseReceipt(
  imageUri: string
): Promise<GroqReceiptResponse> {
  try {
    // Process image
    const processedImage = await processImageForUpload(imageUri);

    // Get API key
    const apiKey = getApiKey();

    // Prepare the request
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${processedImage.base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.0, // Zero temperature to minimize hallucinations and ensure accuracy
        max_completion_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Groq API error: ${response.status} - ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from Groq API');
    }

    // Parse the JSON response
    const parsed = JSON.parse(content) as GroqReceiptResponse;

    // Validate and normalize the response
    return normalizeResponse(parsed);
  } catch (error) {
    // Return error response
    return {
      merchant_name: null,
      receipt_date: null,
      receipt_number: null,
      invoice_type: 'unknown',
      items: [],
      subtotal: null,
      tax: null,
      total: null,
      currency: 'BDT',
      payment_method: null,
      confidence_score: 0,
      error_message:
        error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Parse receipt with retry logic
 */
export async function parseReceiptWithRetry(
  imageUri: string,
  maxRetries: number = 3
): Promise<GroqReceiptResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await parseReceipt(imageUri);

      // If we got a result (even with error_message), return it
      if (result.total !== null || result.error_message) {
        return result;
      }

      // If total is null and no error, retry
      lastError = new Error('Failed to extract receipt total');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  return {
    merchant_name: null,
    receipt_date: null,
    receipt_number: null,
    invoice_type: 'unknown',
    items: [],
    subtotal: null,
    tax: null,
    total: null,
    currency: 'BDT',
    payment_method: null,
    confidence_score: 0,
    error_message: `Failed after ${maxRetries} attempts: ${lastError?.message}`,
  };
}

/**
 * Normalize and validate the API response
 */
function normalizeResponse(response: GroqReceiptResponse): GroqReceiptResponse {
  // Normalize invoice type
  const validTypes: InvoiceType[] = [
    'retail',
    'restaurant',
    'utility',
    'service',
    'unknown',
  ];
  const invoiceType = validTypes.includes(response.invoice_type as InvoiceType)
    ? (response.invoice_type as InvoiceType)
    : 'unknown';

  // Normalize items
  const items = Array.isArray(response.items)
    ? response.items.map((item) => ({
        name: String(item.name || 'Unknown Item'),
        quantity:
          typeof item.quantity === 'number' ? item.quantity : null,
        price: typeof item.price === 'number' ? item.price : 0,
      }))
    : [];

  // Normalize date to ISO format
  let receiptDate = response.receipt_date;
  if (receiptDate) {
    try {
      const date = new Date(receiptDate);
      if (!isNaN(date.getTime())) {
        receiptDate = date.toISOString().split('T')[0];
      } else {
        receiptDate = null;
      }
    } catch {
      receiptDate = null;
    }
  }

  // Normalize currency
  const currency = response.currency?.toUpperCase() || 'BDT';

  // Normalize confidence score
  let confidenceScore = response.confidence_score;
  if (typeof confidenceScore !== 'number' || confidenceScore < 0) {
    confidenceScore = 0;
  } else if (confidenceScore > 1) {
    confidenceScore = confidenceScore > 100 ? 1 : confidenceScore / 100;
  }

  return {
    merchant_name: response.merchant_name || null,
    receipt_date: receiptDate,
    receipt_number: response.receipt_number || null,
    invoice_type: invoiceType,
    items,
    subtotal:
      typeof response.subtotal === 'number' ? response.subtotal : null,
    tax: typeof response.tax === 'number' ? response.tax : null,
    total: typeof response.total === 'number' ? response.total : null,
    currency,
    payment_method: response.payment_method || null,
    confidence_score: confidenceScore,
    error_message: response.error_message || null,
  };
}

/**
 * Validate if an image is suitable for processing
 */
export async function validateImage(
  imageUri: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(imageUri);

    if (!fileInfo.exists) {
      return { valid: false, error: 'Image file not found' };
    }

    // Check file size (rough estimate) - size is available on existant files
    const size = (fileInfo as FileSystem.FileInfo & { size?: number }).size || 0;
    if (size > 20 * 1024 * 1024) {
      return { valid: false, error: 'Image file is too large (max 20MB)' };
    }

    // Check dimensions
    const dimensions = await getImageDimensions(imageUri);
    const totalPixels = dimensions.width * dimensions.height;

    if (totalPixels > 33177600) {
      return {
        valid: false,
        error: 'Image resolution too high (max 33 megapixels)',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error ? error.message : 'Failed to validate image',
    };
  }
}

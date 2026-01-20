
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
 * In production, use EAS Secrets
 */
function getApiKey(): string {
  // For development, you can set this via expo-constants
  // In production, use EAS Secrets
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY not found. Please set GROQ API KEY in your environment.'
    );
  }
  return apiKey;
}

/**
 * Receipt extraction prompt
 */
const EXTRACTION_PROMPT = `You are a receipt/invoice data extraction expert. Analyze this receipt image and extract structured information.

Return a JSON object with EXACTLY these fields:
{
  "merchant_name": "string or null - the store/business name",
  "receipt_date": "string or null - date in ISO format (YYYY-MM-DD)",
  "receipt_number": "string or null - receipt/invoice number if visible",
  "invoice_type": "one of: retail, restaurant, utility, service, unknown",
  "items": [
    {
      "name": "string - item description",
      "quantity": "number or null",
      "price": "number - item total price"
    }
  ],
  "subtotal": "number or null",
  "tax": "number or null", 
  "total": "number - the final total amount",
  "currency": "string - currency code like BDT, USD, EUR",
  "payment_method": "string or null - Cash, Card, Mobile, etc.",
  "confidence_score": "number between 0 and 1 based on image quality and text clarity",
  "error_message": "string or null - only if image is not a valid receipt"
}

Rules:
- If a field cannot be determined, use null (except required fields)
- total is required - estimate if not clearly visible
- currency defaults to "BDT" if not detectable
- confidence_score should reflect image quality and extraction certainty
- For invoice_type:
  - "retail" for stores, supermarkets, shops
  - "restaurant" for food establishments
  - "utility" for electricity, water, gas, internet bills
  - "service" for services like repairs, maintenance
  - "unknown" if cannot determine or not a valid receipt
- If the image is NOT a receipt/invoice, set invoice_type to "unknown" and provide a clear error_message

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
        temperature: 0.1, // Low temperature for consistent extraction
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

const OpenAI = require('openai');
const { toFile } = require('openai/uploads');

const DEFAULT_IMAGE_EDIT_MODEL = 'gpt-image-2';

function getImageEditPrompt() {
  return `You are a professional e-commerce product image localization assistant.

Your task is to localize this product image for international buyers.

IMPORTANT RULES:

Keep the original product exactly as it is.

DO NOT modify, translate, remove, redraw, or replace any text that is printed on the actual product or its packaging.

This includes, but is not limited to:

- Brand logos
- Brand names
- Product names
- Package titles
- Flavor names
- Model numbers
- Specifications
- Weight
- Barcode
- QR code
- Trademark
- Manufacturer information
- Labels printed on the product
- Any text that is part of the original packaging design

ONLY translate or replace text that is outside the product itself, such as:

- Advertising slogans
- Promotional banners
- Marketing copy
- Selling points
- Feature descriptions
- Product highlights
- Call-to-action text
- Labels added by designers
- Decorative promotional text
- Corner badges
- Floating text around the product

Requirements:

- Preserve the original product exactly.
- Preserve the original package exactly.
- Preserve all logos.
- Preserve layout.
- Preserve colors.
- Preserve lighting.
- Preserve shadows.
- Preserve image quality.
- Do not move the product.
- Do not add new design elements.
- Translate only the surrounding promotional text into natural English.

Output ONLY the edited image.`;
}

async function editProductImageText(file) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.statusCode = 500;
    throw error;
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_IMAGE_EDIT_MODEL || DEFAULT_IMAGE_EDIT_MODEL;
  const uploadableImage = await toFile(
    file.buffer,
    file.originalname || 'product-image.jpg',
    { type: file.mimetype }
  );

  try {
    const response = await client.images.edit({
      model,
      image: uploadableImage,
      prompt: getImageEditPrompt(),
      n: 1,
      size: 'auto',
      quality: 'auto',
      output_format: 'png',
      input_fidelity: 'high'
    });

    const b64Json = response.data?.[0]?.b64_json;
    if (!b64Json) {
      const error = new Error('OpenAI returned empty image');
      error.statusCode = 502;
      throw error;
    }

    return Buffer.from(b64Json, 'base64');
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = error.status || 502;
    }

    throw error;
  }
}

module.exports = {
  editProductImageText
};

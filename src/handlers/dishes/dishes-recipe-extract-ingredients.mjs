import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { parseIngredient, looksLikeIngredientLine } from './ingredient-parser.mjs';

const textract = new TextractClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.RECIPE_BUCKET;

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'application/pdf'];

export const handler = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ message: 'id path parameter required' }) };
  }

  try {
    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `DISH#${id}`, SK: 'METADATA' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Dish not found' }) };
    }

    const attachment = existing.Item.recipeAttachment;
    if (!attachment?.s3Key) {
      return { statusCode: 404, body: JSON.stringify({ message: 'No recipe attachment found to scan' }) };
    }

    if (attachment.fileType && !SUPPORTED_TYPES.includes(attachment.fileType)) {
      return {
        statusCode: 422,
        body: JSON.stringify({ message: "This file type isn't supported for scanning (JPEG, PNG or PDF only). Please add ingredients manually." }),
      };
    }

    const result = await textract.send(new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: BUCKET_NAME, Name: attachment.s3Key } },
    }));

    const lines = (result.Blocks || [])
      .filter(b => b.BlockType === 'LINE' && b.Text)
      .map(b => b.Text);

    const ingredients = lines
      .filter(looksLikeIngredientLine)
      .map(parseIngredient)
      .filter(ing => ing.name);

    if (!ingredients.length) {
      return {
        statusCode: 422,
        body: JSON.stringify({ message: 'No ingredient lines were found in this file. Please add ingredients manually.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients }),
    };
  } catch (err) {
    console.error('Textract extract error:', err);
    if (err.name === 'UnsupportedDocumentException' || err.name === 'BadDocumentException') {
      return {
        statusCode: 422,
        body: JSON.stringify({ message: "This file couldn't be scanned (unsupported format, or a multi-page PDF — only single-page PDFs are supported). Please add ingredients manually." }),
      };
    }
    if (err.name === 'DocumentTooLargeException') {
      return { statusCode: 422, body: JSON.stringify({ message: 'This file is too large to scan (max 10MB). Please add ingredients manually.' }) };
    }
    if (err.name === 'InvalidS3ObjectException') {
      return { statusCode: 422, body: JSON.stringify({ message: 'Could not read the uploaded file. Please add ingredients manually.' }) };
    }
    return { statusCode: 422, body: JSON.stringify({ message: 'Could not scan this file for ingredients. Please add ingredients manually.' }) };
  }
};

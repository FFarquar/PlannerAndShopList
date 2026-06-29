import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.RECIPE_BUCKET;

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ message: 'id path parameter required' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `DISH#${id}`, SK: 'METADATA' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Dish not found' }) };
    }

    const s3Key = existing.Item.recipeAttachment?.s3Key;
    if (s3Key && BUCKET_NAME) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
    }

    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `DISH#${id}`, SK: 'METADATA' },
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Dish deleted' }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
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

    const attachment = existing.Item.recipeAttachment;
    if (!attachment?.s3Key) {
      return { statusCode: 404, body: JSON.stringify({ message: 'No recipe attachment found' }) };
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: attachment.s3Key,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        downloadUrl,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

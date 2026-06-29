import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

    const fileName = event.queryStringParameters?.fileName;
    const fileType = event.queryStringParameters?.fileType;
    if (!fileName || !fileType) {
      return { statusCode: 400, body: JSON.stringify({ message: 'fileName and fileType query parameters required' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `DISH#${id}`, SK: 'METADATA' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Dish not found' }) };
    }

    const ext = fileName.split('.').pop().toLowerCase();
    const s3Key = `recipes/${id}/recipe.${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, s3Key, fileName, fileType }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

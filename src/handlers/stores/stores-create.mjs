import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Store name is required' }) };
    }

    const storeId = crypto.randomUUID();
    const item = {
      PK: `STORE#${storeId}`,
      SK: 'METADATA',
      entityType: 'STORE',
      storeId,
      name,
      displayOrder: body.displayOrder ?? 99,
      createdDate: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ message: 'id path parameter required' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const updates = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.displayOrder !== undefined) updates.displayOrder = Number(body.displayOrder);

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields to update' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `STORE#${id}`, SK: 'METADATA' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Store not found' }) };
    }

    const setExpressions = Object.keys(updates).map((k, i) => `#f${i} = :v${i}`);
    const expressionNames = Object.fromEntries(Object.keys(updates).map((k, i) => [`#f${i}`, k]));
    const expressionValues = Object.fromEntries(Object.keys(updates).map((k, i) => [`:v${i}`, updates[k]]));

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `STORE#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: id, ...updates }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const mealPlanId = event.pathParameters?.mealPlanId;
    const itemId = event.pathParameters?.itemId;
    if (!mealPlanId || !itemId) {
      return { statusCode: 400, body: JSON.stringify({ message: 'mealPlanId and itemId path parameters required' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SHOPPINGLIST#${mealPlanId}`, SK: `ITEM#${itemId}` },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Shopping list item not found' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const updates = {};
    if (body.purchased !== undefined) updates.purchased = Boolean(body.purchased);
    if (body.store !== undefined) updates.store = (body.store || '').trim();
    if (body.name !== undefined) updates.name = (body.name || '').trim();
    if (body.totalQuantity !== undefined) updates.totalQuantity = Number(body.totalQuantity);
    if (body.unit !== undefined) updates.unit = (body.unit || '').trim();

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields to update' }) };
    }

    const setExpressions = Object.keys(updates).map((k, i) => `#f${i} = :v${i}`);
    const expressionNames = Object.fromEntries(Object.keys(updates).map((k, i) => [`#f${i}`, k]));
    const expressionValues = Object.fromEntries(Object.keys(updates).map((k, i) => [`:v${i}`, updates[k]]));

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SHOPPINGLIST#${mealPlanId}`, SK: `ITEM#${itemId}` },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }));

    // Persist store association for future use when store changes
    if (updates.store) {
      const itemName = updates.name || existing.Item.name || '';
      const normalizedName = itemName.toLowerCase().trim();
      if (normalizedName) {
        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `INGREDIENTSTORE#${normalizedName}`,
            SK: 'METADATA',
            entityType: 'INGREDIENTSTORE',
            defaultStore: updates.store,
          },
        }));
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, ...updates }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

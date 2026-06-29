import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const mealPlanId = event.pathParameters?.mealPlanId;
    if (!mealPlanId) {
      return { statusCode: 400, body: JSON.stringify({ message: 'mealPlanId path parameter required' }) };
    }

    const plan = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MEALPLAN#${mealPlanId}`, SK: 'METADATA' },
    }));
    if (!plan.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Meal plan not found' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Item name is required' }) };
    }

    // Look up stored store association for this ingredient
    const normalizedName = name.toLowerCase().trim();
    let store = (body.store || '').trim();
    if (!store) {
      const storeRecord = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `INGREDIENTSTORE#${normalizedName}`, SK: 'METADATA' },
      }));
      if (storeRecord.Item?.defaultStore) {
        store = storeRecord.Item.defaultStore;
      }
    }

    const itemId = crypto.randomUUID();
    const item = {
      PK: `SHOPPINGLIST#${mealPlanId}`,
      SK: `ITEM#${itemId}`,
      entityType: 'SHOPITEM',
      itemId,
      mealPlanId,
      name,
      totalQuantity: Number(body.totalQuantity) || 1,
      unit: (body.unit || '').trim(),
      store,
      purchased: false,
      source: 'manual',
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

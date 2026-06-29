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
      return { statusCode: 400, body: JSON.stringify({ message: 'Dish name is required' }) };
    }

    const ingredients = (body.ingredients || []).map(ing => ({
      id: ing.id || crypto.randomUUID(),
      name: (ing.name || '').trim(),
      quantity: Number(ing.quantity) || 0,
      unit: (ing.unit || '').trim(),
      defaultStore: (ing.defaultStore || '').trim(),
    })).filter(ing => ing.name);

    const dishId = crypto.randomUUID();
    const item = {
      PK: `DISH#${dishId}`,
      SK: 'METADATA',
      entityType: 'DISH',
      dishId,
      name,
      ingredients,
      createdDate: new Date().toISOString(),
    };

    if (body.recipeUrl) {
      item.recipeUrl = body.recipeUrl.trim();
    }

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

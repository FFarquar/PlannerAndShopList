import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

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

    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SHOPPINGLIST#${mealPlanId}`, SK: `ITEM#${itemId}` },
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Item deleted' }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

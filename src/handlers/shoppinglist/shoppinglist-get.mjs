import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

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

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `SHOPPINGLIST#${mealPlanId}`, ':prefix': 'ITEM#' },
    }));

    const items = (result.Items || []).sort((a, b) => (a.store || '').localeCompare(b.store || '') || (a.name || '').localeCompare(b.name || ''));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ mealPlan: plan.Item, items }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

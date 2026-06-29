import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

async function batchDelete(keys) {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: chunk.map(Key => ({ DeleteRequest: { Key } })),
      },
    }));
  }
}

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ message: 'id path parameter required' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MEALPLAN#${id}`, SK: 'METADATA' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Meal plan not found' }) };
    }

    // Collect all DAYMEAL records
    const dayMealsResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `MEALPLAN#${id}`, ':prefix': 'DAYMEAL#' },
      ProjectionExpression: 'PK, SK',
    }));

    // Collect all SHOPPINGLIST items
    const shopItemsResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `SHOPPINGLIST#${id}`, ':prefix': 'ITEM#' },
      ProjectionExpression: 'PK, SK',
    }));

    const keysToDelete = [
      { PK: `MEALPLAN#${id}`, SK: 'METADATA' },
      ...(dayMealsResult.Items || []).map(item => ({ PK: item.PK, SK: item.SK })),
      ...(shopItemsResult.Items || []).map(item => ({ PK: item.PK, SK: item.SK })),
    ];

    await batchDelete(keysToDelete);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Meal plan deleted' }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

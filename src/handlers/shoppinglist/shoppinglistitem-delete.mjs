import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

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

    // For meal-sourced items, set needToBuy=false in all day meals so a
    // subsequent refresh won't re-add this ingredient.
    if (existing.Item.source === 'meal') {
      const targetName = (existing.Item.name || '').toLowerCase().trim();
      const targetUnit = (existing.Item.unit || '').toLowerCase().trim();

      const dayMealsResult = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `MEALPLAN#${mealPlanId}`, ':prefix': 'DAYMEAL#' },
      }));

      const updates = [];
      for (const dm of (dayMealsResult.Items || [])) {
        let changed = false;
        const dishes = (dm.dishes || []).map(dish => ({
          ...dish,
          ingredients: (dish.ingredients || []).map(ing => {
            const ingName = (ing.name || '').toLowerCase().trim();
            const ingUnit = (ing.unit || '').toLowerCase().trim();
            if (ingName === targetName && ingUnit === targetUnit && ing.needToBuy) {
              changed = true;
              return { ...ing, needToBuy: false };
            }
            return ing;
          }),
        }));

        if (changed) {
          updates.push(ddb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...dm, dishes },
          })));
        }
      }

      await Promise.all(updates);
    }

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

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

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

async function batchPut(items) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: chunk.map(Item => ({ PutRequest: { Item } })),
      },
    }));
  }
}

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

    // Fetch all day meals for this plan
    const dayMealsResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `MEALPLAN#${mealPlanId}`, ':prefix': 'DAYMEAL#' },
    }));

    // Aggregate ingredients where needToBuy = true
    // Key: "<normalizedName>||<unit>"
    const aggregated = new Map();
    for (const dayMeal of (dayMealsResult.Items || [])) {
      // SK format: DAYMEAL#<date>#<mealTime>
      const skParts = (dayMeal.SK || '').split('#');
      const mealSource = { date: skParts[1] || '', mealTime: skParts[2] || '' };
      for (const dish of (dayMeal.dishes || [])) {
        for (const ing of (dish.ingredients || [])) {
          if (!ing.needToBuy) continue;
          const key = `${(ing.name || '').toLowerCase().trim()}||${(ing.unit || '').toLowerCase().trim()}`;
          if (aggregated.has(key)) {
            const agg = aggregated.get(key);
            agg.totalQuantity += Number(ing.quantity) || 0;
            agg.mealSources.push(mealSource);
          } else {
            aggregated.set(key, {
              name: (ing.name || '').trim(),
              totalQuantity: Number(ing.quantity) || 0,
              unit: (ing.unit || '').trim(),
              defaultStore: (ing.defaultStore || '').trim(),
              normalizedName: (ing.name || '').toLowerCase().trim(),
              mealSources: [mealSource],
            });
          }
        }
      }
    }

    // Delete existing meal-sourced items
    const existingResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: '#src = :meal',
      ExpressionAttributeNames: { '#src': 'source' },
      ExpressionAttributeValues: {
        ':pk': `SHOPPINGLIST#${mealPlanId}`,
        ':prefix': 'ITEM#',
        ':meal': 'meal',
      },
    }));

    await batchDelete((existingResult.Items || []).map(i => ({ PK: i.PK, SK: i.SK })));

    // Look up stored store associations and write new items
    const newItems = [];
    for (const [, agg] of aggregated) {
      let store = agg.defaultStore;

      const storeRecord = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `INGREDIENTSTORE#${agg.normalizedName}`, SK: 'METADATA' },
      }));
      if (storeRecord.Item?.defaultStore) {
        store = storeRecord.Item.defaultStore;
      }

      const itemId = crypto.randomUUID();
      newItems.push({
        PK: `SHOPPINGLIST#${mealPlanId}`,
        SK: `ITEM#${itemId}`,
        entityType: 'SHOPITEM',
        itemId,
        mealPlanId,
        name: agg.name,
        totalQuantity: agg.totalQuantity,
        unit: agg.unit,
        store,
        purchased: false,
        source: 'meal',
        mealSources: agg.mealSources,
      });
    }

    if (newItems.length > 0) {
      await batchPut(newItems);
    }

    // Return updated full list (meal + manual)
    const updatedResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `SHOPPINGLIST#${mealPlanId}`, ':prefix': 'ITEM#' },
    }));

    const items = (updatedResult.Items || []).sort((a, b) => (a.store || '').localeCompare(b.store || '') || (a.name || '').localeCompare(b.name || ''));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Shopping list refreshed', items }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

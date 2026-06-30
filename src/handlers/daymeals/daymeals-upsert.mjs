import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

const VALID_MEAL_TIMES = ['BREAKFAST', 'LUNCH', 'DINNER'];

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    const date = event.pathParameters?.date;
    const mealTime = (event.pathParameters?.mealTime || '').toUpperCase();

    if (!id || !date || !mealTime) {
      return { statusCode: 400, body: JSON.stringify({ message: 'id, date and mealTime path parameters required' }) };
    }
    if (!VALID_MEAL_TIMES.includes(mealTime)) {
      return { statusCode: 400, body: JSON.stringify({ message: `mealTime must be one of: ${VALID_MEAL_TIMES.join(', ')}` }) };
    }

    const plan = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MEALPLAN#${id}`, SK: 'METADATA' },
    }));
    if (!plan.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Meal plan not found' }) };
    }
    if (date < plan.Item.startDate || date > plan.Item.endDate) {
      return { statusCode: 400, body: JSON.stringify({ message: `date must be within meal plan range (${plan.Item.startDate} to ${plan.Item.endDate})` }) };
    }

    const body = JSON.parse(event.body || '{}');
    const dishes = (body.dishes || []).map(dish => ({
      dishId: dish.dishId || crypto.randomUUID(),
      dishName: (dish.dishName || '').trim(),
      ingredients: (dish.ingredients || []).map(ing => ({
        id: ing.id || crypto.randomUUID(),
        name: (ing.name || '').trim(),
        quantity: Number(ing.quantity) || 0,
        unit: (ing.unit || '').trim(),
        defaultStore: (ing.defaultStore || '').trim(),
        needToBuy: Boolean(ing.needToBuy),
      })).filter(ing => ing.name),
    })).filter(d => d.dishName);

    const item = {
      PK: `MEALPLAN#${id}`,
      SK: `DAYMEAL#${date}#${mealTime}`,
      entityType: 'DAYMEAL',
      mealPlanId: id,
      date,
      mealTime,
      eatingOut: Boolean(body.eatingOut),
      dishes,
      updatedDate: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

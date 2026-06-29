import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    const date = event.pathParameters?.date;
    const mealTime = (event.pathParameters?.mealTime || '').toUpperCase();

    if (!id || !date || !mealTime) {
      return { statusCode: 400, body: JSON.stringify({ message: 'id, date and mealTime path parameters required' }) };
    }

    const sk = `DAYMEAL#${date}#${mealTime}`;

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MEALPLAN#${id}`, SK: sk },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Day meal not found' }) };
    }

    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `MEALPLAN#${id}`, SK: sk },
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Day meal deleted' }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

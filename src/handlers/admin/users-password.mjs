import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const authContext = event.requestContext?.authorizer?.lambda || {};
    if (authContext.role !== 'ADMIN') {
      return { statusCode: 403, body: JSON.stringify({ message: 'Admin access required' }) };
    }

    const loginID = event.pathParameters?.loginID;
    if (!loginID) {
      return { statusCode: 400, body: JSON.stringify({ message: 'loginID path parameter required' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { password } = body;
    if (!password) {
      return { statusCode: 400, body: JSON.stringify({ message: 'password is required' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'User not found' }) };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
      UpdateExpression: 'SET passwordHash = :h',
      ExpressionAttributeValues: { ':h': passwordHash },
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Password updated' }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

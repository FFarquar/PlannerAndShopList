import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

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
    const updates = {};

    if (body.role !== undefined) {
      if (!['USER', 'ADMIN'].includes(body.role)) {
        return { statusCode: 400, body: JSON.stringify({ message: 'role must be USER or ADMIN' }) };
      }
      updates.role = body.role;
    }
    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields to update' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'User not found' }) };
    }

    const setExpressions = Object.keys(updates).map((k, i) => `#f${i} = :v${i}`);
    const expressionNames = Object.fromEntries(Object.keys(updates).map((k, i) => [`#f${i}`, k]));
    const expressionValues = Object.fromEntries(Object.keys(updates).map((k, i) => [`:v${i}`, updates[k]]));

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginID, ...updates }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

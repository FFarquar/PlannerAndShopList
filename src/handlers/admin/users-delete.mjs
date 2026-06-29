import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

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

    if (authContext.loginID === loginID) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Cannot delete your own account' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'User not found' }) };
    }

    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'User deleted' }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

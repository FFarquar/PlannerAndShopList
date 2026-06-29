import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const authContext = event.requestContext?.authorizer?.lambda || {};
    if (authContext.role !== 'ADMIN') {
      return { statusCode: 403, body: JSON.stringify({ message: 'Admin access required' }) };
    }

    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk AND entityType = :type',
      ExpressionAttributeValues: { ':sk': 'PROFILE', ':type': 'USER' },
    }));

    const users = (result.Items || []).map(({ passwordHash, ...rest }) => rest);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(users),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

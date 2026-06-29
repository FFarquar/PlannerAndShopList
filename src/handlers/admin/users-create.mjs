import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

    const body = JSON.parse(event.body || '{}');
    const { loginID, password, role = 'USER' } = body;

    if (!loginID || !password) {
      return { statusCode: 400, body: JSON.stringify({ message: 'loginID and password are required' }) };
    }
    if (!['USER', 'ADMIN'].includes(role)) {
      return { statusCode: 400, body: JSON.stringify({ message: 'role must be USER or ADMIN' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${loginID}`, SK: 'PROFILE' },
    }));
    if (existing.Item) {
      return { statusCode: 409, body: JSON.stringify({ message: 'User already exists' }) };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const item = {
      PK: `USER#${loginID}`,
      SK: 'PROFILE',
      entityType: 'USER',
      loginID,
      passwordHash,
      role,
      active: true,
      createdDate: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

    const { passwordHash: _, ...safeItem } = item;
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeItem),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

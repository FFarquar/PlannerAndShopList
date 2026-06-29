import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;
const AUTH_SECRET = (process.env.AUTH_SECRET || 'local-dev-secret-2026').trim();

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

async function verifyPassword(candidatePassword, storedPassword) {
  if (!storedPassword) return false;
  if (storedPassword.startsWith('$2')) return bcrypt.compare(candidatePassword, storedPassword);
  if (storedPassword.startsWith('sha256:')) {
    const hash = crypto.createHash('sha256').update(candidatePassword).digest('hex');
    return safeEqual(storedPassword.slice('sha256:'.length), hash);
  }
  return safeEqual(storedPassword, candidatePassword);
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(signingInput)
    .digest('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${signature}`;
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod || event.requestContext?.http?.method;
    if (method !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ message: 'Only POST is supported' }) };
    }

    const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {});
    const body = rawBody ? JSON.parse(rawBody) : {};
    const { loginID, password } = body;

    if (!loginID || !password) {
      return { statusCode: 400, body: JSON.stringify({ message: 'loginID and password are required' }) };
    }

    let user = null;
    const isLocalMock = !TABLE_NAME || process.env.USE_MOCK === 'true';

    if (isLocalMock) {
      const mockPath = path.resolve(process.cwd(), 'frontend/mockdata/mock-users.json');
      const mockUsers = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
      user = mockUsers.find(u => u.loginID === loginID);
    } else {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${loginID}`, ':sk': 'PROFILE' },
      }));
      user = result.Items?.[0];
    }

    if (!user || user.active !== true) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Invalid login credentials' }) };
    }

    const passwordHash = user.passwordHash || user.password || '';
    const authenticated = await verifyPassword(password, passwordHash);

    if (!authenticated) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Invalid login credentials' }) };
    }

    const now = Math.floor(Date.now() / 1000);
    const token = signToken({
      sub: user.PK,
      loginID: user.loginID,
      role: user.role || 'USER',
      iat: now,
      exp: now + 604800,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ accessToken: token, token, tokenType: 'Bearer', expiresIn: 604800, role: user.role || 'USER' }),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Login failed', error: error.message }) };
  }
};

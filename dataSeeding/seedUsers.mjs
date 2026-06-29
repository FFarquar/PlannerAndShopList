import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';

const TABLE_NAME = process.env.TABLE_NAME || 'PLANNER-STAGING-Data';
const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const ddb = DynamoDBDocumentClient.from(client);

const users = [
  { loginID: 'Dean_P', password: 'Password123', role: 'ADMIN' },
  { loginID: 'Jenny_P', password: 'Password456', role: 'USER' },
];

for (const u of users) {
  const passwordHash = await bcrypt.hash(u.password, 10);
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${u.loginID}`,
      SK: 'PROFILE',
      entityType: 'USER',
      loginID: u.loginID,
      passwordHash,
      role: u.role,
      active: true,
      createdDate: new Date().toISOString(),
    },
  }));
  console.log(`Created user: ${u.loginID}`);
}

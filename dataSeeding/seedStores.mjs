import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const TABLE_NAME = process.env.TABLE_NAME || 'PLANNER-STAGING-Data';
const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const ddb = DynamoDBDocumentClient.from(client);

const stores = [
  { name: 'Coles', displayOrder: 1 },
  { name: 'Butcher', displayOrder: 2 },
  { name: 'Fruit Market', displayOrder: 3 },
  { name: 'Aldi', displayOrder: 4 },
];

for (const s of stores) {
  const storeId = crypto.randomUUID();
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `STORE#${storeId}`,
      SK: 'METADATA',
      entityType: 'STORE',
      storeId,
      name: s.name,
      displayOrder: s.displayOrder,
      createdDate: new Date().toISOString(),
    },
  }));
  console.log(`Created store: ${s.name}`);
}

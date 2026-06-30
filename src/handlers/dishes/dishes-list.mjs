import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async () => {
  try {
    const items = [];
    let lastKey;
    do {
      const result = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'entityType = :type',
        ExpressionAttributeValues: { ':type': 'DISH' },
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }));
      items.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    const dishes = items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(dishes),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

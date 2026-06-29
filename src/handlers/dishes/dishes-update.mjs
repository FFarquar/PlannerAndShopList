import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const id = event.pathParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ message: 'id path parameter required' }) };
    }

    const existing = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `DISH#${id}`, SK: 'METADATA' },
    }));
    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: 'Dish not found' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const setUpdates = {};
    const removeFields = [];

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return { statusCode: 400, body: JSON.stringify({ message: 'Dish name cannot be empty' }) };
      setUpdates.name = name;
    }

    if (body.ingredients !== undefined) {
      setUpdates.ingredients = (body.ingredients || []).map(ing => ({
        id: ing.id || crypto.randomUUID(),
        name: (ing.name || '').trim(),
        quantity: Number(ing.quantity) || 0,
        unit: (ing.unit || '').trim(),
        defaultStore: (ing.defaultStore || '').trim(),
      })).filter(ing => ing.name);
    }

    if (body.recipeUrl !== undefined) {
      if (body.recipeUrl) {
        setUpdates.recipeUrl = body.recipeUrl.trim();
      } else {
        removeFields.push('recipeUrl');
      }
    }

    if (body.recipeAttachment !== undefined) {
      if (body.recipeAttachment) {
        setUpdates.recipeAttachment = {
          s3Key: body.recipeAttachment.s3Key,
          fileName: body.recipeAttachment.fileName,
          fileType: body.recipeAttachment.fileType,
          uploadedDate: new Date().toISOString(),
        };
      } else {
        removeFields.push('recipeAttachment');
      }
    }

    if (Object.keys(setUpdates).length === 0 && removeFields.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ message: 'No valid fields to update' }) };
    }

    const expressionNames = {};
    const expressionValues = {};
    let updateExpression = '';

    if (Object.keys(setUpdates).length > 0) {
      const setParts = Object.keys(setUpdates).map((k, i) => {
        expressionNames[`#f${i}`] = k;
        expressionValues[`:v${i}`] = setUpdates[k];
        return `#f${i} = :v${i}`;
      });
      updateExpression = `SET ${setParts.join(', ')}`;
    }

    if (removeFields.length > 0) {
      const offset = Object.keys(setUpdates).length;
      const removeParts = removeFields.map((k, i) => {
        expressionNames[`#f${offset + i}`] = k;
        return `#f${offset + i}`;
      });
      updateExpression += ` REMOVE ${removeParts.join(', ')}`;
    }

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `DISH#${id}`, SK: 'METADATA' },
      UpdateExpression: updateExpression.trim(),
      ExpressionAttributeNames: expressionNames,
      ...(Object.keys(expressionValues).length > 0 && { ExpressionAttributeValues: expressionValues }),
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishId: id, ...setUpdates, removed: removeFields }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};

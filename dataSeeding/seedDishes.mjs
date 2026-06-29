import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

const TABLE_NAME = process.env.TABLE_NAME || 'PLANNER-STAGING-Data';
const client = new DynamoDBClient({ region: 'ap-southeast-2' });
const ddb = DynamoDBDocumentClient.from(client);

const dishes = [
  {
    name: 'Lasagna',
    ingredients: [
      { name: 'Mince', quantity: 500, unit: 'g', defaultStore: 'Butcher' },
      { name: 'Pasta Sauce', quantity: 1, unit: 'jar', defaultStore: 'Coles' },
      { name: 'Lasagna Sheets', quantity: 1, unit: 'pack', defaultStore: 'Coles' },
      { name: 'Tinned Tomatoes', quantity: 2, unit: 'tin', defaultStore: 'Coles' },
      { name: 'Mozzarella', quantity: 200, unit: 'g', defaultStore: 'Coles' },
    ],
  },
  {
    name: 'Bolognese',
    ingredients: [
      { name: 'Mince', quantity: 500, unit: 'g', defaultStore: 'Butcher' },
      { name: 'Tinned Tomatoes', quantity: 2, unit: 'tin', defaultStore: 'Coles' },
      { name: 'Pasta', quantity: 500, unit: 'g', defaultStore: 'Coles' },
      { name: 'Onion', quantity: 1, unit: '', defaultStore: 'Fruit Market' },
    ],
  },
  {
    name: 'Roast Chicken',
    ingredients: [
      { name: 'Whole Chicken', quantity: 1, unit: '', defaultStore: 'Butcher' },
      { name: 'Potatoes', quantity: 1, unit: 'kg', defaultStore: 'Fruit Market' },
      { name: 'Carrots', quantity: 500, unit: 'g', defaultStore: 'Fruit Market' },
      { name: 'Olive Oil', quantity: 1, unit: 'bottle', defaultStore: 'Coles' },
    ],
  },
  {
    name: 'Beef Wellington',
    ingredients: [
      { name: 'Beef Tenderloin', quantity: 800, unit: 'g', defaultStore: 'Butcher' },
      { name: 'Puff Pastry', quantity: 1, unit: 'sheet', defaultStore: 'Coles' },
      { name: 'Mushrooms', quantity: 300, unit: 'g', defaultStore: 'Fruit Market' },
      { name: 'Prosciutto', quantity: 100, unit: 'g', defaultStore: 'Coles' },
    ],
  },
];

for (const d of dishes) {
  const dishId = crypto.randomUUID();
  const ingredients = d.ingredients.map(ing => ({ id: crypto.randomUUID(), ...ing }));
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `DISH#${dishId}`,
      SK: 'METADATA',
      entityType: 'DISH',
      dishId,
      name: d.name,
      ingredients,
      createdDate: new Date().toISOString(),
    },
  }));
  console.log(`Created dish: ${d.name}`);
}

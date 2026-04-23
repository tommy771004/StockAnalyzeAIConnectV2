import 'dotenv/config';
import { db } from '../src/db/index.js';
import { replacePositions } from '../server/repositories/positionsRepo.js';
import { users } from '../src/db/schema.js';

async function main() {
  const allUsers = await db.select().from(users).limit(1);
  if (allUsers.length === 0) {
    console.log("No users found.");
    process.exit(0);
  }
  const userId = allUsers[0].id;
  
  try {
    const res = await replacePositions(userId, [
      {
        symbol: "AAPL",
        name: "Apple Inc",
        shares: 10,
        avgCost: 150,
        currency: "USD"
      }
    ]);
    console.log("Success:", res);
  } catch (err: any) {
    console.error("Error inside replacePositions:", err.message);
    if (err.cause) console.error("Cause:", err.cause);
  }
  process.exit(0);
}

main();

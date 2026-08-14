import "dotenv/config";
import { app } from "./app.js";
import { connectRedis } from "./lib/redis.js";

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  connectRedis().then(()=>{
    console.log("Connected to Redis");
  }).catch((e) => {
    throw new Error("Cannot connect to Redis");
  })

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Swagger docs on http://localhost:${PORT}/api-docs`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

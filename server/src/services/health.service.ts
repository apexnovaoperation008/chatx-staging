import { Pool } from "pg";
import { logServerHealthIssue } from "../logger";
import { config } from "../config/env";

const healthPool = new Pool({
  connectionString: config.PG_URL,
  max: 1, // only 1 connection just for health checks
  options: `-c search_path=${config.PG_SCHEMA}`
});

let healthStatus = { status: "unknown", lastChecked: null as number | null };

async function pingDb() {
  const client = await healthPool.connect();
  const start = Date.now();
  try {
    await client.query("SELECT 1");
    healthStatus = { status: "up", lastChecked: Date.now() };
  } catch (err: any) {
    healthStatus = { status: "down", lastChecked: Date.now() };

    logServerHealthIssue(
      err.message,
      "database",
      "down",
      Date.now() - start,
      healthStatus.lastChecked ? new Date(healthStatus.lastChecked).toISOString() : null
    );
  } finally {
    client.release();
    const duration = Date.now() - start;
    console.log(`DB ping took ${duration}ms`);
  }
}

// Delay health check until database is initialized
// pingDb();
// setInterval(pingDb, 30000);

// Start health checks after database is initialized
export function startHealthChecks() {
  pingDb();
  setInterval(pingDb, 30000);
}

// public API
export function getHealthStatus() {
  return healthStatus;
}

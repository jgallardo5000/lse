import oracledb from 'oracledb';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Oracle connection config (Thin mode)
const oraConfig: oracledb.ConnectionAttributes = {
  user:          process.env.ORA_USER,
  password:      process.env.ORA_PASS,
  connectString: `${process.env.ORA_HOST}:${process.env.ORA_PORT}/${process.env.ORA_SERVICE}`
};

// PostgreSQL pool config
const pgPool = new Pool({
  host:     process.env.PG_HOST,
  port:     Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DB,
  user:     process.env.PG_USER,
  password: process.env.PG_PASS,
});

/**
 * Get an Oracle connection.
 * We use thin mode (default in oracledb 6+).
 */
export async function getOracleConnection(): Promise<oracledb.Connection> {
  try {
    const conn = await oracledb.getConnection(oraConfig);
    console.log("Connected to Oracle successfully.");
    return conn;
  } catch (err) {
    console.error("Error connecting to Oracle:", err);
    throw err;
  }
}

/**
 * Get the PostgreSQL pool.
 */
export const pg = pgPool;

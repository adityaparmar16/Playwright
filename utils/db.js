import mysql from 'mysql2/promise';

export async function queryDatabase(query, dbConfig) {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
  });

  try {
    const [rows] = await connection.execute(query);
    return rows;
  } finally {
    await connection.end(); // closed even when the query fails
  }
}

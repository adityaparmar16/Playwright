import mysql from 'mysql2/promise';

export async function queryDatabase(query, dbConfig) {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
  });

  const [rows] = await connection.execute(query);
  await connection.end();
  return rows;
}

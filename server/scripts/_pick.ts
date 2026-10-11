
import db from '../db';
const { rows } = await db.query(
  "SELECT id, name, length(parsed_text) AS len FROM documents WHERE parsed_text IS NOT NULL AND length(parsed_text) > 500 AND textbook_id IS NULL ORDER BY length(parsed_text) ASC LIMIT 5"
);
console.log(JSON.stringify(rows, null, 1));
process.exit(0);

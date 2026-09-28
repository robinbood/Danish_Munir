import 'dotenv/config';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL, { connect_timeout: 15, ssl: 'require' });
try {
  const rows = await client`
    select user_id, left(question, 40) as question, tokens_used
    from chat_messages
    order by created_at desc
    limit 6
  `;
  console.log('LATEST STORED ROWS:');
  for (const r of rows) {
    console.log(`  tokens_used=${String(r.tokens_used).padStart(3)}  q="${r.question}"`);
  }
} catch (e) {
  console.error('FAILED:', e.message);
} finally {
  await client.end({ timeout: 5 });
}

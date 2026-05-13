import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_1E4CvgZbaVBW@ep-fragrant-waterfall-ad8fjcey-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require', {
  max: 1,
  prepare: false
});

const [counts] = await sql`
  SELECT
    COUNT(*) AS total_bids,
    SUM(CASE WHEN status = 'Incomplete' THEN 1 ELSE 0 END) AS open_bids,
    SUM(CASE WHEN status = 'Complete' THEN 1 ELSE 0 END) AS completed_bids,
    MIN(log_date) AS oldest_bid,
    MAX(log_date) AS newest_bid,
    MAX(id) AS max_id
  FROM bid
`;
console.log('=== pa-bid-request (Neon) ===');
console.log(counts);

const recent = await sql`
  SELECT id, project_name, status, log_date
  FROM bid
  ORDER BY id DESC
  LIMIT 10
`;
console.log('\n=== Most recent 10 bids ===');
recent.forEach(r => console.log(r));

const [fileCounts] = await sql`
  SELECT COUNT(*) AS total_files FROM bid_file
`;
console.log('\n=== Bid files ===');
console.log(fileCounts);

await sql.end();

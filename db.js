const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getSavedPosts() {
  const result = await pool.query(
    'SELECT * FROM saved_posts ORDER BY created_at DESC LIMIT 50'
  );
  return result.rows.map(row => ({
    id: row.visible_id,
    title: row.title,
    price: row.price,
    link: row.link,
    coupon: row.coupon,
    image: row.image,
    message: row.message,
    hook: row.hook,
    createdAt: row.created_at
  }));
}

async function addSavedPost(post) {
  const visibleId = Date.now().toString();
  await pool.query(
    `INSERT INTO saved_posts (visible_id, title, price, link, coupon, image, message, hook)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [visibleId, post.title, post.price, post.link, post.coupon, post.image, post.message, post.hook]
  );
  return { id: visibleId, ...post, createdAt: new Date().toISOString() };
}

async function deleteSavedPost(visibleId) {
  await pool.query('DELETE FROM saved_posts WHERE visible_id = $1', [visibleId]);
}

async function clearAllSavedPosts() {
  await pool.query('DELETE FROM saved_posts');
}

async function getScheduledPosts() {
  const result = await pool.query(
    'SELECT * FROM scheduled_posts ORDER BY scheduled_time ASC'
  );
  return result.rows.map(row => ({
    id: row.visible_id,
    title: row.title,
    price: row.price,
    link: row.link,
    coupon: row.coupon,
    image: row.image,
    message: row.message,
    scheduledTime: row.scheduled_time,
    credentials: row.credentials,
    createdAt: row.created_at
  }));
}

async function addScheduledPost(post) {
  const visibleId = Date.now().toString();
  await pool.query(
    `INSERT INTO scheduled_posts (visible_id, title, price, link, coupon, image, message, scheduled_time, credentials)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [visibleId, post.title, post.price, post.link, post.coupon, post.image, post.message, post.scheduledTime, JSON.stringify(post.credentials)]
  );
  return { id: visibleId, ...post };
}

async function deleteScheduledPost(visibleId) {
  await pool.query('DELETE FROM scheduled_posts WHERE visible_id = $1', [visibleId]);
}

async function getScheduledPostById(visibleId) {
  const result = await pool.query(
    'SELECT * FROM scheduled_posts WHERE visible_id = $1',
    [visibleId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.visible_id,
    title: row.title,
    price: row.price,
    link: row.link,
    coupon: row.coupon,
    image: row.image,
    message: row.message,
    scheduledTime: row.scheduled_time,
    credentials: row.credentials
  };
}

module.exports = {
  pool,
  getSavedPosts,
  addSavedPost,
  deleteSavedPost,
  clearAllSavedPosts,
  getScheduledPosts,
  addScheduledPost,
  deleteScheduledPost,
  getScheduledPostById
};

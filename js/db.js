/**
 * db.js — IndexedDB layer via Dexie
 *
 * Stores photo sessions with:
 *   id        auto-generated primary key
 *   date      ISO date string
 *   layout    layout key (single / strip3 / grid4 / wide4)
 *   filter    filter key applied at save-time
 *   composite base64 data-URL of the final rendered strip
 */

const db = new Dexie('LJRPhotobooth');

db.version(1).stores({
  sessions: '++id, date, layout'
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save a new session.
 * @param {string} layout
 * @param {string} filter
 * @param {string} composite  - base64 data URL
 * @returns {Promise<number>} new session id
 */
async function dbSaveSession(layout, filter, composite) {
  return db.sessions.add({
    date: new Date().toISOString(),
    layout,
    filter,
    composite
  });
}

/**
 * Load all sessions, newest first.
 * @returns {Promise<Array>}
 */
async function dbGetAllSessions() {
  return db.sessions.orderBy('id').reverse().toArray();
}

/**
 * Delete a session by id.
 * @param {number} id
 */
async function dbDeleteSession(id) {
  return db.sessions.delete(id);
}

/**
 * Clear all sessions.
 */
async function dbClearAll() {
  return db.sessions.clear();
}

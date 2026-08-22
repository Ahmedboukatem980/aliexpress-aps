(function () {
  const MIGRATION_KEY = 'affilidz_postgres_migration_v1';

  function readLegacyJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  let migrationPromise = null;

  async function runMigration() {
    if (localStorage.getItem(MIGRATION_KEY) === 'done') return;

    const settings = readLegacyJson('appSettings', {});
    const savedPosts = readLegacyJson('affilidz_saved_posts', []);
    if (Object.keys(settings).length === 0 && (!Array.isArray(savedPosts) || savedPosts.length === 0)) {
      localStorage.setItem(MIGRATION_KEY, 'done');
      return;
    }

    const response = await fetch('/api/settings/migrate-local-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, savedPosts: Array.isArray(savedPosts) ? savedPosts : [] })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'فشل ترحيل البيانات القديمة');
    }
    localStorage.setItem(MIGRATION_KEY, 'done');
  }

  function migrateLegacyStorage() {
    if (!migrationPromise) {
      migrationPromise = runMigration().catch(error => {
        migrationPromise = null;
        throw error;
      });
    }
    return migrationPromise;
  }

  window.migrateLegacyStorage = migrateLegacyStorage;
  window.loadPersistedSettings = async function (fallback) {
    await migrateLegacyStorage();
    const response = await fetch('/api/settings');
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'فشل تحميل الإعدادات');
    }
    return { ...(fallback || {}), ...(data.settings || {}) };
  };
})();
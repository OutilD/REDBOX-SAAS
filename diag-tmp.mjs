import fs from 'node:fs'; import pg from 'pg';
const url = fs.readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const c = new pg.Client({ connectionString: url }); await c.connect();
await c.query(`INSERT INTO session (jeton, utilisateur_id, expire_le)
               SELECT 'ESSAI-PROFIL', id, now() + interval '30 minutes' FROM utilisateur WHERE id=11
               ON CONFLICT (jeton) DO UPDATE SET expire_le = now() + interval '30 minutes'`);
const r = (await c.query("SELECT expire_le, now() AS maintenant FROM session WHERE jeton='ESSAI-PROFIL'")).rows[0];
console.log('expire_le :', r.expire_le.toISOString(), '| now() :', r.maintenant.toISOString(), '| horloge locale :', new Date().toISOString());
await c.end();

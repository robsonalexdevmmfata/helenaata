"""Aplica database/supabase-helena-rpa.sql usando DATABASE_URL do .env.local."""
from pathlib import Path
import psycopg2

root = Path(__file__).resolve().parents[1]
env = {}
for line in (root / ".env.local").read_text(encoding="utf-8").splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, val = line.split("=", 1)
    env[key.strip()] = val.strip()

conn = psycopg2.connect(env["DATABASE_URL"], sslmode="require", connect_timeout=25)
conn.autocommit = True
cur = conn.cursor()
for rel in (
    "database/supabase-helena-rpa.sql",
    "database/002_helena10_app_ids.sql",
    "database/003_rpa_center.sql",
    "database/004_intelligence_3.sql",
):
    path = root / rel
    if path.exists():
        cur.execute(path.read_text(encoding="utf-8"))
        print("APPLIED", rel)
cur.execute("select tablename from pg_tables where schemaname = 'public' order by 1")
print("TABLES:")
for (name,) in cur.fetchall():
    print(" ", name)
conn.close()
print("OK")

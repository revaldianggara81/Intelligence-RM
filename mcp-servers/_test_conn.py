import db

try:
    with db.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("select sys_context('userenv','db_name'), sys_context('userenv','con_name') from dual")
        print("OK:", cur.fetchone())
except Exception as e:
    print("ERROR:", type(e).__name__, str(e)[:500])

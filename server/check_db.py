import sqlite3
import os

# Find the database
db_path = "data/storage/data_engine.db"
if not os.path.exists(db_path):
    db_path = "data/data_engine.db"
if not os.path.exists(db_path):
    db_path = "sam3.db"

print(f"Using database: {db_path}")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# List tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print(f"Tables: {tables}")

# Check mask_proposals if exists
if "mask_proposals" in tables:
    cur.execute("SELECT COUNT(*) FROM mask_proposals")
    total = cur.fetchone()[0]
    print(f"Total proposals: {total}")
    
    cur.execute("SELECT id, image_id, status, LENGTH(mask_data) as size FROM mask_proposals LIMIT 5")
    print("Sample proposals:")
    for r in cur.fetchall():
        print(f"  id={r[0]}, image_id={r[1]}, status={r[2]}, mask_size={r[3]} bytes")
    
    # Check indexes
    cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='mask_proposals'")
    indexes = [r[0] for r in cur.fetchall()]
    print(f"Existing indexes: {indexes}")
    
    # Add indexes if not exist
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_status ON mask_proposals(status)")
        print("Created index on status")
    except Exception as e:
        print(f"Status index: {e}")
    
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_image_id ON mask_proposals(image_id)")
        print("Created index on image_id")
    except Exception as e:
        print(f"image_id index: {e}")
        
    conn.commit()

conn.close()
print("Done")

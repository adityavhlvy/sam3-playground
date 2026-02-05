import sqlite3
import os

db_path = "data/storage/data_engine.db"

if not os.path.exists(db_path):
    print("Database file does not exist.")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get columns
        cursor.execute("PRAGMA table_info(mask_proposals)")
        columns = cursor.fetchall()
        
        print(f"Columns in mask_proposals:")
        found_score = False
        for col in columns:
            cid, name, dtype, notnull, dflt_value, pk = col
            print(f"- {name} ({dtype})")
            if name == "score":
                found_score = True
        
        if not found_score:
            print("\n[CRITICAL] 'score' column is MISSING from the table!")
        else:
            print("\n[OK] 'score' column exists.")
            
        conn.close()
    except Exception as e:
        print(f"Error checking DB: {e}")

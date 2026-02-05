import sqlite3
import os

db_path = "data/storage/data_engine.db"

if not os.path.exists(db_path):
    print("Database file does not exist, nothing to reset.")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print(f"Found tables: {tables}")
        
        for table in tables:
            table_name = table[0]
            if table_name != "sqlite_sequence": # Keep sequence
                print(f"Dropping table {table_name}...")
                cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
        
        conn.commit()
        conn.close()
        print("Database reset successfully! (All tables dropped, they will be recreated by the server automatically)")
    except Exception as e:
        print(f"Error resetting DB: {e}")

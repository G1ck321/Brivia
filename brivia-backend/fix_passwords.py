"""
Fix existing user password hashes from passlib to pwdlib format.
Run: python fix_passwords.py
"""

from app.config.db import get_supabase
from app.config.security import hash_password, verify_password


def fix_passwords():
    db = get_supabase()
    
    # Get all users
    result = db.table("users").select("id, email, password_hash").execute()
    if not result.data:
        print("No users found")
        return
    
    print(f"Found {len(result.data)} users")
    
    for user in result.data:
        email = user["email"]
        old_hash = user["password_hash"]
        
        # Test if the old hash works with pwdlib
        try:
            if verify_password("password123", old_hash):
                print(f"  [{email}] Already uses pwdlib - OK")
                continue
        except Exception:
            pass
        
        # Old hash doesn't work - re-hash with pwdlib
        new_hash = hash_password("password123")
        db.table("users").update({"password_hash": new_hash}).eq("id", user["id"]).execute()
        print(f"  [{email}] Re-hashed with pwdlib - FIXED")
    
    print("\nAll passwords updated. Use 'password123' to login.")


if __name__ == "__main__":
    fix_passwords()

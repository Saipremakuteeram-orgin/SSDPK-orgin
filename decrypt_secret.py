import os
import base64
import sys
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

def get_password(prompt):
    import getpass
    try:
        pw = getpass.getpass(prompt)
    except Exception:
        print(prompt, end='', flush=True)
        pw = sys.stdin.readline().strip()
    return pw

def decrypt():
    input_filename = "client_secret.json.enc"
    if not os.path.exists(input_filename):
        print(f"Error: Encrypted file '{input_filename}' not found.")
        return

    password = get_password("Enter decryption password: ")
    if not password:
        print("Error: Password cannot be empty.")
        return

    with open(input_filename, "rb") as encrypted_file:
        file_data = encrypted_file.read()

    # Extract salt (first 16 bytes) and encrypted content (remaining)
    salt = file_data[:16]
    encrypted_data = file_data[16:]

    # Derive key using same salt and parameters
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    f = Fernet(key)

    try:
        decrypted_data = f.decrypt(encrypted_data)
        
        # Output filename matches the exact original filename
        output_filename = "client_secret_2_161803562899-t5d73nsp7r6lm8mfjri3hj5nm23f6dhm.apps.googleusercontent.com.json"
        with open(output_filename, "wb") as decrypted_file:
            decrypted_file.write(decrypted_data)
            
        print(f"\nSuccess! Successfully decrypted and restored '{output_filename}'.")
    except Exception:
        print("\nError: Decryption failed. Incorrect password.")

if __name__ == "__main__":
    decrypt()

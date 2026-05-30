import os
import glob
import base64
import sys
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

def get_password(prompt):
    # Check if we are running in an environment that supports getpass
    import getpass
    try:
        pw = getpass.getpass(prompt)
    except Exception:
        # Fallback to stdin.readline if getpass is not supported/throws
        print(prompt, end='', flush=True)
        pw = sys.stdin.readline().strip()
    return pw

def encrypt():
    # Find client secret file in current directory
    files = glob.glob("client_secret_*.json")
    if not files:
        print("Error: No file matching 'client_secret_*.json' found in this directory.")
        return

    # Select the first matching file
    secret_file = files[0]
    print(f"Found file to encrypt: {secret_file}")

    password = get_password("Enter a password to encrypt this file: ")
    if not password:
        print("Error: Password cannot be empty.")
        return

    confirm_password = get_password("Confirm password: ")
    if password != confirm_password:
        print("Error: Passwords do not match.")
        return

    # Generate salt and derive key
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    f = Fernet(key)

    # Read data
    with open(secret_file, "rb") as file_to_encrypt:
        data = file_to_encrypt.read()

    encrypted_data = f.encrypt(data)

    # Write output
    output_filename = "client_secret.json.enc"
    with open(output_filename, "wb") as output_file:
        output_file.write(salt + encrypted_data)

    print(f"\nSuccess! Successfully encrypted '{secret_file}' to '{output_filename}'.")
    print("Only the encrypted file (.enc) should be pushed to GitHub.")

if __name__ == "__main__":
    encrypt()

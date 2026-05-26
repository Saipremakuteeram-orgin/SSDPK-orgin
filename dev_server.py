import http.server
import socketserver
import os
import json
from dotenv import load_dotenv

# Load local environment variables
load_dotenv()

PORT = 8080

class DevServerHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        print(f"GET Request received: {self.path}")
        if self.path == '/api/config':
            print("Matching /api/config endpoint!")
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            config_data = {
                'GEMINI_API_KEY': os.getenv('GEMINI_API_KEY', ''),
                'SUPABASE_URL': os.getenv('SUPABASE_URL', ''),
                'SUPABASE_ANON_KEY': os.getenv('SUPABASE_ANON_KEY', '')
            }
            self.wfile.write(json.dumps(config_data).encode('utf-8'))
        else:
            # Serve standard static files
            super().do_GET()

if __name__ == '__main__':
    # Allow prompt socket reuse to prevent port-in-use errors on restarts
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DevServerHandler) as httpd:
        print(f"Local development server running at http://localhost:{PORT}")
        print("Exposing /api/config for safe local environment loading.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.server_close()

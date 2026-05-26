#!/usr/bin/env python3
import os, sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8181
os.chdir(os.path.dirname(os.path.abspath(__file__)))
HTTPServer(('', port), SimpleHTTPRequestHandler).serve_forever()

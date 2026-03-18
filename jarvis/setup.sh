#!/bin/bash
set -e

echo "╔═══════════════════════════════════════════╗"
echo "║  JARVIS Setup Script                      ║"
echo "╚═══════════════════════════════════════════╝"

echo ""
echo "→ Installing backend dependencies..."
cd backend && npm install

echo ""
echo "→ Installing frontend dependencies..."
cd ../frontend && npm install

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║  Setup complete!                          ║"
echo "║                                           ║"
echo "║  Next steps:                              ║"
echo "║  1. cp backend/.env.example backend/.env  ║"
echo "║  2. Fill in your API keys in .env         ║"
echo "║  3. Run: cd backend && npm start          ║"
echo "║  4. Run: cd frontend && npm run dev       ║"
echo "║  5. Open: http://localhost:5173           ║"
echo "╚═══════════════════════════════════════════╝"

#!/bin/bash
# Quick start script for Expo dev server

echo "🚀 Starting Beisser LiveEdge Driver App..."
echo ""
echo "Instructions:"
echo "1. On your iPhone, download 'Expo Go' from App Store"
echo "2. Open Expo Go"
echo "3. Tap the camera icon"
echo "4. Point at your Mac screen to scan the QR code below"
echo ""
echo "The app will load in 10-15 seconds..."
echo ""
echo "================================================"
echo ""

cd "$(dirname "$0")"
npm start

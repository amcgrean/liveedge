#!/bin/bash

# Mobile App Entry Point Testing Script
# This script helps systematically test the enhanced entry point debugging

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Mobile App Entry Point Testing${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Function to print section headers
print_header() {
  echo ""
  echo -e "${YELLOW}▶ $1${NC}"
  echo -e "${YELLOW}─────────────────────────────────────────────────${NC}"
}

# Function to print success
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# Step 1: Check environment
print_header "Step 1: Verifying Environment"

if ! command -v npm &> /dev/null; then
  print_error "npm not found. Please install Node.js"
  exit 1
fi
print_success "npm found: $(npm --version)"

if ! command -v node &> /dev/null; then
  print_error "node not found. Please install Node.js"
  exit 1
fi
print_success "node found: $(node --version)"

# Step 2: Verify project structure
print_header "Step 2: Verifying Project Structure"

if [ ! -f "index.tsx" ]; then
  print_error "index.tsx not found in project root"
  exit 1
fi
print_success "index.tsx exists"

if [ ! -f "src/app/_layout.tsx" ]; then
  print_error "src/app/_layout.tsx not found"
  exit 1
fi
print_success "src/app/_layout.tsx exists"

if [ ! -f "app.json" ]; then
  print_error "app.json not found"
  exit 1
fi
print_success "app.json exists"

# Check SDK version
SDK_VERSION=$(grep '"sdkVersion"' app.json | head -1 | grep -o '"[^"]*"' | tail -1 | tr -d '"')
if [ "$SDK_VERSION" != "54.0.0" ]; then
  print_error "SDK version is $SDK_VERSION, expected 54.0.0"
  exit 1
fi
print_success "SDK version is 54.0.0"

# Step 3: Verify dependencies
print_header "Step 3: Verifying Dependencies"

if [ ! -d "node_modules" ]; then
  print_error "node_modules not found. Running npm install..."
  npm install --legacy-peer-deps
fi

REQUIRED_DEPS=("react" "react-native" "expo" "expo-router")
for dep in "${REQUIRED_DEPS[@]}"; do
  if [ -d "node_modules/$dep" ]; then
    VERSION=$(cat "node_modules/$dep/package.json" | grep '"version"' | head -1 | grep -o '"[^"]*"' | tail -1 | tr -d '"')
    print_success "$dep is installed (v$VERSION)"
  else
    print_error "$dep is not installed"
    exit 1
  fi
done

# Step 4: Type checking
print_header "Step 4: Running TypeScript Type Check"

if npm run type-check 2>&1 | grep -q "error TS"; then
  echo -e "${YELLOW}⚠ TypeScript errors found (non-critical for runtime)${NC}"
  echo -e "  Note: Metro bundler doesn't enforce TypeScript during dev"
else
  print_success "No TypeScript errors"
fi

# Step 5: Clear cache and prepare
print_header "Step 5: Preparing Dev Environment"

# Kill any existing processes
if pkill -f "expo start" 2>/dev/null; then
  print_success "Stopped existing expo process"
fi

if pkill -f "metro" 2>/dev/null; then
  print_success "Stopped existing metro process"
fi

sleep 2

print_success "Dev environment ready"

# Step 6: Instructions for starting server
print_header "Step 6: Ready to Start Dev Server"

echo ""
echo -e "${GREEN}Environment verified! Ready to test.${NC}"
echo ""
echo -e "Run this command to start the dev server:"
echo -e "${BLUE}  npm start${NC}"
echo ""
echo -e "Then:"
echo -e "  1. Wait for Metro bundler to show QR code"
echo -e "  2. Open Expo Go on iPhone"
echo -e "  3. Tap 'Scan QR code'"
echo -e "  4. Watch terminal for [INDEX] and [ROOT_LAYOUT] logs"
echo ""
echo -e "Expected successful logs:"
echo -e "  ${GREEN}[TIME] [INDEX] ✓ React loaded${NC}"
echo -e "  ${GREEN}[TIME] [INDEX] ✓ React Native loaded${NC}"
echo -e "  ${GREEN}[TIME] [INDEX] ✓ Expo loaded${NC}"
echo -e "  ${GREEN}[TIME] [INDEX] ✓ Root layout loaded${NC}"
echo -e "  ${GREEN}[TIME] [INDEX] ✓ expo-router/entry imported successfully${NC}"
echo -e "  ${GREEN}[TIME] [ROOT_LAYOUT] RootLayout component function called${NC}"
echo ""
echo -e "For detailed debugging info, see:"
echo -e "  ${BLUE}DEBUG_GUIDE.md${NC} - Complete debugging reference"
echo -e "  ${BLUE}TEST_ENTRY_POINT.md${NC} - Detailed testing procedures"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

print_success "Verification complete! Ready to start development."
echo ""

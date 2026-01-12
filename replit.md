# AliExpress Affiliate Links Generator

## Overview
An Arabic-language web application for generating AliExpress affiliate links and publishing product offers to Telegram channels. The app is a PWA (Progressive Web App) that can be installed on mobile devices.

## Project Structure
- `server.js` - Main Express server entry point
- `afflink.js` - AliExpress affiliate link generation logic
- `scheduler.js` - Post scheduling functionality
- `aliexpress-api.js` - AliExpress API integration
- `index.js` - Telegram bot entry point
- `public/` - Static frontend files
  - `index.html` - Main app interface
  - `collections.html` - Collections page
  - `telegram.html` - Telegram publishing page
  - `manifest.json` - PWA manifest
  - `sw.js` - Service worker for offline support

## Tech Stack
- **Backend**: Node.js with Express
- **Frontend**: Vanilla HTML/CSS/JavaScript (PWA)
- **Dependencies**: axios, cheerio, cors, express, sharp, telegraf

## Running the App
The app runs on port 5000 with the command:
```
npm start
```

## Features
- Generate AliExpress affiliate links
- Frame product images with custom borders
- **Logo Watermark** - Add channel logo as watermark to framed images
  - Upload PNG logo with transparent background
  - 5 position options (corners + center)
  - 3 size options (small, medium, large)
- Publish offers to Telegram channels
- Schedule posts for later
- PWA support for mobile installation
- **Discover Winning Products** - Search for hot products using AliExpress API with optional Gemini AI ranking
  - AI-powered keyword suggestions for Algerian market
  - Product analysis with AI scoring and hooks in Algerian dialect
  - Fallback mode works without Gemini API key
- **Gemini API Key Rotation** - Automatic switching between multiple API keys
  - Add multiple keys in Settings (comma-separated)
  - Auto-rotates to next key when quota is exceeded
  - Status display shows current key and total available
  - Keys stored securely in `gemini_keys.json` (gitignored)
- **AI Hook Refinement** - Improve user-written Algerian hooks with AI
  - Two buttons: "توليد (AI)" for generating new hooks, "تحسين (AI)" for refining existing ones

## Environment Variables (Optional)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_CHANNEL_ID` - Default channel ID
- `cook` - AliExpress cookie for affiliate generation

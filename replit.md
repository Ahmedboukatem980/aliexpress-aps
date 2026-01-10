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
- Generate single AliExpress affiliate link from any product URL
- Frame product images with custom borders
- Publish offers to Telegram channels
- Schedule posts for later
- PWA support for mobile installation
- AI-powered title refinement and Algerian dialect hooks (using Gemini AI)
- **Discover Winning Products** - Search for hot products using AliExpress API with optional Gemini AI ranking
  - AI-powered keyword suggestions for Algerian market
  - Product analysis with AI scoring and hooks in Algerian dialect
  - Fallback mode works without Gemini API key

## Recent Changes (January 2026)
- Simplified affiliate link generation: Now generates a single affiliate link instead of multiple types (coin, point, super, limit, bundle)
- Updated UI to show one affiliate link with copy/open/publish buttons
- Fixed image framing for uploaded images (base64 support)
- Separated title refinement and intro generation buttons in Telegram page

## Environment Variables (Optional)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `TELEGRAM_CHANNEL_ID` - Default channel ID
- `cook` - AliExpress cookie for affiliate generation

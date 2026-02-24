# Premium Vertical Digital Signage (9:16)

A professional single-file HTML/CSS/JS vertical digital signage system optimized for portrait displays (43"-55").

## Features

### 🎯 Layout (9:16 Aspect Ratio)
- **Zone 1 (14%)**: Bangkok time/date/weather + 3 rotating world clocks
- **Zone 2 (79%)**: Video player with gapless preloading
- **Zone 3 (7%)**: Scrolling bilingual news ticker (Thai/English)

### 🌦️ Weather Integration
- Real-time Bangkok weather via OpenWeatherMap API
- Visual weather icons (☀️🌤️⛅☁️🌧️⛈️🌨️🌫️)
- Temperature display in Celsius
- 1-hour caching to save API calls

### 📰 News Feed
- Bilingual news headlines (Thai/English)
- NewsData.io API integration
- Smooth scrolling ticker
- 1-hour caching

### 🌍 World Clocks
- 3 simultaneous analog clocks with rotating cities
- Dynamic light/dark themes based on local time (6am-6pm)
- Covers: North America, Europe, Asia, Middle East, Oceania

### 🎬 Video Playback
- Gapless video preloading
- Dual-video element approach
- Supports MP4 and HLS (.m3u8)
- Bilingual CTA buttons

## Quick Start

### 1. Setup API Keys

Open `index.html` and add your API keys at line 474-475:

```javascript
const CONFIG = {
    WEATHER_API_KEY: 'your_openweathermap_key',  // Get from: https://openweathermap.org/api
    NEWS_API_KEY: 'your_newsdata_io_key',        // Get from: https://newsdata.io/
    // ... rest of config
};
```

### 2. Configure Video Playlist

Edit `playlist.json` with your video URLs and CTAs:

```json
[
    {
        "url": "https://example.com/video1.mp4",
        "cta_en": "Explore Our Menu",
        "cta_th": "สำรวจเมนูของเรา"
    }
]
```

### 3. Run Locally

```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx http-server -p 8080

# Using PHP
php -S localhost:8080
```

Open: `http://localhost:8080`

## API Setup

### OpenWeatherMap (Free Tier)
1. Sign up: https://openweathermap.org/api
2. Get API key (activates in 1-2 hours)
3. Free tier: 60 calls/min, 1M calls/month

### NewsData.io (Free Tier)
1. Sign up: https://newsdata.io/
2. Get API key
3. Free tier: 200 requests/day

**Note**: NewsData.io has CORS restrictions. Browser requests may be blocked. The system includes mock data fallback for demos.

## Configuration

### Caching
- Weather & News: 1 hour (3600000ms)
- Reduces API calls and ensures rate limit compliance

### Display Settings
- CTA language toggle: Every 3 seconds
- World clock rotation: Every 8 seconds
- News ticker speed: 168 seconds per loop

### Location
- Default: Bangkok (13.7563°N, 100.5018°E)
- Change `BANGKOK_LAT` and `BANGKOK_LON` in CONFIG

## Browser Compatibility

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari
- Requires: ES6+, localStorage, fetch API

## Display Recommendations

- **Size**: 43"-55" portrait displays
- **Aspect Ratio**: 9:16 (1080x1920, 1440x2560)
- **Orientation**: Vertical/Portrait
- **Brightness**: 300-500 cd/m² for indoor use

## File Structure

```
vertical-signage-project/
├── index.html          # Main signage system (single file)
├── playlist.json       # Video playlist configuration
└── README.md          # This file
```

## Deployment

### GitHub Pages
```bash
# Enable GitHub Pages in repository settings
# Select source: main branch, / (root)
# Access: https://yourusername.github.io/vertical-signage/
```

### Custom Server
- Upload `index.html` and `playlist.json`
- Ensure server serves with proper MIME types
- HTTPS recommended for video playback

## Customization

### Colors
Edit CSS variables in `<style>` section:
- Background: `#001D56` to `#002775` (gradient)
- Accent: `#C4682D` (bronze)

### Fonts
Current: Montserrat (Google Fonts)
Change link in `<head>` and update `font-family`

### Video Duration
Adjust playback in JavaScript (default: natural duration)

## Troubleshooting

### Weather not showing
- Check API key is activated (1-2 hours after signup)
- Verify no console errors (401 = unauthorized)
- Mock data displays automatically as fallback

### News not updating
- CORS restrictions may block browser requests
- Mock data provides fallback
- Consider using server-side proxy for production

### Videos not playing
- Check video URLs are accessible
- Ensure CORS headers allow playback
- Test with sample videos first

## License

MIT License - Free for commercial and personal use

## Credits

Built with HTML5, CSS3, Vanilla JavaScript
Weather: OpenWeatherMap API
News: NewsData.io API
Fonts: Google Fonts (Montserrat)

---

**For support or questions, please open an issue on GitHub.**

# Free Time Tracker for Obsidian

An Obsidian plugin that connects to your Google Calendar and warns you when your free time falls below a configurable threshold.

## Features

- **Multiple calendar support** - Track events from multiple Google Calendar accounts
- **Configurable time window** - Set your working hours (e.g., 9am-6pm)
- **Weekend toggle** - Include or exclude weekends from calculations
- **Keyword filtering** - Exclude events containing certain keywords (e.g., "OOO", "blocked")
- **Status bar indicator** - Shows free hours with color coding (green/yellow/red)
- **Warning notifications** - Get notified when free time is critically low
- **Auto-refresh** - Automatically updates at configurable intervals

## Installation

### Manual Installation

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder called `obsidian-free-time-tracker` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into that folder
4. Reload Obsidian
5. Enable the plugin in Settings > Community Plugins

### Building from Source

```bash
npm install
npm run build
```

## Setup

1. Get your Google Calendar iCal URL:
   - Go to [Google Calendar](https://calendar.google.com)
   - Click the gear icon > Settings
   - Select your calendar on the left
   - Scroll to "Integrate calendar"
   - Copy the "Secret address in iCal format"

2. In Obsidian, go to Settings > Free Time Tracker
3. Click "+ Add Calendar" and paste your iCal URL
4. Configure your preferences (time window, thresholds, etc.)

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Start hour | When your trackable day starts | 9 (9am) |
| End hour | When your trackable day ends | 20 (8pm) |
| Include weekends | Count weekends in free time | true |
| Excluded keywords | Events containing these words are ignored | - |
| Warning threshold | Show warning below this many hours | 15 |
| Critical threshold | Show critical warning below this | 5 |
| Lookahead days | How many days ahead to calculate | 7 |
| Refresh interval | How often to update (minutes) | 30 |

## Usage

- **Status bar**: Shows your current free hours (click for details)
- **Commands**:
  - "Free Time Tracker: Refresh" - Manually refresh
  - "Free Time Tracker: Show details" - See detailed breakdown

## Privacy

This plugin:
- Only reads calendar data via iCal feeds (read-only)
- Stores calendar URLs locally in your vault
- Does not send data anywhere except to fetch your calendars

## License

MIT

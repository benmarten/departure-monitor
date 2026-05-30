# KVV Board

A personalised KVV (Karlsruhe public transport) departure board for iOS, Android, and Web.

## Features

- **Location-aware** — automatically switches presets based on your GPS position
- **Reachability indicator** — shows whether you can make it to the stop on time (walk/bike)
- **Real-time departures** — live data from the EFA-BW API with delay info
- **Configurable routes** — set up stop-to-stop presets per location group
- **Dark mode** — system-matched dark UI
- **Demo mode** — works offline with simulated data when the API is unreachable

## Setup

```bash
# Install dependencies
bun install

# Start the dev server
bun expo start

# Run on specific platforms
bun expo start --ios
bun expo start --android
bun expo start --web
```

## Build for Web

```bash
bunx expo export --platform web
# Output in dist/
```

### Docker

```bash
docker build -t kvv-board .
docker run -p 8080:8080 kvv-board
```

## Project Structure

```
src/
├── components/        # Reusable UI components
├── screens/           # BoardScreen, SettingsScreen, RouteEditorModal
├── appSettings.ts     # Settings persistence (AsyncStorage)
├── efa.ts             # EFA-BW API client
├── reach.ts           # Reachability calculation (walk/bike)
├── storage.ts         # Presets persistence
├── types.ts           # TypeScript types
├── useActiveLocation.ts  # GPS → preset group matching
├── useDepartures.ts      # Departure data fetching
└── usePresets.ts         # Presets state management
```

## Presets

Presets are organised into **location groups** (e.g. "Friedrichstal", "Karlsruhe"). Each group has an anchor coordinate and an activation radius. Within a group you configure **routes** (from-stop → to-stop), optionally filtered by line name.

Presets are stored locally on the device (AsyncStorage). A default set is provided out of the box.

## Tech Stack

- Expo 56 · React 19 · TypeScript
- NativeWind (Tailwind CSS) for styling
- React Native Reanimated for animations
- Expo Location for GPS

## License

MIT

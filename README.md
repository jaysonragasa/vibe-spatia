# EarCandy - Spatial Audio Composer

A web-based 3D spatial audio environment that lets you create immersive soundscapes using HRTF (Head-Related Transfer Function) technology.

## Features

- **Spatial Audio**: Drag and position sounds in a 3D space with realistic directional audio
- **Built-in Sounds**: 528Hz healing tone, ocean waves, rain, and white noise
- **Custom Audio**: Upload your own MP3 files
- **Streaming Audio**: Add internet radio streams with CORS support
- **Movement Patterns**: Animate sounds with circle, back-and-forth, or close-far movements
- **Volume Control**: Individual volume adjustment for each sound (0-200%)
- **Scene Management**: Save and load your soundscape configurations
- **Headphone Optimized**: Best experienced with headphones for full spatial effect

## Quick Start

1. Open `index.html` in a modern web browser
2. Click "ENTER STUDIO" to initialize the audio engine
3. Drag sound icons from the dock into the circular room
4. Move sounds around to hear the spatial audio effect
5. Double-click active sounds to adjust settings

## Usage

### Adding Sounds
- **Built-in**: Drag icons (✨🌊🌧️💨) from the dock into the room
- **Custom MP3**: Click the `+` button to upload audio files
- **Radio Streams**: Click the `📻` button to add streaming URLs (requires CORS support)

### Controlling Sounds
- **Position**: Drag sounds around the room
- **Settings**: Double-click an active sound to open settings
- **Remove**: Drag sounds outside the room to remove them
- **Movement**: Choose static, circle, back-and-forth, or close-far patterns
- **Volume**: Adjust from 0% to 200%

### Scene Management
- **Export**: Click 💾 to save your current soundscape as JSON
- **Import**: Click 📁 to load a previously saved scene

## Configuration

Edit `CONFIG` in `spatia.js`:

```javascript
const CONFIG = {
    ROOM_SCALE: 15,           // Audio space size in meters
    ROOM_RADIUS: 200,         // Visual room size in pixels
    FADE_TIME: 0.5,           // Fade in/out duration in seconds
    USE_FILTERS: false,       // Enable audio filtering
    ENABLE_STREAMING: true    // Enable radio streaming feature
};
```

## Technical Details

- **Audio Engine**: Web Audio API with PannerNode for spatial audio
- **Panning Model**: HRTF for realistic 3D positioning
- **Distance Model**: Exponential rolloff
- **Sample Rate**: Browser default (typically 48kHz)
- **Supported Formats**: MP3, WAV, OGG (browser-dependent)

## Browser Compatibility

Requires a modern browser with Web Audio API support:
- Chrome 34+
- Firefox 25+
- Safari 14.1+
- Edge 79+

## Streaming Audio Requirements

For radio streams to work:
1. Stream server must support CORS headers
2. Use HTTPS URLs when possible
3. Test URL with the built-in test button before adding

## Tips

- Use headphones for the best spatial audio experience
- Position yourself in the center (green dot) for optimal effect
- Experiment with movement patterns for dynamic soundscapes
- Adjust individual volumes to create balanced mixes
- Save your favorite configurations for later use

## License

MIT License - Feel free to use and modify

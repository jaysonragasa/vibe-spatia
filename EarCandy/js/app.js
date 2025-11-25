import { CONFIG } from './config.js';
import { AudioEngine } from './audio-engine.js';
import { SoundSource } from './sound-source.js';

class SpatiaApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.sounds = [];
        this.init();
    }

    init() {
        this.createSounds();
        this.setupEventListeners();
    }

    createSounds() {
        CONFIG.SOUND_DEFINITIONS.forEach(soundDef => {
            const sound = new SoundSource(
                soundDef.id,
                soundDef.type,
                soundDef.icon,
                soundDef.color,
                soundDef.label,
                this.audioEngine
            );
            this.sounds.push(sound);
        });
    }

    setupEventListeners() {
        document.getElementById('initBtn').addEventListener('click', () => {
            this.audioEngine.init();
            const overlay = document.getElementById('start-overlay');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SpatiaApp();
});
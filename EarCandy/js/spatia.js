// Configuration
const CONFIG = {
    ROOM_SCALE: 15,
    ROOM_RADIUS: 200, // Pixels - visual radius of the circular room
    FADE_TIME: 0.5,
    USE_FILTERS: false, // Disable filtering for natural sound
    ENABLE_STREAMING: true, // Enable/disable streaming audio feature
    SOUND_DEFINITIONS: [
        { id: '528', type: '528', icon: '✨', color: '#d8b4fe', label: 'Healing' },
        { id: 'ocean', type: 'ocean', icon: '🌊', color: '#38bdf8', label: 'Waves' },
        { id: 'rain', type: 'rain', icon: '🌧️', color: '#9ca3af', label: 'Rain' },
        { id: 'white', type: 'white', icon: '💨', color: '#e5e7eb', label: 'Static' }
    ]
};

// Audio Engine
class AudioEngine {
    constructor() {
        this.ctx = null;
    }

    init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        const listener = this.ctx.listener;
        if (listener.forwardX) {
            listener.forwardX.value = 0;
            listener.forwardY.value = 0;
            listener.forwardZ.value = -1;
            listener.upX.value = 0;
            listener.upY.value = 1;
            listener.upZ.value = 0;
        } else {
            listener.setOrientation(0, 0, -1, 0, 1, 0);
        }
    }

    createNoiseBuffer(type) {
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        switch (type) {
            case 'white':
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                break;
            case 'pink':
                let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + white * 0.0555179;
                    b1 = 0.99332 * b1 + white * 0.0750759;
                    b2 = 0.96900 * b2 + white * 0.1538520;
                    b3 = 0.86650 * b3 + white * 0.3104856;
                    b4 = 0.55000 * b4 + white * 0.5329522;
                    b5 = -0.7616 * b5 - white * 0.0168980;
                    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                    data[i] *= 0.11;
                    b6 = white * 0.115926;
                }
                break;
            case 'brown':
                let lastOut = 0;
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    lastOut = (lastOut + (0.02 * white)) / 1.02;
                    data[i] = lastOut * 3.5;
                }
                break;
        }
        return buffer;
    }

    async loadAudioFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        return await this.ctx.decodeAudioData(arrayBuffer);
    }
}

// Sound Source
class SoundSource {
    constructor(id, type, icon, color, label, audioEngine, audioBuffer = null, isInstance = false, fileName = null, fileData = null, streamUrl = null, iconImage = null) {
        this.id = id;
        this.type = type;
        this.icon = icon;
        this.color = color;
        this.label = label;
        this.fileName = fileName;
        this.fileData = fileData;
        this.streamUrl = streamUrl;
        this.iconImage = iconImage;
        this.active = false;
        this.audioEngine = audioEngine;
        this.audioBuffer = audioBuffer;
        this.isInstance = isInstance;
        this.sourceNode = null;
        this.gainNode = null;
        this.pannerNode = null;
        this.filterNode = null;
        this.movement = { type: 'static', speed: 1, distance: 3, animationId: null };
        this.volume = 1;
        this.normalizedPos = { x: 0, z: 0 }; // Store position as ratio of room size
        
        // Audio element will be created when playing
        this.audioElement = null;

        this.createDOMElements();
        this.initDrag();
    }

    createDOMElements() {
        this.el = document.createElement('div');
        this.el.className = 'sound-node docked w-12 h-12 bg-gray-800 border-2';
        this.el.style.borderColor = this.color;
        this.el.style.color = this.color;
        
        if (this.iconImage) {
            this.el.innerHTML = `<img src="${this.iconImage}" class="w-full h-full object-cover rounded-full" />`;
        } else {
            this.el.innerHTML = this.icon;
        }
        
        this.el.id = `sound-${this.id}`;
        this.el.title = this.label;

        if (!this.isInstance) {
            this.slot = document.createElement('div');
            this.slot.className = 'dock-slot';
            this.slot.appendChild(this.el);
            document.getElementById('dock').appendChild(this.slot);
        }

        // Double-tap for settings
        this.lastTap = 0;
        this.el.addEventListener('click', (e) => {
            if (!this.active) return;
            const now = Date.now();
            if (now - this.lastTap < 300) {
                e.stopPropagation();
                this.showSettings();
            }
            this.lastTap = now;
        });
    }

    play(x, z) {
        if (!this.audioEngine.ctx) return;
        const ctx = this.audioEngine.ctx;

        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 0;
        
        this.pannerNode = new PannerNode(ctx, {
            panningModel: 'HRTF',
            distanceModel: 'exponential',
            positionX: x, positionY: 0, positionZ: z,
            refDistance: 1, maxDistance: 10000, rolloffFactor: 1
        });
        this.filterNode = ctx.createBiquadFilter();
        
        if (CONFIG.USE_FILTERS) {
            this.filterNode.connect(this.pannerNode);
        }
        this.pannerNode.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);

        this.createAudioSource(ctx);
        
        this.gainNode.gain.linearRampToValueAtTime(this.getMaxVol() * this.volume, ctx.currentTime + CONFIG.FADE_TIME);
    }

    createAudioSource(ctx) {
        if (this.streamUrl) {
            console.log('[STREAM] Creating audio element for:', this.streamUrl);
            
            this.audioElement = document.createElement('audio');
            this.audioElement.crossOrigin = 'anonymous';
            this.audioElement.src = this.streamUrl;
            this.audioElement.volume = 1;
            
            this.mediaSource = ctx.createMediaElementSource(this.audioElement);
            this.mediaSource.connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
            

            
            this.audioElement.play().catch(e => console.error('[STREAM] Play failed:', e));
            
            this.sourceNode = { 
                stop: () => { 
                    if (this.audioElement) {
                        this.audioElement.pause();
                        this.audioElement.src = '';
                    }
                }
            };
            return;
        }
        
        if (this.audioBuffer) {
            // Custom MP3 file
            const source = ctx.createBufferSource();
            source.buffer = this.audioBuffer;
            source.loop = true;
            source.connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
            source.start();
            this.sourceNode = source;
            return;
        }

        switch (this.type) {
            case '528':
                const osc = ctx.createOscillator();
                osc.frequency.value = 528;
                const oscGain = ctx.createGain();
                oscGain.gain.value = 0.4;
                osc.connect(oscGain).connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
                osc.start();

                const noise = ctx.createBufferSource();
                noise.buffer = this.audioEngine.createNoiseBuffer('pink');
                noise.loop = true;
                const noiseGain = ctx.createGain();
                noiseGain.gain.value = 0.1;
                noise.connect(noiseGain).connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
                noise.start();

                this.sourceNode = { stop: () => { osc.stop(); noise.stop(); } };
                if (CONFIG.USE_FILTERS) {
                    this.filterNode.type = 'lowpass';
                    this.filterNode.frequency.value = 2000;
                }
                break;

            case 'ocean':
                const oceanNoise = ctx.createBufferSource();
                oceanNoise.buffer = this.audioEngine.createNoiseBuffer('brown');
                oceanNoise.loop = true;
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 0.15;
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = 300;
                lfo.connect(lfoGain).connect(this.filterNode.frequency);
                lfo.start();

                oceanNoise.connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
                oceanNoise.start();
                this.sourceNode = { stop: () => { oceanNoise.stop(); lfo.stop(); } };
                if (CONFIG.USE_FILTERS) {
                    this.filterNode.type = 'lowpass';
                    this.filterNode.frequency.value = 400;
                }
                break;

            case 'rain':
                const rainNoise = ctx.createBufferSource();
                rainNoise.buffer = this.audioEngine.createNoiseBuffer('pink');
                rainNoise.loop = true;
                rainNoise.connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
                rainNoise.start();
                this.sourceNode = rainNoise;
                if (CONFIG.USE_FILTERS) {
                    this.filterNode.type = 'highpass';
                    this.filterNode.frequency.value = 800;
                }
                break;

            case 'white':
                const whiteNoise = ctx.createBufferSource();
                whiteNoise.buffer = this.audioEngine.createNoiseBuffer('white');
                whiteNoise.loop = true;
                whiteNoise.connect(CONFIG.USE_FILTERS ? this.filterNode : this.pannerNode);
                whiteNoise.start();
                this.sourceNode = whiteNoise;
                if (CONFIG.USE_FILTERS) {
                    this.filterNode.type = 'lowpass';
                    this.filterNode.frequency.value = 10000;
                }
                break;
        }
    }

    stop() {
        if (this.gainNode && this.audioEngine.ctx) {
            const stopTime = this.audioEngine.ctx.currentTime + CONFIG.FADE_TIME;
            this.gainNode.gain.linearRampToValueAtTime(0, stopTime);
            setTimeout(() => {
                if (this.sourceNode) this.sourceNode.stop();
                this.pannerNode.disconnect();
                this.gainNode.disconnect();
                this.sourceNode = null;
            }, CONFIG.FADE_TIME * 1000);
        }
    }

    updateAudioPosition(x, z) {
        if (this.pannerNode && this.audioEngine.ctx) {
            const t = this.audioEngine.ctx.currentTime + 0.1;
            this.pannerNode.positionX.linearRampToValueAtTime(x, t);
            this.pannerNode.positionZ.linearRampToValueAtTime(z, t);
        }
    }

    updateVisualPosition() {
        if (!this.active || !this.pannerNode) return;
        const room = document.getElementById('room');
        const roomRect = room.getBoundingClientRect();
        const centerX = roomRect.width / 2;
        const centerY = roomRect.height / 2;
        
        const audioX = this.pannerNode.positionX.value;
        const audioZ = this.pannerNode.positionZ.value;
        const scale = roomRect.width / CONFIG.ROOM_SCALE;
        
        const visualX = centerX + (audioX * scale) - 24;
        const visualY = centerY + (audioZ * scale) - 24;
        
        this.el.style.left = visualX + 'px';
        this.el.style.top = visualY + 'px';
    }

    startMovement() {
        if (this.movement.animationId) return;
        const startTime = Date.now();
        const room = document.getElementById('room');
        const roomRect = room.getBoundingClientRect();
        const centerX = roomRect.left + roomRect.width / 2;
        const centerY = roomRect.top + roomRect.height / 2;
        
        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000 * this.movement.speed;
            let x = 0, z = 0;

            switch (this.movement.type) {
                case 'circle':
                    x = Math.cos(elapsed) * this.movement.distance;
                    z = Math.sin(elapsed) * this.movement.distance;
                    break;
                case 'backforth':
                    x = Math.sin(elapsed) * this.movement.distance;
                    z = 0;
                    break;
                case 'closefar':
                    const dist = (Math.sin(elapsed) + 1) * this.movement.distance / 2 + 1;
                    x = 0;
                    z = dist;
                    break;
            }

            this.updateAudioPosition(x, z);
            
            // Update visual position (room-relative)
            const scale = roomRect.width / CONFIG.ROOM_SCALE;
            const visualX = (roomRect.width / 2) + (x * scale) - 24;
            const visualY = (roomRect.height / 2) + (z * scale) - 24;
            this.el.style.left = visualX + 'px';
            this.el.style.top = visualY + 'px';
            
            this.movement.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    stopMovement() {
        if (this.movement.animationId) {
            cancelAnimationFrame(this.movement.animationId);
            this.movement.animationId = null;
        }
    }

    showSettings() {
        // Temporarily pause movement to prevent icon jumping
        const wasMoving = this.movement.animationId !== null;
        if (wasMoving) {
            this.stopMovement();
        }
        
        window.spatiaApp.showBehaviorSettings(this);
        
        // Store callback to resume movement if it was active
        window.spatiaApp.onSettingsClosed = () => {
            if (wasMoving && this.movement.type !== 'static' && this.active) {
                this.startMovement();
            }
        };
    }

    setMovement(type, speed, distance) {
        this.stopMovement();
        this.movement.type = type;
        this.movement.speed = speed;
        this.movement.distance = distance;
        if (type !== 'static' && this.active) {
            this.startMovement();
        }
    }

    setVolume(volume) {
        this.volume = volume;
        if (this.gainNode && this.active) {
            this.gainNode.gain.setValueAtTime(this.getMaxVol() * this.volume, this.audioEngine.ctx.currentTime);
        }
    }

    getMaxVol() {
        if (this.audioBuffer || this.streamUrl) return 1;
        const volumes = { 'white': 0.05, 'rain': 0.2, 'ocean': 0.4, '528': 0.3 };
        return volumes[this.type] || 0.3;
    }

    returnToDock() {
        if (this.active) {
            this.stop();
            this.stopMovement();
            this.active = false;
            this.el.classList.remove('active');
        }
        
        if (this.isInstance) {
            this.el.remove();
            window.spatiaApp.removeSound(this);
        } else {
            this.el.classList.add('docked');
            this.el.style.position = '';
            this.el.style.left = '';
            this.el.style.top = '';
            this.slot.appendChild(this.el);
        }
    }

    initDrag() {
        const room = document.getElementById('room');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        let touchStartPos = { x: 0, y: 0 };
        let hasMoved = false;

        let draggedInstance = null;
        
        const startDrag = (cx, cy) => {
            touchStartPos = { x: cx, y: cy };
            hasMoved = false;
            isDragging = true;
        };

        const updateDrag = (cx, cy, e) => {
            if (!isDragging) return;
            
            const deltaX = cx - touchStartPos.x;
            const deltaY = cy - touchStartPos.y;
            const moveDistance = Math.sqrt(deltaX ** 2 + deltaY ** 2);
            
            // Only apply upward-only restriction for docked icons
            if (!hasMoved && moveDistance > 10) {
                if (!this.active && deltaY >= 0) {
                    // Docked icon: only drag upward, cancel for horizontal/down
                    isDragging = false;
                    return;
                }
                // Confirmed drag - prevent scroll
                if (e) e.preventDefault();
                hasMoved = true;
                const rect = this.el.getBoundingClientRect();
                
                if (!this.isInstance && !this.active) {
                    const instance = new SoundSource(
                        `${this.id}-${Date.now()}`,
                        this.type,
                        this.icon,
                        this.color,
                        this.label,
                        this.audioEngine,
                        this.audioBuffer,
                        true,
                        this.fileName,
                        this.fileData,
                        this.streamUrl,
                        this.iconImage
                    );
                    window.spatiaApp.sounds.push(instance);
                    
                    instance.el.classList.remove('docked');
                    instance.el.style.position = 'absolute';
                    const roomRect = room.getBoundingClientRect();
                    instance.el.style.left = (rect.left - roomRect.left) + 'px';
                    instance.el.style.top = (rect.top - roomRect.top) + 'px';
                    room.appendChild(instance.el);
                    
                    draggedInstance = instance;
                } else {
                    draggedInstance = this;
                    if (this.active && this.movement.animationId) {
                        this.stopMovement();
                        draggedInstance.wasMoving = true;
                    }
                    if (!this.active) {
                        this.el.classList.remove('docked');
                        this.el.style.position = 'absolute';
                        room.appendChild(this.el);
                    }
                }
                
                dragOffset.x = touchStartPos.x - rect.left;
                dragOffset.y = touchStartPos.y - rect.top;
                draggedInstance.el.style.zIndex = 100;
            }
            
            if (!hasMoved || !draggedInstance) return;
            
            const roomRect = room.getBoundingClientRect();
            draggedInstance.el.style.left = (cx - roomRect.left - dragOffset.x) + 'px';
            draggedInstance.el.style.top = (cy - roomRect.top - dragOffset.y) + 'px';
            const centerX = roomRect.left + roomRect.width / 2;
            const centerY = roomRect.top + roomRect.height / 2;
            const radius = roomRect.width / 2;
            const distance = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2);
            const inRoom = distance <= radius;
            const dropHint = document.getElementById('drop-hint');
            
            if (inRoom) {
                dropHint.classList.replace('border-emerald-500/0', 'border-emerald-500/50');
                if (draggedInstance.active) {
                    const xRel = cx - roomRect.left;
                    const yRel = cy - roomRect.top;
                    const normX = (xRel / roomRect.width) * 2 - 1;
                    const normZ = (yRel / roomRect.height) * 2 - 1;
                    draggedInstance.updateAudioPosition(normX * (CONFIG.ROOM_SCALE / 2), normZ * (CONFIG.ROOM_SCALE / 2));
                }
            } else {
                dropHint.classList.replace('border-emerald-500/50', 'border-emerald-500/0');
            }
        };

        const endDrag = (cx, cy) => {
            if (!isDragging) return;
            
            if (!hasMoved || !draggedInstance) {
                isDragging = false;
                hasMoved = false;
                draggedInstance = null;
                return;
            }
            
            isDragging = false;
            draggedInstance.el.style.zIndex = 50;
            document.getElementById('drop-hint').classList.replace('border-emerald-500/50', 'border-emerald-500/0');

            const roomRect = room.getBoundingClientRect();
            const centerX = roomRect.left + roomRect.width / 2;
            const centerY = roomRect.top + roomRect.height / 2;
            const radius = roomRect.width / 2;
            const distance = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2);
            const inRoom = distance <= radius;

            if (inRoom) {
                if (!draggedInstance.active) {
                    draggedInstance.active = true;
                    draggedInstance.el.classList.add('active');
                    const normX = ((cx - roomRect.left) / roomRect.width) * 2 - 1;
                    const normZ = ((cy - roomRect.top) / roomRect.height) * 2 - 1;
                    draggedInstance.play(normX * (CONFIG.ROOM_SCALE / 2), normZ * (CONFIG.ROOM_SCALE / 2));
                    if (draggedInstance.movement.type !== 'static') draggedInstance.startMovement();
                } else {
                    // Resume movement if it was paused during drag
                    if (draggedInstance.wasMoving && draggedInstance.movement.type !== 'static') {
                        draggedInstance.startMovement();
                    }
                }
            } else {
                draggedInstance.returnToDock();
            }
            
            draggedInstance.wasMoving = false;
            draggedInstance = null;
        };

        this.el.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
        window.addEventListener('mousemove', e => updateDrag(e.clientX, e.clientY, null));
        window.addEventListener('mouseup', e => endDrag(e.clientX, e.clientY));
        this.el.addEventListener('touchstart', e => { startDrag(e.touches[0].clientX, e.touches[0].clientY); });
        window.addEventListener('touchmove', e => { 
            if (isDragging) {
                updateDrag(e.touches[0].clientX, e.touches[0].clientY, e);
            }
        }, { passive: false });
        window.addEventListener('touchend', e => { if (isDragging) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    }
}

// Main App
class SpatiaApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.sounds = [];
        this.init();
    }

    init() {
        window.spatiaApp = this;
        
        // Set room size from config
        const room = document.getElementById('room');
        const diameter = CONFIG.ROOM_RADIUS * 2;
        room.style.maxWidth = diameter + 'px';
        
        CONFIG.SOUND_DEFINITIONS.forEach(soundDef => {
            this.sounds.push(new SoundSource(soundDef.id, soundDef.type, soundDef.icon, soundDef.color, soundDef.label, this.audioEngine));
        });

        this.setupFileUpload();
        this.createBehaviorOverlay();
        this.createSceneControls();

        document.getElementById('initBtn').addEventListener('click', () => {
            this.audioEngine.init();
            const overlay = document.getElementById('start-overlay');
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        });

        this.applySettings(this.loadSettings());
    }

    showBehaviorSettings(sound) {
        this.currentSound = sound;
        document.getElementById('behavior-overlay').classList.remove('hidden');
        document.getElementById('movement-type').value = sound.movement.type;
        document.getElementById('movement-speed').value = sound.movement.speed;
        document.getElementById('movement-distance').value = sound.movement.distance;
        document.getElementById('volume-control').value = sound.volume;
    }

    createBehaviorOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'behavior-overlay';
        overlay.className = 'hidden fixed inset-0 bg-black/50 z-[200] flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-gray-800 rounded-lg p-6 w-80">
                <h3 class="text-lg font-bold mb-4">Movement Behavior</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm mb-2">Movement Type</label>
                        <select id="movement-type" class="w-full bg-gray-700 rounded px-3 py-2">
                            <option value="static">Static</option>
                            <option value="circle">Circle</option>
                            <option value="backforth">Back & Forth</option>
                            <option value="closefar">Close & Far</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm mb-2">Speed</label>
                        <input id="movement-speed" type="range" min="0.1" max="3" step="0.1" value="1" class="w-full">
                        <div class="text-xs text-gray-400 mt-1">0.1x - 3x</div>
                    </div>
                    <div>
                        <label class="block text-sm mb-2">Distance</label>
                        <input id="movement-distance" type="range" min="1" max="6" step="0.5" value="3" class="w-full">
                        <div class="text-xs text-gray-400 mt-1">1 - 6 meters</div>
                    </div>
                    <div>
                        <label class="block text-sm mb-2">Volume</label>
                        <input id="volume-control" type="range" min="0" max="2" step="0.1" value="1" class="w-full">
                        <div class="text-xs text-gray-400 mt-1">0% - 200%</div>
                    </div>
                    <div class="flex gap-2 mt-6">
                        <button id="apply-behavior" class="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded">Apply</button>
                        <button id="cancel-behavior" class="flex-1 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('apply-behavior').onclick = () => {
            const type = document.getElementById('movement-type').value;
            const speed = parseFloat(document.getElementById('movement-speed').value);
            const distance = parseFloat(document.getElementById('movement-distance').value);
            const volume = parseFloat(document.getElementById('volume-control').value);
            this.currentSound.setMovement(type, speed, distance);
            this.currentSound.setVolume(volume);
            overlay.classList.add('hidden');
            if (this.onSettingsClosed) this.onSettingsClosed();
        };

        document.getElementById('cancel-behavior').onclick = () => {
            overlay.classList.add('hidden');
            if (this.onSettingsClosed) this.onSettingsClosed();
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
                if (this.onSettingsClosed) this.onSettingsClosed();
            }
        };
    }

    removeSound(sound) {
        const index = this.sounds.indexOf(sound);
        if (index > -1) {
            this.sounds.splice(index, 1);
        }
    }

    exportScene() {
        const activeSounds = this.sounds.filter(s => s.active && s.isInstance);
        const sceneData = {
            version: '1.0',
            sounds: activeSounds.map(s => {
                const rect = document.getElementById('room').getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const iconRect = s.el.getBoundingClientRect();
                const iconCenterX = iconRect.left + iconRect.width / 2;
                const iconCenterY = iconRect.top + iconRect.height / 2;
                
                // Calculate normalized position from visual position
                const relX = (iconCenterX - centerX) / (rect.width / 2);
                const relZ = (iconCenterY - centerY) / (rect.height / 2);
                const audioX = relX * (CONFIG.ROOM_SCALE / 2);
                const audioZ = relZ * (CONFIG.ROOM_SCALE / 2);
                
                return {
                    type: s.type,
                    position: { x: audioX, z: audioZ },
                    movement: {
                        type: s.movement.type,
                        speed: s.movement.speed,
                        distance: s.movement.distance
                    },
                    volume: s.volume,
                    label: s.label,
                    isCustom: !!s.audioBuffer,
                    fileName: s.fileName,
                    fileData: s.fileData
                };
            })
        };
        
        const blob = new Blob([JSON.stringify(sceneData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'spatia-scene.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importScene(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const sceneData = JSON.parse(e.target.result);
                this.loadScene(sceneData);
            } catch (error) {
                console.error('Failed to import scene:', error);
            }
        };
        reader.readAsText(file);
    }

    loadScene(sceneData) {
        // Clear existing active sounds
        this.sounds.filter(s => s.active).forEach(s => s.returnToDock());
        
        // Load sounds from scene
        sceneData.sounds.forEach(async soundData => {
            if (soundData.isCustom) {
                if (!soundData.fileData) {
                    const fileName = soundData.fileName || soundData.label;
                    alert(`Custom audio file "${fileName}" cannot be loaded automatically. Please re-add this MP3 file manually using the + button.`);
                    return;
                }
                
                // Decode base64 and load audio
                try {
                    const binaryString = atob(soundData.fileData);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const audioBuffer = await this.audioEngine.ctx.decodeAudioData(bytes.buffer);
                    
                    const instance = new SoundSource(
                        `custom-${Date.now()}`,
                        'custom',
                        '🎵',
                        '#fbbf24',
                        soundData.label,
                        this.audioEngine,
                        audioBuffer,
                        true,
                        soundData.fileName,
                        soundData.fileData
                    );
                    
                    this.loadSoundInstance(instance, soundData);
                } catch (error) {
                    console.error('Failed to load custom audio:', error);
                    alert(`Failed to load custom audio file "${soundData.fileName}".`);
                }
                return;
            }
            
            const originalSound = this.sounds.find(s => s.type === soundData.type && !s.isInstance);
            if (originalSound) {
                const instance = new SoundSource(
                    `${originalSound.id}-${Date.now()}`,
                    originalSound.type,
                    originalSound.icon,
                    originalSound.color,
                    originalSound.label,
                    this.audioEngine,
                    originalSound.audioBuffer,
                    true
                );
                
                // Set movement properties before activation
                instance.movement.type = soundData.movement.type;
                instance.movement.speed = soundData.movement.speed;
                instance.movement.distance = soundData.movement.distance;
                instance.volume = soundData.volume;
                
                // Position the visual element
                const room = document.getElementById('room');
                const roomRect = room.getBoundingClientRect();
                const centerX = roomRect.left + roomRect.width / 2;
                const centerY = roomRect.top + roomRect.height / 2;
                
                // Convert audio position back to visual position
                const relX = soundData.position.x / (CONFIG.ROOM_SCALE / 2);
                const relZ = soundData.position.z / (CONFIG.ROOM_SCALE / 2);
                const visualX = centerX + (relX * roomRect.width / 2) - 24;
                const visualY = centerY + (relZ * roomRect.height / 2) - 24;
                
                instance.active = true;
                instance.el.classList.remove('docked');
                instance.el.classList.add('active');
                instance.el.style.position = 'fixed';
                instance.el.style.left = visualX + 'px';
                instance.el.style.top = visualY + 'px';
                document.body.appendChild(instance.el);
                
                this.loadSoundInstance(instance, soundData);
            }
        });
    }

    loadSoundInstance(instance, soundData) {
        // Set movement properties before activation
        instance.movement.type = soundData.movement.type;
        instance.movement.speed = soundData.movement.speed;
        instance.movement.distance = soundData.movement.distance;
        instance.volume = soundData.volume;
        
        // Position the visual element
        const room = document.getElementById('room');
        const roomRect = room.getBoundingClientRect();
        const centerX = roomRect.left + roomRect.width / 2;
        const centerY = roomRect.top + roomRect.height / 2;
        
        // Convert audio position back to visual position
        const relX = soundData.position.x / (CONFIG.ROOM_SCALE / 2);
        const relZ = soundData.position.z / (CONFIG.ROOM_SCALE / 2);
        const visualX = centerX + (relX * roomRect.width / 2) - 24;
        const visualY = centerY + (relZ * roomRect.height / 2) - 24;
        
        instance.active = true;
        instance.el.classList.remove('docked');
        instance.el.classList.add('active');
        instance.el.style.position = 'fixed';
        instance.el.style.left = visualX + 'px';
        instance.el.style.top = visualY + 'px';
        document.body.appendChild(instance.el);
        
        this.sounds.push(instance);
        instance.play(soundData.position.x, soundData.position.z);
        
        if (instance.movement.type !== 'static') {
            instance.startMovement();
        }
    }

    setupFileUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.multiple = true;
        input.style.display = 'none';
        document.body.appendChild(input);

        const uploadBtn = document.createElement('button');
        uploadBtn.innerHTML = '+';
        uploadBtn.className = 'w-12 h-12 bg-gray-700 border-2 border-dashed border-gray-500 rounded-full text-gray-400 hover:border-purple-400 hover:text-purple-400 transition-colors';
        uploadBtn.onclick = () => input.click();

        const slot1 = document.createElement('div');
        slot1.className = 'dock-slot';
        slot1.appendChild(uploadBtn);
        document.getElementById('dock').appendChild(slot1);

        if (CONFIG.ENABLE_STREAMING) {
            const radioBtn = document.createElement('button');
            radioBtn.innerHTML = '📻<span style="position:absolute;top:-2px;right:-2px;font-size:8px;background:#22c55e;color:white;border-radius:50%;width:12px;height:12px;display:flex;align-items:center;justify-content:center;">+</span>';
            radioBtn.className = 'w-12 h-12 bg-gray-700 border-2 border-dashed border-gray-500 rounded-full text-gray-400 hover:border-green-400 hover:text-green-400 transition-colors relative';
            radioBtn.onclick = () => this.showStreamDialog();

            const slot2 = document.createElement('div');
            slot2.className = 'dock-slot';
            slot2.appendChild(radioBtn);
            document.getElementById('dock').appendChild(slot2);
        }

        input.onchange = async (e) => {
            for (const file of e.target.files) {
                if (file.type.startsWith('audio/')) {
                    try {
                        const buffer = await this.audioEngine.loadAudioFile(file);
                        const name = file.name.replace(/\.[^/.]+$/, '');
                        
                        // Convert file to base64 for saving
                        const arrayBuffer = await file.arrayBuffer();
                        const bytes = new Uint8Array(arrayBuffer);
                        let binary = '';
                        for (let i = 0; i < bytes.length; i++) {
                            binary += String.fromCharCode(bytes[i]);
                        }
                        const base64Data = btoa(binary);
                        
                        const sound = new SoundSource(
                            `custom-${Date.now()}`,
                            'custom',
                            '🎵',
                            '#fbbf24',
                            name,
                            this.audioEngine,
                            buffer,
                            false,
                            file.name,
                            base64Data
                        );
                        this.sounds.push(sound);
                    } catch (error) {
                        console.error('Failed to load audio file:', error);
                    }
                }
            }
        };
    }

    createSceneControls() {
        const controls = document.createElement('div');
        controls.className = 'fixed top-4 right-4 flex gap-2 z-50';
        
        const exportBtn = document.createElement('button');
        exportBtn.innerHTML = '💾';
        exportBtn.className = 'w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors';
        exportBtn.title = 'Export Scene';
        exportBtn.onclick = () => this.exportScene();
        
        const importBtn = document.createElement('button');
        importBtn.innerHTML = '📁';
        importBtn.className = 'w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors';
        importBtn.title = 'Import Scene';
        
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json';
        importInput.style.display = 'none';
        importInput.onchange = (e) => {
            if (e.target.files[0]) {
                this.importScene(e.target.files[0]);
            }
        };
        
        importBtn.onclick = () => importInput.click();
        
        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.className = 'w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors';
        settingsBtn.title = 'Settings';
        settingsBtn.onclick = () => this.showSettings();
        
        controls.appendChild(exportBtn);
        controls.appendChild(importBtn);
        controls.appendChild(settingsBtn);
        controls.appendChild(importInput);
        document.body.appendChild(controls);
    }

    loadSettings() {
        const saved = localStorage.getItem('spatia-settings');
        return saved ? JSON.parse(saved) : { backgroundUrl: 'images/bganim.gif' };
    }

    saveSettings(settings) {
        localStorage.setItem('spatia-settings', JSON.stringify(settings));
        this.applySettings(settings);
    }

    applySettings(settings) {
        const room = document.getElementById('room');
        const dock = document.getElementById('dock');
        if (settings.backgroundUrl) {
            document.body.style.backgroundImage = `url(${settings.backgroundUrl})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            room.style.backgroundColor = 'rgba(26, 26, 26, 0.1)';
            room.style.backdropFilter = 'blur(10px)';
            room.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            room.style.borderWidth = '3px';
            dock.style.backgroundColor = 'rgba(31, 41, 55, 0.5)';
        } else {
            document.body.style.backgroundImage = '';
            document.body.style.backgroundSize = '';
            document.body.style.backgroundPosition = '';
            room.style.backgroundColor = '';
            room.style.backdropFilter = '';
            room.style.borderColor = '';
            room.style.borderWidth = '';
            dock.style.backgroundColor = '';
        }
    }

    showSettings() {
        const settings = this.loadSettings();
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 z-[200] flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-gray-800 rounded-lg p-6 w-96">
                <h3 class="text-lg font-bold mb-4">Settings</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm mb-2">Background URL</label>
                        <input id="bg-url" type="url" value="${settings.backgroundUrl}" placeholder="https://example.com/image.jpg" class="w-full bg-gray-700 rounded px-3 py-2">
                    </div>
                    <div class="flex gap-2 mt-6">
                        <button id="save-settings" class="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded">Save</button>
                        <button id="cancel-settings" class="flex-1 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('save-settings').onclick = () => {
            const bgUrl = document.getElementById('bg-url').value;
            this.saveSettings({ backgroundUrl: bgUrl });
            overlay.remove();
        };

        document.getElementById('cancel-settings').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    }

    showStreamDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/50 z-[200] flex items-center justify-center';
        overlay.innerHTML = `
            <div class="bg-gray-800 rounded-lg p-6 w-96">
                <h3 class="text-lg font-bold mb-4">Add Streaming Audio</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm mb-2">Stream URL</label>
                        <input id="stream-url" type="url" placeholder="https://example.com/stream.mp3" class="w-full bg-gray-700 rounded px-3 py-2">
                        <button id="test-stream" class="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm">Test URL</button>
                    </div>
                    <div>
                        <label class="block text-sm mb-2">Label</label>
                        <input id="stream-label" type="text" placeholder="Radio Station" class="w-full bg-gray-700 rounded px-3 py-2">
                    </div>
                    <div>
                        <label class="block text-sm mb-2">Custom Icon (optional)</label>
                        <input id="icon-upload" type="file" accept="image/*" class="w-full bg-gray-700 rounded px-3 py-2">
                    </div>
                    <div class="flex gap-2 mt-6">
                        <button id="add-stream" class="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded">Add Stream</button>
                        <button id="cancel-stream" class="flex-1 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('add-stream').onclick = async () => {
            const url = document.getElementById('stream-url').value;
            const label = document.getElementById('stream-label').value;
            const iconFile = document.getElementById('icon-upload').files[0];
            
            if (!url || !label) {
                alert('Please fill in URL and Label');
                return;
            }
            
            let iconImage = null;
            if (iconFile) {
                iconImage = await this.fileToBase64(iconFile);
            }
            
            const sound = new SoundSource(
                `stream-${Date.now()}`,
                'stream',
                '📻',
                '#22c55e',
                label,
                this.audioEngine,
                null,
                false,
                null,
                null,
                url,
                iconImage
            );
            this.sounds.push(sound);
            overlay.remove();
        };

        document.getElementById('test-stream').onclick = () => {
            const url = document.getElementById('stream-url').value;
            if (!url) {
                alert('Enter a URL first');
                return;
            }
            
            const testAudio = new Audio(url);
            testAudio.volume = 0.5;
            testAudio.play().then(() => {
                alert('Stream works! You should hear audio.');
                setTimeout(() => testAudio.pause(), 3000);
            }).catch(e => {
                alert('Stream failed: ' + e.message);
                console.error('Test failed:', e);
            });
        };

        document.getElementById('cancel-stream').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    }

    async fileToBase64(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => new SpatiaApp());
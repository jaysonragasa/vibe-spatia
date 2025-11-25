import { CONFIG } from './config.js';

export class SoundSource {
    constructor(id, type, icon, color, label, audioEngine) {
        this.id = id;
        this.type = type;
        this.icon = icon;
        this.color = color;
        this.active = false;
        this.audioEngine = audioEngine;

        // Audio Nodes
        this.sourceNode = null;
        this.gainNode = null;
        this.pannerNode = null;
        this.filterNode = null;

        this.createDOMElements();
        this.initDrag();
    }

    createDOMElements() {
        this.el = document.createElement('div');
        this.el.className = 'sound-node docked w-12 h-12 bg-gray-800 border-2';
        this.el.style.borderColor = this.color;
        this.el.style.color = this.color;
        this.el.innerHTML = this.icon;
        this.el.id = `sound-${this.id}`;
        this.el.dataset.id = this.id;

        this.slot = document.createElement('div');
        this.slot.className = 'dock-slot';
        this.slot.appendChild(this.el);
        document.getElementById('dock').appendChild(this.slot);
    }

    play(x, z) {
        if (!this.audioEngine.ctx) return;
        const ctx = this.audioEngine.ctx;

        this.pannerNode = new PannerNode(ctx, {
            panningModel: 'HRTF',
            distanceModel: 'exponential',
            positionX: x,
            positionY: 0,
            positionZ: z,
            refDistance: 1,
            maxDistance: 10000,
            rolloffFactor: 1
        });

        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 0;

        this.filterNode = ctx.createBiquadFilter();

        this.createAudioSource(ctx);
        this.connectAudioGraph(ctx);
        this.fadeIn();
    }

    createAudioSource(ctx) {
        switch (this.type) {
            case '528':
                this.create528Hz(ctx);
                break;
            case 'ocean':
                this.createOcean(ctx);
                break;
            case 'rain':
                this.createRain(ctx);
                break;
            case 'white':
                this.createWhiteNoise(ctx);
                break;
        }
    }

    create528Hz(ctx) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 528;
        const oscGain = ctx.createGain();
        oscGain.gain.value = 0.4;
        osc.connect(oscGain).connect(this.filterNode);
        osc.start();

        const noise = ctx.createBufferSource();
        noise.buffer = this.audioEngine.createNoiseBuffer('pink');
        noise.loop = true;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.1;
        noise.connect(noiseGain).connect(this.filterNode);
        noise.start();

        this.sourceNode = { stop: () => { osc.stop(); noise.stop(); } };
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = 2000;
    }

    createOcean(ctx) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.audioEngine.createNoiseBuffer('brown');
        noise.loop = true;

        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = 400;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.15;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 300;

        lfo.connect(lfoGain).connect(this.filterNode.frequency);
        lfo.start();

        noise.connect(this.filterNode);
        noise.start();
        this.sourceNode = { stop: () => { noise.stop(); lfo.stop(); } };
    }

    createRain(ctx) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.audioEngine.createNoiseBuffer('pink');
        noise.loop = true;

        this.filterNode.type = 'highpass';
        this.filterNode.frequency.value = 800;

        noise.connect(this.filterNode);
        noise.start();
        this.sourceNode = noise;
    }

    createWhiteNoise(ctx) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.audioEngine.createNoiseBuffer('white');
        noise.loop = true;

        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.value = 10000;

        noise.connect(this.filterNode);
        noise.start();
        this.sourceNode = noise;
    }

    connectAudioGraph(ctx) {
        this.filterNode.connect(this.pannerNode);
        this.pannerNode.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);
    }

    fadeIn() {
        this.gainNode.gain.linearRampToValueAtTime(
            this.getMaxVol(),
            this.audioEngine.ctx.currentTime + CONFIG.FADE_TIME
        );
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

    getMaxVol() {
        const volumes = {
            'white': 0.05,
            'rain': 0.2,
            'ocean': 0.4,
            '528': 0.3
        };
        return volumes[this.type] || 0.3;
    }

    returnToDock() {
        if (this.active) {
            this.stop();
            this.active = false;
            this.el.classList.remove('active');
        }
        this.el.classList.add('docked');
        this.el.style.position = '';
        this.el.style.left = '';
        this.el.style.top = '';
        this.slot.appendChild(this.el);
    }

    initDrag() {
        const room = document.getElementById('room');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        const startDrag = (cx, cy) => {
            isDragging = true;
            const rect = this.el.getBoundingClientRect();

            if (!this.active) {
                this.el.classList.remove('docked');
                this.el.style.position = 'fixed';
                document.body.appendChild(this.el);
            }

            dragOffset.x = cx - rect.left;
            dragOffset.y = cy - rect.top;
            this.el.style.zIndex = 100;
            updateDrag(cx, cy);
        };

        const updateDrag = (cx, cy) => {
            if (!isDragging) return;

            this.el.style.left = (cx - dragOffset.x) + 'px';
            this.el.style.top = (cy - dragOffset.y) + 'px';

            const roomRect = room.getBoundingClientRect();
            const inRoom = (cx > roomRect.left && cx < roomRect.right &&
                          cy > roomRect.top && cy < roomRect.bottom);

            const dropHint = document.getElementById('drop-hint');
            if (inRoom) {
                dropHint.classList.replace('border-emerald-500/0', 'border-emerald-500/50');

                if (this.active) {
                    const xRel = cx - roomRect.left;
                    const yRel = cy - roomRect.top;
                    const normX = (xRel / roomRect.width) * 2 - 1;
                    const normZ = (yRel / roomRect.height) * 2 - 1;
                    const audioX = normX * (CONFIG.ROOM_SCALE / 2);
                    const audioZ = normZ * (CONFIG.ROOM_SCALE / 2);
                    this.updateAudioPosition(audioX, audioZ);
                }
            } else {
                dropHint.classList.replace('border-emerald-500/50', 'border-emerald-500/0');
            }
        };

        const endDrag = (cx, cy) => {
            if (!isDragging) return;
            isDragging = false;
            this.el.style.zIndex = 50;
            document.getElementById('drop-hint').classList.replace('border-emerald-500/50', 'border-emerald-500/0');

            const roomRect = room.getBoundingClientRect();
            const inRoom = (cx > roomRect.left && cx < roomRect.right &&
                          cy > roomRect.top && cy < roomRect.bottom);

            if (inRoom) {
                if (!this.active) {
                    this.active = true;
                    this.el.classList.add('active');
                    const normX = ((cx - roomRect.left) / roomRect.width) * 2 - 1;
                    const normZ = ((cy - roomRect.top) / roomRect.height) * 2 - 1;
                    this.play(normX * (CONFIG.ROOM_SCALE / 2), normZ * (CONFIG.ROOM_SCALE / 2));
                }
            } else {
                this.returnToDock();
            }
        };

        // Mouse events
        this.el.addEventListener('mousedown', e => {
            e.preventDefault();
            startDrag(e.clientX, e.clientY);
        });

        window.addEventListener('mousemove', e => updateDrag(e.clientX, e.clientY));
        window.addEventListener('mouseup', e => endDrag(e.clientX, e.clientY));

        // Touch events
        this.el.addEventListener('touchstart', e => {
            e.preventDefault();
            startDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        window.addEventListener('touchmove', e => {
            if (isDragging) updateDrag(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        window.addEventListener('touchend', e => {
            if (isDragging) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        });
    }
}
// Audio manager — preloads all sounds and handles playback
const AudioManager = {
  sounds: {},
  bgMusic: null,
  bgMusicPlaying: false,
  muted: false,
  musicVolume: 0.25,
  sfxVolume: 0.6,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Preload sound effects
    const sfxFiles = {
      'card-play':    'sounds/card-play.mp3',
      'card-draw':    'sounds/card-draw.mp3',
      'card-flip':    'sounds/card-flip.mp3',
      'card-slide':   'sounds/card-slide.wav',
      'card-shuffle': 'sounds/card-shuffle.mp3',
      'card-deal':    'sounds/card-deal.mp3',
      'cat-hiss':     'sounds/cat-hiss.wav',
      'bell-ding':    'sounds/bell-ding.mp3',
      'victory':      'sounds/victory.mp3',
    };

    for (const [name, src] of Object.entries(sfxFiles)) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = this.sfxVolume;
      this.sounds[name] = audio;
    }

    // Background music
    this.bgMusic = new Audio('sounds/bg-music.mp3');
    this.bgMusic.loop = true;
    this.bgMusic.volume = this.musicVolume;
    this.bgMusic.preload = 'auto';
  },

  // Play a sound effect (creates a clone so overlapping plays work)
  play(name) {
    if (this.muted) return;
    const original = this.sounds[name];
    if (!original) return;

    const clone = original.cloneNode(true);
    clone.volume = this.sfxVolume;
    clone.play().catch(() => {});
    // Clean up after playback ends
    clone.addEventListener('ended', () => { clone.remove && clone.remove(); });
  },

  // Start background music
  startMusic() {
    if (!this.bgMusic || this.bgMusicPlaying) return;
    this.bgMusic.volume = this.muted ? 0 : this.musicVolume;
    this.bgMusic.play().then(() => {
      this.bgMusicPlaying = true;
    }).catch(() => {
      // Browser blocked autoplay — mark as wanting music so toggleMute can resume
      this.bgMusicPlaying = false;
      this.wantsMusic = true;
    });
  },

  // Stop background music
  stopMusic() {
    if (!this.bgMusic) return;
    this.bgMusic.pause();
    this.bgMusic.currentTime = 0;
    this.bgMusicPlaying = false;
    this.wantsMusic = false;
  },

  // Toggle mute
  toggleMute() {
    this.muted = !this.muted;
    if (this.bgMusic) {
      this.bgMusic.volume = this.muted ? 0 : this.musicVolume;
      // If unmuting and music should be playing but was blocked by autoplay, resume it
      if (!this.muted && (this.wantsMusic || this.bgMusicPlaying)) {
        this.bgMusic.play().then(() => {
          this.bgMusicPlaying = true;
          this.wantsMusic = false;
        }).catch(() => {});
      }
    }
    localStorage.setItem('kc-muted', this.muted ? '1' : '0');
    return this.muted;
  },

  // Restore mute preference
  loadPreference() {
    const saved = localStorage.getItem('kc-muted');
    if (saved === '1') {
      this.muted = true;
    }
  }
};

// Load preferences immediately
AudioManager.loadPreference();

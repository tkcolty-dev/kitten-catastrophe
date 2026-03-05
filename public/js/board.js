// Board renderer — draws the game board on a canvas
// Renders proper board-game tiles with labels, icons, and thick paths

const SPACE_STYLES = {
  start:       { fill: '#66bb6a', stroke: '#388e3c', label: 'START',  emoji: '🏁', glow: '#a5d6a7' },
  safe:        { fill: '#e8e0d4', stroke: '#bfb5a5', label: '',       emoji: '🐾', glow: null },
  draw:        { fill: '#42a5f5', stroke: '#1976d2', label: 'DRAW',   emoji: '🃏', glow: '#90caf9' },
  catastrophe: { fill: '#ef5350', stroke: '#c62828', label: 'CAT!',   emoji: '💥', glow: '#ef9a9a' },
  fork:        { fill: '#ffca28', stroke: '#f9a825', label: 'FORK',   emoji: '🔀', glow: '#fff59d' },
  trap:        { fill: '#ffa726', stroke: '#e65100', label: 'TRAP',   emoji: '🪤', glow: '#ffcc80' },
  shortcut:    { fill: '#ab47bc', stroke: '#7b1fa2', label: 'SKIP!',  emoji: '⚡', glow: '#ce93d8' },
  finish:      { fill: '#ffd600', stroke: '#ff8f00', label: 'FINISH', emoji: '🏆', glow: '#fff176' },
  property:    { fill: '#78909c', stroke: '#455a64', label: 'LOT',    emoji: '🏠', glow: '#b0bec5' },
  shop:        { fill: '#26c6da', stroke: '#00838f', label: 'SHOP',   emoji: '🛒', glow: '#80deea' },
};

const TILE_W = 52;
const TILE_H = 52;
const TILE_R = 10;

class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.virtualWidth = 1080;
    this.virtualHeight = 555;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.positions = {};
    this.playerColors = {};
    this.playerNames = {};
    this.properties = {};
    this.animatingTokens = {};
  }

  setBoard(boardLayout) {
    this.nodes = boardLayout.nodes;
    this.virtualWidth = boardLayout.width;
    this.virtualHeight = boardLayout.height;
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight || 400;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = 40;
    const scaleX = (w - pad * 2) / this.virtualWidth;
    const scaleY = (h - pad * 2) / this.virtualHeight;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (w - this.virtualWidth * this.scale) / 2;
    this.offsetY = (h - this.virtualHeight * this.scale) / 2;
  }

  toScreen(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: y * this.scale + this.offsetY,
    };
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    this.drawBackground(w, h);
    this.drawEdges();
    for (const node of this.nodes) this.drawTile(node);
    this.drawTokens();
  }

  drawBackground(w, h) {
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
    grad.addColorStop(0, '#faf6f0');
    grad.addColorStop(1, '#f0ebe3');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0,0,0,0.015)';
    for (let px = 0; px < w; px += 18) {
      for (let py = 0; py < h; py += 18) {
        ctx.beginPath();
        ctx.arc(px, py, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawEdges() {
    const ctx = this.ctx;

    for (const node of this.nodes) {
      for (const nextId of node.next) {
        const next = this.nodes.find(n => n.id === nextId);
        if (!next) continue;

        const from = this.toScreen(node.x, node.y);
        const to = this.toScreen(next.x, next.y);

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const cx = from.x + dx * 0.5;
        const cy = from.y + dy * 0.5 - Math.abs(dy) * 0.1;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cx, cy, to.x, to.y);
        ctx.strokeStyle = '#c8b8a0';
        ctx.lineWidth = Math.max(8 * this.scale, 3);
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cx, cy, to.x, to.y);
        ctx.strokeStyle = '#e8dfd4';
        ctx.lineWidth = Math.max(4 * this.scale, 2);
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      if (node.type === 'shortcut' && node.shortcutTo !== undefined) {
        const target = this.nodes.find(n => n.id === node.shortcutTo);
        if (target) {
          const from = this.toScreen(node.x, node.y);
          const to = this.toScreen(target.x, target.y);
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#ab47bc';
          ctx.lineWidth = Math.max(2.5 * this.scale, 2);
          ctx.lineCap = 'round';
          ctx.beginPath();
          const midY = Math.min(from.y, to.y) - 40 * this.scale;
          ctx.moveTo(from.x, from.y);
          ctx.quadraticCurveTo((from.x + to.x) / 2, midY, to.x, to.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  drawTile(node) {
    const ctx = this.ctx;
    const style = SPACE_STYLES[node.type] || SPACE_STYLES.safe;
    const pos = this.toScreen(node.x, node.y);
    const w = TILE_W * this.scale;
    const h = TILE_H * this.scale;
    const r = TILE_R * this.scale;
    const x = pos.x - w / 2;
    const y = pos.y - h / 2;

    // Property ownership border
    const owner = this.properties[node.id];
    if (owner && node.type === 'property') {
      const ownerColor = this.playerColors[owner] || '#999';
      ctx.save();
      ctx.shadowColor = ownerColor;
      ctx.shadowBlur = 10 * this.scale;
      ctx.fillStyle = ownerColor;
      this.roundRect(x - 4, y - 4, w + 8, h + 8, r + 3);
      ctx.fill();
      ctx.restore();
    } else if (style.glow) {
      ctx.save();
      ctx.shadowColor = style.glow;
      ctx.shadowBlur = 8 * this.scale;
      ctx.fillStyle = style.glow;
      this.roundRect(x - 2, y - 2, w + 4, h + 4, r + 2);
      ctx.fill();
      ctx.restore();
    }

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 6 * this.scale;
    ctx.shadowOffsetY = 2 * this.scale;

    // Tile body
    let fillColor = style.fill;
    if (owner && node.type === 'property') {
      // Tint property with owner's color
      fillColor = this.blendColor(style.fill, this.playerColors[owner] || '#999', 0.3);
    }
    ctx.fillStyle = fillColor;
    this.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = owner && node.type === 'property' ? (this.playerColors[owner] || style.stroke) : style.stroke;
    ctx.lineWidth = Math.max(2 * this.scale, 1.5);
    this.roundRect(x, y, w, h, r);
    ctx.stroke();

    // Emoji icon
    const emojiSize = Math.max(16 * this.scale, 10);
    ctx.font = `${emojiSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.emoji, pos.x, pos.y - 3 * this.scale);

    // Label text
    if (style.label) {
      ctx.fillStyle = style.stroke;
      ctx.font = `bold ${Math.max(8 * this.scale, 6)}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.label, pos.x, pos.y + 14 * this.scale);
    }
  }

  blendColor(c1, c2, ratio) {
    const hex = s => parseInt(s.slice(1), 16);
    const h1 = hex(c1), h2 = hex(c2);
    const r = Math.round(((h1 >> 16) & 255) * (1 - ratio) + ((h2 >> 16) & 255) * ratio);
    const g = Math.round(((h1 >> 8) & 255) * (1 - ratio) + ((h2 >> 8) & 255) * ratio);
    const b = Math.round((h1 & 255) * (1 - ratio) + (h2 & 255) * ratio);
    return `rgb(${r},${g},${b})`;
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  drawTokens() {
    const ctx = this.ctx;
    const byNode = {};
    for (const [pid, nodeId] of Object.entries(this.positions)) {
      if (!byNode[nodeId]) byNode[nodeId] = [];
      byNode[nodeId].push(pid);
    }

    for (const [nodeIdStr, players] of Object.entries(byNode)) {
      const nodeId = parseInt(nodeIdStr);
      const node = this.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const base = this.toScreen(node.x, node.y);
      const tokenR = Math.max(14 * this.scale, 9);
      const tokenBaseY = base.y + (TILE_H * this.scale) / 2 + tokenR + 3 * this.scale;

      players.forEach((pid, i) => {
        const anim = this.animatingTokens[pid];
        let tx, ty;

        if (anim) {
          const elapsed = Date.now() - anim.startTime;
          const stepDuration = 350;
          const currentStep = Math.floor(elapsed / stepDuration);

          if (currentStep >= anim.path.length) {
            delete this.animatingTokens[pid];
            tx = base.x; ty = tokenBaseY;
          } else {
            const progress = (elapsed % stepDuration) / stepDuration;
            const fromNodeId = currentStep === 0 ? anim.startNode : anim.path[currentStep - 1];
            const toNodeId = anim.path[currentStep];
            const fromNode = this.nodes.find(n => n.id === fromNodeId);
            const toNode = this.nodes.find(n => n.id === toNodeId);
            if (fromNode && toNode) {
              const from = this.toScreen(fromNode.x, fromNode.y);
              const to = this.toScreen(toNode.x, toNode.y);
              const ease = easeInOut(progress);
              tx = from.x + (to.x - from.x) * ease;
              ty = from.y + (to.y - from.y) * ease;
              ty -= Math.sin(ease * Math.PI) * 12 * this.scale;
            } else { tx = base.x; ty = tokenBaseY; }
          }
        } else { tx = base.x; ty = tokenBaseY; }

        // Offset when sharing
        const totalW = players.length * (tokenR * 2 + 2 * this.scale);
        const startX = -totalW / 2 + tokenR;
        tx += startX + i * (tokenR * 2 + 2 * this.scale);

        // Token shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 2;

        // Outer ring
        ctx.beginPath();
        ctx.arc(tx, ty, tokenR + 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Colored circle
        ctx.beginPath();
        ctx.arc(tx, ty, tokenR, 0, Math.PI * 2);
        ctx.fillStyle = this.playerColors[pid] || '#999';
        ctx.fill();
        ctx.restore();

        // Player initial
        const name = this.playerNames[pid] || '';
        if (name) {
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.max(tokenR * 1.0, 10)}px Nunito, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(name[0].toUpperCase(), tx, ty);
        }
      });
    }
  }

  animateToken(playerId, path, startNode) {
    if (path.length === 0) return;
    this.animatingTokens[playerId] = { path, startNode, startTime: Date.now() };
    const totalDuration = path.length * 350 + 50;
    const animate = () => {
      this.draw();
      if (Date.now() - this.animatingTokens[playerId]?.startTime < totalDuration) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  updatePositions(positions) { this.positions = { ...positions }; }
  updateProperties(properties) { this.properties = { ...properties }; }

  highlightNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const ctx = this.ctx;
    const pos = this.toScreen(node.x, node.y);
    const w = (TILE_W + 10) * this.scale;
    const h = (TILE_H + 10) * this.scale;
    const r = (TILE_R + 3) * this.scale;
    ctx.save();
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    this.roundRect(pos.x - w / 2, pos.y - h / 2, w, h, r);
    ctx.stroke();
    ctx.restore();
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// --- 3D Dice ---

class DiceRoller {
  constructor(container) {
    this.container = container;
    this.value = null;
    this.rolling = false;
    this.build();
  }

  build() {
    this.container.innerHTML = `
      <div class="dice3d-wrapper">
        <div class="dice3d-scene">
          <div class="dice3d-cube" id="dice-cube">
            <div class="dice3d-face dice3d-front">${this.pips(1)}</div>
            <div class="dice3d-face dice3d-back">${this.pips(6)}</div>
            <div class="dice3d-face dice3d-right">${this.pips(3)}</div>
            <div class="dice3d-face dice3d-left">${this.pips(4)}</div>
            <div class="dice3d-face dice3d-top">${this.pips(2)}</div>
            <div class="dice3d-face dice3d-bottom">${this.pips(5)}</div>
          </div>
        </div>
        <button id="dice-btn" class="dice3d-btn">ROLL!</button>
      </div>
    `;
  }

  // Shake the dice on hover for tactile feel
  addHoverShake() {
    const cube = document.getElementById('dice-cube');
    const btn = document.getElementById('dice-btn');
    if (!btn || !cube) return;
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) cube.style.animation = 'diceHover 0.3s ease';
    });
    btn.addEventListener('mouseleave', () => {
      cube.style.animation = '';
    });
  }

  pips(n) {
    const d = '<span class="d3pip"></span>';
    const s = '<span class="d3pip-spacer"></span>';
    const layouts = {
      1: `<div class="d3row">${s}${d}${s}</div>`,
      2: `<div class="d3row">${d}${s}</div><div class="d3row">${s}${d}</div>`,
      3: `<div class="d3row">${d}${s}</div><div class="d3row">${s}${d}${s}</div><div class="d3row">${s}${d}</div>`,
      4: `<div class="d3row">${d}${d}</div><div class="d3row">${d}${d}</div>`,
      5: `<div class="d3row">${d}${d}</div><div class="d3row">${s}${d}${s}</div><div class="d3row">${d}${d}</div>`,
      6: `<div class="d3row">${d}${d}</div><div class="d3row">${d}${d}</div><div class="d3row">${d}${d}</div>`,
    };
    return layouts[n] || '';
  }

  showRoll(value) {
    this.rolling = true;
    this.value = value;
    const cube = document.getElementById('dice-cube');
    if (!cube) return;

    // Add tumble animation
    cube.classList.add('dice3d-rolling');
    const btn = document.getElementById('dice-btn');
    if (btn) btn.disabled = true;

    setTimeout(() => {
      cube.classList.remove('dice3d-rolling');
      // Set final rotation to show correct face
      const rotations = {
        1: 'rotateX(0deg) rotateY(0deg)',
        2: 'rotateX(-90deg) rotateY(0deg)',
        3: 'rotateX(0deg) rotateY(90deg)',
        4: 'rotateX(0deg) rotateY(-90deg)',
        5: 'rotateX(90deg) rotateY(0deg)',
        6: 'rotateX(180deg) rotateY(0deg)',
      };
      cube.style.transform = rotations[value] || '';
      this.rolling = false;
    }, 1200);
  }

  reset() {
    this.value = null;
    this.rolling = false;
    const cube = document.getElementById('dice-cube');
    if (cube) {
      cube.classList.remove('dice3d-rolling');
      cube.style.transform = '';
    }
    const btn = document.getElementById('dice-btn');
    if (btn) btn.disabled = false;
  }

  setEnabled(enabled) {
    const btn = document.getElementById('dice-btn');
    if (btn) btn.disabled = !enabled;
  }
}

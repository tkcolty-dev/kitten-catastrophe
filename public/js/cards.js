// Card definitions
const KITTY_COLORS = {
  red:    { bg: 'linear-gradient(145deg, #ff8a80 0%, #ff5252 40%, #d32f2f 100%)', text: '#fff', border: '#e53935', name: 'Red', glow: 'rgba(229,57,53,0.25)', accent: '#ffcdd2' },
  blue:   { bg: 'linear-gradient(145deg, #82b1ff 0%, #448aff 40%, #1565c0 100%)', text: '#fff', border: '#1e88e5', name: 'Blue', glow: 'rgba(30,136,229,0.25)', accent: '#bbdefb' },
  green:  { bg: 'linear-gradient(145deg, #69f0ae 0%, #00e676 40%, #00895e 100%)', text: '#fff', border: '#00a651', name: 'Green', glow: 'rgba(0,166,81,0.25)', accent: '#b9f6ca' },
  yellow: { bg: 'linear-gradient(145deg, #fff9c4 0%, #ffee58 40%, #f9a825 100%)', text: '#5d4037', border: '#f9a825', name: 'Yellow', glow: 'rgba(249,168,37,0.25)', accent: '#fff8e1' }
};

const RARE_DEFS = {
  skip: {
    name: 'Catnap',
    desc: 'Skip next player',
    color: '#90caf9',
    bg: '#e3f2fd',
    img: 'https://images.unsplash.com/photo-1700916536888-ca4c2ae624e8?w=200&h=200&fit=crop&crop=faces',
    label: 'SKIP'
  },
  draw2: {
    name: 'Zoomies',
    desc: 'Next player draws 2!',
    color: '#ffb74d',
    bg: '#fff3e0',
    img: 'https://images.unsplash.com/photo-1685712108226-c7f960765bbd?w=200&h=200&fit=crop&crop=faces',
    label: '+2'
  },
  draw6: {
    name: 'Stampede',
    desc: 'Pick color + next draws 6!',
    color: '#ff7043',
    bg: '#fbe9e7',
    img: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&h=200&fit=crop&crop=faces',
    label: 'WILD +6'
  },
  draw10: {
    name: 'Cat-astrophic Pile',
    desc: 'Pick color + next draws 10!!',
    color: '#d50000',
    bg: '#ffebee',
    img: 'https://images.unsplash.com/photo-1615497001839-b0a0eac3274c?w=200&h=200&fit=crop&crop=faces',
    label: 'WILD +10'
  },
  reverse: {
    name: 'Alley Cat',
    desc: 'Reverse direction',
    color: '#81c784',
    bg: '#e8f5e9',
    img: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=200&h=200&fit=crop&crop=faces',
    label: 'REVERSE'
  },
  steal: {
    name: 'Pounce',
    desc: 'Steal a random card',
    color: '#f48fb1',
    bg: '#fce4ec',
    img: 'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=200&h=200&fit=crop&crop=faces',
    label: 'STEAL'
  },
  discardall: {
    name: 'Purr-ge',
    desc: 'Discard all of this color',
    color: '#ce93d8',
    bg: '#f3e5f5',
    img: 'https://images.unsplash.com/photo-1606214174585-fe31582dc6ee?w=200&h=200&fit=crop&crop=faces',
    label: 'PURGE'
  },
  skipall: {
    name: 'Cat Nuke',
    desc: 'Skip all other players!',
    color: '#ff8a65',
    bg: '#fbe9e7',
    img: 'img/kitten.png',
    label: 'SKIP ALL'
  },
  nope: {
    name: 'HISS!',
    desc: 'Cancel draw stack',
    color: '#e53935',
    bg: '#ffcdd2',
    img: 'https://images.unsplash.com/photo-1548747371-ebf9d255c6d1?w=200&h=200&fit=crop&crop=faces',
    label: 'NOPE'
  },
  wild: {
    name: 'Copycat',
    desc: 'Play anytime, pick color',
    color: '#ab47bc',
    bg: '#f3e5f5',
    img: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=200&h=200&fit=crop&crop=faces',
    label: 'WILD'
  },
  wilddraw4: {
    name: 'Cat Burglar',
    desc: 'Pick color + next draws 4!',
    color: '#333',
    bg: '#f5f5f5',
    img: 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=200&h=200&fit=crop&crop=faces',
    label: 'WILD +4'
  }
};

const PAW_SVG = `<svg viewBox="0 0 24 24" class="kitty-paw-icon" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="16" rx="5.5" ry="4.5" fill="currentColor" opacity="0.12"/><circle cx="6.5" cy="10" r="2.8" fill="currentColor" opacity="0.1"/><circle cx="17.5" cy="10" r="2.8" fill="currentColor" opacity="0.1"/><circle cx="9.5" cy="6.5" r="2.2" fill="currentColor" opacity="0.1"/><circle cx="14.5" cy="6.5" r="2.2" fill="currentColor" opacity="0.1"/></svg>`;

function getCardDef(card) {
  if (card.type === 'kitty') return null;
  return RARE_DEFS[card.type];
}

function renderCard(card, opts = {}) {
  if (card.type === 'kitty') return renderKittyCard(card, opts);
  return renderRareCard(card, opts);
}

function renderKittyCard(card, opts = {}) {
  const c = KITTY_COLORS[card.color];
  if (!c) return '<div class="card unknown">?</div>';
  const selected = opts.selected ? 'selected' : '';
  const playable = opts.playable ? 'playable' : '';
  const small = opts.small ? 'card-small' : '';

  return `
    <div class="card card-kitty ${selected} ${playable} ${small}" data-card-id="${card.id}" data-card-type="kitty" data-card-color="${card.color}" style="--card-color: ${c.border}; --card-glow: ${c.glow}">
      <div class="card-inner kitty-inner" style="background: ${c.bg}; border-color: ${c.border}; color: ${c.text}">
        <div class="kitty-shine"></div>
        <div class="kitty-corner-tl"><span class="kitty-corner-num">${card.number}</span></div>
        <div class="kitty-center-paw">${PAW_SVG}</div>
        <div class="kitty-number">${card.number}</div>
        <div class="kitty-corner-br"><span class="kitty-corner-num">${card.number}</span></div>
        <div class="kitty-color-name">${c.name}</div>
      </div>
    </div>
  `;
}

function renderRareCard(card, opts = {}) {
  const def = getCardDef(card);
  if (!def) return '<div class="card unknown">?</div>';
  const selected = opts.selected ? 'selected' : '';
  const playable = opts.playable ? 'playable' : '';
  const small = opts.small ? 'card-small' : '';

  // Colored action cards get their kitty color as border/accent
  const kc = card.color ? KITTY_COLORS[card.color] : null;
  const borderColor = kc ? kc.border : def.color;
  const bgColor = kc ? kc.accent : def.bg;
  const colorTag = kc ? `<div class="card-color-tag" style="background:${kc.border};color:${kc.text}">${kc.name}</div>` : '';

  return `
    <div class="card card-rare ${selected} ${playable} ${small}" data-card-id="${card.id}" data-card-type="${card.type}" style="--card-color: ${borderColor}; --card-bg: ${bgColor}">
      <div class="card-inner">
        <div class="card-photo">
          <img src="${def.img}" alt="${def.name}" loading="lazy">
          ${def.label ? `<span class="card-label">${def.label}</span>` : ''}
        </div>
        <div class="card-name">${def.name}</div>
        <div class="card-desc">${def.desc}</div>
        ${colorTag}
      </div>
    </div>
  `;
}

function renderCardBack(opts = {}) {
  const small = opts.small ? 'card-small' : '';
  return `<div class="card card-back ${small}"><div class="card-back-design"><img src="img/kitten.png" alt="" class="card-back-cat"><div class="card-back-label">KC</div></div></div>`;
}

// Card definitions and SVG art
const CARD_DEFS = {
  catastrophe: {
    toilet: {
      name: 'Toilet Catastrophe',
      desc: 'Kitten fell in the toilet!',
      color: '#6ec6ff',
      bg: '#e3f2fd',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="40" cy="52" rx="22" ry="14" fill="#e0e0e0" stroke="#999" stroke-width="2"/>
        <ellipse cx="40" cy="50" rx="18" ry="10" fill="#90caf9"/>
        <circle cx="36" cy="30" r="10" fill="#ffa726"/>
        <circle cx="32" cy="28" r="3" fill="#fff"/><circle cx="33" cy="28" r="1.5" fill="#333"/>
        <circle cx="40" cy="28" r="3" fill="#fff"/><circle cx="41" cy="28" r="1.5" fill="#333"/>
        <path d="M34 33 Q37 36 40 33" fill="none" stroke="#333" stroke-width="1.5"/>
        <path d="M28 23 L26 17" stroke="#ffa726" stroke-width="2" stroke-linecap="round"/>
        <path d="M44 23 L46 17" stroke="#ffa726" stroke-width="2" stroke-linecap="round"/>
        <path d="M30 44 Q36 38 42 44" fill="#ffa726" stroke="none"/>
        <text x="40" y="74" text-anchor="middle" font-size="6" fill="#666">SPLASH!</text>
      </svg>`
    },
    vase: {
      name: 'Vase Catastrophe',
      desc: 'Kitten knocked over the vase!',
      color: '#ce93d8',
      bg: '#f3e5f5',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 60 L28 35 Q28 25 40 25 Q52 25 52 35 L50 60 Z" fill="#ce93d8" stroke="#8e24aa" stroke-width="1.5" transform="rotate(25 40 42)"/>
        <path d="M35 28 L33 20 M40 26 L40 16 M45 28 L47 20" stroke="#4caf50" stroke-width="2" transform="rotate(25 40 42)"/>
        <circle cx="32" cy="50" r="10" fill="#ff9800"/>
        <circle cx="28" cy="48" r="3" fill="#fff"/><circle cx="29" cy="48" r="1.5" fill="#333"/>
        <circle cx="36" cy="48" r="3" fill="#fff"/><circle cx="37" cy="48" r="1.5" fill="#333"/>
        <path d="M30 53 Q32 55 34 53" fill="none" stroke="#333" stroke-width="1.5"/>
        <path d="M24 43 L22 37" stroke="#ff9800" stroke-width="2" stroke-linecap="round"/>
        <path d="M40 43 L42 37" stroke="#ff9800" stroke-width="2" stroke-linecap="round"/>
        <text x="40" y="74" text-anchor="middle" font-size="6" fill="#666">CRASH!</text>
      </svg>`
    },
    tree: {
      name: 'Tree Catastrophe',
      desc: 'Kitten stuck in a tree!',
      color: '#81c784',
      bg: '#e8f5e9',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect x="36" y="45" width="8" height="25" fill="#8d6e63"/>
        <polygon points="40,10 20,35 60,35" fill="#66bb6a"/>
        <polygon points="40,20 22,45 58,45" fill="#4caf50"/>
        <circle cx="40" cy="36" r="7" fill="#ffcc80"/>
        <circle cx="37" cy="34" r="2.5" fill="#fff"/><circle cx="38" cy="34" r="1.2" fill="#333"/>
        <circle cx="43" cy="34" r="2.5" fill="#fff"/><circle cx="44" cy="34" r="1.2" fill="#333"/>
        <path d="M38 39 Q40 41 42 39" fill="none" stroke="#333" stroke-width="1.2"/>
        <path d="M33 30 L31 26" stroke="#ffcc80" stroke-width="2" stroke-linecap="round"/>
        <path d="M47 30 L49 26" stroke="#ffcc80" stroke-width="2" stroke-linecap="round"/>
        <text x="40" y="76" text-anchor="middle" font-size="6" fill="#666">HELP!</text>
      </svg>`
    },
    yarn: {
      name: 'Yarn Catastrophe',
      desc: 'Kitten tangled in yarn!',
      color: '#ef5350',
      bg: '#ffebee',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="15" fill="#ef5350"/>
        <path d="M38 45 Q50 35 62 45 Q50 55 38 45" fill="none" stroke="#c62828" stroke-width="1"/>
        <path d="M42 38 Q50 50 58 38" fill="none" stroke="#c62828" stroke-width="1"/>
        <path d="M50 35 L30 25" stroke="#ef5350" stroke-width="2"/>
        <circle cx="28" cy="32" r="9" fill="#ffd54f"/>
        <circle cx="25" cy="30" r="2.5" fill="#fff"/><circle cx="26" cy="30" r="1.2" fill="#333"/>
        <circle cx="31" cy="30" r="2.5" fill="#fff"/><circle cx="32" cy="30" r="1.2" fill="#333"/>
        <path d="M26 35 Q28 37 30 35" fill="none" stroke="#333" stroke-width="1.2"/>
        <path d="M20 25 L18 19" stroke="#ffd54f" stroke-width="2" stroke-linecap="round"/>
        <path d="M36 25 L38 19" stroke="#ffd54f" stroke-width="2" stroke-linecap="round"/>
        <path d="M35 40 C30 38 25 42 28 45 C20 42 22 50 30 48" stroke="#ef5350" stroke-width="1.5" fill="none"/>
        <text x="40" y="76" text-anchor="middle" font-size="6" fill="#666">TANGLE!</text>
      </svg>`
    }
  },
  defuse: {
    name: 'Land on Your Feet',
    desc: 'Defuse a catastrophe!',
    color: '#ffd600',
    bg: '#fffde7',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="35" r="14" fill="#ffb74d"/>
      <circle cx="35" cy="32" r="3.5" fill="#fff"/><circle cx="36" cy="32" r="2" fill="#4caf50"/>
      <circle cx="45" cy="32" r="3.5" fill="#fff"/><circle cx="46" cy="32" r="2" fill="#4caf50"/>
      <path d="M37 39 Q40 43 43 39" fill="none" stroke="#333" stroke-width="1.5"/>
      <path d="M30 25 L27 17" stroke="#ffb74d" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M50 25 L53 17" stroke="#ffb74d" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="40" y1="49" x2="40" y2="58" stroke="#ffb74d" stroke-width="3"/>
      <line x1="33" y1="58" x2="40" y2="65" stroke="#ffb74d" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="47" y1="58" x2="40" y2="65" stroke="#ffb74d" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M25 68 L55 68" stroke="#aaa" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="40" y="76" text-anchor="middle" font-size="5" fill="#f57f17" font-weight="bold">SAFE!</text>
    </svg>`
  },
  catnap: {
    name: 'Catnap',
    desc: 'Skip your turn',
    color: '#90caf9',
    bg: '#e3f2fd',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="50" rx="25" ry="12" fill="#e0e0e0" rx="3"/>
      <circle cx="40" cy="40" r="12" fill="#bcaaa4"/>
      <path d="M34 40 Q37 38 40 40" fill="none" stroke="#333" stroke-width="1.5"/>
      <path d="M40 40 Q43 38 46 40" fill="none" stroke="#333" stroke-width="1.5"/>
      <path d="M37 44 Q40 46 43 44" fill="none" stroke="#333" stroke-width="1"/>
      <path d="M32 32 L30 25" stroke="#bcaaa4" stroke-width="2" stroke-linecap="round"/>
      <path d="M48 32 L50 25" stroke="#bcaaa4" stroke-width="2" stroke-linecap="round"/>
      <text x="52" y="24" font-size="10" fill="#64b5f6" font-weight="bold">Z</text>
      <text x="58" y="18" font-size="8" fill="#90caf9" font-weight="bold">Z</text>
      <text x="62" y="13" font-size="6" fill="#bbdefb" font-weight="bold">Z</text>
      <text x="40" y="72" text-anchor="middle" font-size="5" fill="#1976d2">Zzz...</text>
    </svg>`
  },
  zoomies: {
    name: 'Zoomies',
    desc: 'Next player takes 2 turns!',
    color: '#ffb74d',
    bg: '#fff3e0',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="45" cy="38" r="11" fill="#ff8a65"/>
      <circle cx="41" cy="36" r="3" fill="#fff"/><circle cx="43" cy="35" r="1.5" fill="#333"/>
      <circle cx="49" cy="36" r="3" fill="#fff"/><circle cx="51" cy="35" r="1.5" fill="#333"/>
      <path d="M44 42 Q46 43 48 42" fill="none" stroke="#333" stroke-width="1"/>
      <path d="M37 30 L34 24" stroke="#ff8a65" stroke-width="2" stroke-linecap="round"/>
      <path d="M53 30 L56 24" stroke="#ff8a65" stroke-width="2" stroke-linecap="round"/>
      <line x1="18" y1="40" x2="30" y2="38" stroke="#ffcc80" stroke-width="2"/>
      <line x1="15" y1="44" x2="28" y2="42" stroke="#ffcc80" stroke-width="1.5"/>
      <line x1="18" y1="48" x2="28" y2="46" stroke="#ffcc80" stroke-width="1"/>
      <path d="M42 49 Q50 55 55 50 Q60 48 62 52" fill="none" stroke="#ff8a65" stroke-width="2.5"/>
      <text x="40" y="72" text-anchor="middle" font-size="5" fill="#e65100">ZOOM!</text>
    </svg>`
  },
  curiosity: {
    name: 'Curiosity',
    desc: 'Peek at top 3 cards',
    color: '#a5d6a7',
    bg: '#e8f5e9',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="42" r="13" fill="#8d6e63"/>
      <circle cx="35" cy="39" r="4.5" fill="#ffd600"/><circle cx="36" cy="39" r="2.5" fill="#333"/>
      <circle cx="45" cy="39" r="4.5" fill="#ffd600"/><circle cx="46" cy="39" r="2.5" fill="#333"/>
      <ellipse cx="40" cy="46" rx="2" ry="1.2" fill="#ffab91"/>
      <path d="M33 32 L30 24" stroke="#8d6e63" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M47 32 L50 24" stroke="#8d6e63" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="20" y="54" width="12" height="16" rx="2" fill="#e0e0e0" stroke="#999" stroke-width="1"/>
      <rect x="34" y="54" width="12" height="16" rx="2" fill="#e0e0e0" stroke="#999" stroke-width="1"/>
      <rect x="48" y="54" width="12" height="16" rx="2" fill="#e0e0e0" stroke="#999" stroke-width="1"/>
      <text x="26" y="64" text-anchor="middle" font-size="8" fill="#999">?</text>
      <text x="40" y="64" text-anchor="middle" font-size="8" fill="#999">?</text>
      <text x="54" y="64" text-anchor="middle" font-size="8" fill="#999">?</text>
    </svg>`
  },
  hairball: {
    name: 'Hairball',
    desc: 'Shuffle the draw pile',
    color: '#bcaaa4',
    bg: '#efebe9',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="35" r="12" fill="#a1887f"/>
      <circle cx="36" cy="33" r="3" fill="#fff"/><circle cx="37" cy="33" r="1.5" fill="#333"/>
      <circle cx="44" cy="33" r="3" fill="#fff"/><circle cx="45" cy="33" r="1.5" fill="#333"/>
      <ellipse cx="40" cy="40" rx="3" ry="2" fill="#333"/>
      <path d="M33 27 L30 20" stroke="#a1887f" stroke-width="2" stroke-linecap="round"/>
      <path d="M47 27 L50 20" stroke="#a1887f" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="40" cy="58" rx="12" ry="8" fill="#bcaaa4"/>
      <path d="M30 56 Q35 50 40 56 Q45 50 50 56" fill="none" stroke="#8d6e63" stroke-width="1.5"/>
      <path d="M32 60 Q37 54 42 60 Q47 54 52 60" fill="none" stroke="#8d6e63" stroke-width="1"/>
      <text x="40" y="76" text-anchor="middle" font-size="5" fill="#5d4037">*hack*</text>
    </svg>`
  },
  pounce: {
    name: 'Pounce',
    desc: 'Steal a random card from a player',
    color: '#f48fb1',
    bg: '#fce4ec',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="35" cy="28" r="11" fill="#ff7043"/>
      <circle cx="31" cy="26" r="3" fill="#fff"/><circle cx="32" cy="25" r="1.8" fill="#333"/>
      <circle cx="39" cy="26" r="3" fill="#fff"/><circle cx="40" cy="25" r="1.8" fill="#333"/>
      <path d="M33 32 Q35 34 37 32" fill="none" stroke="#333" stroke-width="1"/>
      <path d="M27 20 L24 12" stroke="#ff7043" stroke-width="2" stroke-linecap="round"/>
      <path d="M43 20 L46 12" stroke="#ff7043" stroke-width="2" stroke-linecap="round"/>
      <path d="M35 39 Q40 45 50 50" fill="none" stroke="#ff7043" stroke-width="3"/>
      <path d="M50 50 L60 44 M50 50 L62 50 M50 50 L58 56" stroke="#ff7043" stroke-width="2" stroke-linecap="round"/>
      <rect x="48" y="58" width="18" height="12" rx="2" fill="#e0e0e0" stroke="#999" stroke-width="1"/>
      <text x="57" y="67" text-anchor="middle" font-size="8" fill="#999">?</text>
      <text x="40" y="76" text-anchor="middle" font-size="5" fill="#d84315">YOINK!</text>
    </svg>`
  },
  hiss: {
    name: 'HISS!',
    desc: 'Cancel any action card',
    color: '#e53935',
    bg: '#ffcdd2',
    svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="16" fill="#ef5350"/>
      <circle cx="34" cy="36" r="4" fill="#fff"/><circle cx="35" cy="35" r="2.5" fill="#333"/>
      <circle cx="46" cy="36" r="4" fill="#fff"/><circle cx="47" cy="35" r="2.5" fill="#333"/>
      <path d="M35 48 L40 44 L45 48" fill="none" stroke="#fff" stroke-width="2"/>
      <path d="M24 28 L20 18" stroke="#ef5350" stroke-width="3" stroke-linecap="round"/>
      <path d="M56 28 L60 18" stroke="#ef5350" stroke-width="3" stroke-linecap="round"/>
      <path d="M15 32 L10 30 M15 36 L8 36 M15 40 L10 42" stroke="#ffcdd2" stroke-width="2" stroke-linecap="round"/>
      <path d="M65 32 L70 30 M65 36 L72 36 M65 40 L70 42" stroke="#ffcdd2" stroke-width="2" stroke-linecap="round"/>
      <text x="40" y="70" text-anchor="middle" font-size="7" fill="#b71c1c" font-weight="bold">HISS!</text>
    </svg>`
  },
  breed: {
    tabby: {
      name: 'Tabby Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#ffcc80',
      bg: '#fff8e1',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="42" r="16" fill="#ffb74d"/>
        <path d="M25 35 Q28 28 32 32" fill="#ffb74d" stroke="#f57c00" stroke-width="1"/>
        <path d="M55 35 Q52 28 48 32" fill="#ffb74d" stroke="#f57c00" stroke-width="1"/>
        <path d="M30 38 L50 38 M32 42 L48 42 M34 46 L46 46" stroke="#f57c00" stroke-width="1" opacity="0.5"/>
        <circle cx="35" cy="39" r="3.5" fill="#fff"/><circle cx="36" cy="39" r="2" fill="#4caf50"/>
        <circle cx="45" cy="39" r="3.5" fill="#fff"/><circle cx="46" cy="39" r="2" fill="#4caf50"/>
        <ellipse cx="40" cy="46" rx="2" ry="1.5" fill="#ffab91"/>
        <path d="M37 49 Q40 52 43 49" fill="none" stroke="#333" stroke-width="1"/>
        <text x="40" y="72" text-anchor="middle" font-size="6" fill="#e65100">Tabby</text>
      </svg>`
    },
    siamese: {
      name: 'Siamese Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#d7ccc8',
      bg: '#efebe9',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="42" r="16" fill="#f5f5f5"/>
        <path d="M25 35 Q28 22 33 32" fill="#f5f5f5" stroke="#8d6e63" stroke-width="1"/>
        <path d="M55 35 Q52 22 47 32" fill="#f5f5f5" stroke="#8d6e63" stroke-width="1"/>
        <circle cx="35" cy="39" r="3.5" fill="#64b5f6"/><circle cx="36" cy="39" r="2" fill="#1565c0"/>
        <circle cx="45" cy="39" r="3.5" fill="#64b5f6"/><circle cx="46" cy="39" r="2" fill="#1565c0"/>
        <ellipse cx="40" cy="46" rx="2" ry="1.5" fill="#8d6e63"/>
        <circle cx="40" cy="47" r="6" fill="#d7ccc8" opacity="0.7"/>
        <path d="M37 49 Q40 51 43 49" fill="none" stroke="#5d4037" stroke-width="1"/>
        <text x="40" y="72" text-anchor="middle" font-size="6" fill="#5d4037">Siamese</text>
      </svg>`
    },
    tuxedo: {
      name: 'Tuxedo Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#424242',
      bg: '#f5f5f5',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="42" r="16" fill="#333"/>
        <path d="M25 35 Q28 25 33 32" fill="#333"/>
        <path d="M55 35 Q52 25 47 32" fill="#333"/>
        <ellipse cx="40" cy="48" rx="10" ry="8" fill="#fff"/>
        <circle cx="35" cy="39" r="3.5" fill="#ffd600"/><circle cx="36" cy="39" r="2" fill="#333"/>
        <circle cx="45" cy="39" r="3.5" fill="#ffd600"/><circle cx="46" cy="39" r="2" fill="#333"/>
        <ellipse cx="40" cy="45" rx="2" ry="1.5" fill="#ffab91"/>
        <path d="M37 48 Q40 51 43 48" fill="none" stroke="#333" stroke-width="1"/>
        <text x="40" y="72" text-anchor="middle" font-size="6" fill="#333">Tuxedo</text>
      </svg>`
    },
    persian: {
      name: 'Persian Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#e0e0e0',
      bg: '#fafafa',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="42" r="18" fill="#e0e0e0"/>
        <circle cx="40" cy="42" r="18" fill="url(#fluff)" opacity="0.3"/>
        <path d="M24 36 Q27 25 32 33" fill="#e0e0e0"/>
        <path d="M56 36 Q53 25 48 33" fill="#e0e0e0"/>
        <circle cx="35" cy="40" r="4" fill="#ff8a65"/><circle cx="36" cy="40" r="2.5" fill="#333"/>
        <circle cx="45" cy="40" r="4" fill="#ff8a65"/><circle cx="46" cy="40" r="2.5" fill="#333"/>
        <ellipse cx="40" cy="46" rx="3" ry="2" fill="#ffab91"/>
        <path d="M36 50 Q40 53 44 50" fill="none" stroke="#999" stroke-width="1"/>
        <text x="40" y="72" text-anchor="middle" font-size="6" fill="#757575">Persian</text>
      </svg>`
    },
    sphynx: {
      name: 'Sphynx Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#ffccbc',
      bg: '#fbe9e7',
      svg: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="44" r="14" fill="#ffccbc"/>
        <path d="M27 38 Q24 18 34 32" fill="#ffccbc" stroke="#ff8a65" stroke-width="1"/>
        <path d="M53 38 Q56 18 46 32" fill="#ffccbc" stroke="#ff8a65" stroke-width="1"/>
        <circle cx="35" cy="41" r="4.5" fill="#c8e6c9"/><circle cx="36" cy="41" r="2.5" fill="#2e7d32"/>
        <circle cx="45" cy="41" r="4.5" fill="#c8e6c9"/><circle cx="46" cy="41" r="2.5" fill="#2e7d32"/>
        <ellipse cx="40" cy="48" rx="2" ry="1.5" fill="#ef9a9a"/>
        <path d="M36 51 Q40 54 44 51" fill="none" stroke="#bf360c" stroke-width="1"/>
        <path d="M30 36 Q35 34 40 36 Q45 34 50 36" fill="none" stroke="#ffab91" stroke-width="0.8"/>
        <text x="40" y="72" text-anchor="middle" font-size="6" fill="#bf360c">Sphynx</text>
      </svg>`
    }
  }
};

const CARD_BACK_SVG = `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
  <rect width="80" height="100" rx="8" fill="#7e57c2"/>
  <pattern id="paws" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
    <circle cx="7" cy="5" r="2" fill="#9575cd" opacity="0.5"/>
    <circle cx="13" cy="5" r="2" fill="#9575cd" opacity="0.5"/>
    <circle cx="5" cy="9" r="2" fill="#9575cd" opacity="0.5"/>
    <circle cx="15" cy="9" r="2" fill="#9575cd" opacity="0.5"/>
    <ellipse cx="10" cy="13" rx="4" ry="3" fill="#9575cd" opacity="0.5"/>
  </pattern>
  <rect x="4" y="4" width="72" height="92" rx="6" fill="url(#paws)"/>
  <ellipse cx="40" cy="52" rx="6" ry="5" fill="#ede7f6" opacity="0.6"/>
  <circle cx="35" cy="44" r="2.5" fill="#ede7f6" opacity="0.6"/>
  <circle cx="45" cy="44" r="2.5" fill="#ede7f6" opacity="0.6"/>
  <circle cx="37" cy="40" r="2" fill="#ede7f6" opacity="0.6"/>
  <circle cx="43" cy="40" r="2" fill="#ede7f6" opacity="0.6"/>
</svg>`;

function getCardDef(card) {
  if (card.type === 'catastrophe') return CARD_DEFS.catastrophe[card.subtype];
  if (card.type === 'breed') return CARD_DEFS.breed[card.subtype];
  return CARD_DEFS[card.type];
}

function renderCard(card, opts = {}) {
  const def = getCardDef(card);
  if (!def) return '<div class="card unknown">?</div>';

  const selected = opts.selected ? 'selected' : '';
  const playable = opts.playable ? 'playable' : '';
  const small = opts.small ? 'card-small' : '';

  return `
    <div class="card ${selected} ${playable} ${small}" data-card-id="${card.id}" data-card-type="${card.type}" data-card-subtype="${card.subtype || ''}" style="--card-color: ${def.color}; --card-bg: ${def.bg}">
      <div class="card-inner">
        <div class="card-art">${def.svg}</div>
        <div class="card-name">${def.name}</div>
        <div class="card-desc">${def.desc}</div>
      </div>
    </div>
  `;
}

function renderCardBack(opts = {}) {
  const small = opts.small ? 'card-small' : '';
  return `<div class="card card-back ${small}">${CARD_BACK_SVG}</div>`;
}

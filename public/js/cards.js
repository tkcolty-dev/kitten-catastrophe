// Card definitions with cat photos
const CARD_DEFS = {
  catastrophe: {
    toilet: {
      name: 'Toilet Catastrophe',
      desc: 'Kitten fell in the toilet!',
      color: '#6ec6ff',
      bg: '#e3f2fd',
      img: 'https://images.unsplash.com/photo-1626803264630-6053d8672c23?w=200&h=200&fit=crop&crop=faces',
      label: 'SPLASH!'
    },
    vase: {
      name: 'Vase Catastrophe',
      desc: 'Kitten knocked over the vase!',
      color: '#ce93d8',
      bg: '#f3e5f5',
      img: 'https://images.unsplash.com/photo-1612812166620-a072f77ec45b?w=200&h=200&fit=crop&crop=faces',
      label: 'CRASH!'
    },
    tree: {
      name: 'Tree Catastrophe',
      desc: 'Kitten stuck in a tree!',
      color: '#81c784',
      bg: '#e8f5e9',
      img: 'https://images.unsplash.com/photo-1668398568778-6488935b6d3f?w=200&h=200&fit=crop&crop=faces',
      label: 'HELP!'
    },
    yarn: {
      name: 'Yarn Catastrophe',
      desc: 'Kitten tangled in yarn!',
      color: '#ef5350',
      bg: '#ffebee',
      img: 'https://images.unsplash.com/photo-1553707232-831b0324a714?w=200&h=200&fit=crop&crop=faces',
      label: 'TANGLE!'
    }
  },
  defuse: {
    name: 'Land on Your Feet',
    desc: 'Auto-saves you from catastrophe spaces!',
    color: '#ffd600',
    bg: '#fffde7',
    img: 'https://images.unsplash.com/photo-1489084917528-a57e68a79a1e?w=200&h=200&fit=crop&crop=faces',
    label: 'SAFE!'
  },
  catnap: {
    name: 'Catnap',
    desc: 'Skip your turn — don\'t roll the dice',
    color: '#90caf9',
    bg: '#e3f2fd',
    img: 'https://images.unsplash.com/photo-1700916536888-ca4c2ae624e8?w=200&h=200&fit=crop&crop=faces',
    label: 'Zzz...'
  },
  zoomies: {
    name: 'Zoomies',
    desc: 'Target takes 2 consecutive turns!',
    color: '#ffb74d',
    bg: '#fff3e0',
    img: 'https://images.unsplash.com/photo-1685712108226-c7f960765bbd?w=200&h=200&fit=crop&crop=faces',
    label: 'ZOOM!'
  },
  curiosity: {
    name: 'Curiosity',
    desc: 'See the next 6 spaces ahead on the board',
    color: '#a5d6a7',
    bg: '#e8f5e9',
    img: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=200&h=200&fit=crop&crop=faces',
    label: '???'
  },
  hairball: {
    name: 'Hairball',
    desc: 'Shuffle the board card deck',
    color: '#bcaaa4',
    bg: '#efebe9',
    img: 'https://images.unsplash.com/photo-1654442617616-cc101a818f3b?w=200&h=200&fit=crop&crop=faces',
    label: '*hack*'
  },
  pounce: {
    name: 'Pounce',
    desc: 'Steal a random card from another player',
    color: '#f48fb1',
    bg: '#fce4ec',
    img: 'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=200&h=200&fit=crop&crop=faces',
    label: 'YOINK!'
  },
  hiss: {
    name: 'HISS!',
    desc: 'Cancel any action card — play anytime!',
    color: '#e53935',
    bg: '#ffcdd2',
    img: 'https://images.unsplash.com/photo-1548747371-ebf9d255c6d1?w=200&h=200&fit=crop&crop=faces',
    label: 'HISS!'
  },
  breed: {
    tabby: {
      name: 'Tabby Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#ffcc80',
      bg: '#fff8e1',
      img: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=200&h=200&fit=crop&crop=faces'
    },
    siamese: {
      name: 'Siamese Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#d7ccc8',
      bg: '#efebe9',
      img: 'https://images.unsplash.com/photo-1568152950566-c1bf43f4ab28?w=200&h=200&fit=crop&crop=faces'
    },
    tuxedo: {
      name: 'Tuxedo Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#424242',
      bg: '#f5f5f5',
      img: 'https://images.unsplash.com/photo-1498100152307-ce63fd6c5424?w=200&h=200&fit=crop&crop=faces'
    },
    persian: {
      name: 'Persian Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#e0e0e0',
      bg: '#fafafa',
      img: 'https://images.unsplash.com/photo-1611554115165-738adc61a524?w=200&h=200&fit=crop&crop=faces'
    },
    sphynx: {
      name: 'Sphynx Cat',
      desc: 'Collect pairs or triples to steal!',
      color: '#ffccbc',
      bg: '#fbe9e7',
      img: 'https://images.unsplash.com/photo-1547565322-847851d7ef2f?w=200&h=200&fit=crop&crop=faces'
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
  const isCatastrophe = card.type === 'catastrophe';

  return `
    <div class="card ${selected} ${playable} ${small} ${isCatastrophe ? 'card-catastrophe' : ''}" data-card-id="${card.id}" data-card-type="${card.type}" data-card-subtype="${card.subtype || ''}" style="--card-color: ${def.color}; --card-bg: ${def.bg}">
      <div class="card-inner">
        <div class="card-photo">
          <img src="${def.img}" alt="${def.name}" loading="lazy">
          ${def.label ? `<span class="card-label">${def.label}</span>` : ''}
        </div>
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

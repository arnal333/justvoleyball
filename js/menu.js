const promos = [
  {
    brand: 'MIKASA',
    product: 'V200W-VNL',
    copy: 'Balón destacado de Mikasa para voleibol de alto nivel.',
    accent: '#8c2234'
  },
  {
    brand: 'ASICS',
    product: 'SKY ELITE FF 4',
    copy: 'Zapatilla de voleibol de la línea actual de ASICS, enfocada en apoyo, estabilidad y movimientos rápidos.',
    accent: '#1f5f8f'
  },
  {
    brand: 'MIZUNO',
    product: 'WAVE LIGHTNING NEO 3',
    copy: 'Modelo de voleibol de Mizuno con enfoque ligero, amortiguación y estabilidad.',
    accent: '#355c8a'
  }
];

const menuStatus = document.getElementById('menuStatus');
const roomInput = document.getElementById('roomCode');
const wsInput = document.getElementById('wsServer');
const startOverlay = document.getElementById('startOverlay');
const installButton = document.getElementById('installPwa');

function defaultWsUrl() {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return location.protocol === 'https:' ? 'wss://' + location.host + '/ws' : 'ws://' + location.host + '/ws';
  }
  return '';
}
wsInput.value = defaultWsUrl();

function setStatus(message) {
  if (menuStatus) menuStatus.textContent = message;
  const status = document.getElementById('netStatus');
  if (status) status.textContent = message;
}

function dispatchStart(config) {
  window.dispatchEvent(new CustomEvent('jv-menu-start', { detail: config }));
}

document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;

    if (mode === 'local-duo') {
      dispatchStart({ kind: 'local', mode: 'duo' });
      return;
    }
    if (mode === 'local-cross') {
      dispatchStart({ kind: 'local', mode: 'cross' });
      return;
    }

    const url = (wsInput.value || defaultWsUrl()).trim();
    if (!url) {
      setStatus('Poné la URL del servidor WebSocket primero.');
      return;
    }

    dispatchStart({
      kind: 'network',
      mode: mode === 'create-cross' ? 'cross' : 'duo',
      action: 'create',
      wsUrl: url
    });
  });
});

document.getElementById('joinRoom').addEventListener('click', () => {
  const code = String(roomInput.value || '').trim().toUpperCase();
  const url = (wsInput.value || defaultWsUrl()).trim();

  if (code.length !== 6) {
    setStatus('El código de sala debe tener 6 caracteres.');
    return;
  }
  if (!url) {
    setStatus('Poné la URL del servidor WebSocket primero.');
    return;
  }

  dispatchStart({
    kind: 'network',
    action: 'join',
    code,
    wsUrl: url
  });
});

roomInput.addEventListener('input', () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});

window.addEventListener('jv-room-created', e => {
  const code = e.detail?.code || '------';
  roomInput.value = code;
  setStatus('Sala creada: ' + code + ' · esperá al otro jugador.');
});

window.addEventListener('jv-room-joined', e => {
  setStatus('Entraste a la sala ' + (e.detail?.code || '') + ' · sincronizando...');
});

window.addEventListener('jv-network-error', e => {
  setStatus(e.detail?.message || 'No se pudo conectar al servidor.');
});

window.addEventListener('jv-network-status', e => {
  const state = e.detail?.state;
  const labels = {
    connecting: 'CONECTANDO...',
    open: 'SERVIDOR CONECTADO',
    closed: 'DESCONECTADO',
    error: 'ERROR DE RED'
  };
  setStatus(labels[state] || state || 'RED');
});

let promoIndex = 0;
function renderPromo(index) {
  promoIndex = (index + promos.length) % promos.length;
  const p = promos[promoIndex];
  const card = document.getElementById('promoCard');
  if (!card) return;
  card.innerHTML =
    '<div class="promo-brand" style="color:'+p.accent+'">'+p.brand+'</div>' +
    '<div class="promo-product">'+p.product+'</div>' +
    '<div class="promo-copy">'+p.copy+'</div>' +
    '<div class="promo-source">Referencia oficial · equipamiento de voleibol</div>';

  document.querySelectorAll('.promo-dot').forEach((d,i) => d.classList.toggle('active', i === promoIndex));
}
document.querySelectorAll('.promo-dot').forEach(dot => {
  dot.addEventListener('click', () => renderPromo(Number(dot.dataset.promo)));
});
renderPromo(0);
setInterval(() => {
  if (!startOverlay.classList.contains('hidden')) renderPromo(promoIndex + 1);
}, 4500);

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  installButton.style.display = 'block';
});
installButton.addEventListener('click', async () => {
  if (!deferredInstall) {
    setStatus('En iPhone/iPad: Compartir → Añadir a pantalla de inicio.');
    return;
  }
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  installButton.style.display = 'none';
});

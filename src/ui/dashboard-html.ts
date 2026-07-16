/**
 * Dashboard HTML — exporté comme string pour le serveur UI.
 * 0 dépendance externe. Vanilla HTML/CSS/JS + canvas pour le graphe.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlas — Cortex Harnais 2027</title>
<style>
:root {
  --bg: #0a0a12;
  --panel: #12121e;
  --border: #1e1e30;
  --text: #c0c0d0;
  --dim: #606078;
  --accent: #7c5cfc;
  --accent2: #5cfca0;
  --warn: #fcb55c;
  --danger: #fc5c5c;
  --claude: #7CFC00;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, monospace; font-size: 13px; overflow: hidden; height: 100vh; }
#app { display: grid; grid-template-columns: 280px 1fr 320px; grid-template-rows: 48px 1fr 180px; height: 100vh; gap: 1px; background: var(--border); }
header { grid-column: 1/-1; display: flex; align-items: center; padding: 0 16px; background: var(--panel); gap: 16px; }
header h1 { font-size: 14px; color: var(--accent); letter-spacing: 1px; }
header .status { display: flex; gap: 12px; font-size: 11px; color: var(--dim); }
header .status .mode { font-weight: bold; padding: 2px 8px; border-radius: 4px; }
.mode-awake { background: #1a2a1a; color: var(--accent2); }
.mode-idle { background: #1a1a2a; color: #6c9cff; }
.mode-sleep { background: #2a1a2a; color: #c56cff; }
.panel { background: var(--panel); overflow: auto; padding: 12px; }
.panel h2 { font-size: 11px; text-transform: uppercase; color: var(--dim); margin-bottom: 8px; letter-spacing: 1px; }
#left-panel { grid-column: 1; grid-row: 2; }
#center-panel { grid-column: 2; grid-row: 2; position: relative; }
#right-panel { grid-column: 3; grid-row: 2; }
#chat-panel { grid-column: 1/-1; grid-row: 3; }

/* Etat du cortex */
.state-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.state-item { background: #0e0e18; padding: 8px; border-radius: 6px; }
.state-item .label { font-size: 10px; color: var(--dim); text-transform: uppercase; }
.state-item .value { font-size: 16px; color: var(--text); font-weight: bold; }
.state-item .value.accent { color: var(--accent); }
.state-item .value.green { color: var(--accent2); }
.state-item .value.warn { color: var(--warn); }

/* Budget bar */
.budget-bar { height: 6px; background: #0e0e18; border-radius: 3px; overflow: hidden; margin-top: 4px; }
.budget-fill { height: 100%; background: var(--accent); transition: width 0.5s; }

/* Hypotheses */
.hypothesis { background: #0e0e18; padding: 8px; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid var(--warn); }
.hypothesis .text { font-size: 12px; }
.hypothesis .meta { font-size: 10px; color: var(--dim); margin-top: 4px; }

/* Working memory */
.wm-item { padding: 4px 8px; margin-bottom: 3px; border-radius: 4px; font-size: 11px; border-left: 2px solid var(--dim); }
.wm-item.user_input { border-color: var(--accent); }
.wm-item.model_output { border-color: var(--accent2); }
.wm-item.action { border-color: var(--warn); }
.wm-item.decision { border-color: #c56cff; }
.wm-item .type { font-size: 9px; color: var(--dim); text-transform: uppercase; }

/* Threads */
.thread { background: #0e0e18; padding: 6px; border-radius: 4px; margin-bottom: 4px; }
.thread .topic { font-size: 11px; color: var(--accent2); }
.thread .iter { font-size: 10px; color: var(--dim); }
.thread .thought { font-size: 10px; color: var(--dim); margin-top: 2px; }

/* Graphe canvas */
#graph-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
#graph-canvas:active { cursor: grabbing; }
.graph-controls { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; }
.graph-controls button { background: #0e0e18; border: 1px solid var(--border); color: var(--text); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.graph-controls button:hover { border-color: var(--accent); }
.graph-info { position: absolute; bottom: 8px; left: 8px; font-size: 10px; color: var(--dim); }

/* Chat */
#chat-panel { display: flex; flex-direction: column; }
.chat-messages { flex: 1; overflow-y: auto; padding: 8px 12px; }
.chat-msg { margin-bottom: 4px; }
.chat-msg.user { color: var(--accent); }
.chat-msg.cortex { color: var(--accent2); }
.chat-msg .author { font-size: 10px; color: var(--dim); }
.chat-input-row { display: flex; padding: 8px; gap: 8px; border-top: 1px solid var(--border); }
#chat-input { flex: 1; background: #0e0e18; border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none; }
#chat-input:focus { border-color: var(--accent); }
#chat-send { background: var(--accent); color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; }
#chat-send:hover { background: #6c4cfc; }
#chat-send:disabled { opacity: 0.5; cursor: wait; }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--dim); }
</style>
</head>
<body>
<div id="app">
  <header>
    <h1>ATLAS — CORTEX HARNAIS 2027</h1>
    <div class="status">
      <span class="mode mode-idle" id="hdr-mode">IDLE</span>
      <span id="hdr-cycles">Cycle 0</span>
      <span id="hdr-uptime">—</span>
    </div>
  </header>

  <!-- Left: Cortex state -->
  <div id="left-panel" class="panel">
    <h2>État du Cortex</h2>
    <div class="state-grid">
      <div class="state-item"><div class="label">Mode</div><div class="value accent" id="st-mode">—</div></div>
      <div class="state-item"><div class="label">Cycles</div><div class="value" id="st-cycles">0</div></div>
      <div class="state-item"><div class="label">Focus</div><div class="value" id="st-focus">aucun</div></div>
      <div class="state-item"><div class="label">Engagement</div><div class="value" id="st-engagement">0.00</div></div>
      <div class="state-item"><div class="label">Ton utilisateur</div><div class="value" id="st-tone">neutral</div></div>
      <div class="state-item"><div class="label">Self-mods</div><div class="value green" id="st-selfmods">0</div></div>
    </div>
    <h2 style="margin-top:12px">Budget cognitif</h2>
    <div class="state-item">
      <div class="label" id="st-budget-label">0 / 4096 tokens</div>
      <div class="budget-bar"><div class="budget-fill" id="st-budget-bar" style="width:0%"></div></div>
    </div>

    <h2 style="margin-top:12px">Hypothèses (<span id="st-hyp-count">0</span>)</h2>
    <div id="hypotheses"></div>
  </div>

  <!-- Center: Graph -->
  <div id="center-panel" class="panel" style="padding:0">
    <canvas id="graph-canvas"></canvas>
    <div class="graph-controls">
      <button onclick="graphZoom(1.2)">+</button>
      <button onclick="graphZoom(0.8)">−</button>
      <button onclick="graphReset()">reset</button>
    </div>
    <div class="graph-info" id="graph-info">0 nœuds, 0 arêtes</div>
  </div>

  <!-- Right: Threads + Working memory -->
  <div id="right-panel" class="panel">
    <h2>Fils de pensée (<span id="st-thread-count">0</span>)</h2>
    <div id="threads"></div>
    <h2 style="margin-top:12px">Mémoire de travail</h2>
    <div id="working-memory"></div>
  </div>

  <!-- Bottom: Chat -->
  <div id="chat-panel" class="panel">
    <div class="chat-messages" id="chat-messages">
      <div class="chat-msg"><span class="author">Système — </span>Connecté au cortex. Envoie un message pour interagir.</div>
    </div>
    <div class="chat-input-row">
      <input id="chat-input" placeholder="Message au cortex..." autocomplete="off">
      <button id="chat-send" onclick="sendChat()">Envoyer</button>
    </div>
  </div>
</div>

<script>
// --- WebSocket ---
let ws = null;
let wsConnected = false;

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);
  ws.onopen = () => { wsConnected = true; };
  ws.onclose = () => { wsConnected = false; setTimeout(connectWS, 2000); };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'state') updateState(msg.data);
      else if (msg.type === 'graph') updateGraph(msg.data);
      else if (msg.type === 'chat') addChatMessage('cortex', msg.cortex);
    } catch(e) {}
  };
}
connectWS();

// --- State update ---
function updateState(d) {
  const modeEl = document.getElementById('st-mode');
  const mode = (d && d.mode) ? d.mode : 'idle';
  modeEl.textContent = mode.toUpperCase();
  modeEl.className = 'value mode-' + mode;
  const hdrMode = document.getElementById('hdr-mode');
  hdrMode.textContent = mode.toUpperCase();
  hdrMode.className = 'mode mode-' + mode;

  document.getElementById('st-cycles').textContent = d.cycles;
  document.getElementById('hdr-cycles').textContent = 'Cycle ' + d.cycles;
  document.getElementById('st-focus').textContent = d.focus || 'aucun';
  document.getElementById('st-engagement').textContent = (d.userEngagement || 0).toFixed(2);
  document.getElementById('st-tone').textContent = d.userTone || 'neutral';
  document.getElementById('st-selfmods').textContent = d.selfModifications || 0;

  // Budget
  const pct = d.cognitiveBudget > 0 ? (d.budgetSpent / d.cognitiveBudget) * 100 : 0;
  document.getElementById('st-budget-label').textContent = (d.budgetSpent||0) + ' / ' + (d.cognitiveBudget||0) + ' tokens';
  document.getElementById('st-budget-bar').style.width = Math.min(100, pct) + '%';

  // Uptime
  if (d.lastInteraction) {
    const ago = Math.round((Date.now() - d.lastInteraction) / 1000);
    document.getElementById('hdr-uptime').textContent = 'Dernière interaction: ' + ago + 's';
  }

  // Hypotheses
  const hypDiv = document.getElementById('hypotheses');
  document.getElementById('st-hyp-count').textContent = (d.activeHypotheses||[]).length;
  if (d.activeHypotheses && d.activeHypotheses.length > 0) {
    hypDiv.innerHTML = d.activeHypotheses.map(h =>
      '<div class="hypothesis"><div class="text">' + esc(h.text) + '</div>' +
      '<div class="meta">confiance: ' + (h.confidence||0).toFixed(2) + '</div></div>'
    ).join('');
  } else {
    hypDiv.innerHTML = '<div style="color:var(--dim);font-size:11px">Aucune hypothèse active</div>';
  }

  // Threads
  const threadDiv = document.getElementById('threads');
  document.getElementById('st-thread-count').textContent = (d.backgroundThreads||[]).length;
  if (d.backgroundThreads && d.backgroundThreads.length > 0) {
    threadDiv.innerHTML = d.backgroundThreads.map(t =>
      '<div class="thread"><div class="topic">' + esc(t.topic.slice(0,60)) + '</div>' +
      '<div class="iter">iter ' + t.iterations + '/5 — prio ' + (t.priority||0.5).toFixed(1) + '</div>' +
      '<div class="thought">' + esc((t.thought||'').slice(0,80)) + '</div></div>'
    ).join('');
  } else {
    threadDiv.innerHTML = '<div style="color:var(--dim);font-size:11px">Aucun fil actif</div>';
  }

  // Working memory
  const wmDiv = document.getElementById('working-memory');
  if (d.workingMemory && d.workingMemory.length > 0) {
    wmDiv.innerHTML = d.workingMemory.slice(-15).reverse().map(wm =>
      '<div class="wm-item ' + wm.type + '"><span class="type">' + wm.type + '</span> ' +
      esc(wm.content.slice(0,100)) + '</div>'
    ).join('');
  } else {
    wmDiv.innerHTML = '<div style="color:var(--dim);font-size:11px">Mémoire vide</div>';
  }
}

// --- Graph ---
let graphNodes = [];
let graphEdges = [];
let nodePositions = new Map();
let graphScale = 1;
let graphOffsetX = 0, graphOffsetY = 0;
let dragging = false, dragNode = null;
let panning = false, panStartX = 0, panStartY = 0;

const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const parent = canvas.parentElement;
  canvas.width = parent ? parent.clientWidth : window.innerWidth;
  canvas.height = parent ? parent.clientHeight : window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 50);
setTimeout(resizeCanvas, 500); // second try after layout settles

function updateGraph(d) {
  graphNodes = d.nodes || [];
  graphEdges = d.edges || [];
  document.getElementById('graph-info').textContent =
    graphNodes.length + ' nœuds, ' + graphEdges.length + ' arêtes';
  resizeCanvas();

  const cx = canvas.width / 2, cy = canvas.height / 2;
  // Initialise les positions pour les nouveaux nœuds (en cercle serre autour du centre)
  const n = graphNodes.length;
  graphNodes.forEach((node, i) => {
    if (!nodePositions.has(node.id)) {
      const angle = (i / Math.max(1, n)) * Math.PI * 2;
      const r = Math.min(cx, cy) * 0.5;
      nodePositions.set(node.id, {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0, vy: 0,
      });
    }
  });
  // Nettoie les nœuds disparus
  const ids = new Set(graphNodes.map(nd => nd.id));
  for (const key of Array.from(nodePositions.keys())) {
    if (!ids.has(key)) nodePositions.delete(key);
  }
  drawGraph();
}

// Force-directed layout (stable, borné au canvas)
function simulate() {
  if (graphNodes.length === 0) return;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const area = canvas.width * canvas.height;
  // Répulsion douce, proportionnelle à la surface disponible
  const repulsion = Math.min(6000, area / 80);
  const k = 60; // distance idéale
  const attraction = 0.03;

  // Répulsion entre nœuds
  for (let i = 0; i < graphNodes.length; i++) {
    for (let j = i + 1; j < graphNodes.length; j++) {
      const p1 = nodePositions.get(graphNodes[i].id);
      const p2 = nodePositions.get(graphNodes[j].id);
      if (!p1 || !p2) continue;
      let dx = p1.x - p2.x, dy = p1.y - p2.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = Math.min(repulsion / (dist * dist), 40); // clamp pour éviter l'explosion
      p1.vx += (dx / dist) * force;
      p1.vy += (dy / dist) * force;
      p2.vx -= (dx / dist) * force;
      p2.vy -= (dy / dist) * force;
    }
  }

  // Attraction des arêtes
  for (const e of graphEdges) {
    const p1 = nodePositions.get(e.from);
    const p2 = nodePositions.get(e.to);
    if (!p1 || !p2) continue;
    let dx = p2.x - p1.x, dy = p2.y - p1.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = attraction * (dist - k);
    p1.vx += (dx / dist) * force;
    p1.vy += (dy / dist) * force;
    p2.vx -= (dx / dist) * force;
    p2.vy -= (dy / dist) * force;
  }

  // Centre de gravité + clamp dans le canvas
  const margin = 30;
  for (const nd of graphNodes) {
    const p = nodePositions.get(nd.id);
    if (!p) continue;
    p.vx += (cx - p.x) * 0.02;
    p.vy += (cy - p.y) * 0.02;
    p.vx *= 0.8;
    p.vy *= 0.8;
    if (!dragging || dragNode !== nd.id) {
      p.x += p.vx;
      p.y += p.vy;
    }
    // Borné au canvas (avec marge)
    p.x = Math.max(margin, Math.min(canvas.width - margin, p.x));
    p.y = Math.max(margin, Math.min(canvas.height - margin, p.y));
  }
}

const typeColors = {
  entity: '#7c5cfc',
  concept: '#5cfca0',
  episode: '#fcb55c',
  procedure: '#c56cff',
  preference: '#fc5c5c',
  hypothesis: '#5cfcfc',
  model: '#fcfc5c',
};

function drawGraph() {
  simulate();
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(graphOffsetX, graphOffsetY);
  ctx.scale(graphScale, graphScale);

  // Arêtes
  for (const e of graphEdges) {
    const p1 = nodePositions.get(e.from);
    const p2 = nodePositions.get(e.to);
    if (!p1 || !p2) continue;
    ctx.strokeStyle = 'rgba(120,120,180,' + (0.15 + e.weight * 0.3) + ')';
    ctx.lineWidth = 0.5 + e.weight * 1.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // Nœuds
  for (const n of graphNodes) {
    const p = nodePositions.get(n.id);
    if (!p) continue;
    const color = typeColors[n.type] || '#888';
    const r = 3 + n.weight * 8;

    // halo
    ctx.fillStyle = color + '30';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI*2);
    ctx.fill();

    // node
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fill();

    // label (seulement si assez gros ou zoom suffisant)
    if (r > 5 || graphScale > 1.5) {
      ctx.fillStyle = '#c0c0d0';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(n.label.slice(0, 20), p.x, p.y + r + 12);
    }
  }

  ctx.restore();
}

function graphZoom(factor) {
  graphScale *= factor;
  graphScale = Math.max(0.3, Math.min(3, graphScale));
}
function graphReset() {
  graphScale = 1; graphOffsetX = 0; graphOffsetY = 0;
}

// Animation loop
function animate() {
  if (graphNodes.length > 0) drawGraph();
  requestAnimationFrame(animate);
}
animate();

// Canvas interactions
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left - graphOffsetX) / graphScale;
  const my = (e.clientY - rect.top - graphOffsetY) / graphScale;
  for (const n of graphNodes) {
    const p = nodePositions.get(n.id);
    if (!p) continue;
    const dx = p.x - mx, dy = p.y - my;
    if (Math.sqrt(dx*dx + dy*dy) < 12) {
      dragging = true; dragNode = n.id; return;
    }
  }
  panning = true; panStartX = e.clientX - graphOffsetX; panStartY = e.clientY - graphOffsetY;
});
canvas.addEventListener('mousemove', (e) => {
  if (dragging && dragNode) {
    const rect = canvas.getBoundingClientRect();
    const p = nodePositions.get(dragNode);
    if (p) {
      p.x = (e.clientX - rect.left - graphOffsetX) / graphScale;
      p.y = (e.clientY - rect.top - graphOffsetY) / graphScale;
      p.vx = 0; p.vy = 0;
    }
  } else if (panning) {
    graphOffsetX = e.clientX - panStartX;
    graphOffsetY = e.clientY - panStartY;
  }
});
canvas.addEventListener('mouseup', () => { dragging = false; dragNode = null; panning = false; });
canvas.addEventListener('mouseleave', () => { dragging = false; dragNode = null; panning = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); graphZoom(e.deltaY < 0 ? 1.1 : 0.9); });

// --- Chat ---
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatMessage('user', msg);
  document.getElementById('chat-send').disabled = true;

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.response) addChatMessage('cortex', data.response);
    else if (data.error) addChatMessage('cortex', 'Erreur: ' + data.error);
    document.getElementById('chat-send').disabled = false;
  })
  .catch(err => {
    addChatMessage('cortex', 'Erreur de connexion: ' + err.message);
    document.getElementById('chat-send').disabled = false;
  });
}

function addChatMessage(author, text) {
  const div = document.createElement('div');
  div.className = 'chat-msg ' + author;
  div.innerHTML = '<span class="author">' + (author === 'user' ? 'Toi — ' : 'Cortex — ') + '</span>' + esc(text.slice(0,500));
  document.getElementById('chat-messages').appendChild(div);
  document.getElementById('chat-messages').scrollTop = 999999;
}

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// --- Utils ---
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Poll API (toujours actif, complement le WS) ---
function pollNow() {
  fetch('/api/state').then(r => r.json()).then(d => updateState(d.data || d)).catch(()=>{});
  fetch('/api/graph').then(r => r.json()).then(d => updateGraph(d.data || d)).catch(()=>{});
}
// Fetch initial immediat (n'attend pas le WS)
pollNow();
setInterval(pollNow, 3000);
</script>
</body>
</html>`;
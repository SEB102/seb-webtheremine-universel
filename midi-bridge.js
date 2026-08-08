#!/usr/bin/env node
/**
 * Theremine-GarageBand — Pont MIDI réseau
 *
 * Permet de jouer depuis un iPad, un téléphone ou un PC : l'appareil ouvre la
 * page dans son navigateur, suit la main avec sa caméra, et envoie les notes
 * par le réseau. Ce pont les reçoit et les écrit sur un port MIDI virtuel que
 * GarageBand, Live, Logic ou Max voient comme un clavier branché.
 *
 * C'est la seule façon de jouer depuis un iPad sans passer par Xcode : aucun
 * navigateur iOS ne sait produire du MIDI, mais tous savent parler WebSocket.
 *
 *   iPad (navigateur) ──WiFi──> ce pont ──> port MIDI « Theremine-GarageBand »
 *
 * POURQUOI CE PONT SERT AUSSI LA PAGE
 * Un navigateur refuse une connexion ws:// non chiffrée depuis une page
 * chargée en https://. Si l'iPad ouvrait la page depuis GitHub, la connexion
 * serait donc bloquée. En servant la page lui-même, tout reste sur la même
 * adresse en http:// et le navigateur laisse passer.
 *
 * PLUSIEURS JOUEURS
 * Chaque appareil connecté reçoit son propre canal MIDI (1, 2, 3…), ce qui
 * permet de donner un instrument différent à chacun dans le logiciel audio.
 *
 * Usage :  node midi-bridge.js [port]      (port par défaut : 8080)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { WebSocketServer } = require('ws');

let midi;
try {
  midi = require('@julusian/midi');
} catch (_) {
  console.error("\n  ERREUR : les modules ne sont pas installés.");
  console.error("  Ouvrez ce dossier dans le Terminal et tapez :  npm install\n");
  process.exit(1);
}

const PORT   = parseInt(process.argv[2]) || 8080;
const RACINE = __dirname;
const NOM_PORT_MIDI = 'Theremine-GarageBand';

// ── Port MIDI virtuel ────────────────────────────────────────────────────────
// openVirtualPort crée une source visible par tout logiciel MIDI du Mac.
// Aucun pilote IAC à activer : le port existe tant que ce pont tourne.
const sortie = new midi.Output();
try {
  sortie.openVirtualPort(NOM_PORT_MIDI);
} catch (e) {
  console.error(`\n  ERREUR : impossible de créer le port MIDI (${e.message})\n`);
  process.exit(1);
}

// ── Serveur HTTP : sert la page aux appareils du réseau ─────────────────────
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.mjs' : 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png' : 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream'
};

const serveur = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split('?')[0]); }
  catch (_) { res.writeHead(400); return res.end('400'); }
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';

  const cible = path.join(RACINE, rel);
  if (cible !== RACINE && !cible.startsWith(RACINE + path.sep)) {
    res.writeHead(403); return res.end('403');
  }
  fs.readFile(cible, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(cible).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  });
});

// ── WebSocket sur le même port : reçoit les notes ───────────────────────────
const wss = new WebSocketServer({ server: serveur });

const notesEnCours = new Map(); // client -> Set des notes actives, pour tout couper proprement

// On attribue le plus petit canal libre, et non un compteur qui monte : sinon
// le troisième joueur d'une séance un peu longue se retrouverait sur le canal 9
// alors que les canaux 1 et 2 viennent de se libérer.
function canalLibre() {
  const pris = new Set([...wss.clients].map(c => c.canal).filter(c => c !== undefined));
  for (let i = 0; i < 16; i++) if (!pris.has(i)) return i;
  return 0;
}

function toutCouper(client) {
  const notes = notesEnCours.get(client);
  if (!notes) return;
  const canal = client.canal ?? 0;
  for (const note of notes) sortie.sendMessage([0x80 | canal, note, 0]);
  sortie.sendMessage([0xB0 | canal, 123, 0]); // All Notes Off
  notes.clear();
}

wss.on('connection', (client, req) => {
  client.canal = canalLibre();
  notesEnCours.set(client, new Set());

  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  console.log(`  ➜ Appareil connecté : ${ip}  →  canal MIDI ${client.canal + 1}`);

  client.on('message', brut => {
    let msg;
    try { msg = JSON.parse(brut); } catch (_) { return; }
    if (msg.protocol !== 'seb-midi-bridge-v1') return;

    if (msg.type === 'hello') {
      console.log(`     « ${msg.name || 'appareil'} » prêt`);
      return;
    }
    if (msg.type !== 'midi' || !Array.isArray(msg.data) || msg.data.length < 3) return;

    // Le canal envoyé par la page est ignoré : c'est le pont qui l'attribue,
    // pour que deux appareils ne se retrouvent pas sur le même instrument.
    const [statut, d1, d2] = msg.data;
    const type = statut & 0xF0;
    const octets = [type | client.canal, d1 & 0x7F, d2 & 0x7F];

    const notes = notesEnCours.get(client);
    if (type === 0x90 && d2 > 0) notes.add(d1 & 0x7F);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) notes.delete(d1 & 0x7F);

    try { sortie.sendMessage(octets); } catch (_) {}
  });

  client.on('close', () => {
    toutCouper(client);            // sinon une note resterait bloquée
    notesEnCours.delete(client);
    console.log(`  ✕ Appareil déconnecté : ${ip}`);
  });
});

// ── Adresses à saisir sur l'iPad ────────────────────────────────────────────
function adressesReseau() {
  const out = [];
  for (const cartes of Object.values(os.networkInterfaces())) {
    for (const c of cartes || []) {
      if (c.family === 'IPv4' && !c.internal) out.push(c.address);
    }
  }
  return out;
}

serveur.listen(PORT, () => {
  const adresses = adressesReseau();
  console.log('');
  console.log('  ══════════════════════════════════════════════════');
  console.log('   Theremine-GarageBand — Pont MIDI réseau');
  console.log('  ══════════════════════════════════════════════════');
  console.log('');
  console.log(`   Port MIDI créé : « ${NOM_PORT_MIDI} »`);
  console.log('   Choisissez-le comme entrée dans GarageBand, Live, Max…');
  console.log('');
  if (adresses.length === 0) {
    console.log('   Aucun réseau détecté : connectez ce Mac au WiFi.');
  } else {
    console.log('   SUR L\'IPAD — ouvrez cette adresse dans Safari :');
    for (const a of adresses) console.log(`      http://${a}:${PORT}`);
    console.log('');
    console.log('   Puis dans la page : Transport MIDI → « Pont MIDI réseau »,');
    console.log('   saisissez la MÊME adresse en remplaçant http par ws :');
    for (const a of adresses) console.log(`      ws://${a}:${PORT}`);
  }
  console.log('');
  console.log('   Les deux appareils doivent être sur le même WiFi.');
  console.log('   Fermez cette fenêtre pour arrêter le pont.');
  console.log('  ══════════════════════════════════════════════════');
  console.log('');
});

serveur.on('error', err => {
  console.error(err.code === 'EADDRINUSE'
    ? `\n  ERREUR : le port ${PORT} est déjà utilisé.\n  Relancez avec un autre port :  node midi-bridge.js 8081\n`
    : `\n  ERREUR : ${err.message}\n`);
  process.exit(1);
});

// ── Arrêt propre : ne jamais laisser une note bloquée ────────────────────────
function arret() {
  console.log('\n  Arrêt du pont…');
  for (const client of wss.clients) toutCouper(client);
  try { sortie.closePort(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', arret);
process.on('SIGTERM', arret);

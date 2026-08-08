#!/bin/bash
# Theremine-GarageBand — démarre le pont MIDI réseau.
# À lancer sur le Mac AVANT d'ouvrir la page sur l'iPad.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  ERREUR : Node.js n'est pas installé."
  echo "  Téléchargez-le sur https://nodejs.org (version LTS), puis relancez."
  echo
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer…"
  exit 1
fi

if [ ! -d "node_modules/@julusian/midi" ]; then
  echo "  Première utilisation : installation des modules…"
  echo "  (une minute environ, connexion Internet nécessaire)"
  if ! npm install --silent; then
    echo
    echo "  ERREUR : l'installation a échoué."
    read -n 1 -s -r -p "  Appuyez sur une touche pour fermer…"
    exit 1
  fi
fi

# Le pont tourne au premier plan : fermer cette fenêtre arrête tout,
# et libère le port MIDI proprement.
node midi-bridge.js 8080

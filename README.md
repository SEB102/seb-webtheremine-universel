# SEB WebTheremine Universel

Version indépendante de SEB WebTheremine avec trois modes de sortie :

- audio local ;
- Web MIDI direct sur les navigateurs compatibles ;
- pont MIDI réseau par WebSocket pour iPad et les navigateurs sans Web MIDI.

## Protocole du pont réseau

La page se connecte à une adresse `ws://` ou `wss://` fournie par l'utilisateur.
Elle envoie ensuite des messages JSON :

```json
{
  "protocol": "seb-midi-bridge-v1",
  "type": "midi",
  "data": [144, 60, 100],
  "timestamp": 1234.5
}
```

`data` contient les trois octets MIDI. La vélocité initiale est portée par
Note On et les variations continues par le contrôleur MIDI CC11.

# Theremine-GarageBand

Deux façons d'envoyer du MIDI à GarageBand avec les mains ou le visage.
Elles vivent côte à côte dans ce dossier et ne se gênent pas.

| Plateforme | Quoi utiliser |
|---|---|
| Mac | l'une ou l'autre |
| iPad | l'application seulement |
| PC | la page web seulement (GarageBand n'existe pas sous Windows) |

---

## 1. La page web — `index.html`

Un seul fichier. Il s'ouvre dans **Chrome ou Edge** (pas Safari, qui n'a pas
Web MIDI), suit une main par la caméra et envoie du MIDI. Aucun son n'est
produit : c'est un contrôleur, l'instrument est dans GarageBand.

Pour que GarageBand reçoive quelque chose, il faut un port MIDI virtuel :

- **Mac** — Configuration audio et MIDI → Fenêtre → Afficher le studio MIDI →
  double-clic sur **Pilote IAC** → cocher « Le périphérique est en ligne ».
  Choisir ensuite `IAC Driver Bus 1` dans « Port MIDI ».
- **PC** — installer un port virtuel type loopMIDI, puis le choisir de même.

Cette page est aussi publiée en ligne :
<https://seb102.github.io/seb-webtheremine-universel/>
Le dossier est le dépôt de cette publication — d'où le `.git` et le `.nojekyll`.

Un second transport, « Pont MIDI réseau », existe dans l'interface mais **n'a
pas de serveur** : rien n'implémente le protocole `seb-midi-bridge-v1` décrit
plus bas. Il ne fait donc rien pour l'instant.

## 2. L'application Mac et iPad — `project.yml`, `Sources/`, `Resources/`

C'est **la seule façon d'envoyer du MIDI depuis un iPad** : aucun navigateur
iOS ne supporte Web MIDI, et Apple impose son moteur à tous. L'application
contourne le mur en publiant une vraie source CoreMIDI nommée
**Theremine-GarageBand**, que GarageBand voit directement.

Elle réunit cinq modes — Mains, Mains Duo, Visage, Visage Duo, Continu —
affichés dans une vue web servie depuis `127.0.0.1`. **Aucune connexion
Internet n'est utilisée** : tous les fichiers MediaPipe sont dans `Resources/`.

Données envoyées : Note On/Off, vélocité et CC11 (expression) ; Pitch Bend
±2 demi-tons en mode Continu ; canaux 1 et 2 en Duo. Le bouton **Stop MIDI**
envoie Note Off, All Notes Off et recentre le Pitch Bend.

### Compiler

```sh
xcodegen generate
xcodebuild -project Theremine-GarageBand.xcodeproj -scheme TheremineGarageBand-macOS \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Pour l'iPad : ouvrir `Theremine-GarageBand.xcodeproj`, choisir l'équipe de signature
dans la cible `TheremineGarageBand-iOS`, puis lancer sur l'appareil. Cela suppose que
la **plateforme iOS soit installée** dans Xcode (Réglages → Composants).

### Utilisation avec GarageBand

1. Lancer Theremine-GarageBand et démarrer la caméra dans le mode voulu.
2. Dans GarageBand, sélectionner une piste d'instrument logiciel.
3. Jouer : GarageBand reçoit les événements en direct.

---

## Le réglage « Départ » et « Latence »

Présent dans la page web et dans les quatre modes à notes de l'application.
Une zone ne sonne que si l'on y reste un certain temps, et ce temps diffère
selon la situation :

- **Départ** (0–150 ms, défaut 60) — quand *rien* ne sonne. On vient du
  silence, il n'y a aucune note à traverser : l'attaque doit être franche.
- **Latence** (200–400 ms, défaut 300) — quand *une note sonne déjà*. C'est ce
  délai qui supprime les notes de passage : do → mi ne fait plus sonner le ré
  intermédiaire, et le do continue pendant la traversée.

Main baissée sous le seuil compte comme du silence : « baisser, glisser,
remonter » repasse donc par le délai court.

Le mode Continu n'a pas ce réglage : sa hauteur est continue, il n'y a pas de
note de passage possible.

---

## Protocole du pont réseau (non implémenté)

La page se connecte à une adresse `ws://` ou `wss://` et envoie :

```json
{
  "protocol": "seb-midi-bridge-v1",
  "type": "midi",
  "data": [144, 60, 100],
  "timestamp": 1234.5
}
```

`data` contient les trois octets MIDI. La vélocité initiale est portée par
Note On, les variations continues par CC11.

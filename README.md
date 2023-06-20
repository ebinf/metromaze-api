# Metro Maze

## MQTT topics

- `game/<game>/settings` (Retained)
- `game/<game>/broadcast`
- `game/<game>/emergency`
- `game/<game>/searched_broadcast`
- `game/<game>/redeem_joker`
- `game/<game>/chat/all`
- `game/<game>/chat/searching`
- `game/<game>/chat/device/<device>`
- `game/<game>/devices/<device>/info` (Retained)
- `game/<game>/devices/<device>/location`

## HTTP requests

- `GET /api/v1/games/create`
- `GET /api/v1/games/<code>/join`
- `POST /api/v1/games/<code>/start`
- `GET /api/v1/infrastructure/<provider>`

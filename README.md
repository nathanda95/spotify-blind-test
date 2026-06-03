# CRUD React TypeScript + Express

Petit CRUD basic avec un front React + TypeScript et une API Node.js + Express.

## Installation

```bash
npm install
```

## Base PostgreSQL

Le serveur lit la connexion dans `.env`.

```env
PORT=3001
APP_PORT=3001
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=spotify_blind_test
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/spotify_blind_test
DATABASE_URL_DOCKER=postgresql://postgres:postgres@db:5432/spotify_blind_test
```

Tu dois creer une base PostgreSQL, puis la table `todos`.

```sql
CREATE DATABASE spotify_blind_test;
```

Connecte-toi ensuite a cette base et lance:

```sql
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Le meme script est disponible dans `db/schema.sql`.

## Lancer le projet

```bash
npm run dev
```

Le front tourne sur `http://localhost:5173`.
L'API tourne sur `http://localhost:3001`.

## Lancer avec Docker

Docker lance l'app Node/Express et une base PostgreSQL. Le front React est build puis servi par Express.
Les ports, identifiants Postgres et URLs de connexion sont lus depuis `.env`.

```bash
docker compose up --build
```

L'application est disponible sur `http://localhost:3001`.

La base PostgreSQL est creee automatiquement avec:

- base: `spotify_blind_test`
- user: `postgres`
- password: `postgres`
- port local: `5432`

Au premier demarrage, Docker execute automatiquement `db/schema.sql` pour creer la table `todos`.

Pour arreter:

```bash
docker compose down
```

Pour supprimer aussi les donnees PostgreSQL Docker:

```bash
docker compose down -v
```

## Routes API

- `GET /api/todos`
- `GET /api/todos/:id`
- `POST /api/todos`
- `PUT /api/todos/:id`
- `DELETE /api/todos/:id`

Les donnees sont stockees dans PostgreSQL. 

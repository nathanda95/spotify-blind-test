import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = process.env.PORT ?? 3001;
const databaseUrl = process.env.DATABASE_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../dist');

if (!databaseUrl) {
  throw new Error('DATABASE_URL est manquant dans le fichier .env.');
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
});

app.use(cors());
app.use(express.json());
app.use(express.static(clientDistPath));

function mapTodo(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    done: row.done,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function handleServerError(error, response) {
  console.error(error);
  response.status(500).json({ message: 'Erreur serveur.' });
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/todos', async (_request, response) => {
  try {
    const result = await pool.query(
      'SELECT id, title, description, done, created_at, updated_at FROM todos ORDER BY id DESC',
    );
    response.json(result.rows.map(mapTodo));
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/todos/:id', async (request, response) => {
  try {
    const result = await pool.query(
      'SELECT id, title, description, done, created_at, updated_at FROM todos WHERE id = $1',
      [Number(request.params.id)],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Todo introuvable.' });
    }

    return response.json(mapTodo(result.rows[0]));
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.post('/api/todos', async (request, response) => {
  const { title, description = '' } = request.body;

  if (!title || typeof title !== 'string') {
    return response.status(400).json({ message: 'Le titre est obligatoire.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO todos (title, description)
       VALUES ($1, $2)
       RETURNING id, title, description, done, created_at, updated_at`,
      [title.trim(), String(description).trim()],
    );

    return response.status(201).json(mapTodo(result.rows[0]));
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.put('/api/todos/:id', async (request, response) => {
  const id = Number(request.params.id);
  const { title, description = '', done = false } = request.body;

  if (!title || typeof title !== 'string') {
    return response.status(400).json({ message: 'Le titre est obligatoire.' });
  }

  try {
    const result = await pool.query(
      `UPDATE todos
       SET title = $1, description = $2, done = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, title, description, done, created_at, updated_at`,
      [title.trim(), String(description).trim(), Boolean(done), id],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Todo introuvable.' });
    }

    return response.json(mapTodo(result.rows[0]));
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.delete('/api/todos/:id', async (request, response) => {
  const id = Number(request.params.id);

  try {
    const result = await pool.query('DELETE FROM todos WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Todo introuvable.' });
    }

    return response.status(204).send();
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.use((_request, response) => {
  response.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`API CRUD lancee sur http://localhost:${port}`);
});

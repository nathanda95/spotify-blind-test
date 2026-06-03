import { FormEvent, useEffect, useMemo, useState } from 'react';

type Todo = {
  id: number;
  title: string;
  description: string;
  done: boolean;
};

const API_URL = import.meta.env.VITE_API_URL ?? '/api/todos';

const emptyForm = {
  title: '',
  description: '',
};

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const editingTodo = useMemo(
    () => todos.find((todo) => todo.id === editingId),
    [editingId, todos],
  );

  async function loadTodos() {
    setError('');
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error('Impossible de charger les todos.');
      }
      const data = (await response.json()) as Todo[];
      setTodos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTodos();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${API_URL}/${editingId}` : API_URL;

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? 'Action impossible.');
      }

      await loadTodos();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }

  async function toggleDone(todo: Todo) {
    setError('');
    try {
      const response = await fetch(`${API_URL}/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...todo, done: !todo.done }),
      });

      if (!response.ok) {
        throw new Error('Impossible de modifier le statut.');
      }

      await loadTodos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }

  async function deleteTodo(id: number) {
    setError('');
    try {
      const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Impossible de supprimer la todo.');
      }

      await loadTodos();
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setForm({
      title: todo.title,
      description: todo.description,
    });
  }

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">React TypeScript + Express</p>
          <h1>CRUD basic</h1>
        </div>
        <span className="counter">{todos.length} todos</span>
      </section>

      <section className="layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <h2>{editingTodo ? 'Modifier une todo' : 'Ajouter une todo'}</h2>

          <label>
            Titre
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ex: Préparer le blind test"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Quelques détails utiles..."
              rows={4}
            />
          </label>

          <div className="actions">
            <button type="submit">{editingTodo ? 'Enregistrer' : 'Créer'}</button>
            {editingTodo && (
              <button className="secondary" type="button" onClick={resetForm}>
                Annuler
              </button>
            )}
          </div>
        </form>

        <section className="panel list-panel">
          <h2>Todos</h2>

          {error && <p className="error">{error}</p>}
          {isLoading && <p className="muted">Chargement...</p>}

          {!isLoading && todos.length === 0 && (
            <p className="muted">Aucune todo pour le moment.</p>
          )}

          <div className="todo-list">
            {todos.map((todo) => (
              <article className={todo.done ? 'todo done' : 'todo'} key={todo.id}>
                <div>
                  <h3>{todo.title}</h3>
                  <p>{todo.description || 'Pas de description.'}</p>
                </div>

                <div className="todo-actions">
                  <button className="secondary" type="button" onClick={() => toggleDone(todo)}>
                    {todo.done ? 'À faire' : 'Terminer'}
                  </button>
                  <button className="secondary" type="button" onClick={() => startEdit(todo)}>
                    Modifier
                  </button>
                  <button className="danger" type="button" onClick={() => void deleteTodo(todo.id)}>
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;

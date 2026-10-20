'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { moduleApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STOCK_MOVEMENT_TYPES } from '@/lib/constants';
import { dateTime, money, qty } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useLoad } from '@/lib/useLoad';
import Modal from '@/components/Modal';

const EMPTY_PRODUCT = { code: '', name: '', category: '', unit: 'unidad', cost: '', price: '', stock: '', min_stock: '' };

export default function StockPage() {
  const { module } = useParams();
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // producto (o EMPTY_PRODUCT para alta)
  const [moving, setMoving] = useState(null); // producto al que se le registra un movimiento

  const debouncedSearch = useDebounced(search.trim());

  const query = new URLSearchParams({
    ...(debouncedSearch && { q: debouncedSearch }),
    ...(onlyLow && { low: '1' }),
    ...(showInactive && { all: '1' }),
  }).toString();
  const products = useLoad(() => moduleApi(module, `/products?${query}`), [module, query]);
  const movements = useLoad(() => moduleApi(module, '/products/movements?limit=30'), [module]);

  const refresh = () => {
    products.reload();
    movements.reload();
  };

  async function toggleActive(p) {
    if (p.active && !confirm(`¿Desactivar "${p.name}"? Dejará de aparecer en ventas.`)) return;
    try {
      await moduleApi(module, `/products/${p.id}`, { method: 'PUT', body: { active: !p.active } });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Stock</h1>
        {isAdmin && (
          <button className="btn primary" onClick={() => setEditing(EMPTY_PRODUCT)}>
            + Nuevo producto
          </button>
        )}
      </header>

      <section className="card">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Buscar por nombre, código o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Solo stock bajo
          </label>
          {isAdmin && (
            <label className="check">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{' '}
              Ver inactivos
            </label>
          )}
        </div>

        {products.error && <div className="alert error">{products.error.message}</div>}
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Categoría</th>
              {isAdmin && <th className="num">Costo</th>}
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              <th className="num">Mínimo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(products.data ?? []).map((p) => (
              <tr key={p.id} className={p.active ? '' : 'struck'}>
                <td className="muted">{p.code}</td>
                <td>
                  {p.name} {p.unit === 'kg' && <span className="badge">kg</span>}
                </td>
                <td className="muted">{p.category}</td>
                {isAdmin && <td className="num">{money(p.cost)}</td>}
                <td className="num">{money(p.price)}</td>
                <td className={`num ${p.stock <= p.min_stock ? 'danger strong' : ''}`}>{qty(p.stock, p.unit)}</td>
                <td className="num muted">{qty(p.min_stock, p.unit)}</td>
                <td className="actions">
                  {p.active ? (
                    <button className="btn outline small" onClick={() => setMoving(p)}>
                      Movimiento
                    </button>
                  ) : null}
                  {isAdmin && (
                    <>
                      <button className="btn ghost small" onClick={() => setEditing(p)}>
                        Editar
                      </button>
                      <button className="btn ghost small" onClick={() => toggleActive(p)}>
                        {p.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.data?.length === 0 && <p className="muted">No hay productos.</p>}
      </section>

      <section className="card">
        <h2>Últimos movimientos</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th className="num">Cantidad</th>
              <th className="num">Stock resultante</th>
              <th>Usuario</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {(movements.data ?? []).map((m) => (
              <tr key={m.id}>
                <td>{dateTime(m.created_at)}</td>
                <td>{m.product_name}</td>
                <td>{STOCK_MOVEMENT_TYPES[m.type]}</td>
                <td className={`num ${m.qty < 0 ? 'danger' : 'ok'}`}>
                  {m.qty > 0 ? '+' : ''}
                  {qty(m.qty, m.unit)}
                </td>
                <td className="num">{qty(m.stock_after, m.unit)}</td>
                <td>{m.user_name}</td>
                <td className="muted">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && (
        <ProductForm
          module={module}
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {moving && (
        <StockMovementForm
          module={module}
          product={moving}
          isAdmin={isAdmin}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function ProductForm({ module, product, onClose, onSaved }) {
  const isNew = !product.id;
  const [form, setForm] = useState({ ...product, code: product.code ?? '', category: product.category ?? '' });
  const [error, setError] = useState('');
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { stock, ...rest } = form;
      await moduleApi(module, isNew ? '/products' : `/products/${product.id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: isNew ? form : rest,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={isNew ? 'Nuevo producto' : `Editar: ${product.name}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Nombre
          <input value={form.name} onChange={set('name')} required autoFocus />
        </label>
        <label>
          Código
          <input value={form.code} onChange={set('code')} />
        </label>
        <label>
          Categoría
          <input value={form.category} onChange={set('category')} />
        </label>
        <label>
          Unidad de venta
          <select value={form.unit} onChange={set('unit')}>
            <option value="unidad">Por unidad</option>
            <option value="kg">Por kilo (kg)</option>
          </select>
        </label>
        <label>
          Stock mínimo
          <input type="number" step="any" min="0" value={form.min_stock} onChange={set('min_stock')} />
        </label>
        <label>
          Costo
          <input type="number" step="0.01" min="0" value={form.cost} onChange={set('cost')} />
        </label>
        <label>
          Precio de venta {form.unit === 'kg' && '(por kg)'}
          <input type="number" step="0.01" min="0" value={form.price} onChange={set('price')} required />
        </label>
        {isNew && (
          <label>
            Stock inicial
            <input type="number" step="any" min="0" value={form.stock} onChange={set('stock')} />
          </label>
        )}
        {error && <div className="alert error span-2">{error}</div>}
        <div className="span-2 form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function StockMovementForm({ module, product, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState({ type: 'ingreso', qty: '', note: '' });
  const [error, setError] = useState('');
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const unitLabel = product.unit === 'kg' ? 'kg' : 'unidades';

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await moduleApi(module, `/products/${product.id}/stock`, { method: 'POST', body: form });
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={`Movimiento de stock: ${product.name}`} onClose={onClose}>
      <p className="muted">Stock actual: {qty(product.stock, product.unit)}</p>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Tipo
          <select value={form.type} onChange={set('type')}>
            <option value="ingreso">Ingreso de mercadería</option>
            <option value="egreso">Egreso (merma, vencimiento, rotura)</option>
            {isAdmin && <option value="ajuste">Ajuste por recuento (fija el stock)</option>}
          </select>
        </label>
        <label className="span-2">
          {form.type === 'ajuste' ? `Stock contado (${unitLabel})` : `Cantidad (${unitLabel})`}
          <input
            type="number"
            step={product.unit === 'kg' ? '0.001' : '1'}
            min="0"
            value={form.qty}
            onChange={set('qty')}
            required
            autoFocus
          />
        </label>
        <label className="span-2">
          {form.type === 'ingreso' ? 'Nota (proveedor, remito…)' : 'Motivo'}
          <input value={form.note} onChange={set('note')} required={form.type !== 'ingreso'} />
        </label>
        {error && <div className="alert error span-2">{error}</div>}
        <div className="span-2 form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary">Registrar</button>
        </div>
      </form>
    </Modal>
  );
}

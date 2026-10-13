'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { moduleApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PAYMENT_METHODS } from '@/lib/constants';
import { money, qty, time } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import Modal from '@/components/Modal';
import SalesTable from '@/components/SalesTable';

export default function VentasPage() {
  const { module } = useParams();
  const { user } = useAuth();
  const products = useLoad(() => moduleApi(module, '/products'), [module]);
  const cash = useLoad(() => moduleApi(module, '/cash/current'), [module]);
  const sales = useLoad(() => moduleApi(module, '/sales'), [module]);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ product, qty: string }]
  const [payment, setPayment] = useState('efectivo');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
    );
  }, [products.data, search]);

  const lines = cart.map((l) => {
    const n = Number(l.qty.replace(',', '.'));
    return { ...l, n, subtotal: Number.isFinite(n) ? n * l.product.price : 0 };
  });
  const total = lines.reduce((acc, l) => acc + l.subtotal, 0);

  function addToCart(product) {
    setMessage(null);
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id);
      if (existing) {
        return c.map((l) => (l === existing ? { ...l, qty: String(Number(l.qty.replace(',', '.')) + 1) } : l));
      }
      return [...c, { product, qty: '1' }];
    });
  }

  const updateQty = (id, value) => setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: value } : l)));
  const removeLine = (id) => setCart((c) => c.filter((l) => l.product.id !== id));

  async function checkout() {
    setBusy(true);
    setMessage(null);
    try {
      const sale = await moduleApi(module, '/sales', {
        method: 'POST',
        body: { payment_method: payment, items: lines.map((l) => ({ product_id: l.product.id, qty: l.n })) },
      });
      setCart([]);
      setMessage({ type: 'ok', text: `Venta #${sale.id} registrada por ${money(sale.total)}` });
      products.reload();
      sales.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function cancelSale(sale) {
    if (!confirm(`¿Anular la venta #${sale.id} por ${money(sale.total)}? Se repondrá el stock.`)) return;
    try {
      await moduleApi(module, `/sales/${sale.id}/cancel`, { method: 'POST' });
      setDetail(null);
      sales.reload();
      products.reload();
    } catch (err) {
      alert(err.message);
    }
  }

  const cashClosed = cash.data === null && !cash.loading;
  const invalid = lines.some((l) => !(l.n > 0) || (l.product.unit === 'unidad' && !Number.isInteger(l.n)));

  return (
    <>
      <header className="page-header">
        <h1>Ventas</h1>
      </header>

      {cashClosed && (
        <div className="alert warn">
          La caja está cerrada. <Link href={`/${module}/caja`}>Abrí la caja</Link> para poder vender.
        </div>
      )}

      <section className="pos">
        <div className="card">
          <input
            className="search"
            placeholder="Buscar por nombre o código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="product-grid">
            {filtered.map((p) => (
              <button
                key={p.id}
                className="product-tile"
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0 || cashClosed}
              >
                <span className="name">{p.name}</span>
                <span className="price">
                  {money(p.price)}
                  {p.unit === 'kg' ? ' /kg' : ''}
                </span>
                <span className={`small ${p.stock <= p.min_stock ? 'danger' : 'muted'}`}>
                  Stock: {qty(p.stock, p.unit)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="muted">Sin resultados.</p>}
          </div>
        </div>

        <div className="card cart">
          <h2>Ticket</h2>
          {lines.length === 0 ? (
            <p className="muted">Seleccioná productos para agregarlos.</p>
          ) : (
            <table>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.product.id}>
                    <td>
                      {l.product.name}
                      <div className="small muted">{money(l.product.price)}</div>
                    </td>
                    <td>
                      <input
                        className="qty-input"
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) => updateQty(l.product.id, e.target.value)}
                      />
                      <span className="small muted"> {l.product.unit === 'kg' ? 'kg' : 'u.'}</span>
                    </td>
                    <td className="num">{money(l.subtotal)}</td>
                    <td>
                      <button className="btn ghost small" onClick={() => removeLine(l.product.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>

          <div className="payment-methods">
            {Object.entries(PAYMENT_METHODS).map(([key, label]) => (
              <button
                key={key}
                className={`btn ${payment === key ? 'primary' : 'outline'} small`}
                onClick={() => setPayment(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {message && <div className={`alert ${message.type}`}>{message.text}</div>}

          <button
            className="btn primary block lg"
            disabled={busy || lines.length === 0 || invalid || cashClosed}
            onClick={checkout}
          >
            {busy ? 'Procesando…' : `Cobrar ${money(total)}`}
          </button>
          {invalid && <p className="small danger">Revisá las cantidades (los productos por unidad van enteros).</p>}
        </div>
      </section>

      <section className="card">
        <h2>Ventas de hoy</h2>
        <SalesTable sales={sales.data ?? []} onSelect={async (s) => setDetail(await moduleApi(module, `/sales/${s.id}`))} />
      </section>

      {detail && (
        <Modal title={`Venta #${detail.id}`} onClose={() => setDetail(null)}>
          <p className="muted">
            {time(detail.created_at)} · {detail.user_name} · {PAYMENT_METHODS[detail.payment_method]}
            {detail.status === 'anulada' && <span className="badge danger"> Anulada por {detail.cancelled_by_name}</span>}
          </p>
          <table>
            <tbody>
              {detail.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.product_name}</td>
                  <td className="num">{qty(i.qty, i.unit)}</td>
                  <td className="num">{money(i.unit_price)}</td>
                  <td className="num">{money(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cart-total">
            <span>Total</span>
            <strong>{money(detail.total)}</strong>
          </div>
          {user.role === 'admin' && detail.status === 'completada' && (
            <button className="btn danger" onClick={() => cancelSale(detail)}>
              Anular venta
            </button>
          )}
        </Modal>
      )}
    </>
  );
}

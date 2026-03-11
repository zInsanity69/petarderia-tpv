import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  getProductos, upsertProducto, toggleProducto, deleteProducto,
  getOfertas, upsertOferta, deleteOferta,
  getPerfiles, updatePerfil, crearUsuario,
  getCasetas, upsertCaseta, deleteCaseta,
  getStatsAdmin, getTicketsAdmin,
  setStock, getStockCaseta,
  getVentasPorDia,
} from '../lib/api.js'
import { fmt } from '../lib/precios.js'

const TABS = [
  ['dashboard', '📊 Dashboard'],
  ['ventas',    '💰 Ventas'],
  ['tickets',   '🧾 Tickets'],
  ['productos', '📦 Productos'],
  ['stock',     '📋 Stock'],
  ['ofertas',   '🏷️ Ofertas'],
  ['casetas',   '🏪 Casetas'],
  ['usuarios',  '👥 Usuarios'],
]

function Toast({ msg, type }) {
  return <div className="twrap"><div className={`toast ${type === 'error' ? 'te2' : 'tok'}`}>{msg}</div></div>
}

// ─── DASHBOARD ───────────────────────────────────────────────
function Dashboard({ casetas }) {
  const [stats, setStats]     = useState(null)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    Promise.all([getStatsAdmin(), getTicketsAdmin(hoy.toISOString(), null, null)])
      .then(([s, t]) => { setStats(s); setTickets(t) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-row"><div className="spin-sm" /> Cargando...</div>

  const totalHoy    = stats.tickets.reduce((s, t) => s + t.total, 0)
  const efectivoHoy = stats.tickets.filter(t => t.metodo_pago === 'efectivo').reduce((s, t) => s + t.total, 0)
  const tarjetaHoy  = stats.tickets.filter(t => t.metodo_pago === 'tarjeta').reduce((s, t) => s + t.total, 0)

  // Ventas por caseta hoy
  const porCaseta = {}
  stats.tickets.forEach(t => {
    const n = t.casetas?.nombre || '?'
    if (!porCaseta[n]) porCaseta[n] = 0
    porCaseta[n] += t.total
  })

  return (
    <>
      <div className="ag">
        <div className="sc"><div className="sv">{fmt(totalHoy)}</div><div className="sl2">Ventas hoy</div></div>
        <div className="sc"><div className="sv">{stats.tickets.length}</div><div className="sl2">Tickets hoy</div></div>
        <div className="sc"><div className="sv">{fmt(efectivoHoy)}</div><div className="sl2">Efectivo hoy</div></div>
        <div className="sc"><div className="sv">{fmt(tarjetaHoy)}</div><div className="sl2">Tarjeta hoy</div></div>
        <div className="sc"><div className="sv" style={{ color: stats.stockBajo.length > 5 ? 'var(--red)' : 'var(--ac)' }}>{stats.stockBajo.length}</div><div className="sl2">Stock bajo</div></div>
        <div className="sc"><div className="sv">{casetas.length}</div><div className="sl2">Casetas</div></div>
      </div>

      {Object.keys(porCaseta).length > 1 && (
        <>
          <div className="stit">Ventas por caseta hoy</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 22 }}>
            {Object.entries(porCaseta).sort((a,b) => b[1]-a[1]).map(([nombre, total]) => (
              <div key={nombre} className="sc">
                <div style={{ fontSize: '.72rem', color: 'var(--tx2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{nombre.replace('Caballer ','')}</div>
                <div className="sv" style={{ fontSize: '1.4rem' }}>{fmt(total)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="stit">Últimos tickets</div>
      <div className="tw">
        <table>
          <thead><tr><th>Hora</th><th>Caseta</th><th>Empleado</th><th>Método</th><th>Total</th></tr></thead>
          <tbody>
            {tickets.length === 0
              ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20 }}>Sin ventas hoy</td></tr>
              : tickets.slice(0, 25).map(t => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--tx2)' }}>{new Date(t.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ color: 'var(--tx2)' }}>{t.casetas?.nombre}</td>
                  <td>{t.perfiles?.nombre}</td>
                  <td>{t.metodo_pago === 'efectivo' ? '💵' : '💳'} {t.metodo_pago}</td>
                  <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(t.total)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="stit">Stock crítico</div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Caseta</th><th>Stock</th></tr></thead>
          <tbody>
            {stats.stockBajo.length === 0
              ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20 }}>Todo el stock está bien ✓</td></tr>
              : stats.stockBajo.map((s, i) => (
                <tr key={i}>
                  <td>{s.productos?.nombre}</td>
                  <td style={{ color: 'var(--tx2)' }}>{s.casetas?.nombre}</td>
                  <td style={{ color: s.cantidad === 0 ? 'var(--red)' : 'var(--gold)', fontWeight: 700 }}>{s.cantidad}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── PANEL VENTAS ────────────────────────────────────────────
function PanelVentas({ casetas }) {
  const hoy     = new Date()
  const [año,   setAño]     = useState(hoy.getFullYear())
  const [mes,   setMes]     = useState(hoy.getMonth() + 1)
  const [casetaSel, setCasetaSel] = useState('')
  const [datos, setDatos]   = useState({})
  const [loading, setLoading] = useState(false)

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  useEffect(() => {
    setLoading(true)
    getVentasPorDia(casetaSel || null, año, mes)
      .then(setDatos)
      .finally(() => setLoading(false))
  }, [año, mes, casetaSel])

  // Días del mes
  const diasEnMes = new Date(año, mes, 0).getDate()
  const primerDia = new Date(año, mes - 1, 1).getDay()
  const ajuste    = (primerDia + 6) % 7 // lunes = 0

  const totalMes    = Object.values(datos).reduce((s, d) => s + d.efectivo + d.tarjeta, 0)
  const ticketsMes  = Object.values(datos).reduce((s, d) => s + d.tickets, 0)
  const diasConVenta = Object.keys(datos).length
  const maxDia      = Math.max(...Object.values(datos).map(d => d.efectivo + d.tarjeta), 1)

  const diaStr = (d) => `${año}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  return (
    <>
      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '8px 12px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif" }}>
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={año} onChange={e => setAño(Number(e.target.value))} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '8px 12px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif" }}>
          {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
        </select>
        <select value={casetaSel} onChange={e => setCasetaSel(e.target.value)} style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '8px 12px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif" }}>
          <option value="">Todas las casetas</option>
          {casetas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Stats del mes */}
      <div className="ag" style={{ marginBottom: 20 }}>
        <div className="sc"><div className="sv">{fmt(totalMes)}</div><div className="sl2">Total {MESES[mes-1]}</div></div>
        <div className="sc"><div className="sv">{ticketsMes}</div><div className="sl2">Tickets</div></div>
        <div className="sc"><div className="sv">{diasConVenta}</div><div className="sl2">Días con venta</div></div>
        <div className="sc"><div className="sv">{diasConVenta ? fmt(totalMes / diasConVenta) : '—'}</div><div className="sl2">Media/día</div></div>
      </div>

      {/* Calendario */}
      {loading
        ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
        : (
          <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--r)', padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
              {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '.68rem', color: 'var(--tx2)', fontWeight: 700, padding: '4px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {Array(ajuste).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {Array(diasEnMes).fill(null).map((_, i) => {
                const dia = i + 1
                const key = diaStr(dia)
                const d   = datos[key]
                const tot = d ? d.efectivo + d.tarjeta : 0
                const esHoy = key === hoy.toISOString().slice(0, 10)
                const intensidad = tot > 0 ? Math.max(0.12, tot / maxDia) : 0
                return (
                  <div key={dia} style={{
                    borderRadius: 8, padding: '6px 4px', textAlign: 'center',
                    background: tot > 0 ? `rgba(255,77,28,${intensidad})` : 'var(--s2)',
                    border: `1px solid ${esHoy ? 'var(--ac)' : 'transparent'}`,
                    minHeight: 54,
                  }}>
                    <div style={{ fontSize: '.7rem', color: tot > 0 ? 'var(--tx)' : 'var(--tx2)', fontWeight: 700 }}>{dia}</div>
                    {tot > 0 && (
                      <>
                        <div style={{ fontSize: '.62rem', color: 'var(--ac)', fontWeight: 700, marginTop: 2 }}>{fmt(tot)}</div>
                        <div style={{ fontSize: '.56rem', color: 'var(--tx2)' }}>{d.tickets}t</div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      }

      {/* Lista días con venta */}
      <div className="stit">Detalle por día</div>
      <div className="tw">
        <table>
          <thead><tr><th>Día</th><th>Tickets</th><th>Efectivo</th><th>Tarjeta</th><th>Total</th></tr></thead>
          <tbody>
            {Object.entries(datos).length === 0
              ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20 }}>Sin ventas este mes</td></tr>
              : Object.entries(datos).sort((a,b) => b[0].localeCompare(a[0])).map(([dia, d]) => (
                <tr key={dia}>
                  <td style={{ fontWeight: 600 }}>{new Date(dia + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td style={{ color: 'var(--tx2)' }}>{d.tickets}</td>
                  <td style={{ color: 'var(--green)' }}>{fmt(d.efectivo)}</td>
                  <td style={{ color: 'var(--blue)' }}>{fmt(d.tarjeta)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(d.efectivo + d.tarjeta)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── PANEL TICKETS ────────────────────────────────────────────
function PanelTickets({ casetas }) {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const [desde, setDesde]       = useState(hoy.toISOString().slice(0,10))
  const [hasta, setHasta]       = useState(new Date().toISOString().slice(0,10))
  const [casetaSel, setCasetaSel] = useState('')
  const [tickets, setTickets]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [toast, setToast]       = useState(null)

  const showToast = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  const buscar = () => {
    setLoading(true)
    getTicketsAdmin(
      desde + 'T00:00:00',
      hasta + 'T23:59:59',
      casetaSel || null
    ).then(setTickets).finally(() => setLoading(false))
  }

  useEffect(() => { buscar() }, [])

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este ticket? El stock NO se restaura.')) return
    try {
      const { error } = await import('../lib/supabase.js').then(m => m.supabase.from('tickets').delete().eq('id', id))
      if (error) throw error
      setTickets(prev => prev.filter(t => t.id !== id))
      showToast('Ticket eliminado')
    } catch (e) { showToast(e.message, 'error') }
  }

  const totalFiltrado = tickets.reduce((s, t) => s + t.total, 0)

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="fg" style={{ margin: 0 }}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif" }} />
        </div>
        <div className="fg" style={{ margin: 0 }}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif" }} />
        </div>
        <div className="fg" style={{ margin: 0 }}>
          <label>Caseta</label>
          <select value={casetaSel} onChange={e => setCasetaSel(e.target.value)}
            style={{ background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif" }}>
            <option value="">Todas</option>
            {casetas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <button className="btn-add" onClick={buscar} style={{ height: 38 }}>Buscar</button>
      </div>

      <div style={{ marginBottom: 14, fontSize: '.82rem', color: 'var(--tx2)' }}>
        {tickets.length} tickets · Total: <strong style={{ color: 'var(--ac)' }}>{fmt(totalFiltrado)}</strong>
      </div>

      {loading
        ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
        : (
          <div className="tw">
            <table>
              <thead><tr><th>Fecha/Hora</th><th>Caseta</th><th>Empleado</th><th>Método</th><th>Total</th><th>Acciones</th></tr></thead>
              <tbody>
                {tickets.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign:'center',color:'var(--tx2)',padding:20 }}>Sin tickets en este rango</td></tr>
                  : tickets.map(t => (
                    <>
                      <tr key={t.id}>
                        <td style={{ color:'var(--tx2)',fontSize:'.78rem' }}>{new Date(t.creado_en).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                        <td style={{ color:'var(--tx2)' }}>{t.casetas?.nombre}</td>
                        <td>{t.perfiles?.nombre}</td>
                        <td>{t.metodo_pago === 'efectivo' ? '💵' : '💳'}</td>
                        <td style={{ fontWeight:700,color:'var(--ac)' }}>{fmt(t.total)}</td>
                        <td>
                          <div className="acell">
                            <button className="btn-edit" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                              {expanded === t.id ? 'Ocultar' : 'Ver líneas'}
                            </button>
                            <button className="btn-del" onClick={() => eliminar(t.id)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                      {expanded === t.id && t.ticket_items && (
                        <tr key={`${t.id}-detail`}>
                          <td colSpan={6} style={{ background:'var(--s2)',padding:'8px 16px' }}>
                            {t.ticket_items.map((li, i) => (
                              <div key={i} style={{ display:'flex',justifyContent:'space-between',fontSize:'.78rem',padding:'3px 0',borderBottom:'1px solid var(--bd)' }}>
                                <span>{li.nombre_producto} × {li.cantidad}</span>
                                <span style={{ color:'var(--ac)' }}>{fmt(li.total_linea)}</span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
              </tbody>
            </table>
          </div>
        )
      }
    </>
  )
}

// ─── GESTIÓN PRODUCTOS ────────────────────────────────────────
function GestionProductos() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [editId, setEditId]       = useState(null)
  const [busq, setBusq]           = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const formRef = useRef(null)

  const CATS_FIJAS = ['Petardos','Truenos','Bengalas','Cracker','Terrestres','Fuentes','Efectos','Packs','Accesorios']
  const F0 = { nombre:'', precio:'', categoria:'Petardos', catNueva:'', edad_minima:'16', codigo_ean:'' }
  const [form, setForm] = useState(F0)

  const showToast = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  useEffect(() => { getProductos().then(setProductos).finally(()=>setLoading(false)) }, [])

  const catsDinamicas = ['Todos', ...new Set([...CATS_FIJAS, ...productos.map(p=>p.categoria)])]

  const guardar = async () => {
    if (!form.nombre.trim() || !form.precio || !form.codigo_ean.trim()) {
      showToast('Nombre, precio y EAN son obligatorios','error'); return
    }
    const categoria = form.categoria === '__nueva__' ? form.catNueva.trim() : form.categoria
    if (!categoria) { showToast('Introduce el nombre de la nueva categoría','error'); return }
    try {
      const data = await upsertProducto({
        ...(editId ? { id: editId } : {}),
        nombre: form.nombre.trim(),
        precio: parseFloat(form.precio),
        categoria,
        edad_minima: parseInt(form.edad_minima),
        codigo_ean: form.codigo_ean.trim(),
        activo: true,
      })
      if (editId) {
        setProductos(prev => prev.map(p => p.id === editId ? data : p))
        showToast('Producto actualizado ✓')
      } else {
        setProductos(prev => [...prev, data])
        showToast('Producto añadido ✓')
      }
      setForm(F0); setEditId(null)
    } catch(e) { showToast(e.message,'error') }
  }

  const editar = p => {
    setForm({ nombre:p.nombre, precio:String(p.precio), categoria:p.categoria, catNueva:'', edad_minima:String(p.edad_minima), codigo_ean:p.codigo_ean })
    setEditId(p.id)
    // Scroll automático al formulario
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const toggle = async (id, activo) => {
    await toggleProducto(id, !activo)
    setProductos(prev => prev.map(p => p.id === id ? {...p, activo: !activo} : p))
  }

  const eliminar = async id => {
    if (!window.confirm('¿Eliminar este producto? Si tiene ventas registradas se desactivará en lugar de eliminarse.')) return
    try {
      await deleteProducto(id)
      setProductos(prev => prev.filter(p => p.id !== id))
      showToast('Producto eliminado ✓')
    } catch(e) {
      // Tiene tickets asociados — desactivar en su lugar
      if (e.message?.includes('foreign key') || e.message?.includes('violates') || e.message?.includes('ticket_items')) {
        await toggleProducto(id, false)
        setProductos(prev => prev.map(p => p.id === id ? {...p, activo: false} : p))
        showToast('Tiene ventas registradas — se ha desactivado en lugar de eliminar', 'ok')
      } else {
        showToast(e.message, 'error')
      }
    }
  }

  const eaCl  = m => m===0?'cp':m===12?'cg':m===16?'cb2':'cr'
  const eaLbl = m => m===0?'T1':m+'+'

  const prods = productos.filter(p => {
    if (catFiltro !== 'Todos' && p.categoria !== catFiltro) return false
    if (busq && !p.nombre.toLowerCase().includes(busq.toLowerCase()) && !p.codigo_ean?.includes(busq)) return false
    return true
  })

  if (loading) return <div className="loading-row"><div className="spin-sm" />Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div ref={formRef} className="stit">{editId ? '✏️ Editar Producto' : '➕ Nuevo Producto'}</div>
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Ej: Piratas 50u." /></div>
          <div className="fg"><label>Precio (€)</label><input type="number" value={form.precio} onChange={e=>setForm({...form,precio:e.target.value})} placeholder="1.00" min="0" step=".01" /></div>
          <div className="fg"><label>Código EAN</label><input value={form.codigo_ean} onChange={e=>setForm({...form,codigo_ean:e.target.value})} placeholder="8410278004" inputMode="numeric" /></div>
          <div className="fg">
            <label>Categoría</label>
            <select value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>
              {CATS_FIJAS.map(c=><option key={c}>{c}</option>)}
              <option value="__nueva__">+ Otra categoría...</option>
            </select>
          </div>
          {form.categoria === '__nueva__' && (
            <div className="fg"><label>Nueva categoría</label><input value={form.catNueva} onChange={e=>setForm({...form,catNueva:e.target.value})} placeholder="Nombre de la categoría" /></div>
          )}
          <div className="fg">
            <label>Edad mínima</label>
            <select value={form.edad_minima} onChange={e=>setForm({...form,edad_minima:e.target.value})}>
              <option value="0">T1 (requiere DNI)</option>
              <option value="12">12+</option>
              <option value="16">16+</option>
              <option value="18">18+</option>
            </select>
          </div>
        </div>
        <div style={{ display:'flex',gap:9 }}>
          <button className="btn-add" onClick={guardar}>{editId ? 'Guardar cambios' : 'Añadir producto'}</button>
          {editId && <button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0)}}>Cancelar</button>}
        </div>
      </div>

      <div style={{ display:'flex',gap:10,alignItems:'center',marginBottom:10,flexWrap:'wrap' }}>
        <div className="stit" style={{ margin:0 }}>Catálogo ({productos.length})</div>
        <input className="si" style={{maxWidth:240}} placeholder="Buscar..." value={busq} onChange={e=>setBusq(e.target.value)} />
        <select value={catFiltro} onChange={e=>setCatFiltro(e.target.value)}
          style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'7px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
          {catsDinamicas.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>EAN</th><th>Categoría</th><th>Precio</th><th>Edad</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {prods.map(p=>(
              <tr key={p.id} style={{opacity:p.activo?1:.5}}>
                <td style={{fontWeight:600}}>{p.nombre}</td>
                <td style={{color:'var(--tx2)',fontSize:'.76rem',fontFamily:'monospace'}}>{p.codigo_ean}</td>
                <td style={{color:'var(--tx2)'}}>{p.categoria}</td>
                <td style={{color:'var(--ac)',fontWeight:700}}>{fmt(p.precio)}</td>
                <td><span className={`chip ${eaCl(p.edad_minima)}`}>{eaLbl(p.edad_minima)}</span></td>
                <td><span className={`chip ${p.activo?'cg':'cr'}`}>{p.activo?'Activo':'Inactivo'}</span></td>
                <td>
                  <div className="acell">
                    <button className="btn-edit" onClick={()=>editar(p)}>Editar</button>
                    <button className="btn-tog" style={{color:p.activo?'var(--gold)':'var(--green)'}} onClick={()=>toggle(p.id,p.activo)}>{p.activo?'Desact.':'Activar'}</button>
                    <button className="btn-del" onClick={()=>eliminar(p.id)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN STOCK ────────────────────────────────────────────
function GestionStock({ casetas }) {
  const [productos, setProductos] = useState([])
  const [stockData, setStockData] = useState({})
  const [casetaSel, setCasetaSel] = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(null)
  const [editVals, setEditVals]   = useState({})
  const [busq, setBusq]           = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [toast, setToast]         = useState(null)

  const showToast = (msg,type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  useEffect(() => {
    getProductos().then(p => {
      setProductos(p)
      if (casetas.length) setCasetaSel(casetas[0].id)
    }).finally(()=>setLoading(false))
  }, [])

  useEffect(() => {
    if (!casetaSel) return
    setLoading(true)
    getStockCaseta(casetaSel).then(stk => {
      setStockData(prev=>({...prev,[casetaSel]:stk}))
      setEditVals({})
    }).finally(()=>setLoading(false))
  }, [casetaSel])

  const stockActual = stockData[casetaSel] || {}
  const CATS = ['Todos', ...new Set(productos.map(p=>p.categoria))]

  const guardarStock = async (productoId) => {
    const val = editVals[productoId]
    if (val === undefined || val === '') return
    const cantidad = parseInt(val)
    if (isNaN(cantidad) || cantidad < 0) { showToast('Cantidad no válida','error'); return }
    setSaving(productoId)
    try {
      await setStock(productoId, casetaSel, cantidad)
      setStockData(prev => ({...prev,[casetaSel]:{...prev[casetaSel],[productoId]:cantidad}}))
      setEditVals(prev => { const n={...prev}; delete n[productoId]; return n })
      showToast('Stock actualizado ✓')
    } catch(e) { showToast(e.message,'error') }
    finally { setSaving(null) }
  }

  const prods = productos.filter(p => {
    if (catFiltro !== 'Todos' && p.categoria !== catFiltro) return false
    if (busq && !p.nombre.toLowerCase().includes(busq.toLowerCase())) return false
    return true
  })

  const colStock = n => n === 0 ? 'var(--red)' : n < 10 ? 'var(--gold)' : 'var(--green)'
  if (loading && !productos.length) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div style={{ display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap' }}>
        <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
          {casetas.map(c=>(
            <button key={c.id} onClick={()=>setCasetaSel(c.id)} style={{
              padding:'7px 13px',borderRadius:'var(--rs)',border:'1px solid',
              borderColor:casetaSel===c.id?'var(--ac)':'var(--bd)',
              background:casetaSel===c.id?'rgba(255,77,28,.1)':'transparent',
              color:casetaSel===c.id?'var(--ac)':'var(--tx2)',
              fontSize:'.82rem',fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
            }}>{c.nombre.replace('Caballer ','')}</button>
          ))}
        </div>
        <input className="si" style={{maxWidth:200}} placeholder="Buscar..." value={busq} onChange={e=>setBusq(e.target.value)} />
        <select value={catFiltro} onChange={e=>setCatFiltro(e.target.value)}
          style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'7px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
          {CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="info-box" style={{marginBottom:12}}>
        Escribe la nueva cantidad y pulsa <strong>Enter</strong> o <strong>✓</strong> para guardar.
      </div>
      {loading && <div className="loading-row"><div className="spin-sm"/>Actualizando...</div>}
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th>EAN</th><th style={{textAlign:'center'}}>Stock</th><th style={{textAlign:'center'}}>Nuevo</th></tr></thead>
          <tbody>
            {prods.map(p=>{
              const cant = stockActual[p.id] ?? 0
              const editando = editVals[p.id] !== undefined
              const guardando = saving === p.id
              return (
                <tr key={p.id}>
                  <td style={{fontWeight:600}}>{p.nombre}</td>
                  <td style={{color:'var(--tx2)',fontSize:'.78rem'}}>{p.categoria}</td>
                  <td style={{color:'var(--tx2)',fontSize:'.74rem',fontFamily:'monospace'}}>{p.codigo_ean}</td>
                  <td style={{textAlign:'center'}}>
                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.2rem',color:colStock(cant)}}>{cant}</span>
                  </td>
                  <td style={{textAlign:'center'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                      <input type="number" min="0" value={editVals[p.id]??''} placeholder={String(cant)}
                        onChange={e=>setEditVals(prev=>({...prev,[p.id]:e.target.value}))}
                        onKeyDown={e=>e.key==='Enter'&&guardarStock(p.id)}
                        style={{width:70,background:'var(--s2)',border:'1px solid',borderColor:editando?'var(--ac)':'var(--bd)',borderRadius:'var(--rs)',padding:'6px 8px',color:'var(--tx)',fontSize:'.88rem',outline:'none',fontFamily:"'DM Sans',sans-serif",textAlign:'center'}}
                        inputMode="numeric"
                      />
                      {editando && (
                        <button onClick={()=>guardarStock(p.id)} disabled={guardando} style={{width:28,height:28,borderRadius:'50%',border:'none',background:'var(--green)',color:'white',cursor:'pointer',fontSize:'.82rem',display:'flex',alignItems:'center',justifyContent:'center',opacity:guardando?.5:1}}>
                          {guardando?'…':'✓'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN OFERTAS ─────────────────────────────────────────
function GestionOfertas() {
  const [ofertas, setOfertas]     = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [editId, setEditId]       = useState(null)
  const F0 = { producto_id:'', etiqueta:'', cantidad_pack:'', precio_pack:'' }
  const [form, setForm]           = useState(F0)

  const showToast = (msg,type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  useEffect(() => {
    Promise.all([getOfertas(),getProductos()]).then(([o,p])=>{setOfertas(o);setProductos(p)}).finally(()=>setLoading(false))
  },[])

  const precioU = () => (form.cantidad_pack&&form.precio_pack) ? parseFloat(form.precio_pack)/parseInt(form.cantidad_pack) : 0
  const prodSel = productos.find(p=>p.id===form.producto_id)

  const guardar = async () => {
    if (!form.producto_id||!form.etiqueta||!form.cantidad_pack||!form.precio_pack) {
      showToast('Todos los campos son obligatorios','error'); return
    }
    try {
      const data = await upsertOferta({
        ...(editId?{id:editId}:{}),
        producto_id:form.producto_id, etiqueta:form.etiqueta,
        cantidad_pack:parseInt(form.cantidad_pack), precio_pack:parseFloat(form.precio_pack), activa:true,
      })
      if (editId) { setOfertas(prev=>prev.map(o=>o.id===editId?data:o)); showToast('Oferta actualizada ✓') }
      else { setOfertas(prev=>[...prev,data]); showToast('Oferta añadida ✓') }
      setForm(F0); setEditId(null)
    } catch(e) { showToast(e.message,'error') }
  }

  const editar = o => {
    setForm({producto_id:o.producto_id,etiqueta:o.etiqueta,cantidad_pack:String(o.cantidad_pack),precio_pack:String(o.precio_pack)})
    setEditId(o.id)
  }

  const eliminar = async id => {
    if (!window.confirm('¿Eliminar esta oferta?')) return
    await deleteOferta(id)
    setOfertas(prev=>prev.filter(o=>o.id!==id))
    showToast('Oferta eliminada')
  }

  if (loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="stit">{editId?'✏️ Editar Oferta':'➕ Nueva Oferta'}</div>
      <div className="info-box">
        <strong style={{color:'var(--gold)'}}>Cómo funcionan:</strong> Pack de N unidades por X€. Si el cliente compra más de un pack se aplican automáticamente. El resto va a precio normal.
      </div>
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Producto</label>
            <select value={form.producto_id} onChange={e=>setForm({...form,producto_id:e.target.value})}>
              <option value="">-- Seleccionar --</option>
              {productos.filter(p=>p.activo).map(p=><option key={p.id} value={p.id}>{p.nombre} ({fmt(p.precio)})</option>)}
            </select>
          </div>
          <div className="fg"><label>Etiqueta</label><input value={form.etiqueta} onChange={e=>setForm({...form,etiqueta:e.target.value})} placeholder="Ej: 4 x 5€" /></div>
          <div className="fg"><label>Unidades del pack</label><input type="number" value={form.cantidad_pack} onChange={e=>setForm({...form,cantidad_pack:e.target.value})} placeholder="4" min="2" /></div>
          <div className="fg"><label>Precio total (€)</label><input type="number" value={form.precio_pack} onChange={e=>setForm({...form,precio_pack:e.target.value})} placeholder="5.00" min="0" step=".01" /></div>
        </div>
        {form.cantidad_pack&&form.precio_pack&&(
          <div style={{fontSize:'.8rem',marginBottom:11,display:'flex',gap:18,flexWrap:'wrap'}}>
            <span style={{color:'var(--gold)'}}>€/u. con oferta: <strong>{fmt(precioU())}</strong></span>
            {prodSel&&<span style={{color:'var(--green)'}}>Ahorro: <strong>{fmt(prodSel.precio-precioU())}/u.</strong></span>}
          </div>
        )}
        <div style={{display:'flex',gap:9}}>
          <button className="btn-add" onClick={guardar}>{editId?'Guardar':'Añadir oferta'}</button>
          {editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0)}}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Ofertas activas ({ofertas.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Pack</th><th>Precio pack</th><th>€/u.</th><th>Normal</th><th>Ahorro</th><th>Acciones</th></tr></thead>
          <tbody>
            {ofertas.length===0
              ? <tr><td colSpan={7} style={{textAlign:'center',color:'var(--tx2)',padding:24}}>Sin ofertas</td></tr>
              : ofertas.map(o=>{
                const p=productos.find(x=>x.id===o.producto_id)
                const pu=o.precio_pack/o.cantidad_pack
                const ahorro=p?p.precio-pu:0
                return (
                  <tr key={o.id}>
                    <td style={{fontWeight:600}}>{p?p.nombre:<span style={{color:'var(--red)'}}>Eliminado</span>}</td>
                    <td><span className="chip cy">{o.etiqueta}</span></td>
                    <td style={{color:'var(--ac)',fontWeight:700}}>{fmt(o.precio_pack)}</td>
                    <td style={{color:'var(--gold)',fontWeight:700}}>{fmt(pu)}</td>
                    <td style={{color:'var(--tx2)'}}>{p?fmt(p.precio):'—'}</td>
                    <td style={{color:ahorro>0?'var(--green)':'var(--red)',fontWeight:700}}>{ahorro>0?`-${fmt(ahorro)}`:'—'}</td>
                    <td><div className="acell">
                      <button className="btn-edit" onClick={()=>editar(o)}>Editar</button>
                      <button className="btn-del" onClick={()=>eliminar(o.id)}>Eliminar</button>
                    </div></td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN CASETAS ─────────────────────────────────────────
function GestionCasetas({ casetas, setCasetas }) {
  const [toast, setToast] = useState(null)
  const [editId, setEditId] = useState(null)
  const F0 = { nombre: '' }
  const [form, setForm] = useState(F0)

  const showToast = (msg,type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const guardar = async () => {
    if (!form.nombre.trim()) { showToast('El nombre es obligatorio','error'); return }
    try {
      const data = await upsertCaseta({ ...(editId?{id:editId}:{}), nombre:form.nombre.trim() })
      if (editId) { setCasetas(prev=>prev.map(c=>c.id===editId?data:c)); showToast('Caseta actualizada ✓') }
      else { setCasetas(prev=>[...prev,data]); showToast('Caseta creada ✓') }
      setForm(F0); setEditId(null)
    } catch(e) { showToast(e.message,'error') }
  }

  const eliminar = async id => {
    if (!window.confirm('¿Eliminar esta caseta? Se eliminarán también sus cajas y tickets.')) return
    try { await deleteCaseta(id); setCasetas(prev=>prev.filter(c=>c.id!==id)); showToast('Caseta eliminada') }
    catch(e) { showToast(e.message,'error') }
  }

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="stit">{editId?'✏️ Editar Caseta':'➕ Nueva Caseta'}</div>
      <div className="iform">
        <div className="fg"><label>Nombre de la caseta</label>
          <input value={form.nombre} onChange={e=>setForm({nombre:e.target.value})} placeholder="Caballer Nueva Caseta" />
        </div>
        <div style={{display:'flex',gap:9}}>
          <button className="btn-add" onClick={guardar}>{editId?'Guardar':'Crear caseta'}</button>
          {editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0)}}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Casetas ({casetas.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>ID</th><th>Acciones</th></tr></thead>
          <tbody>
            {casetas.map(c=>(
              <tr key={c.id}>
                <td style={{fontWeight:600}}>{c.nombre}</td>
                <td style={{color:'var(--tx2)',fontSize:'.72rem',fontFamily:'monospace'}}>{c.id}</td>
                <td>
                  <div className="acell">
                    <button className="btn-edit" onClick={()=>{setEditId(c.id);setForm({nombre:c.nombre})}}>Editar</button>
                    <button className="btn-del" onClick={()=>eliminar(c.id)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN USUARIOS ─────────────────────────────────────────
function GestionUsuarios({ casetas }) {
  const [perfiles, setPerfiles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)
  const [editId, setEditId]     = useState(null)
  const F0 = { nombre:'', email:'', password:'', rol:'EMPLEADO', caseta_id:'' }
  const [form, setForm]         = useState(F0)
  const [msg, setMsg]           = useState(null)

  const showToast = (txt,type='ok') => { setToast({msg:txt,type}); setTimeout(()=>setToast(null),3000) }
  const showMsg   = (txt,ok=true)   => { setMsg({txt,ok});          setTimeout(()=>setMsg(null),4000) }

  useEffect(() => { getPerfiles().then(setPerfiles).finally(()=>setLoading(false)) }, [])

  const guardar = async () => {
    if (!form.nombre.trim()) { showMsg('El nombre es obligatorio',false); return }
    if (!editId && !form.email.trim()) { showMsg('El email es obligatorio',false); return }
    if (!editId && !form.password.trim()) { showMsg('La contraseña es obligatoria',false); return }
    if (form.rol==='EMPLEADO' && !form.caseta_id) { showMsg('El empleado necesita una caseta asignada',false); return }
    setSaving(true)
    try {
      if (editId) {
        const cambios = { nombre:form.nombre, rol:form.rol, caseta_id:form.caseta_id||null }
        await updatePerfil(editId, cambios)
        setPerfiles(prev=>prev.map(p=>p.id===editId?{...p,...cambios,casetas:casetas.find(c=>c.id===form.caseta_id)}:p))
        showMsg('Usuario actualizado ✓')
      } else {
        const nuevo = await crearUsuario(form)
        setPerfiles(prev=>[...prev,{...nuevo,activo:true,casetas:casetas.find(c=>c.id===nuevo.caseta_id)}])
        showMsg('Usuario creado ✓')
      }
      setForm(F0); setEditId(null)
    } catch(e) { showMsg(e.message,false) }
    finally { setSaving(false) }
  }

  const toggleActivo = async (id, activo) => {
    await updatePerfil(id, {activo:!activo})
    setPerfiles(prev=>prev.map(p=>p.id===id?{...p,activo:!activo}:p))
    showToast(activo?'Usuario desactivado':'Usuario activado')
  }

  const editar = p => {
    setForm({nombre:p.nombre,email:'',password:'',rol:p.rol,caseta_id:p.caseta_id||''})
    setEditId(p.id)
  }

  if (loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="stit">{editId?'✏️ Editar Usuario':'➕ Nuevo Usuario'}</div>
      {msg && <div className={msg.ok?'ok-box':'err-box'}>{msg.txt}</div>}
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre completo</label>
            <input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="María García" />
          </div>
          {!editId&&<div className="fg"><label>Email</label>
            <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="maria@caballer.es" />
          </div>}
          {!editId&&<div className="fg"><label>Contraseña</label>
            <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Mínimo 6 caracteres" />
          </div>}
          <div className="fg"><label>Rol</label>
            <select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value,caseta_id:e.target.value==='ADMIN'?'':form.caseta_id})}>
              <option value="EMPLEADO">Empleado — solo TPV</option>
              <option value="ADMIN">Administrador — acceso completo</option>
            </select>
          </div>
          {form.rol==='EMPLEADO'&&<div className="fg"><label>Caseta asignada</label>
            <select value={form.caseta_id} onChange={e=>setForm({...form,caseta_id:e.target.value})}>
              <option value="">-- Seleccionar --</option>
              {casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>}
        </div>
        <div style={{display:'flex',gap:9}}>
          <button className="btn-add" onClick={guardar} disabled={saving}>{saving?'Guardando...':editId?'Guardar cambios':'Crear usuario'}</button>
          {editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0);setMsg(null)}}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Usuarios ({perfiles.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>Rol</th><th>Caseta</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {perfiles.map(p=>(
              <tr key={p.id} style={{opacity:p.activo?1:.5}}>
                <td style={{fontWeight:600}}>{p.nombre}</td>
                <td><span className={`chip ${p.rol==='ADMIN'?'cy':'cb2'}`}>{p.rol}</span></td>
                <td style={{color:'var(--tx2)'}}>{p.casetas?.nombre||'— Global —'}</td>
                <td><span className={`chip ${p.activo?'cg':'cr'}`}>{p.activo?'Activo':'Inactivo'}</span></td>
                <td><div className="acell">
                  <button className="btn-edit" onClick={()=>editar(p)}>Editar</button>
                  <button className="btn-tog" style={{color:p.activo?'var(--gold)':'var(--green)'}} onClick={()=>toggleActivo(p.id,p.activo)}>
                    {p.activo?'Desact.':'Activar'}
                  </button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── ADMIN PANEL ─────────────────────────────────────────────
export default function AdminPanel({ perfil, casetas: casetasInit }) {
  const [tab, setTab]       = useState('dashboard')
  const [casetas, setCasetas] = useState(casetasInit)

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">💥 Caballer TPV</div>
        <div className="ti">
          <span style={{fontSize:'.8rem',color:'var(--tx2)'}}>{perfil.nombre}</span>
          <span className="badge ba">Admin</span>
          <button className="btn-o" onClick={()=>supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="navtabs">
        {TABS.map(([k,l])=>(
          <button key={k} className={`ntab ${tab===k?'on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="cnt">
        {tab==='dashboard' && <Dashboard casetas={casetas} />}
        {tab==='ventas'    && <PanelVentas casetas={casetas} />}
        {tab==='tickets'   && <PanelTickets casetas={casetas} />}
        {tab==='productos' && <GestionProductos />}
        {tab==='stock'     && <GestionStock casetas={casetas} />}
        {tab==='ofertas'   && <GestionOfertas />}
        {tab==='casetas'   && <GestionCasetas casetas={casetas} setCasetas={setCasetas} />}
        {tab==='usuarios'  && <GestionUsuarios casetas={casetas} />}
      </div>
    </div>
  )
}

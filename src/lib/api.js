import { supabase } from './supabase.js'

// ─── AUTH ────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, casetas(id, nombre)')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

// ─── PRODUCTOS ───────────────────────────────────────────────
export async function getProductos() {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('categoria')
    .order('nombre')
  if (error) throw error
  return data
}

export async function getProductoByEan(ean) {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('codigo_ean', ean)
    .eq('activo', true)
    .single()
  if (error) return null
  return data
}

export async function upsertProducto(producto) {
  const { data, error } = await supabase
    .from('productos')
    .upsert(producto, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function toggleProducto(id, activo) {
  const { error } = await supabase.from('productos').update({ activo }).eq('id', id)
  if (error) throw error
}

export async function deleteProducto(id) {
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) throw error
}

export async function getCategorias() {
  const { data, error } = await supabase
    .from('productos')
    .select('categoria')
    .eq('activo', true)
  if (error) return []
  const cats = [...new Set(data.map(p => p.categoria))].sort()
  return cats
}

// ─── STOCK ───────────────────────────────────────────────────
export async function getStockCaseta(casetaId) {
  const { data, error } = await supabase
    .from('stock')
    .select('producto_id, cantidad')
    .eq('caseta_id', casetaId)
  if (error) throw error
  return Object.fromEntries(data.map(s => [s.producto_id, s.cantidad]))
}

export async function setStock(productoId, casetaId, cantidad) {
  const { error } = await supabase
    .from('stock')
    .upsert({ producto_id: productoId, caseta_id: casetaId, cantidad }, { onConflict: 'producto_id,caseta_id' })
  if (error) throw error
}

// ─── OFERTAS ─────────────────────────────────────────────────
export async function getOfertas() {
  const { data, error } = await supabase
    .from('ofertas')
    .select('*')
    .eq('activa', true)
    .order('producto_id')
    .order('cantidad_pack')
  if (error) throw error
  return data
}

export async function upsertOferta(oferta) {
  const { data, error } = await supabase
    .from('ofertas')
    .upsert(oferta, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOferta(id) {
  const { error } = await supabase.from('ofertas').delete().eq('id', id)
  if (error) throw error
}

// ─── CASETAS ─────────────────────────────────────────────────
export async function getCasetas() {
  const { data, error } = await supabase
    .from('casetas')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data
}

export async function upsertCaseta(caseta) {
  const { data, error } = await supabase
    .from('casetas')
    .upsert(caseta, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCaseta(id) {
  const { error } = await supabase.from('casetas').delete().eq('id', id)
  if (error) throw error
}

// ─── USUARIOS / PERFILES ─────────────────────────────────────
export async function getPerfiles() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, casetas(nombre)')
    .order('nombre')
  if (error) throw error
  return data
}

export async function crearUsuario({ nombre, email, password, rol, caseta_id }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ nombre, email, password, rol, caseta_id }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error creando usuario')
  return data
}

export async function updatePerfil(id, cambios) {
  const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
  if (error) throw error
}

// ─── CAJA ────────────────────────────────────────────────────
export async function getCajaAbierta(casetaId) {
  const { data, error } = await supabase
    .from('cajas')
    .select('*, perfiles!abierta_por(nombre)')
    .eq('caseta_id', casetaId)
    .eq('estado', 'ABIERTA')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function abrirCaja(casetaId, empleadoId, aperturaDinero) {
  const existente = await getCajaAbierta(casetaId)
  if (existente) return existente
  const { data, error } = await supabase
    .from('cajas')
    .insert({ caseta_id: casetaId, abierta_por: empleadoId, apertura_dinero: aperturaDinero })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cerrarCaja(cajaId, empleadoId, dineroContado) {
  const { error } = await supabase
    .from('cajas')
    .update({ estado: 'CERRADA', cerrada_por: empleadoId, cerrada_en: new Date().toISOString(), dinero_contado: dineroContado })
    .eq('id', cajaId)
  if (error) throw error
}

export async function getResumenCaja(cajaId) {
  const { data, error } = await supabase
    .from('tickets')
    .select('metodo_pago, total, empleado_id, perfiles(nombre)')
    .eq('caja_id', cajaId)
  if (error) throw error
  return data
}

// ─── TICKETS ─────────────────────────────────────────────────
export async function crearTicket(payload) {
  const { data, error } = await supabase.rpc('crear_ticket', {
    p_caja_id:     payload.cajaId,
    p_caseta_id:   payload.casetaId,
    p_empleado_id: payload.empleadoId,
    p_metodo_pago: payload.metodoPago,
    p_total:       payload.total,
    p_dinero_dado: payload.dineroDado,
    p_cambio:      payload.cambio,
    p_items:       payload.items,
  })
  if (error) throw error
  return data
}

export async function getTicketsTurno(cajaId) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_items(*, productos(nombre)), perfiles(nombre)')
    .eq('caja_id', cajaId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsPorRango(casetaId, desde, hasta) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_items(cantidad, total_linea, nombre_producto), perfiles(nombre), casetas(nombre)')
    .eq('caseta_id', casetaId)
    .gte('creado_en', desde)
    .lte('creado_en', hasta)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsAdmin(desde, hasta, casetaId) {
  let q = supabase
    .from('tickets')
    .select('*, ticket_items(cantidad, total_linea, nombre_producto), casetas(nombre), perfiles(nombre)')
    .order('creado_en', { ascending: false })
    .limit(200)
  if (desde) q = q.gte('creado_en', desde)
  if (hasta) q = q.lte('creado_en', hasta)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function deleteTicket(id) {
  const { error } = await supabase.from('tickets').delete().eq('id', id)
  if (error) throw error
}

export async function getTicketsHoy(casetaId) {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const { data, error } = await supabase
    .from('tickets')
    .select('*, perfiles(nombre)')
    .eq('caseta_id', casetaId)
    .gte('creado_en', hoy.toISOString())
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

// ─── FAVORITOS (localStorage) ─────────────────────────────────
export function getFavoritos() {
  try { return JSON.parse(localStorage.getItem('tpv_favoritos') || '[]') } catch { return [] }
}
export function toggleFavorito(productoId) {
  const favs = getFavoritos()
  const idx  = favs.indexOf(productoId)
  if (idx >= 0) favs.splice(idx, 1)
  else favs.unshift(productoId)
  localStorage.setItem('tpv_favoritos', JSON.stringify(favs.slice(0, 20)))
  return favs
}

// ─── STATS ADMIN ─────────────────────────────────────────────
export async function getStatsAdmin() {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const [ticketsRes, stockBajoRes] = await Promise.all([
    supabase.from('tickets').select('total, metodo_pago, casetas(nombre)').gte('creado_en', hoy.toISOString()),
    supabase.from('stock').select('cantidad, productos(nombre, categoria), casetas(nombre)').lt('cantidad', 10),
  ])
  return {
    tickets:   ticketsRes.data  || [],
    stockBajo: stockBajoRes.data || [],
  }
}

export async function getVentasPorDia(casetaId, año, mes) {
  const desde = new Date(año, mes - 1, 1).toISOString()
  const hasta  = new Date(año, mes, 0, 23, 59, 59).toISOString()
  let q = supabase
    .from('tickets')
    .select('total, metodo_pago, creado_en')
    .gte('creado_en', desde)
    .lte('creado_en', hasta)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  // Agrupar por día
  const porDia = {}
  ;(data || []).forEach(t => {
    const dia = t.creado_en.slice(0, 10)
    if (!porDia[dia]) porDia[dia] = { efectivo: 0, tarjeta: 0, tickets: 0 }
    porDia[dia].tickets++
    if (t.metodo_pago === 'efectivo') porDia[dia].efectivo += t.total
    else porDia[dia].tarjeta += t.total
  })
  return porDia
}

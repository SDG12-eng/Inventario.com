import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN FIREBASE Y GLOBALES ---
const db = getFirestore(initializeApp({ apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8", authDomain: "mi-web-db.firebaseapp.com", projectId: "mi-web-db", storageBucket: "mi-web-db.appspot.com" }));
window.usuarioActual = null; window.carritoGlobal = {}; window.cachePedidos = []; window.cacheEntradas = [];
const EMAIL_CFG = { s: 'service_a7yozqh', t: 'template_zglatmb', k: '2jVnfkJKKG0bpKN-U', admin: 'Emanuel.cedeno@fcipty.com' };

// Helpers de acortamiento para HTML DOM (Ahorran muchísimo código)
const $ = id => document.getElementById(id);
window.toggleModal = (id, show) => $(id)?.classList[show ? 'remove' : 'add']('hidden');

// --- 2. UI Y MENÚS ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => { v.classList.add("hidden"); v.classList.remove("animate-fade-in"); });
    $(`pag-${id}`)?.classList.remove("hidden"); setTimeout(() => $(`pag-${id}`)?.classList.add("animate-fade-in"), 10);
    if(window.innerWidth < 768) window.toggleMenu(false);
};

window.toggleMenu = (force) => {
    const sb = $("sidebar"), ov = $("sidebar-overlay"), open = force !== undefined ? force : sb.classList.contains("-translate-x-full");
    sb.classList[open ? 'remove' : 'add']("-translate-x-full"); ov.classList[open ? 'remove' : 'add']("hidden");
    if(open) { sb.style.zIndex = "100"; ov.style.zIndex = "90"; }
};

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden')); $(`tab-content-${tab}`)?.classList.remove('hidden');
    const onClass = "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-600 shadow-sm transition-all", offClass = "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-500 hover:text-slate-700 transition-all";
    if(tab === 'activos') { $("tab-btn-activos").className = onClass; $("tab-btn-historial").className = offClass; } else { $("tab-btn-historial").className = onClass; $("tab-btn-activos").className = offClass; }
};

window.filtrarTabla = (id, txt) => document.querySelectorAll(`#${id} tr`).forEach(f => f.style.display = f.innerText.toLowerCase().includes(txt.toLowerCase()) ? '' : 'none');
window.filtrarTarjetas = (id, txt) => $(id)?.querySelectorAll('.item-tarjeta').forEach(c => c.style.display = c.innerText.toLowerCase().includes(txt.toLowerCase()) ? '' : 'none');

// --- 3. SESIÓN ---
window.cargarSesion = (d) => {
    window.usuarioActual = d; localStorage.setItem("fcilog_session", JSON.stringify(d));
    window.toggleModal("pantalla-login", false); window.toggleModal("interfaz-app", true);
    $("info-usuario").innerHTML = `<div class="flex flex-col items-center"><div class="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2"><i class="fas fa-user"></i></div><span class="font-bold text-slate-700 uppercase tracking-wide">${d.id}</span><span class="text-[10px] uppercase font-bold text-white bg-indigo-500 px-2 py-0.5 rounded-full mt-1 shadow-sm">${d.rol}</span><span class="text-[9px] text-slate-400 mt-1 uppercase block">${d.departamento || 'Sin Depto'}</span></div>`;
    if(['admin','manager'].includes(d.rol)) window.toggleModal("btn-admin-stock", true);
    
    const rutas = { st:{id:'stats',n:'Dashboard',i:'chart-pie'}, sk:{id:'stock',n:'Stock',i:'boxes'}, pd:{id:'solicitar',n:'Pedido',i:'cart-plus'}, pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, hs:{id:'historial',n:'Movimientos',i:'history'}, fc:{id:'facturas',n:'Facturas',i:'file-invoice-dollar'}, us:{id:'usuarios',n:'Accesos',i:'users-cog'}, mp:{id:'notificaciones',n:'Mis Solicitudes',i:'shipping-fast'} };
    let act = d.rol==='admin' ? [rutas.st,rutas.sk,rutas.pd,rutas.pe,rutas.hs,rutas.fc,rutas.us,rutas.mp] : d.rol==='manager' ? [rutas.st,rutas.sk,rutas.pd,rutas.pe,rutas.hs,rutas.fc,rutas.mp] : d.rol==='supervisor' ? [rutas.st,rutas.sk,rutas.pd,rutas.pe,rutas.hs,rutas.mp] : [rutas.sk,rutas.pd,rutas.mp];
    $("menu-dinamico").innerHTML = act.map(x => `<button onclick="window.verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');
    
    window.verPagina(['admin','manager','supervisor'].includes(d.rol) ? 'stats' : 'stock'); window.activarSincronizacion();
};

window.iniciarSesion = async () => {
    const u = $("login-user").value.trim().toLowerCase(), p = $("login-pass").value.trim();
    if(!u || !p) return alert("Ingrese usuario y contraseña.");
    if (u === "admin" && p === "1130") return window.cargarSesion({ id: "admin", rol: "admin", departamento: "SISTEMAS" });
    try { const snap = await getDoc(doc(db, "usuarios", u)); if (snap.exists() && snap.data().pass === p) window.cargarSesion({ id: u, ...snap.data() }); else alert("Credenciales incorrectas."); } catch (e) { alert("Error de conexión a DB."); }
};
window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

// --- 4. CORE REALTIME (Sincronización) ---
window.activarSincronizacion = () => {
    const uRol = window.usuarioActual.rol;
    
    // INVENTARIO
    onSnapshot(collection(db, "inventario"), s => {
        let grid="", cart="", dl="", tr=0, ts=0, lbl=[], dst=[];
        s.forEach(ds => {
            const p = ds.data(), n = ds.id.toUpperCase(), sId = ds.id.replace(/[^a-zA-Z0-9]/g, '_'), jId = ds.id.replace(/'/g, "\\'");
            tr++; ts += p.cantidad; lbl.push(n.substring(0,10)); dst.push(p.cantidad); dl += `<option value="${n}">`;
            
            const ctrl = ['admin','manager'].includes(uRol) ? `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jId}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jId}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>` : "";
            const img = p.imagen ? `<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const low = p.stockMinimo && p.cantidad <= p.stockMinimo;
            grid += `<div class="${low ? "border-2 border-red-500 bg-red-50" : "border border-slate-100 bg-white"} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col item-tarjeta"><div class="flex justify-between items-start">${img}${ctrl}</div><h4 class="font-bold text-slate-700 text-xs truncate" title="${n}">${n} ${low?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse"></i>':''}</h4><div class="flex justify-between items-end mt-1"><p class="text-2xl font-black text-slate-800">${p.cantidad}</p>${p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : ''}</div></div>`;
            
            if(p.cantidad > 0) {
                const eC = window.carritoGlobal[ds.id] || 0;
                cart += `<div id="row-${sId}" class="flex items-center justify-between p-3 rounded-xl border ${eC>0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white"} transition-all shadow-sm item-tarjeta"><div class="flex items-center gap-3 overflow-hidden">${p.imagen?`<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">`:''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${n}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0 z-10 relative"><button onclick="window.ajustarCantidad('${jId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition">-</button><span id="cant-${sId}" class="w-8 text-center font-bold text-indigo-600 text-sm">${eC}</span><button onclick="window.ajustarCantidad('${jId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-600 transition" ${eC>=p.cantidad?'disabled':''}>+</button></div></div>`;
            }
        });
        if($("lista-inventario")) $("lista-inventario").innerHTML = grid; if($("contenedor-lista-pedidos")) $("contenedor-lista-pedidos").innerHTML = cart; if($("lista-sugerencias")) $("lista-sugerencias").innerHTML = dl;
        if($("metrica-total")) $("metrica-total").innerText = tr; if($("metrica-stock")) $("metrica-stock").innerText = ts;
        window.actualizarDashboard();
    });

    // PEDIDOS
    onSnapshot(collection(db,"pedidos"), s => {
        window.cachePedidos = []; let grp = {}, pend = 0, lAct = "", lHis = "", lAdm = "";
        s.forEach(ds => { const p = ds.data(); p.id = ds.id; window.cachePedidos.push(p); const bK = p.batchId || p.timestamp; if(!grp[bK]) grp[bK] = {i:[], u:p.usuarioId, s:p.ubicacion, d:p.fecha, t:p.timestamp}; grp[bK].i.push(p); if(p.estado==='pendiente') pend++; });
        
        window.cachePedidos.filter(p => p.usuarioId === window.usuarioActual.id).sort((a,b) => b.timestamp - a.timestamp).forEach(p => {
            const btn = p.estado === 'aprobado' ? `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end gap-2"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-emerald-600">Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50">Reportar</button></div>` : ['recibido','devuelto'].includes(p.estado) ? `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-500 text-xs font-bold hover:underline flex items-center gap-1"><i class="fas fa-undo"></i> Devolver / Reportar</button></div>` : "";
            const pr = p.prioridad || 'normal';
            const c = `<div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm item-tarjeta"><div class="flex justify-between items-start"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-700 uppercase text-sm mt-2">${p.insumoNom} <span class="badge status-pri-${pr} ml-1">${pr}</span></h4><p class="text-xs text-slate-400 font-mono mt-1">x${p.cantidad} • ${p.ubicacion}</p><p class="text-[10px] text-slate-300 mt-1">${p.fecha.split(',')[0]}</p></div></div>${btn}</div>`;
            ['pendiente','aprobado'].includes(p.estado) ? lAct += c : lHis += c;
        });
        if($("tab-content-activos")) $("tab-content-activos").innerHTML = lAct; if($("tab-content-historial")) $("tab-content-historial").innerHTML = lHis;

        if(['admin','manager','supervisor'].includes(uRol)) {
            Object.values(grp).sort((a,b) => b.t - a.t).forEach(g => {
                const pI = g.i.filter(i => i.estado === 'pendiente');
                if(pI.length > 0) {
                    const hA = pI.some(i => (i.prioridad||'normal') === 'alta');
                    lAdm += `<div class="bg-white p-5 rounded-2xl border-l-4 ${hA?"border-l-red-500":"border-l-amber-400"} shadow-sm cursor-pointer hover:shadow-md transition group" onclick="window.abrirModalGrupo('${g.i[0].batchId||g.t}')"><div class="flex justify-between items-center mb-3"><div><h4 class="font-black text-slate-800 text-sm uppercase flex items-center"><i class="fas fa-user text-slate-300 mr-1"></i> ${g.u} ${hA?`<span class="bg-red-500 text-white px-2 py-1 rounded-lg text-[10px] uppercase font-black animate-pulse ml-2 shadow-sm"><i class="fas fa-exclamation-triangle"></i> Urgente</span>`:''}</h4><span class="text-xs text-slate-400 font-medium">${g.s} • ${g.d.split(',')[0]}</span></div><span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition"><i class="fas fa-chevron-right text-xs"></i></span></div><div class="flex flex-wrap gap-1.5">${pI.map(i => `<span class="bg-slate-50 px-2 py-1 rounded text-[10px] border border-slate-200 uppercase font-bold text-slate-600">${i.insumoNom} (x${i.cantidad}) ${i.prioridad==='alta'?'<i class="fas fa-fire text-red-500 ml-1"></i>':''}</span>`).join('')}</div></div>`;
                }
            });
            if($("lista-pendientes-admin")) $("lista-pendientes-admin").innerHTML = lAdm;
        }
        if($("metrica-pedidos")) $("metrica-pedidos").innerText = pend; window.actualizarDashboard(); window.renderHistorialUnificado();
    });

    // ENTRADAS
    onSnapshot(collection(db,"entradas_stock"), s => { window.cacheEntradas = []; s.forEach(x => { window.cacheEntradas.push({id: x.id, ...x.data()}); }); window.renderHistorialUnificado(); });

    // FACTURAS
    if(['admin','manager'].includes(uRol)) onSnapshot(collection(db, "facturas"), s => {
        let h = ""; s.docs.map(d=>d.data()).sort((a,b)=>b.timestamp-a.timestamp).forEach(f => h += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="p-4 text-slate-500 text-xs font-mono">${f.fecha_compra}</td><td class="p-4 font-bold text-slate-700 uppercase text-xs">${f.proveedor}</td><td class="p-4 font-black text-emerald-600 text-right text-sm">$${parseFloat(f.gasto).toFixed(2)}</td><td class="p-4 text-slate-400 uppercase text-[10px] text-center font-bold">${f.usuarioRegistro}</td><td class="p-4 text-center">${(f.archivo_url && f.archivo_url.trim() !== "") ? `<a href="${f.archivo_url}" target="_blank" rel="noopener noreferrer" class="text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px] inline-flex items-center gap-1"><i class="fas fa-external-link-alt"></i> Ver Doc</a>` : '<span class="text-slate-300 text-[10px] font-bold">N/A</span>'}</td><td class="p-4 text-slate-300 text-[10px] text-right font-mono">${f.fecha_registro.split(',')[0]}</td></tr>`);
        if($("tabla-facturas-db")) $("tabla-facturas-db").innerHTML = h;
    });

    // USUARIOS
    if(uRol === 'admin') onSnapshot(collection(db, "usuarios"), s => {
        let h = ""; s.forEach(d => { const u = d.data(); h += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm"><div class="truncate pr-2"><div class="flex items-center gap-2"><span class="font-bold uppercase text-slate-700">${d.id}</span><span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold">${u.rol}</span></div><span class="text-[10px] text-indigo-400 block font-bold uppercase mt-1">${u.departamento || 'SIN DEPTO'}</span></div><div class="flex gap-2 flex-shrink-0"><button onclick="window.prepararEdicionUsuario('${d.id.replace(/'/g, "\\'")}','${u.pass}','${u.rol}','${u.email||''}','${u.departamento||''}')" class="w-8 h-8 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white transition"><i class="fas fa-pen text-xs"></i></button><button onclick="window.eliminarDato('usuarios','${d.id.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded bg-slate-50 text-red-400 hover:bg-red-500 hover:text-white transition"><i class="fas fa-trash-alt text-xs"></i></button></div></div>`; });
        if($("lista-usuarios-db")) $("lista-usuarios-db").innerHTML = h;
    });
};

window.renderHistorialUnificado = () => {
    if(!$("tabla-movimientos-unificados")) return;
    const a = ['admin', 'manager'].includes(window.usuarioActual.rol);
    const m = [...window.cacheEntradas.map(e => ({ ts: e.timestamp, h: `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="p-3 text-slate-400 text-[10px] font-mono whitespace-nowrap">${e.fecha.split(',')[0]}</td><td class="p-3 text-xs font-bold text-slate-600"><i class="fas fa-arrow-down text-emerald-500"></i> ENTRADA</td><td class="p-3 font-bold text-slate-700 uppercase text-xs">${e.insumo}</td><td class="p-3 text-sm font-bold text-slate-800 text-center">${e.cantidad}</td><td class="p-3 text-xs text-slate-500 uppercase">${e.usuario} ${e.motivo_edicion ? `<br><span class="text-[9px] text-amber-500 font-bold"><i class="fas fa-exclamation-triangle"></i> Editado: ${e.motivo_edicion}</span>` : ''}</td><td class="p-3"><div class="flex items-center gap-2"><span class="badge status-completado">completado</span>${a ? `<button onclick="window.abrirModalEditarEntrada('${e.id}','${e.insumo.replace(/'/g, "\\'")}',${e.cantidad})" class="w-7 h-7 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg"><i class="fas fa-pen text-[10px]"></i></button>` : ''}</div></td></tr>` })), ...window.cachePedidos.map(p => ({ ts: p.timestamp, h: `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="p-3 text-slate-400 text-[10px] font-mono whitespace-nowrap">${p.fecha.split(',')[0]}</td><td class="p-3 text-xs font-bold text-slate-600"><i class="fas fa-arrow-up text-amber-500"></i> SALIDA</td><td class="p-3 font-bold text-slate-700 uppercase text-xs">${p.insumoNom}</td><td class="p-3 text-sm font-bold text-slate-800 text-center">${p.cantidad}</td><td class="p-3 text-xs text-slate-500 uppercase">${p.usuarioId} (${p.ubicacion}) ${p.entregado_por ? `<br><span class="text-[9px] text-indigo-500 font-bold">Por: ${p.entregado_por}</span>` : ''}</td><td class="p-3"><span class="badge status-${p.estado}">${p.estado}</span></td></tr>` }))].sort((x,y) => y.ts - x.ts);
    $("tabla-movimientos-unificados").innerHTML = m.map(x=>x.h).join('');
};

window.actualizarDashboard = () => {
    const tD = $("dash-desde")?.value ? new Date($("dash-desde").value).getTime() : 0, tH = $("dash-hasta")?.value ? new Date($("dash-hasta").value).setHours(23,59,59,999) : Infinity;
    let sC = {}; window.cachePedidos.filter(p => p.timestamp >= tD && p.timestamp <= tH && p.estado !== 'rechazado').forEach(p => sC[p.ubicacion] = (sC[p.ubicacion] || 0) + p.cantidad);
    let lbl=[], dst=[]; document.querySelectorAll("#lista-inventario h4").forEach((e,i) => { lbl.push(e.title.substring(0,10)); dst.push(parseInt(document.querySelectorAll("#lista-inventario p.text-2xl")[i].innerText)); });
    window.renderChart('stockChart', lbl, dst, 'Stock', chartPalette, window.stockChart, c => window.stockChart = c); window.renderChart('locationChart', Object.keys(sC), Object.values(sC), 'Sedes', chartPalette, window.locationChart, c => window.locationChart = c);
};

// --- 5. LOGICA DE NEGOCIO ---
window.ajustarCantidad = (i,d) => { const sI = i.replace(/[^a-zA-Z0-9]/g, '_'); const n = Math.max(0, (window.carritoGlobal[i]||0) + d); window.carritoGlobal[i] = n; if($(`cant-${sI}`)) $(`cant-${sI}`).innerText = n; const r = $(`row-${sI}`); if(r) { r.className = `flex items-center justify-between p-3 rounded-xl border ${n>0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white"} transition-all shadow-sm item-tarjeta`; } };
window.procesarSolicitudMultiple = async () => {
    const ubi = $("sol-ubicacion").value, prio = $("sol-prioridad").value, items = Object.entries(window.carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || !items.length) return alert("Seleccione sede y al menos un producto.");
    const batch = writeBatch(db), ts = Date.now(), fs = new Date().toLocaleString(), bId = ts.toString();
    items.forEach(([ins, c]) => batch.set(doc(collection(db, "pedidos")), { usuarioId: window.usuarioActual.id, insumoNom: ins, cantidad: c, ubicacion: ubi, prioridad: prio, estado: "pendiente", fecha: fs, timestamp: ts, fecha_solicitud: fs, timestamp_solicitud: ts, batchId: bId }));
    try { await batch.commit(); window.enviarEmailNotificacion('nuevo_pedido', { usuario: window.usuarioActual.id, sede: ubi, items: items.map(([i, c]) => ({ insumo: i, cantidad: c })), prioridad: prio }); alert("✅ Pedido Enviado."); window.carritoGlobal = {}; $("sol-ubicacion").value=""; $("sol-prioridad").value="normal"; window.activarSincronizacion(); window.verPagina('notificaciones'); } catch(e) { alert("Error procesando pedido."); }
};

window.abrirModalFactura = () => { $("fact-proveedor").value=""; $("fact-gasto").value=""; $("fact-fecha").value=""; $("fact-archivo-url").value=""; $("factura-file-name").innerText="Ninguno"; window.toggleModal("modal-factura", true); };
window.guardarFactura = async () => {
    const pv = $("fact-proveedor").value.trim(), ga = parseFloat($("fact-gasto").value), fe = $("fact-fecha").value, ar = $("fact-archivo-url").value;
    if(!pv || isNaN(ga) || !fe) return alert("Complete los campos requeridos.");
    try { await addDoc(collection(db, "facturas"), { proveedor: pv, gasto: ga, fecha_compra: fe, archivo_url: ar, usuarioRegistro: window.usuarioActual.id, timestamp: Date.now(), fecha_registro: new Date().toLocaleString() }); alert("✅ Factura registrada."); window.toggleModal("modal-factura", false); } catch(e) { alert("Error guardando factura."); }
};

window.agregarProductoRapido = async () => {
    const n = $("nombre-prod").value.trim().toUpperCase(), c = parseInt($("cantidad-prod").value);
    if(n && c > 0) {
        const r = doc(db, "inventario", n.toLowerCase()), s = await getDoc(r);
        if(s.exists()) { await updateDoc(r, { cantidad: s.data().cantidad + c }); alert("✅ Stock actualizado."); } else { if(confirm("¿Crear nuevo?")) { await setDoc(r, { cantidad: c }); alert("✅ Producto creado."); } else return; }
        await addDoc(collection(db, "entradas_stock"), { insumo: n, cantidad: c, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() });
        window.toggleModal("modal-insumo", false); $("nombre-prod").value=""; $("cantidad-prod").value="";
    } else alert("Datos inválidos.");
};

window.abrirModalGrupo = (bK) => {
    const i = window.cachePedidos.filter(p => p.batchId === bK || p.timestamp.toString() === bK); if(!i.length) return;
    $("modal-grupo-titulo").innerHTML = `${i[0].usuarioId.toUpperCase()} | ${i[0].ubicacion} | ${i[0].fecha}`;
    $("modal-grupo-contenido").innerHTML = i.map(p => `<div class="flex justify-between items-center p-3 border-b border-slate-50 hover:bg-slate-50"><div><b class="uppercase text-sm text-slate-700">${p.insumoNom}</b> <span class="badge status-pri-${p.prioridad||'normal'} ml-1">${p.prioridad||'normal'}</span><br><span class="text-xs text-slate-400">Solicitado: ${p.cantidad}</span></div>${p.estado==='pendiente' && window.usuarioActual.rol!=='supervisor' ? `<div class="flex gap-2 items-center"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border border-slate-200 rounded text-center p-1 font-bold"><button onclick="window.gestionarPedido('${p.id.replace(/'/g, "\\'")}','aprobar','${p.insumoNom.replace(/'/g, "\\'")}')" class="text-white bg-emerald-500 p-1.5 rounded"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${p.id.replace(/'/g, "\\'")}','rechazar')" class="text-slate-400 border p-1.5 rounded hover:bg-red-50 hover:text-red-500"><i class="fas fa-times"></i></button></div>` : `<span class="badge status-${p.estado}">${p.estado}</span>`}</div>`).join('');
    window.toggleModal("modal-grupo-admin", true);
};

window.gestionarPedido = async (pid, act, ins) => {
    const pR = doc(db, "pedidos", pid), pD = (await getDoc(pR)).data(); let em = "";
    try { em = (await getDoc(doc(db, "usuarios", pD.usuarioId))).data()?.email; } catch(e){}
    if(act === 'aprobar') {
        const v = parseInt($(`qty-${pid}`)?.value || pD.cantidad), iR = doc(db, "inventario", ins.toLowerCase()), iS = await getDoc(iR);
        if(iS.exists() && iS.data().cantidad >= v) {
            const nS = iS.data().cantidad - v; await updateDoc(iR, { cantidad: nS });
            await updateDoc(pR, { estado: "aprobado", cantidad: v, entregado_por: window.usuarioActual.id, fecha_aprobado: new Date().toLocaleString(), timestamp_aprobado: Date.now() });
            if(em) window.enviarEmailNotificacion('aprobado_parcial', { usuario: pD.usuarioId, items: [{insumo:ins, cantidad:v}], target_email: em });
            if(nS <= (iS.data().stockMinimo || 0)) window.enviarEmailNotificacion('stock_bajo', { insumo: ins, actual: nS, minimo: iS.data().stockMinimo });
            if(!window.cachePedidos.filter(p => p.batchId === pD.batchId && p.estado === 'pendiente' && p.id !== pid).length) window.toggleModal("modal-grupo-admin", false); else window.abrirModalGrupo(pD.batchId);
        } else alert("Stock insuficiente.");
    } else { await updateDoc(pR, { estado: "rechazado", fecha_rechazo: new Date().toLocaleString() }); window.abrirModalGrupo(pD.batchId); }
};

window.confirmarRecibido = async (pid) => { if(confirm("¿Confirmar recepción?")) { const r = doc(db,"pedidos",pid), s = await getDoc(r); await updateDoc(r, { estado: "recibido", fecha_recibido: new Date().toLocaleString(), timestamp_recibido: Date.now() }); if(s.exists()) window.enviarEmailNotificacion('recibido', {usuario: window.usuarioActual.id, items:[{insumo:s.data().insumoNom, cantidad:s.data().cantidad}], sede:s.data().ubicacion}); } };
window.abrirIncidencia = (pid) => { $("incidencia-pid").value = pid; $("incidencia-detalle").value = ""; window.toggleModal('modal-incidencia', true); };
window.confirmarIncidencia = async (dev) => { const pid = $("incidencia-pid").value, det = $("incidencia-detalle").value.trim(); if(!det) return alert("Debe describir el motivo."); const r = doc(db, "pedidos", pid), d = (await getDoc(r)).data(); if(dev){ const ir = doc(db, "inventario", d.insumoNom.toLowerCase()), is = await getDoc(ir); if(is.exists()) await updateDoc(ir, { cantidad: is.data().cantidad + d.cantidad }); } await updateDoc(r, { estado: dev ? "devuelto" : "con_incidencia", detalleIncidencia: det, fecha_incidencia: new Date().toLocaleString() }); window.toggleModal('modal-incidencia', false); alert("Registrado."); };
window.abrirModalEditarEntrada = (id, ins, c) => { $("edit-entrada-id").value=id; $("edit-entrada-insumo").value=ins; $("edit-entrada-insumo-display").value=ins; $("edit-entrada-cant-original").value=c; $("edit-entrada-cantidad").value=c; $("edit-entrada-motivo").value=""; window.toggleModal('modal-editar-entrada', true); };
window.guardarEdicionEntrada = async () => { const id = $("edit-entrada-id").value, ins = $("edit-entrada-insumo").value.toLowerCase(), cO = parseInt($("edit-entrada-cant-original").value), cN = parseInt($("edit-entrada-cantidad").value), m = $("edit-entrada-motivo").value.trim(); if(isNaN(cN) || cN<0 || !m) return alert("Datos inválidos."); if(cN-cO === 0) return window.toggleModal('modal-editar-entrada', false); try { const ir = doc(db, "inventario", ins), is = await getDoc(ir); if(!is.exists()) return alert("El insumo ya no existe."); const ns = is.data().cantidad + (cN-cO); if(ns < 0) return alert("Error matemático: Stock negativo."); await updateDoc(ir, { cantidad: ns }); await updateDoc(doc(db, "entradas_stock", id), { cantidad: cN, motivo_edicion: m, editado_por: window.usuarioActual.id, fecha_edicion: new Date().toLocaleString() }); window.toggleModal('modal-editar-entrada', false); } catch(e) { alert("Error"); } };

// --- 6. EXCEL Y EMAILS ---
window.enviarEmailNotificacion = async (t, d) => { if(typeof emailjs === 'undefined') return; try { const as = t==='nuevo_pedido' ? `${d.prioridad==='alta'?'🚨 URGENTE: ':''}NUEVO PEDIDO - ${d.sede} - ${d.usuario}` : t.includes('aprobado') ? `PEDIDO APROBADO - ${d.usuario}` : t==='stock_bajo' ? `ALERTA STOCK - ${d.insumo}` : `RECEPCIÓN - ${d.sede}`, msg = t==='nuevo_pedido' ? `Usuario ${d.usuario} solicitó insumos para ${d.sede}.` : t==='stock_bajo' ? `Stock crítico para ${d.insumo}.` : t.includes('aprobado') ? `Su pedido ha sido aprobado.` : `Recepcion confirmada en ${d.sede}.`; await emailjs.send(EMAIL_CFG.s, EMAIL_CFG.t, { as, msg, detalles: (d.items ? d.items.map(i=>`${i.insumo}: ${i.cantidad}`).join('\\n') : `Actual: ${d.actual} | Mín: ${d.minimo}`), to_email: d.target_email || EMAIL_CFG.admin }, EMAIL_CFG.k); } catch(e){} };

window.descargarReporte = async () => {
    if(typeof XLSX === 'undefined') return alert("Cargando librería Excel, reintente en 1s.");
    const tD = $("rep-desde")?.value ? new Date($("rep-desde").value + 'T00:00:00').getTime() : 0, tH = $("rep-hasta")?.value ? new Date($("rep-hasta").value + 'T23:59:59').getTime() : Infinity;
    if(!confirm(`¿Descargar reporte Excel? ${tD||tH !== Infinity ? "Filtrado por fecha." : "Historial COMPLETO."}`)) return;
    const [sS, eS, pS, uS, fS] = await Promise.all([getDocs(collection(db, "inventario")), getDocs(collection(db, "entradas_stock")), getDocs(collection(db, "pedidos")), getDocs(collection(db, "usuarios")), getDocs(collection(db, "facturas"))]);
    const uM = {}; uS.forEach(u => uM[u.id] = u.data());
    const mFn = ts => ts ? `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][new Date(ts).getMonth()]} ${new Date(ts).getFullYear()}` : 'N/A', cT = (i,f) => i&&f ? (f-i)/60000<60 ? `${Math.round((f-i)/60000)} min` : ((f-i)/3600000).toFixed(1)<24 ? `${((f-i)/3600000).toFixed(1)} hrs` : `${((f-i)/86400000).toFixed(1)} días` : 'N/A';
    
    const dSt=[], dEn=[], dSa=[], dFa=[];
    sS.forEach(d => { const x=d.data(); dSt.push({ "Insumo": d.id.toUpperCase(), "Cantidad Disponible": x.cantidad||0, "Stock Mínimo": x.stockMinimo||0, "Precio Unit. ($)": x.precio||0 }); });
    eS.docs.map(x=>x.data()).filter(m => m.timestamp>=tD && m.timestamp<=tH).sort((a,b)=>b.timestamp-a.timestamp).forEach(m => dEn.push({ "Mes/Año": mFn(m.timestamp), "Fecha": m.fecha||'N/A', "Insumo": (m.insumo||'').toUpperCase(), "Cant.": m.cantidad||0, "Responsable": (m.usuario||'').toUpperCase() }));
    pS.docs.map(x=>x.data()).filter(m => m.timestamp>=tD && m.timestamp<=tH).sort((a,b)=>b.timestamp-a.timestamp).forEach(m => dSa.push({ "Mes/Año": mFn(m.timestamp), "ID": m.batchId||'N/A', "Fecha Sol.": m.fecha_solicitud||m.fecha||'N/A', "Prio": (m.prioridad||'N').toUpperCase(), "Insumo": (m.insumoNom||'').toUpperCase(), "Cant": m.cantidad||0, "Sede": (m.ubicacion||'').toUpperCase(), "Solicitante": (m.usuarioId||'').toUpperCase(), "Depto": (uM[m.usuarioId]?.departamento||'N/A').toUpperCase(), "Entregado Por": (m.entregado_por||'N/A').toUpperCase(), "Estado": (m.estado||'').toUpperCase(), "Resp. Time": cT(m.timestamp_solicitud||m.timestamp, m.timestamp_aprobado), "Entrega Time": cT(m.timestamp_aprobado, m.timestamp_recibido), "Notas": m.detalleIncidencia||'' }));
    fS.docs.map(x=>x.data()).filter(f => f.timestamp>=tD && f.timestamp<=tH).sort((a,b)=>b.timestamp-a.timestamp).forEach(f => dFa.push({ "Mes/Año": mFn(f.timestamp), "Fecha": f.fecha_compra||'N/A', "Proveedor": (f.proveedor||'').toUpperCase(), "Gasto ($)": f.gasto||0, "Registrado": (f.usuarioRegistro||'').toUpperCase(), "Doc URL": f.archivo_url||'Sin doc' }));
    
    if(!dEn.length && !dSa.length && !dFa.length) return alert("Sin movimientos en este rango.");
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dSt), "Inventario"); 
    if(dEn.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dEn), "Entradas"); if(dSa.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dSa), "Salidas"); if(dFa.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dFa), "Facturas");
    XLSX.writeFile(wb, `Reporte_FCILog_${tD||tH !== Infinity ? 'Filtrado' : new Date().toISOString().slice(0, 10)}.xlsx`);
};

// --- 7. ADMIN Y MISC ---
window.guardarUsuario = async () => { const i=$("new-user").value.trim().toLowerCase(), p=$("new-pass").value.trim(); if(!i||!p) return alert("Faltan datos."); await setDoc(doc(db,"usuarios",i),{pass:p,rol:$("new-role").value,email:$("new-email").value.trim(),departamento:$("new-dept").value.trim().toUpperCase()},{merge:true}); alert("Usuario guardado."); window.cancelarEdicionUsuario(); };
window.prepararEdicionUsuario = (i,p,r,e,d) => { $("edit-mode-id").value=i; $("new-user").value=i; $("new-user").disabled=true; $("new-pass").value=p; $("new-email").value=e; $("new-dept").value=d; $("new-role").value=r; $("btn-guardar-usuario").innerText="Actualizar"; window.toggleModal("cancel-edit-msg", true); };
window.cancelarEdicionUsuario = () => { $("edit-mode-id").value=""; $("new-user").value=""; $("new-user").disabled=false; $("new-pass").value=""; $("new-email").value=""; $("new-dept").value=""; $("btn-guardar-usuario").innerText="Guardar"; window.toggleModal("cancel-edit-msg", false); };
window.prepararEdicionProducto = async(id) => { const d = (await getDoc(doc(db,"inventario",id))).data(); $("edit-prod-id").value=id; $("edit-prod-precio").value=d.precio||''; $("edit-prod-min").value=d.stockMinimo||''; $("edit-prod-img").value=d.imagen||''; if(d.imagen){ $("preview-img").src=d.imagen; window.toggleModal("preview-img", true); } else window.toggleModal("preview-img", false); window.toggleModal('modal-detalles', true); };
window.guardarDetallesProducto = async () => { await updateDoc(doc(db,"inventario",$("edit-prod-id").value),{precio:parseFloat($("edit-prod-precio").value)||0,stockMinimo:parseInt($("edit-prod-min").value)||0,imagen:$("edit-prod-img").value}); window.cerrarModalDetalles(); alert("Guardado"); };
window.cerrarModalDetalles = () => { window.toggleModal("modal-detalles", false); window.toggleModal("preview-img", false); };
window.eliminarDato = async (c,i) => { if(confirm("¿Eliminar registro?")) await deleteDoc(doc(db,c,i)); };
window.renderChart = (id, l, d, t, c, i, s) => { if(!$(id)) return; if(i) i.destroy(); s(new Chart($(id), { type: id==='locationChart'?'doughnut':'bar', data: { labels: l, datasets: [{ label: t, data: d, backgroundColor: c, borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: id==='locationChart', position: 'bottom' } } } })); };

window.addEventListener('DOMContentLoaded', () => {
    try {
        if(typeof emailjs !== "undefined") emailjs.init(EMAIL_CFG.k);
        const ses = localStorage.getItem("fcilog_session"); if(ses) window.cargarSesion(JSON.parse(ses));
        
        if (typeof cloudinary !== "undefined") {
            window.cloudinaryWidget = cloudinary.createUploadWidget({cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos'}, (e, r) => { if (!e && r?.event === "success") { $("edit-prod-img").value = r.info.secure_url; $("preview-img").src = r.info.secure_url; window.toggleModal("preview-img", true); } });
            if($("upload_widget")) { const nBtn = $("upload_widget").cloneNode(true); $("upload_widget").parentNode.replaceChild(nBtn, $("upload_widget")); nBtn.addEventListener("click", e => { e.preventDefault(); window.cloudinaryWidget?.open(); }, false); }

            window.cloudinaryFacturasWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local'], clientAllowedFormats: ["png", "jpg", "jpeg", "pdf", "doc", "docx", "xls", "xlsx"], multiple: false, folder: 'fcilog_facturas', resourceType: 'auto' }, (e, r) => { if (!e && r?.event === "success") { $("fact-archivo-url").value = r.info.secure_url; $("factura-file-name").innerText = `${r.info.original_filename}.${r.info.format}`; } });
            if($("btn-upload-factura")) { const nBtnF = $("btn-upload-factura").cloneNode(true); $("btn-upload-factura").parentNode.replaceChild(nBtnF, $("btn-upload-factura")); nBtnF.addEventListener("click", e => { e.preventDefault(); window.cloudinaryFacturasWidget?.open(); }, false); }
        }
    } catch(e) {}
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIONES GLOBALES
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EMAILJS_PUBLIC_KEY = "2jVnfkJKKG0bpKN-U"; 
const EMAILJS_SERVICE_ID = "service_a7yozqh";
const EMAILJS_TEMPLATE_ID = "template_zglatmb";

if(EMAILJS_PUBLIC_KEY) emailjs.init(EMAILJS_PUBLIC_KEY);

window.usuarioActual = null;
window.carritoGlobal = {};
window.carritoCompras = {};
window.cachePedidos = [];
window.todosLosGrupos = ["SERVICIOS GENERALES"];
window.grupoActivo = "SERVICIOS GENERALES";
window.miGraficoStock = null;
window.miGraficoUbicacion = null;
window.html5QrcodeScanner = null;

window.configCorreosData = {};
window.configStockData = {};
window.adminEmailGlobal = "";
window.stockAlertEmailGlobal = "";

const chartPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#14b8a6', '#3b82f6', '#f97316', '#a855f7', '#ef4444'];
let rawInventario = [], rawEntradas = [], rawFacturas = [], rawMantenimiento = [], rawActivos = [], rawCompras = [];
window.pedidosRaw = [];
let timeoutBusqueda;

// ==========================================
// 2. DEFINICIÓN DE FUNCIONES (HOISTING SEGURO)
// ==========================================

// PERMISOS Y UTILIDADES
window.tienePermiso = function(modulo, accion = 'ver') {
    if (!window.usuarioActual) return false;
    if (window.usuarioActual.id === 'admin') return true; 
    if (!window.usuarioActual.permisos || !window.usuarioActual.permisos[modulo]) return false;
    if (accion === 'ver') return window.usuarioActual.permisos[modulo].ver === true || window.usuarioActual.permisos[modulo].gestionar === true;
    return window.usuarioActual.permisos[modulo].gestionar === true;
};

window.formatoTiempoDiferencia = function(t1, t2) {
    let diffMs = Math.abs(t2 - t1);
    let diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return diffMins + "m";
    let diffHrs = Math.floor(diffMins / 60);
    let rem = diffMins % 60;
    if (diffHrs < 24) return diffHrs + "h " + rem + "m";
    return Math.floor(diffHrs / 24) + "d " + (diffHrs % 24) + "h";
};

window.enviarNotificacionEmail = async function(correoDestino, asunto, mensaje) {
    try { await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: correoDestino, subject: asunto, message: mensaje }); } 
    catch (error) { console.error("Error email:", error); }
};

window.solicitarPermisosNotificacion = function() { if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") { Notification.requestPermission(); } };
window.enviarNotificacionNavegador = function(titulo, cuerpo) { if ("Notification" in window && Notification.permission === "granted") { new Notification(titulo, { body: cuerpo, icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png" }); } };

window.debounceFiltrarTarjetas = function(idContenedor, texto) {
    clearTimeout(timeoutBusqueda); timeoutBusqueda = setTimeout(() => { const term = texto.toLowerCase(); const container = document.getElementById(idContenedor); if(container) { container.querySelectorAll('.item-tarjeta').forEach(c => { c.style.display = c.innerText.toLowerCase().includes(term) ? '' : 'none'; }); } }, 150);
};

window.debounceFiltrarTabla = function(idTabla, texto) {
    clearTimeout(timeoutBusqueda); timeoutBusqueda = setTimeout(() => { const term = texto.toLowerCase(); document.querySelectorAll(`#${idTabla} tr`).forEach(f => { f.style.display = f.innerText.toLowerCase().includes(term) ? '' : 'none'; }); }, 150);
};

window.verPagina = function(id) {
    document.querySelectorAll(".view").forEach(v => { v.classList.add("hidden"); v.classList.remove("animate-fade-in"); });
    const t = document.getElementById(`pag-${id}`); if(t) { t.classList.remove("hidden"); setTimeout(() => t.classList.add("animate-fade-in"), 10); }
    if(window.innerWidth < 768) window.toggleMenu(false);
};

window.toggleMenu = function(forceState) {
    const sb = document.getElementById("sidebar"); const ov = document.getElementById("sidebar-overlay"); if(!sb || !ov) return;
    const isClosed = sb.classList.contains("-translate-x-full"); const shouldOpen = forceState !== undefined ? forceState : isClosed;
    if (shouldOpen) { sb.classList.remove("-translate-x-full"); ov.classList.remove("hidden"); sb.style.zIndex = "100"; ov.style.zIndex = "90"; } 
    else { sb.classList.add("-translate-x-full"); ov.classList.add("hidden"); }
};

window.switchTab = function(tab) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden')); document.getElementById(`tab-content-${tab}`)?.classList.remove('hidden');
    const onC = "flex-1 py-3 rounded-xl text-sm font-black bg-white text-indigo-600 shadow-sm transition"; const offC = "flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 transition";
    if(tab === 'activos') { document.getElementById('tab-btn-activos').className = onC; document.getElementById('tab-btn-historial').className = offC; } 
    else { document.getElementById('tab-btn-historial').className = onC; document.getElementById('tab-btn-activos').className = offC; }
};

// RENDERIZADO VISUAL
window.renderChart = function(id, labels, data, title, palette, chartInstance, setInstance) {
    const ctx = document.getElementById(id); if(!ctx) return;
    if(chartInstance && typeof chartInstance.destroy === 'function') chartInstance.destroy();
    
    // Obtener color del tema actual para la fuente
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'medium';
    const textColor = isDark ? '#cbd5e1' : '#64748b';
    
    const bgColors = id === 'locationChart' ? palette : palette.map(c=>c+'CC');
    const newChart = new Chart(ctx, {
        type: id === 'locationChart' ? 'doughnut' : 'bar',
        data: { labels: labels, datasets: [{ label: title, data: data, backgroundColor: bgColors, borderColor: palette, borderWidth: 1, borderRadius: id === 'locationChart' ? 0 : 5 }] },
        options: { responsive: true, maintainAspectRatio: false, color: textColor, plugins: { legend: { display: id === 'locationChart', position: 'bottom', labels: { color: textColor } } }, scales: id === 'locationChart' ? {} : { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
    });
    setInstance(newChart);
};

window.actualizarDashboard = function() {
    if(!window.cachePedidos) return;
    const desdeInput = document.getElementById("dash-desde")?.value; const hastaInput = document.getElementById("dash-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity; if(desdeInput) tDesde = new Date(desdeInput + 'T00:00:00').getTime(); if(hastaInput) tHasta = new Date(hastaInput + 'T23:59:59').getTime();

    const panelFiltros = document.getElementById("panel-filtros-dashboard");
    if(panelFiltros && window.tienePermiso('dashboard', 'gestionar')) {
        if(!document.getElementById("btn-excel-dashboard")) { panelFiltros.insertAdjacentHTML('beforeend', `<button id="btn-excel-dashboard" onclick="window.descargarReporte()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow"><i class="fas fa-file-excel"></i> Excel</button>`); }
    } else if (document.getElementById("btn-excel-dashboard")) { document.getElementById("btn-excel-dashboard").remove(); }

    let pedidosFiltrados = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta);
    if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pedidosFiltrados.filter(p => p.estado === 'pendiente').length;

    let sedesCount = {}; pedidosFiltrados.forEach(p => { if(p.estado !== 'rechazado') sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad; });

    const activosFiltrados = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo && a.timestamp >= tDesde && a.timestamp <= tHasta);
    if(document.getElementById("metrica-activos")) document.getElementById("metrica-activos").innerText = activosFiltrados.length;
    if(document.getElementById("metrica-activos-fallas")) document.getElementById("metrica-activos-fallas").innerText = activosFiltrados.filter(a => ['En Mantenimiento', 'Fuera de Servicio'].includes(a.estado)).length;

    const mantFiltrados = rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo && m.estado !== 'completado' && m.timestamp >= tDesde && m.timestamp <= tHasta);
    if(document.getElementById("metrica-mant-pend")) document.getElementById("metrica-mant-pend").innerText = mantFiltrados.length;

    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let lblS = [], datS = []; invActivo.forEach(p => { const n = p.id || 'N/A'; lblS.push(n.toUpperCase().substring(0,10)); datS.push(p.cantidad); });
    window.renderChart('stockChart', lblS, datS, 'Stock', chartPalette, window.miGraficoStock, ch => window.miGraficoStock = ch);
    window.renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Demandas', chartPalette, window.miGraficoUbicacion, ch => window.miGraficoUbicacion = ch);
};

window.renderHistorialUnificado = function() {
    const t = document.getElementById("tabla-movimientos-unificados"); if(!t) return;
    const panelFiltros = document.getElementById("panel-filtros-historial");
    if(panelFiltros && window.tienePermiso('historial', 'gestionar')) {
        if(!document.getElementById("btn-excel-historial")) { panelFiltros.insertAdjacentHTML('beforeend', `<button id="btn-excel-historial" onclick="window.descargarReporte()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 shadow ml-2"><i class="fas fa-file-excel"></i> Exportar Todo</button>`); }
    } else if (document.getElementById("btn-excel-historial")) { document.getElementById("btn-excel-historial").remove(); }

    let html = "";
    const ent = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo).map(e => ({ ts: e.timestamp, fecha: e.fecha || new Date(e.timestamp).toLocaleString(), tipo: '📥 ENTRADA', insumo: e.insumo || 'N/A', cant: e.cantidad || 0, solicito: e.usuario || 'SISTEMA', acepto: 'DIRECTO', motivo: e.motivo_edicion || 'Ingreso Almacén', tiempo: 'N/A', id: e.id }));
    const sal = window.cachePedidos.map(p => { let tProc = (p.timestamp_aprobado && p.timestamp) ? window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado) : 'PEND'; return { ts: p.timestamp, fecha: p.fecha || new Date(p.timestamp).toLocaleString(), tipo: '📤 SALIDA', insumo: p.insumoNom || 'N/A', cant: p.cantidad || 0, solicito: p.usuarioId || 'N/A', acepto: p.entregado_por || (p.estado === 'pendiente' ? 'ESPERANDO' : 'RECHAZADO'), motivo: p.notas || 'Sin notas', tiempo: tProc, id: p.id }; });
    const isGestor = window.tienePermiso('historial', 'gestionar');
    
    const combinados = [...ent, ...sal].sort((a,b) => b.ts - a.ts);
    if (combinados.length === 0) { t.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-bold">No hay registros.</td></tr>`; return; }

    combinados.forEach(h => {
        let btnEdit = (h.tipo === '📥 ENTRADA' && isGestor) ? `<button onclick="window.abrirModalEditarEntrada('${h.id}', '${h.insumo.replace(/'/g,"\\'")}', ${h.cant})" class="text-amber-500 hover:text-amber-600 transition ml-2"><i class="fas fa-pen bg-amber-50 p-1.5 rounded"></i></button>` : '';
        html += `<tr class="border-b hover:bg-slate-50 transition"><td class="p-4 text-[10px] font-mono whitespace-nowrap">${h.fecha.split(',')[0]}</td><td class="p-4 font-black text-xs">${h.tipo}</td><td class="p-4 font-bold uppercase text-xs text-slate-700">${h.insumo}</td><td class="p-4 font-black text-center text-indigo-600">${h.cant}</td><td class="p-4 text-[10px] uppercase font-bold text-slate-500">${h.solicito}</td><td class="p-4 text-[10px] uppercase font-bold text-emerald-600">${h.acepto}</td><td class="p-4 text-[10px] italic text-slate-400 max-w-[150px] truncate" title="${h.motivo}">${h.motivo} ${btnEdit}</td><td class="p-4 text-[10px] font-black text-indigo-400">${h.tiempo}</td></tr>`;
    });
    t.innerHTML = html;
};

window.renderCompras = function() {
    const btnComprar = document.getElementById("panel-registrar-compra");
    if(window.tienePermiso('compras', 'gestionar') && btnComprar) btnComprar.classList.remove("hidden");
    const tb = document.getElementById("lista-compras-db"); if(!tb) return; let html = "";
    const comprasGrupo = rawCompras.filter(c => (c.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    const isGestor = window.tienePermiso('compras', 'gestionar');

    comprasGrupo.forEach(c => {
        let badge = c.estado === 'recibido' ? `<span class="badge status-recibido">Recibido</span>` : `<span class="badge status-pendiente animate-pulse">En Tránsito</span>`;
        let itemsList = `<ul class="text-[11px] text-slate-600 font-medium mt-3 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 h-24 overflow-y-auto custom-scroll shadow-inner">`;
        let totalCosto = 0;
        c.items.forEach(i => { let pStr = i.precio > 0 ? `($${i.precio.toFixed(2)})` : ''; itemsList += `<li><span class="font-black text-slate-800">${i.cantidad}x</span> ${i.insumo} <span class="text-emerald-600 font-bold ml-1">${pStr}</span></li>`; totalCosto += i.precio; });
        itemsList += `</ul>`;
        let btnRecibir = "";
        if (c.estado !== 'recibido' && isGestor) { btnRecibir = `<button onclick="window.confirmarRecepcionCompra('${c.id}')" class="bg-emerald-500 text-white px-4 py-3 rounded-xl text-xs font-black shadow-lg hover:bg-emerald-600 mt-4 w-full transition flex items-center justify-center gap-2"><i class="fas fa-box-open text-lg"></i> Recibir Físico</button>`; }
        let trashBtn = isGestor ? `<button onclick="window.eliminarDato('compras','${c.id}')" class="text-red-300 hover:text-red-500 bg-red-50 p-1.5 rounded-lg transition"><i class="fas fa-trash text-xs"></i></button>` : '';
        html += `<div class="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col justify-between hover:shadow-lg transition"><div class="flex justify-between items-start mb-2"><div>${badge}<h4 class="font-black text-slate-800 uppercase text-base mt-2">${c.proveedor}</h4></div>${trashBtn}</div><p class="text-[10px] font-mono text-slate-400 mt-1">Fac: <span class="font-bold">${c.factura || 'N/A'}</span> • ${c.fecha_compra}</p>${itemsList}<div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-100"><span class="text-[10px] uppercase text-indigo-500 font-black tracking-wide"><i class="fas fa-user mr-1 text-indigo-300"></i> ${c.registrado_por}</span><span class="text-emerald-600 font-black text-lg">$${totalCosto.toFixed(2)}</span></div>${btnRecibir}</div>`;
    });
    tb.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay compras registradas en este grupo.</p>`;
};

window.renderListaInsumos = function() {
    const contenedor = document.getElementById("contenedor-lista-insumos"); if(!contenedor) return;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    if(invFiltrado.length === 0) { contenedor.innerHTML = `<p class="text-center text-slate-400 text-xs py-4">No hay insumos creados aún.</p>`; return; }
    contenedor.innerHTML = invFiltrado.map(p => {
        const nombre = (p.id || '').toUpperCase(); const jsId = (p.id || '').replace(/'/g, "\\'");
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-10 h-10 object-cover rounded-lg border border-slate-200">` : `<div class="w-10 h-10 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center text-slate-300"><i class="fas fa-box"></i></div>`;
        return `<div onclick="window.seleccionarInsumoParaEntrada('${jsId}')" class="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition item-tarjeta mb-3"><div class="flex items-center gap-3 flex-1 min-w-0 pr-2">${img}<div class="flex-1 min-w-0"><p class="font-black text-xs uppercase text-slate-800 break-words whitespace-normal leading-tight">${nombre}</p><p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Stock Actual: <span class="text-indigo-600">${p.cantidad || 0}</span></p></div></div><i class="fas fa-chevron-right text-indigo-300 text-xs flex-shrink-0"></i></div>`;
    }).join('');
};

window.procesarDatosInventario = function() {
    const grid = document.getElementById("lista-inventario"); const cartContainer = document.getElementById("contenedor-lista-pedidos"); const dataList = document.getElementById("lista-sugerencias"); const datalistCompras = document.getElementById("lista-sugerencias-compras");
    if(!grid) return; let gridHTML = ""; let cartHTML = ""; let listHTML = ""; let tr = 0, ts = 0;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const isGestor = window.tienePermiso('stock', 'gestionar');
    
    invFiltrado.forEach(p => {
        const nombre = (p.id || '').toUpperCase(); const safeId = (p.id || '').replace(/[^a-zA-Z0-9]/g, '_'); const jsId = (p.id || '').replace(/'/g, "\\'"); tr++; ts += (p.cantidad || 0); listHTML += `<option value="${nombre}">`;
        let controls = isGestor ? `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 p-1.5 rounded transition"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 p-1.5 rounded transition"><i class="fas fa-trash"></i></button></div>` : "";
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-14 h-14 object-cover rounded-xl border border-slate-200 shadow-sm mb-3">` : `<div class="w-14 h-14 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-300 mb-3 shadow-inner"><i class="fas fa-image text-xl"></i></div>`;
        const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo); const border = isLow ? "border-2 border-red-400 bg-red-50" : "border border-slate-200 bg-white";
        
        gridHTML += `<div class="${border} p-5 rounded-[1.5rem] shadow-sm hover:shadow-md transition flex flex-col item-tarjeta h-full"><div class="flex justify-between items-start mb-2">${img}${controls}</div><h4 class="font-black text-slate-800 text-xs break-words whitespace-normal leading-tight flex-1" title="${nombre}">${nombre} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse inline-block ml-1"></i>':''}</h4><div class="flex justify-between items-end mt-4 pt-4 border-t border-slate-100"><p class="text-3xl font-black text-indigo-900">${p.cantidad || 0}</p>${p.precio ? `<span class="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">$${p.precio}</span>` : ''}</div></div>`;

        if(cartContainer && p.cantidad > 0) {
            const enCarro = window.carritoGlobal[p.id] || 0; const active = enCarro > 0 ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white";
            cartHTML += `<div id="row-${safeId}" class="flex items-center justify-between p-4 rounded-xl border ${active} transition-all shadow-sm item-tarjeta mb-3"><div class="flex items-center gap-4 flex-1 min-w-0 pr-3">${p.imagen?`<img src="${p.imagen}" loading="lazy" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-200">`:''}<div class="flex-1 min-w-0"><p class="font-black text-xs uppercase text-slate-800 break-words whitespace-normal leading-tight">${nombre}</p><p class="text-[10px] text-indigo-500 font-bold mt-1">Disponible: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1.5 border border-slate-200 flex-shrink-0 z-10 shadow-sm"><button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition flex items-center justify-center">-</button><span id="cant-${safeId}" class="w-8 text-center font-black text-indigo-700 text-sm">${enCarro}</span><button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-700 transition flex items-center justify-center" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
        }
    });
    grid.innerHTML = gridHTML; if(cartContainer) cartContainer.innerHTML = cartHTML || `<div class="flex flex-col items-center justify-center py-10 text-slate-400"><i class="fas fa-shopping-basket text-4xl mb-3 opacity-50"></i><p class="text-xs font-medium">Aún no has seleccionado insumos.</p></div>`;
    if(dataList) dataList.innerHTML = listHTML; if(datalistCompras) datalistCompras.innerHTML = listHTML;
    if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = tr; if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = ts;
    window.actualizarDashboard(); window.renderListaInsumos();
};

window.procesarDatosPedidos = function() {
    window.cachePedidos = window.pedidosRaw.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let grupos = {}; let htmlAdmin = "", htmlActive = "", htmlHistory = "";
    window.cachePedidos.forEach(p => {
        const bKey = p.batchId || p.timestamp;
        if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp, notas: p.notas || '' };
        grupos[bKey].items.push(p);
    });
    const misPedidos = window.cachePedidos.filter(p => p.usuarioId === window.usuarioActual?.id).sort((a,b) => b.timestamp - a.timestamp);
    
    misPedidos.forEach(p => {
        let btns = "";
        if(p.estado === 'aprobado') { btns = `<div class="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-3"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-emerald-600 transition flex items-center gap-1"><i class="fas fa-check-circle"></i> Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-50 transition flex items-center gap-1"><i class="fas fa-exclamation-triangle"></i> Reportar</button></div>`; } 
        else if(['recibido', 'devuelto'].includes(p.estado)) { btns = `<div class="mt-4 pt-3 border-t border-slate-100 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-600 text-xs font-bold hover:underline bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 transition"><i class="fas fa-undo mr-1"></i> Devolver / Reportar</button></div>`; }
        
        const prio = p.prioridad || 'normal'; const notesHtml = p.notas ? `<div class="mt-3 bg-amber-50 p-2.5 rounded-xl border border-amber-100"><p class="text-[9px] font-black text-amber-600 uppercase mb-1">Tu Nota:</p><p class="text-[11px] text-amber-900 italic font-medium">"${p.notas}"</p></div>` : '';
        let tiemposHtml = `<div class="mt-3 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] font-mono text-slate-600 shadow-inner"><div class="flex justify-between items-center"><span class="flex items-center gap-1.5"><i class="fas fa-clock text-slate-400"></i> Pedido:</span> <span class="font-bold">${new Date(p.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>`;
        if (p.timestamp_aprobado) tiemposHtml += `<div class="flex justify-between items-center"><span class="flex items-center gap-1.5"><i class="fas fa-user-check text-indigo-500"></i> Atendido:</span> <span class="font-bold">${new Date(p.timestamp_aprobado).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-1 font-black">+${window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado)}</span></span></div>`;
        if (p.timestamp_recibido) tiemposHtml += `<div class="flex justify-between items-center text-emerald-700"><span class="flex items-center gap-1.5"><i class="fas fa-box-open"></i> Recibido:</span> <span class="font-bold">${new Date(p.timestamp_recibido).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-1 font-black">+${window.formatoTiempoDiferencia(p.timestamp_aprobado || p.timestamp, p.timestamp_recibido)}</span></span></div>`;
        if (p.entregado_por) tiemposHtml += `<div class="flex justify-between items-center text-slate-700 mt-2 border-t border-slate-200 pt-2"><span class="flex items-center gap-1.5"><i class="fas fa-handshake text-slate-400"></i> Entregado por:</span> <span class="font-black uppercase">${p.entregado_por}</span></div>`;
        tiemposHtml += `</div>`;

        const cardHtml = `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm item-tarjeta"><div class="flex justify-between items-start mb-2"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-800 uppercase text-sm mt-2 break-words whitespace-normal leading-tight">${p.insumoNom} <span class="badge status-pri-${prio} inline-block ml-1 shadow-sm">${prio}</span></h4><p class="text-xs text-indigo-600 font-black mt-1">x${p.cantidad} <span class="text-slate-400 font-medium ml-1">• ${p.ubicacion}</span></p><p class="text-[10px] text-slate-400 mt-1">${(p.fecha||'').split(',')[0]}</p></div></div>${notesHtml}${tiemposHtml}${btns}</div>`;
        if(['pendiente', 'aprobado'].includes(p.estado)) htmlActive += cardHtml; else htmlHistory += cardHtml;
    });

    if(window.tienePermiso('aprobaciones', 'gestionar')) {
        Object.values(grupos).sort((a,b) => b.ts - a.ts).forEach(g => {
            const pendingItems = g.items.filter(i => i.estado === 'pendiente');
            if(pendingItems.length > 0) {
                let itemsStr = ""; const hasAlta = pendingItems.some(i => (i.prioridad || 'normal') === 'alta');
                const badgeUrgente = hasAlta ? `<span class="bg-red-500 text-white px-2 py-1 rounded text-[9px] uppercase font-black animate-pulse ml-2 shadow-sm">Urgente</span>` : '';
                const blockNota = g.notas ? `<div class="mb-4 text-[11px] text-indigo-800 bg-indigo-50 p-3 rounded-xl italic border border-indigo-100 shadow-inner">"${g.notas}"</div>` : '';
                pendingItems.forEach(i => { itemsStr += `<span class="bg-white px-3 py-1.5 rounded-lg text-[10px] border border-slate-200 uppercase font-black text-slate-700 break-words whitespace-normal text-left shadow-sm">${i.insumoNom} (x${i.cantidad})</span>`; });
                const timeStr = new Date(g.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                htmlAdmin += `<div class="bg-white p-6 rounded-[2rem] border-l-8 ${hasAlta?'border-l-red-500':'border-l-amber-400'} border-y border-r border-slate-200 shadow-md cursor-pointer group hover:shadow-lg transition" onclick="window.abrirModalGrupo('${g.items[0].batchId || g.ts}')"><div class="flex justify-between items-start mb-4"><div><h4 class="font-black text-slate-900 text-base uppercase flex items-center"><i class="fas fa-user-circle text-slate-300 mr-2 text-xl"></i> ${g.user} ${badgeUrgente}</h4><span class="text-xs text-slate-500 font-bold mt-1 block"><i class="fas fa-map-marker-alt text-slate-300 w-4"></i> ${g.sede} <br><i class="fas fa-calendar-alt text-slate-300 w-4 mt-1"></i> ${(g.date||'').split(',')[0]} a las ${timeStr}</span></div><span class="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition shadow-sm"><i class="fas fa-chevron-right text-sm"></i></span></div>${blockNota}<div class="flex flex-wrap gap-2">${itemsStr}</div></div>`;
            }
        });
    }
    if(document.getElementById("lista-pendientes-admin")) document.getElementById("lista-pendientes-admin").innerHTML = htmlAdmin || `<p class="col-span-full text-slate-400 text-sm font-medium">No hay solicitudes pendientes.</p>`;
    if(document.getElementById("tab-content-activos")) document.getElementById("tab-content-activos").innerHTML = htmlActive || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No tienes solicitudes en curso.</p>`;
    if(document.getElementById("tab-content-historial")) document.getElementById("tab-content-historial").innerHTML = htmlHistory || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay historial.</p>`;
};

// ==========================================
// 10. ACCIONES CRUD LOGÍSTICAS
// ==========================================
window.procesarSolicitudMultiple = async function() {
    const ubi = document.getElementById("sol-ubicacion").value; const prio = document.getElementById("sol-prioridad").value; const notas = document.getElementById("sol-notas").value.trim();
    const items = Object.entries(window.carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede y al menos un producto.");
    const batchId = Date.now().toString(); const ts = Date.now(); const fs = new Date().toLocaleString(); const fIso = new Date().toISOString().split('T')[0];
    
    try {
        const batch = writeBatch(db); let detalleInsumos = "";
        items.forEach(([ins, cant]) => {
            detalleInsumos += `- ${cant}x ${ins}\n`;
            batch.set(doc(collection(db, "pedidos")), { usuarioId: window.usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi, prioridad: prio, notas: notas, grupo: window.grupoActivo, estado: "pendiente", fecha: fs, fecha_iso: fIso, timestamp: ts, batchId: batchId });
        });
        await batch.commit();
        
        if(window.adminEmailGlobal) {
            const mensajeAlmacen = `El usuario ${window.usuarioActual.id.toUpperCase()} ha realizado un nuevo pedido de insumos.\n\nSede destino: ${ubi}\nPrioridad: ${prio.toUpperCase()}\n\nInsumos solicitados:\n${detalleInsumos}\nNotas: ${notas || 'Ninguna'}`;
            window.enviarNotificacionEmail(window.adminEmailGlobal, `Nuevo Pedido de Insumos - ${window.usuarioActual.id.toUpperCase()}`, mensajeAlmacen);
        }

        window.carritoGlobal = {}; document.getElementById("sol-ubicacion").value=""; document.getElementById("sol-notas").value=""; window.procesarDatosInventario(); window.verPagina('notificaciones');
    } catch (error) { alert("Error procesando solicitud."); }
};

window.gestionarPedido = async function(pid, accion, ins) {
    const pRef = doc(db, "pedidos", pid); const pData = (await getDoc(pRef)).data();
    if(accion === 'aprobar') {
        const val = parseInt(document.getElementById(`qty-${pid}`).value); const iRef = doc(db, "inventario", ins); const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= val) {
            const nuevoStock = iSnap.data().cantidad - val; const stockMinimo = iSnap.data().stockMinimo || 0;
            await updateDoc(iRef, { cantidad: nuevoStock });
            await updateDoc(pRef, { estado: "aprobado", cantidad: val, entregado_por: window.usuarioActual.id, timestamp_aprobado: Date.now(), fecha_aprobado: new Date().toLocaleString() });
            
            if(nuevoStock <= stockMinimo && stockMinimo > 0 && window.stockAlertEmailGlobal) {
                const msg = `Alerta de Stock Crítico en InsuManager.\n\nEl insumo: ${ins.toUpperCase()}\nSe ha reducido a ${nuevoStock} unidades (El mínimo es ${stockMinimo}).\n\nPor favor proceda con la reposición.`;
                window.enviarNotificacionEmail(window.stockAlertEmailGlobal, `🔴 STOCK BAJO: ${ins.toUpperCase()}`, msg);
            }
            const pend = window.cachePedidos.filter(p => p.batchId === pData.batchId && p.estado === 'pendiente' && p.id !== pid);
            if(pend.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden"); else window.abrirModalGrupo(pData.batchId);
        } else { alert("Error: Stock insuficiente."); }
    } else {
        await updateDoc(pRef, { estado: "rechazado", timestamp_aprobado: Date.now(), fecha_aprobado: new Date().toLocaleString() }); window.abrirModalGrupo(pData.batchId);
    }
};

window.abrirModalGrupo = function(bKey) {
    const items = window.cachePedidos.filter(p => p.batchId === bKey || p.timestamp.toString() === bKey); if(items.length===0) return;
    document.getElementById("modal-grupo-titulo").innerHTML = `${items[0].usuarioId.toUpperCase()} | ${items[0].ubicacion}`;
    if(items[0].notas) { document.getElementById("modal-grupo-notas").innerHTML = `"${items[0].notas}"`; document.getElementById("modal-grupo-notas-container").classList.remove('hidden'); } else { document.getElementById("modal-grupo-notas-container").classList.add('hidden'); }
    let h = "";
    items.forEach(p => {
        let act = `<span class="badge status-${p.estado}">${p.estado}</span>`;
        if(p.estado === 'pendiente' && window.tienePermiso('aprobaciones', 'gestionar')) { act = `<div class="flex gap-2"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border rounded text-center font-bold text-xs"><button onclick="window.gestionarPedido('${p.id}','aprobar','${p.insumoNom.replace(/'/g,"\\'")}')" class="text-white bg-emerald-500 px-2 rounded"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${p.id}','rechazar')" class="text-red-400 bg-red-50 px-2 rounded"><i class="fas fa-times"></i></button></div>`; }
        h += `<div class="flex justify-between items-center p-3 border-b"><div class="text-xs"><b>${p.insumoNom}</b> <span class="badge status-pri-${p.prioridad}">${p.prioridad}</span><br>Cant: ${p.cantidad}</div>${act}</div>`;
    });
    document.getElementById("modal-grupo-contenido").innerHTML = h; document.getElementById("modal-grupo-admin").classList.remove("hidden");
};

// ==========================================
// 11. INICIALIZACIÓN FINAL Y CLOUDINARY
// ==========================================
const inicializarApp = function() {
    const sesion = localStorage.getItem("fcilog_session");
    if(sesion) window.cargarSesion(JSON.parse(sesion));
    
    if (typeof cloudinary !== "undefined") {
        window.cloudinaryEditProdWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('edit-prod-img').value = result.info.secure_url; const preview = document.getElementById('preview-img'); preview.src = result.info.secure_url; preview.classList.remove('hidden'); } }); document.getElementById("btn-upload-edit-prod")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryEditProdWidget.open(); }, false);
        window.cloudinaryActivosWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_activos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('activo-img-url').value = result.info.secure_url; const p = document.getElementById('activo-preview-img'); p.src = result.info.secure_url; p.classList.remove('hidden'); } }); document.getElementById("btn-upload-activo")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryActivosWidget.open(); }, false);
        window.cloudinaryBitacoraWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, folder: 'fcilog_bitacora', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('bitacora-media-url').value = result.info.secure_url; const b = document.getElementById('bitacora-media-badge'); const formatoArchivo = (result.info && result.info.format) ? result.info.format.toUpperCase() : "ADJUNTO"; b.innerText = formatoArchivo; b.classList.remove('hidden'); } }); document.getElementById("btn-upload-bitacora")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryBitacoraWidget.open(); }, false);
        window.cloudinaryActivosBitacoraWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, folder: 'fcilog_activos_bitacora', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('activo-bitacora-url').value = result.info.secure_url; const b = document.getElementById('activo-bitacora-badge'); b.innerText = (result.info.format || 'DOC').toUpperCase(); b.classList.remove('hidden'); } }); document.getElementById("btn-upload-activo-bitacora")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryActivosBitacoraWidget.open(); }, false);
        window.cloudinaryFacturasWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local'], multiple: false, folder: 'fcilog_facturas', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('fact-archivo-url').value = result.info.secure_url; document.getElementById('factura-file-name').innerText = result.info.original_filename || "Documento"; } }); document.getElementById("btn-upload-factura")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryFacturasWidget.open(); }, false);
    }
};

window.addEventListener('DOMContentLoaded', inicializarApp);

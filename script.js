import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ==========================================
// 1. CONFIGURACIÓN FIREBASE Y EMAILJS
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EMAILJS_PUBLIC_KEY = "TU_PUBLIC_KEY_AQUI"; 
const EMAILJS_SERVICE_ID = "TU_SERVICE_ID_AQUI";
const EMAILJS_TEMPLATE_ID = "TU_TEMPLATE_ID_AQUI";

if(EMAILJS_PUBLIC_KEY !== "TU_PUBLIC_KEY_AQUI") {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

// ==========================================
// 2. VARIABLES GLOBALES
// ==========================================
window.usuarioActual = null;
window.carritoGlobal = {};
window.carritoCompras = {};
window.cachePedidos = [];
window.todosLosGrupos = ["SERVICIOS GENERALES"];
window.grupoActivo = "SERVICIOS GENERALES";
window.miGraficoStock = null;
window.miGraficoUbicacion = null;
window.html5QrcodeScanner = null;
window.adminEmailGlobal = "";
window.stockAlertEmailGlobal = "";

const chartPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#14b8a6', '#3b82f6', '#f97316', '#a855f7', '#ef4444'];
let rawInventario = [];
let rawEntradas = [];
let rawFacturas = [];
let rawMantenimiento = [];
let rawActivos = [];
let rawCompras = [];
window.pedidosRaw = [];
let timeoutBusqueda;

// ==========================================
// 3. UTILIDADES Y PERMISOS (CARGADAS PRIMERO)
// ==========================================
window.tienePermiso = (permiso) => {
    if (!window.usuarioActual) return false;
    if (window.usuarioActual.rol === 'admin') return true;
    return window.usuarioActual.permisos && window.usuarioActual.permisos[permiso] === true;
};

window.formatoTiempoDiferencia = (t1, t2) => {
    let diffMs = Math.abs(t2 - t1);
    let diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return diffMins + "m";
    let diffHrs = Math.floor(diffMins / 60);
    let rem = diffMins % 60;
    if (diffHrs < 24) return diffHrs + "h " + rem + "m";
    return Math.floor(diffHrs / 24) + "d " + (diffHrs % 24) + "h";
};

window.enviarNotificacionEmail = async (correoDestino, asunto, mensaje) => {
    if(EMAILJS_PUBLIC_KEY === "TU_PUBLIC_KEY_AQUI") return;
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: correoDestino, subject: asunto, message: mensaje });
    } catch (error) { console.error("Error enviando email:", error); }
};

window.solicitarPermisosNotificacion = () => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
};

window.enviarNotificacionNavegador = (titulo, cuerpo) => {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(titulo, { body: cuerpo, icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png" });
    }
};

window.debounceFiltrarTarjetas = (idContenedor, texto) => {
    clearTimeout(timeoutBusqueda);
    timeoutBusqueda = setTimeout(() => {
        const term = texto.toLowerCase();
        const container = document.getElementById(idContenedor);
        if(container) {
            container.querySelectorAll('.item-tarjeta').forEach(c => {
                c.style.display = c.innerText.toLowerCase().includes(term) ? '' : 'none';
            });
        }
    }, 150);
};

window.debounceFiltrarTabla = (idTabla, texto) => {
    clearTimeout(timeoutBusqueda);
    timeoutBusqueda = setTimeout(() => {
        const term = texto.toLowerCase();
        document.querySelectorAll(`#${idTabla} tr`).forEach(f => {
            f.style.display = f.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
    }, 150);
};

// ==========================================
// 4. FUNCIONES DE RENDERIZADO VISUAL
// ==========================================
window.renderChart = (id, labels, data, title, palette, chartInstance, setInstance) => {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(chartInstance && typeof chartInstance.destroy === 'function') chartInstance.destroy();
    const bgColors = id === 'locationChart' ? palette : palette.map(c=>c+'CC');
    const newChart = new Chart(ctx, {
        type: id === 'locationChart' ? 'doughnut' : 'bar',
        data: { labels: labels, datasets: [{ label: title, data: data, backgroundColor: bgColors, borderColor: palette, borderWidth: 1, borderRadius: id === 'locationChart' ? 0 : 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: id === 'locationChart', position: 'bottom' } } }
    });
    setInstance(newChart);
};

window.actualizarDashboard = () => {
    if(!window.cachePedidos) return;
    const desdeInput = document.getElementById("dash-desde")?.value;
    const hastaInput = document.getElementById("dash-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity;
    if(desdeInput) tDesde = new Date(desdeInput + 'T00:00:00').getTime();
    if(hastaInput) tHasta = new Date(hastaInput + 'T23:59:59').getTime();

    let pedidosFiltrados = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta);
    if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pedidosFiltrados.filter(p => p.estado === 'pendiente').length;

    let sedesCount = {};
    pedidosFiltrados.forEach(p => { if(p.estado !== 'rechazado') sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad; });

    const activosFiltrados = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo && a.timestamp >= tDesde && a.timestamp <= tHasta);
    if(document.getElementById("metrica-activos")) document.getElementById("metrica-activos").innerText = activosFiltrados.length;
    if(document.getElementById("metrica-activos-fallas")) document.getElementById("metrica-activos-fallas").innerText = activosFiltrados.filter(a => ['En Mantenimiento', 'Fuera de Servicio'].includes(a.estado)).length;

    const mantFiltrados = rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo && m.estado !== 'completado' && m.timestamp >= tDesde && m.timestamp <= tHasta);
    if(document.getElementById("metrica-mant-pend")) document.getElementById("metrica-mant-pend").innerText = mantFiltrados.length;

    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let lblS = [], datS = [];
    invActivo.forEach(p => { lblS.push((p.id || 'N/A').toUpperCase().substring(0,10)); datS.push(p.cantidad); });
    window.renderChart('stockChart', lblS, datS, 'Stock', chartPalette, window.miGraficoStock, ch => window.miGraficoStock = ch);
    window.renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Demandas', chartPalette, window.miGraficoUbicacion, ch => window.miGraficoUbicacion = ch);
};

window.renderMantenimiento = () => {
    const tb = document.getElementById("tabla-mantenimiento-db");
    if(!tb) return;
    let html = "";
    const mantGrupo = rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    mantGrupo.forEach(m => {
        let badgeHtml = "", actions = "";
        if (m.estado === 'completado') {
            badgeHtml = `<span class="badge status-recibido mb-1">Completado</span>`;
        } else if (m.estado === 'en_proceso') {
            badgeHtml = `<span class="badge status-aprobado mb-1 animate-pulse">En Proceso</span>`;
            actions = `<button onclick="window.completarMantenimiento('${m.id}')" class="text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow mr-1 mb-1 transition"><i class="fas fa-flag-checkered"></i> Finalizar</button>`;
        } else {
            badgeHtml = `<span class="badge status-pendiente">Pendiente</span>`;
            actions = `<button onclick="window.iniciarMantenimiento('${m.id}')" class="text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-[10px] font-bold mr-1 mb-1 transition"><i class="fas fa-play"></i> Iniciar</button>`;
        }
        actions += `<button onclick="window.abrirBitacora('${m.id}')" class="text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition"><i class="fas fa-book"></i> Bitácora</button>`;
        const trashBtn = window.tienePermiso('activos') ? `<button onclick="window.eliminarDato('mantenimiento','${m.id}')" class="text-red-400 hover:text-red-600 ml-2 p-1"><i class="fas fa-trash"></i></button>` : '';
        let notifTag = m.fecha_notificacion ? `<br><span class="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 rounded mt-1 inline-block"><i class="fas fa-bell"></i> ${m.fecha_notificacion}</span>` : '';
        html += `<tr class="hover:bg-slate-50 border-b border-slate-100 transition ${m.estado === 'completado' ? 'bg-slate-50/50' : ''}"><td class="p-4 align-top w-32">${badgeHtml}</td><td class="p-4 font-bold text-slate-700 uppercase text-xs align-top">${m.equipo}</td><td class="p-4 text-slate-500 text-xs font-mono font-medium align-top">${m.fecha_programada}${notifTag}</td><td class="p-4 text-indigo-600 text-[10px] font-bold uppercase align-top">${m.responsable}</td><td class="p-4 text-right align-top"><div class="flex flex-wrap justify-end gap-1">${actions}${trashBtn}</div></td></tr>`;
    });
    tb.innerHTML = html || '<tr><td colspan="5" class="p-4 text-center text-slate-400">No hay mantenimientos.</td></tr>';
};

window.renderActivos = () => {
    const list = document.getElementById("lista-activos-db");
    if(!list) return;
    let html = "";
    const activosFiltrados = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    const isAdmin = window.tienePermiso('activos');
    
    // AQUÍ ESTÁ EL DISEÑO ANTERIOR RESTAURADO CON LA LÓGICA CORRECTA DE PERMISOS
    activosFiltrados.forEach(a => {
        const jsId = a.id.replace(/'/g, "\\'");
        const img = a.imagen ? `<img src="${a.imagen}" loading="lazy" class="w-16 h-16 object-cover rounded-xl border border-slate-200">` : `<div class="w-16 h-16 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-300"><i class="fas fa-desktop text-2xl"></i></div>`;
        let bColor = "bg-emerald-50 text-emerald-600 border-emerald-200";
        if(a.estado === "En Mantenimiento") bColor = "bg-amber-50 text-amber-600 border-amber-200";
        if(a.estado === "Fuera de Servicio") bColor = "bg-red-50 text-red-600 border-red-200";
        if(a.estado === "Almacenado") bColor = "bg-slate-50 text-slate-600 border-slate-200";
        
        let controls = isAdmin ? `<button onclick="window.abrirModalActivo('${jsId}')" class="text-slate-400 hover:text-indigo-500 p-1 transition"><i class="fas fa-pen text-xs"></i></button><button onclick="window.eliminarDato('activos','${jsId}')" class="text-slate-400 hover:text-red-500 p-1 transition"><i class="fas fa-trash text-xs"></i></button>` : "";
        
        html += `
        <div class="bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition flex flex-col item-tarjeta">
            <div class="flex justify-between items-start mb-3">
                <span class="px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider ${bColor}">${a.estado || 'Activo'}</span>
                <div class="flex gap-1">${controls}</div>
            </div>
            <div class="flex items-center gap-4 mb-4">
                ${img}
                <div class="truncate flex-1">
                    <h4 class="font-black text-slate-700 text-sm uppercase truncate" title="${a.nombre}">${a.nombre}</h4>
                    <p class="text-[10px] text-slate-400 font-mono mt-0.5">${a.id}</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase mt-1 truncate">${a.marca || ''}</p>
                </div>
            </div>
            <div class="flex justify-between items-end mt-auto pt-3 border-t border-slate-50">
                <div class="text-[10px] text-slate-400">
                    <p><i class="fas fa-map-marker-alt text-slate-300 w-3"></i> ${a.ubicacion || 'N/A'}</p>
                    <p class="mt-1"><i class="fas fa-tags text-slate-300 w-3"></i> ${a.categoria || 'N/A'}</p>
                </div>
                <button onclick="window.abrirDetallesActivo('${jsId}')" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm"><i class="fas fa-eye"></i> Detalles</button>
            </div>
        </div>`;
    });
    list.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm">No hay activos registrados en este grupo.</p>`;
};

window.renderHistorialUnificado = () => {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    let html = "";
    const ent = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo).map(e => ({ id: e.id, f: e.fecha || new Date(e.timestamp).toLocaleString(), ts: e.timestamp, t: 'ENTRADA', ins: e.insumo || 'N/A', c: e.cantidad || 0, det: `${e.usuario || 'N/A'} ${e.motivo_edicion ? `(Edit: ${e.motivo_edicion})` : ''}`, est: 'completado' }));
    const sal = window.cachePedidos.map(p => ({ id: p.id, f: p.fecha || new Date(p.timestamp).toLocaleString(), ts: p.timestamp, t: 'SALIDA', ins: p.insumoNom || 'N/A', c: p.cantidad || 0, det: `${p.usuarioId || 'N/A'} (${p.ubicacion || 'N/A'})`, est: p.estado || 'N/A' }));
    const isAdmin = window.tienePermiso('comprar') || window.tienePermiso('aprobar');
    const combinados = [...ent, ...sal].sort((a,b) => b.ts - a.ts);
    if (combinados.length === 0) {
        t.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No hay movimientos registrados.</td></tr>`;
        return;
    }
    combinados.forEach(h => {
        let btn = `<span class="badge status-${h.est}">${h.est}</span>`;
        if(h.t === 'ENTRADA' && isAdmin) {
            btn = `<div class="flex gap-2">${btn}<button onclick="window.abrirModalEditarEntrada('${h.id}', '${h.ins.replace(/'/g,"\\'")}', ${h.c})" class="text-amber-500 hover:text-amber-600"><i class="fas fa-pen"></i></button></div>`;
        }
        html += `<tr class="border-b border-slate-50 hover:bg-slate-50/50 transition"><td class="p-3 text-[10px] font-mono whitespace-nowrap">${h.f.split(',')[0]}</td><td class="p-3 text-xs font-bold whitespace-nowrap">${h.t==='ENTRADA'?'📥':'📤'} ${h.t}</td><td class="p-3 font-bold uppercase text-xs">${h.ins}</td><td class="p-3 font-bold text-center">${h.c}</td><td class="p-3 text-[10px] uppercase">${h.det}</td><td class="p-3">${btn}</td></tr>`;
    });
    t.innerHTML = html;
};

window.procesarDatosFacturas = () => {
    const tb = document.getElementById("tabla-facturas-db");
    if(!tb) return;
    const factGrupo = rawFacturas.filter(f => (f.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    let html = "";
    factGrupo.forEach(f => {
        const docLink = f.archivo_url ? `<a href="${f.archivo_url}" target="_blank" class="text-indigo-500 hover:text-indigo-700 font-bold"><i class="fas fa-file-pdf"></i> Ver</a>` : 'N/A';
        const trashBtn = ['admin','manager'].includes(window.usuarioActual?.rol) ? `<button onclick="window.eliminarDato('facturas','${f.id}')" class="text-red-400 hover:text-red-600 ml-2"><i class="fas fa-trash"></i></button>` : '';
        html += `<tr class="border-b border-slate-50"><td class="p-4 text-xs font-mono">${f.fecha_compra}</td><td class="p-4 text-xs font-bold uppercase">${f.proveedor}</td><td class="p-4 text-xs font-black text-emerald-600 text-right">$${f.gasto.toFixed(2)}</td><td class="p-4 text-xs text-center uppercase">${f.usuarioRegistro}</td><td class="p-4 text-xs text-center">${docLink}</td><td class="p-4 text-center">${trashBtn}</td></tr>`;
    });
    tb.innerHTML = html || '<tr><td colspan="6" class="p-4 text-center text-slate-400">No hay facturas registradas.</td></tr>';
};

window.renderListaInsumos = () => {
    const contenedor = document.getElementById("contenedor-lista-insumos");
    if(!contenedor) return;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    if(invFiltrado.length === 0) {
        contenedor.innerHTML = `<p class="text-center text-slate-400 text-xs py-4">No hay insumos creados aún.</p>`;
        return;
    }
    contenedor.innerHTML = invFiltrado.map(p => {
        const nombre = (p.id || '').toUpperCase();
        const jsId = (p.id || '').replace(/'/g, "\\'");
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-10 h-10 object-cover rounded-lg border">` : `<div class="w-10 h-10 bg-white rounded-lg border flex items-center justify-center text-slate-300"><i class="fas fa-box text-lg"></i></div>`;
        return `<div onclick="window.seleccionarInsumoParaEntrada('${jsId}')" class="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm cursor-pointer hover:border-indigo-100 hover:bg-indigo-50/50 transition item-tarjeta mb-2"><div class="flex items-center gap-3 flex-1 min-w-0 pr-2">${img}<div class="flex-1 min-w-0"><p class="font-bold text-xs uppercase text-slate-700 break-words whitespace-normal leading-tight">${nombre}</p><p class="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">Stock: ${p.cantidad || 0}</p></div></div><i class="fas fa-chevron-right text-indigo-300 text-xs flex-shrink-0"></i></div>`;
    }).join('');
};

window.procesarDatosInventario = () => {
    const grid = document.getElementById("lista-inventario");
    const cartContainer = document.getElementById("contenedor-lista-pedidos");
    const dataList = document.getElementById("lista-sugerencias");
    const datalistCompras = document.getElementById("lista-sugerencias-compras");
    if(!grid) return;
    let gridHTML = ""; let cartHTML = ""; let listHTML = ""; let tr = 0, ts = 0;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const isAdmin = window.tienePermiso('recibir');
    
    invFiltrado.forEach(p => {
        const nombre = (p.id || '').toUpperCase(); const safeId = (p.id || '').replace(/[^a-zA-Z0-9]/g, '_'); const jsId = (p.id || '').replace(/'/g, "\\'"); 
        tr++; ts += (p.cantidad || 0); listHTML += `<option value="${nombre}">`;
        let controls = isAdmin ? `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>` : "";
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-12 h-12 object-cover rounded-lg border mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
        const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo); const border = isLow ? "border-2 border-red-500 bg-red-50" : "border border-slate-100 bg-white";
        gridHTML += `<div class="${border} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col item-tarjeta h-full"><div class="flex justify-between items-start mb-2">${img}${controls}</div><h4 class="font-bold text-slate-700 text-xs break-words whitespace-normal leading-tight flex-1" title="${nombre}">${nombre} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse inline-block ml-1"></i>':''}</h4><div class="flex justify-between items-end mt-3 pt-3 border-t border-slate-50"><p class="text-2xl font-black text-slate-800">${p.cantidad || 0}</p>${p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : ''}</div></div>`;

        if(cartContainer && p.cantidad > 0) {
            const enCarro = window.carritoGlobal[p.id] || 0; const active = enCarro > 0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white";
            cartHTML += `<div id="row-${safeId}" class="flex items-center justify-between p-3 rounded-xl border ${active} transition-all shadow-sm item-tarjeta mb-2"><div class="flex items-center gap-3 flex-1 min-w-0 pr-3">${p.imagen?`<img src="${p.imagen}" loading="lazy" class="w-10 h-10 rounded-md object-cover flex-shrink-0">`:''}<div class="flex-1 min-w-0"><p class="font-bold text-xs uppercase text-slate-700 break-words whitespace-normal leading-tight">${nombre}</p><p class="text-[10px] text-slate-400 mt-1">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0 z-10"><button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition">-</button><span id="cant-${safeId}" class="w-8 text-center font-bold text-indigo-600 text-sm">${enCarro}</span><button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-600 transition" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
        }
    });
    grid.innerHTML = gridHTML;
    if(cartContainer) cartContainer.innerHTML = cartHTML || `<p class="text-center text-slate-400 text-xs py-8">Vacío.</p>`;
    if(dataList) dataList.innerHTML = listHTML;
    if(datalistCompras) datalistCompras.innerHTML = listHTML;
    if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = tr;
    if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = ts;
    window.actualizarDashboard(); window.renderListaInsumos();
};

window.renderCompras = () => {
    const btnComprar = document.getElementById("panel-registrar-compra");
    if(window.tienePermiso('comprar') && btnComprar) btnComprar.classList.remove("hidden");
    const tb = document.getElementById("lista-compras-db");
    if(!tb) return;
    let html = "";
    const comprasGrupo = rawCompras.filter(c => (c.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    comprasGrupo.forEach(c => {
        let badge = c.estado === 'recibido' ? `<span class="badge status-recibido">Recibido</span>` : `<span class="badge status-pendiente animate-pulse">En Tránsito</span>`;
        let itemsList = `<ul class="text-[11px] text-slate-600 font-medium mt-3 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100 h-24 overflow-y-auto custom-scroll shadow-inner">`;
        let totalCosto = 0;
        c.items.forEach(i => { 
            let pStr = i.precio > 0 ? `($${i.precio.toFixed(2)})` : '';
            itemsList += `<li><span class="font-black text-slate-800">${i.cantidad}x</span> ${i.insumo} <span class="text-emerald-600 font-bold ml-1">${pStr}</span></li>`; 
            totalCosto += i.precio; 
        });
        itemsList += `</ul>`;
        let btnRecibir = "";
        if (c.estado !== 'recibido' && window.tienePermiso('recibir')) {
            btnRecibir = `<button onclick="window.confirmarRecepcionCompra('${c.id}')" class="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black shadow hover:bg-emerald-600 mt-4 w-full transition flex items-center justify-center gap-2"><i class="fas fa-box-open text-lg"></i> Recibir Inventario Físico</button>`;
        }
        let trashBtn = window.tienePermiso('comprar') ? `<button onclick="window.eliminarDato('compras','${c.id}')" class="text-red-300 hover:text-red-500 transition"><i class="fas fa-trash text-xs"></i></button>` : '';
        html += `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm flex flex-col justify-between"><div class="flex justify-between items-start mb-2"><div>${badge}<h4 class="font-black text-slate-800 uppercase text-base mt-2">${c.proveedor}</h4></div>${trashBtn}</div><p class="text-[10px] font-mono text-slate-400 mt-1">Factura: <span class="font-bold">${c.factura || 'N/A'}</span> • ${c.fecha_compra}</p>${itemsList}<div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-100"><span class="text-[10px] uppercase text-indigo-500 font-black tracking-wide"><i class="fas fa-user mr-1 text-indigo-300"></i> ${c.registrado_por}</span><span class="text-emerald-600 font-black text-lg">$${totalCosto.toFixed(2)}</span></div>${btnRecibir}</div>`;
    });
    tb.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay compras registradas en este grupo.</p>`;
};

window.procesarDatosPedidos = () => {
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
        if(p.estado === 'aprobado') {
            btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end gap-2"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow">Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold">Reportar</button></div>`;
        } else if(['recibido', 'devuelto'].includes(p.estado)) {
            btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-500 text-xs font-bold hover:underline"><i class="fas fa-undo"></i> Devolver / Reportar</button></div>`;
        }
        const prio = p.prioridad || 'normal';
        const notesHtml = p.notas ? `<p class="text-[10px] text-slate-500 mt-2 bg-slate-50 p-1.5 rounded border border-slate-100 italic">"${p.notas}"</p>` : '';
        let tiemposHtml = `<div class="mt-3 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px] font-mono text-slate-500"><div class="flex justify-between items-center"><span class="flex items-center gap-1"><i class="fas fa-clock text-slate-400"></i> Pedido:</span> <span class="font-bold">${new Date(p.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>`;
        if (p.timestamp_aprobado) tiemposHtml += `<div class="flex justify-between items-center"><span class="flex items-center gap-1"><i class="fas fa-user-check text-indigo-400"></i> Atendido:</span> <span class="font-bold">${new Date(p.timestamp_aprobado).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded ml-1">+${window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado)}</span></span></div>`;
        if (p.timestamp_recibido) tiemposHtml += `<div class="flex justify-between items-center text-emerald-600"><span class="flex items-center gap-1"><i class="fas fa-box-open"></i> Recibido:</span> <span class="font-bold">${new Date(p.timestamp_recibido).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded ml-1">+${window.formatoTiempoDiferencia(p.timestamp_aprobado || p.timestamp, p.timestamp_recibido)}</span></span></div>`;
        if (p.entregado_por) tiemposHtml += `<div class="flex justify-between items-center text-slate-600 mt-1 border-t border-slate-200 pt-1"><span class="flex items-center gap-1"><i class="fas fa-handshake text-slate-400"></i> Entregado por:</span> <span class="font-bold uppercase">${p.entregado_por}</span></div>`;
        tiemposHtml += `</div>`;

        const cardHtml = `<div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm item-tarjeta"><div class="flex justify-between items-start"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-700 uppercase text-sm mt-2 break-words whitespace-normal leading-tight">${p.insumoNom} <span class="badge status-pri-${prio} inline-block ml-1">${prio}</span></h4><p class="text-xs text-slate-400 font-mono mt-1">x${p.cantidad} • ${p.ubicacion}</p><p class="text-[10px] text-slate-300 mt-1">${(p.fecha||'').split(',')[0]}</p></div></div>${notesHtml}${tiemposHtml}${btns}</div>`;
        if(['pendiente', 'aprobado'].includes(p.estado)) htmlActive += cardHtml; else htmlHistory += cardHtml;
    });

    if(window.tienePermiso('aprobar')) {
        Object.values(grupos).sort((a,b) => b.ts - a.ts).forEach(g => {
            const pendingItems = g.items.filter(i => i.estado === 'pendiente');
            if(pendingItems.length > 0) {
                let itemsStr = ""; const hasAlta = pendingItems.some(i => (i.prioridad || 'normal') === 'alta');
                const badgeUrgente = hasAlta ? `<span class="bg-red-500 text-white px-2 py-1 rounded text-[9px] uppercase font-black animate-pulse ml-2 shadow-sm">Urgente</span>` : '';
                const blockNota = g.notas ? `<div class="mb-3 text-[11px] text-indigo-700 bg-indigo-50/50 p-2 rounded-lg italic">"${g.notas}"</div>` : '';
                pendingItems.forEach(i => { itemsStr += `<span class="bg-slate-50 px-2 py-1 rounded text-[10px] border border-slate-200 uppercase font-bold text-slate-600 break-words whitespace-normal text-left">${i.insumoNom} (x${i.cantidad})</span>`; });
                const timeStr = new Date(g.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                htmlAdmin += `<div class="bg-white p-5 rounded-2xl border-l-4 ${hasAlta?'border-l-red-500':'border-l-amber-400'} shadow-sm cursor-pointer group" onclick="window.abrirModalGrupo('${g.items[0].batchId || g.ts}')"><div class="flex justify-between items-center mb-3"><div><h4 class="font-black text-slate-800 text-sm uppercase flex items-center"><i class="fas fa-user text-slate-300 mr-1"></i> ${g.user} ${badgeUrgente}</h4><span class="text-xs text-slate-400 font-medium">${g.sede} • ${(g.date||'').split(',')[0]} a las ${timeStr}</span></div><span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition"><i class="fas fa-chevron-right text-xs"></i></span></div>${blockNota}<div class="flex flex-wrap gap-1.5">${itemsStr}</div></div>`;
            }
        });
    }
    if(document.getElementById("lista-pendientes-admin")) document.getElementById("lista-pendientes-admin").innerHTML = htmlAdmin || `<p class="col-span-full text-slate-400 text-sm">No hay solicitudes pendientes.</p>`;
    if(document.getElementById("tab-content-activos")) document.getElementById("tab-content-activos").innerHTML = htmlActive || `<p class="col-span-full text-center text-slate-400 py-10 text-sm">No tienes solicitudes en curso.</p>`;
    if(document.getElementById("tab-content-historial")) document.getElementById("tab-content-historial").innerHTML = htmlHistory || `<p class="col-span-full text-center text-slate-400 py-10 text-sm">No hay historial.</p>`;
    window.actualizarDashboard();
};


// ==========================================
// 5. ACCIONES CRUD GLOBALES
// ==========================================
window.ajustarCantidad = (idInsumo, delta) => {
    const safeId = idInsumo.replace(/[^a-zA-Z0-9]/g, '_');
    const n = Math.max(0, (window.carritoGlobal[idInsumo] || 0) + delta);
    window.carritoGlobal[idInsumo] = n;
    const el = document.getElementById(`cant-${safeId}`);
    if(el) el.innerText = n;
    const row = document.getElementById(`row-${safeId}`);
    if(row) {
        if(n > 0){
            row.classList.add("border-indigo-500", "bg-indigo-50/50");
            row.classList.remove("border-slate-100", "bg-white");
        } else {
            row.classList.remove("border-indigo-500", "bg-indigo-50/50");
            row.classList.add("border-slate-100", "bg-white");
        }
    }
};

window.agregarItemCompra = () => {
    const insumo = document.getElementById("compra-insumo").value.trim().toUpperCase();
    const cant = parseInt(document.getElementById("compra-cant").value);
    const precio = parseFloat(document.getElementById("compra-precio").value) || 0;
    if(!insumo || isNaN(cant) || cant <= 0) return alert("Completa Insumo y Cantidad válida.");
    if(!window.carritoCompras) window.carritoCompras = {};
    window.carritoCompras[insumo] = { cantidad: cant, precio: precio };
    window.renderCarritoCompras();
    document.getElementById("compra-insumo").value = "";
    document.getElementById("compra-cant").value = "";
    document.getElementById("compra-precio").value = "";
    document.getElementById("compra-insumo").focus();
};

window.renderCarritoCompras = () => {
    const container = document.getElementById("lista-items-compra");
    let items = Object.entries(window.carritoCompras || {});
    if(items.length === 0) { container.innerHTML = `<p class="text-xs text-slate-400 text-center italic py-2">Sin items añadidos</p>`; return; }
    let html = ""; let total = 0;
    items.forEach(([ins, data]) => {
        let pStr = data.precio > 0 ? `<span class="text-emerald-600 font-bold">$${data.precio.toFixed(2)}</span>` : '';
        html += `<div class="flex justify-between items-center bg-white p-2 rounded border border-slate-100 text-xs font-bold text-slate-700 mb-1"><span>${data.cantidad}x ${ins}</span><div class="flex items-center gap-3">${pStr}<button onclick="delete window.carritoCompras['${ins}']; window.renderCarritoCompras()" class="text-red-400 hover:text-red-600 transition"><i class="fas fa-times"></i></button></div></div>`;
        total += data.precio;
    });
    if(total > 0) html += `<div class="text-right text-xs font-black text-slate-800 mt-2 pr-2">Total: <span class="text-emerald-600">$${total.toFixed(2)}</span></div>`;
    container.innerHTML = html;
};

window.procesarCompra = async () => {
    const prov = document.getElementById("compra-proveedor").value.trim().toUpperCase();
    const fact = document.getElementById("compra-factura").value.trim().toUpperCase();
    const items = Object.entries(window.carritoCompras || {});
    if(!prov || items.length === 0) return alert("Proveedor y al menos 1 ítem son requeridos.");
    const itemsArray = items.map(([ins, data]) => ({ insumo: ins, cantidad: data.cantidad, precio: data.precio }));
    try {
        await addDoc(collection(db, "compras"), {
            proveedor: prov, factura: fact, items: itemsArray, estado: "en_transito",
            grupo: window.grupoActivo, registrado_por: window.usuarioActual.id,
            fecha_compra: new Date().toLocaleString(), timestamp: Date.now()
        });
        window.carritoCompras = {};
        window.renderCarritoCompras();
        document.getElementById("compra-proveedor").value = "";
        document.getElementById("compra-factura").value = "";
        alert("Compra en tránsito generada.");
    } catch(e) {
        alert("Error registrando compra.");
    }
};

window.confirmarRecepcionCompra = async (compraId) => {
    if(!confirm("¿Confirmas recibir la compra en físico? Esto sumará el stock al inventario general.")) return;
    const cRef = doc(db, "compras", compraId);
    try {
        const cSnap = await getDoc(cRef);
        if(!cSnap.exists()) return;
        const cData = cSnap.data();
        const batch = writeBatch(db);
        for (const item of cData.items) {
            const iRef = doc(db, "inventario", item.insumo);
            const iSnap = await getDoc(iRef);
            if (iSnap.exists()) {
                batch.update(iRef, { cantidad: iSnap.data().cantidad + item.cantidad });
            } else {
                batch.set(iRef, { cantidad: item.cantidad, precio: 0, stockMinimo: 0, grupo: window.grupoActivo });
            }
            const hRef = doc(collection(db, "entradas_stock"));
            batch.set(hRef, {
                insumo: item.insumo, cantidad: item.cantidad, grupo: window.grupoActivo,
                usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(),
                timestamp: Date.now(), motivo_edicion: `Recepción Compra: ${cData.factura || cData.proveedor}`
            });
        }
        batch.update(cRef, {
            estado: "recibido", recibido_por: window.usuarioActual.id,
            fecha_recepcion: new Date().toLocaleString(), timestamp_recepcion: Date.now()
        });
        await batch.commit();
        alert("✅ Inventario actualizado con los items de la compra.");
    } catch(e) {
        console.error(e);
        alert("Error en la recepción de la compra.");
    }
};

// EDICIÓN PRODUCTO
window.prepararEdicionProducto = async(id) => {
    const s = await getDoc(doc(db,"inventario",id));
    const d = s.data();
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('edit-prod-precio').value = d.precio || '';
    document.getElementById('edit-prod-min').value = d.stockMinimo || '';
    if (d.imagen) {
        document.getElementById('edit-prod-img').value = d.imagen;
        document.getElementById('preview-img').src = d.imagen;
        document.getElementById('preview-img').classList.remove('hidden');
    } else {
        document.getElementById('edit-prod-img').value = '';
        document.getElementById('preview-img').classList.add('hidden');
    }
    document.getElementById('qr-insumo-id-text').innerText = "ID: " + id.toUpperCase();
    document.getElementById('qr-insumo-img').src = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=" + encodeURIComponent(id);
    document.getElementById('modal-detalles').classList.remove('hidden');
};

window.guardarDetallesProducto = async () => {
    const imgUrl = document.getElementById('edit-prod-img').value;
    const precio = parseFloat(document.getElementById('edit-prod-precio').value) || 0;
    const minimo = parseInt(document.getElementById('edit-prod-min').value) || 0;
    await updateDoc(doc(db,"inventario",document.getElementById('edit-prod-id').value),{
        precio: precio,
        stockMinimo: minimo,
        imagen: imgUrl
    });
    document.getElementById('modal-detalles').classList.add('hidden');
};

// GESTIÓN DE PEDIDOS
window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const prio = document.getElementById("sol-prioridad").value;
    const notas = document.getElementById("sol-notas").value.trim();
    const items = Object.entries(window.carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede y al menos un producto.");
    const batchId = Date.now().toString();
    const ts = Date.now();
    const fs = new Date().toLocaleString();
    const fIso = new Date().toISOString().split('T')[0];
    
    try {
        const batch = writeBatch(db);
        let detalleInsumos = "";
        items.forEach(([ins, cant]) => {
            detalleInsumos += `- ${cant}x ${ins}\n`;
            batch.set(doc(collection(db, "pedidos")), {
                usuarioId: window.usuarioActual.id, insumoNom: ins, cantidad: cant,
                ubicacion: ubi, prioridad: prio, notas: notas, grupo: window.grupoActivo,
                estado: "pendiente", fecha: fs, fecha_iso: fIso, timestamp: ts, batchId: batchId
            });
        });
        await batch.commit();
        
        const adminEmail = window.adminEmailGlobal || "";
        if(adminEmail) {
            const mensajeAlmacen = `El usuario ${window.usuarioActual.id.toUpperCase()} ha realizado un nuevo pedido de insumos.\n\nSede destino: ${ubi}\nPrioridad: ${prio.toUpperCase()}\n\nInsumos solicitados:\n${detalleInsumos}\nNotas: ${notas || 'Ninguna'}`;
            window.enviarNotificacionEmail(adminEmail, `Nuevo Pedido de Insumos - ${window.usuarioActual.id.toUpperCase()}`, mensajeAlmacen);
        }

        window.carritoGlobal = {};
        document.getElementById("sol-ubicacion").value="";
        document.getElementById("sol-notas").value="";
        window.procesarDatosInventario();
        window.verPagina('notificaciones');
    } catch (error) { alert("Error procesando solicitud."); }
};

window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid);
    const pData = (await getDoc(pRef)).data();
    if(accion === 'aprobar') {
        const val = parseInt(document.getElementById(`qty-${pid}`).value);
        const iRef = doc(db, "inventario", ins);
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= val) {
            const nuevoStock = iSnap.data().cantidad - val;
            const stockMinimo = iSnap.data().stockMinimo || 0;
            await updateDoc(iRef, { cantidad: nuevoStock });
            await updateDoc(pRef, {
                estado: "aprobado", cantidad: val, entregado_por: window.usuarioActual.id,
                timestamp_aprobado: Date.now(), fecha_aprobado: new Date().toLocaleString()
            });
            
            if(nuevoStock <= stockMinimo && stockMinimo > 0 && window.stockAlertEmailGlobal) {
                const msg = `Alerta de Stock Crítico en InsuManager.\n\nEl insumo: ${ins.toUpperCase()}\nSe ha reducido a ${nuevoStock} unidades (El mínimo es ${stockMinimo}).\n\nPor favor proceda con la reposición.`;
                window.enviarNotificacionEmail(window.stockAlertEmailGlobal, `🔴 STOCK BAJO: ${ins.toUpperCase()}`, msg);
            }
            
            const pend = window.cachePedidos.filter(p => p.batchId === pData.batchId && p.estado === 'pendiente' && p.id !== pid);
            if(pend.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden"); 
            else window.abrirModalGrupo(pData.batchId);
        } else {
            alert("Error: Stock insuficiente.");
        }
    } else {
        await updateDoc(pRef, { estado: "rechazado", timestamp_aprobado: Date.now(), fecha_aprobado: new Date().toLocaleString() });
        window.abrirModalGrupo(pData.batchId);
    }
};

window.abrirModalGrupo = (bKey) => {
    const items = window.cachePedidos.filter(p => p.batchId === bKey || p.timestamp.toString() === bKey);
    if(items.length===0) return;
    document.getElementById("modal-grupo-titulo").innerHTML = `${items[0].usuarioId.toUpperCase()} | ${items[0].ubicacion}`;
    if(items[0].notas) {
        document.getElementById("modal-grupo-notas").innerHTML = `"${items[0].notas}"`;
        document.getElementById("modal-grupo-notas-container").classList.remove('hidden');
    } else {
        document.getElementById("modal-grupo-notas-container").classList.add('hidden');
    }
    let h = "";
    items.forEach(p => {
        let act = `<span class="badge status-${p.estado}">${p.estado}</span>`;
        if(p.estado === 'pendiente' && window.tienePermiso('aprobar')) {
            act = `<div class="flex gap-2"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border rounded text-center font-bold text-xs"><button onclick="window.gestionarPedido('${p.id}','aprobar','${p.insumoNom.replace(/'/g,"\\'")}')" class="text-white bg-emerald-500 px-2 rounded"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${p.id}','rechazar')" class="text-red-400 bg-red-50 px-2 rounded"><i class="fas fa-times"></i></button></div>`;
        }
        h += `<div class="flex justify-between items-center p-3 border-b"><div class="text-xs"><b>${p.insumoNom}</b> <span class="badge status-pri-${p.prioridad}">${p.prioridad}</span><br>Cant: ${p.cantidad}</div>${act}</div>`;
    });
    document.getElementById("modal-grupo-contenido").innerHTML = h;
    document.getElementById("modal-grupo-admin").classList.remove("hidden");
};

window.confirmarRecibido = async (pid) => {
    if(confirm("¿Recibido?")) await updateDoc(doc(db, "pedidos", pid), { estado: "recibido", timestamp_recibido: Date.now(), fecha_recibido: new Date().toLocaleString() });
};

window.abrirIncidencia = (pid) => {
    document.getElementById('incidencia-pid').value = pid;
    document.getElementById('modal-incidencia').classList.remove('hidden');
};

window.confirmarIncidencia = async (dev) => {
    const pid = document.getElementById('incidencia-pid').value;
    const pRef = doc(db, "pedidos", pid);
    const pData = (await getDoc(pRef)).data();
    if(dev){
        const iRef = doc(db, "inventario", pData.insumoNom);
        const iSnap = await getDoc(iRef);
        if(iSnap.exists()) await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad });
    }
    await updateDoc(pRef, {
        estado: dev ? "devuelto" : "con_incidencia",
        detalleIncidencia: document.getElementById('incidencia-detalle').value,
        timestamp_incidencia: Date.now()
    });
    document.getElementById('modal-incidencia').classList.add('hidden');
};

// ACTIVOS FIJOS
window.abrirModalActivo = (id = null) => {
    document.getElementById("activo-preview-img").classList.add("hidden"); document.getElementById("activo-img-url").value = "";
    if (id) {
        const a = rawActivos.find(x => x.id === id); if(!a) return;
        document.getElementById("activo-id").value = id; document.getElementById("activo-nombre").value = a.nombre || ""; document.getElementById("activo-categoria").value = a.categoria || ""; document.getElementById("activo-marca").value = a.marca || ""; document.getElementById("activo-proveedor").value = a.proveedor || ""; document.getElementById("activo-ubicacion").value = a.ubicacion || ""; document.getElementById("activo-precio").value = a.precio || ""; document.getElementById("activo-estado").value = a.estado || "Operativo"; document.getElementById("activo-descripcion").value = a.descripcion || ""; document.getElementById("activo-observacion").value = a.observacion || "";
        if(a.imagen) { document.getElementById("activo-img-url").value = a.imagen; document.getElementById("activo-preview-img").src = a.imagen; document.getElementById("activo-preview-img").classList.remove("hidden"); }
    } else {
        document.getElementById("activo-id").value = ""; document.getElementById("activo-nombre").value = ""; document.getElementById("activo-categoria").value = ""; document.getElementById("activo-marca").value = ""; document.getElementById("activo-proveedor").value = ""; document.getElementById("activo-ubicacion").value = ""; document.getElementById("activo-precio").value = ""; document.getElementById("activo-estado").value = "Operativo"; document.getElementById("activo-descripcion").value = ""; document.getElementById("activo-observacion").value = "";
    }
    document.getElementById("modal-activo").classList.remove("hidden");
};

window.guardarActivo = async () => {
    const actId = document.getElementById("activo-id").value;
    const nombre = document.getElementById("activo-nombre").value.trim().toUpperCase();
    if (!nombre) return alert("El nombre del activo es obligatorio.");
    const data = {
        nombre: nombre, categoria: document.getElementById("activo-categoria").value.trim().toUpperCase(), marca: document.getElementById("activo-marca").value.trim().toUpperCase(), proveedor: document.getElementById("activo-proveedor").value.trim().toUpperCase(), ubicacion: document.getElementById("activo-ubicacion").value.trim().toUpperCase(), precio: parseFloat(document.getElementById("activo-precio").value) || 0, estado: document.getElementById("activo-estado").value, descripcion: document.getElementById("activo-descripcion").value.trim(), observacion: document.getElementById("activo-observacion").value.trim(), imagen: document.getElementById("activo-img-url").value, grupo: window.grupoActivo
    };
    try {
        if (actId) { await updateDoc(doc(db, "activos", actId), data); alert("Activo actualizado."); } 
        else { const newId = "ACT-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random()*100); data.id = newId; data.creado_por = window.usuarioActual.id; data.fecha_registro = new Date().toLocaleString(); data.timestamp = Date.now(); data.bitacora = []; await setDoc(doc(db, "activos", newId), data); alert("Activo registrado. ID: " + newId); }
        document.getElementById("modal-activo").classList.add("hidden");
    } catch(e) { alert("Error al guardar activo."); }
};

window.abrirDetallesActivo = (id) => {
    const a = rawActivos.find(x => x.id === id); if(!a) return;
    document.getElementById("activo-bitacora-id").value = id; document.getElementById("activo-det-nombre").innerText = a.nombre; document.getElementById("activo-det-id").innerText = "ID: " + a.id; document.getElementById("activo-det-qr-container").innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(a.id)}" alt="QR Code" class="w-16 h-16 object-contain">`;
    const imgEl = document.getElementById("activo-det-img"); if(a.imagen) { imgEl.src = a.imagen; imgEl.classList.remove("hidden"); } else { imgEl.classList.add("hidden"); }
    document.getElementById("activo-det-estado").innerHTML = `<span class="px-2 py-1 bg-slate-100 rounded text-slate-700 text-xs">${a.estado}</span>`;
    document.getElementById("activo-det-cat").innerText = a.categoria || '-'; document.getElementById("activo-det-marca").innerText = a.marca || '-'; document.getElementById("activo-det-ubi").innerText = a.ubicacion || '-'; document.getElementById("activo-det-fecha").innerText = a.fecha_registro || '-'; document.getElementById("activo-det-desc").innerText = a.descripcion || 'Sin detalles';
    let bHtml = "";
    if (a.observacion) bHtml += `<div class="relative pl-4 border-l-2 border-indigo-200 pb-3"><div class="absolute w-2.5 h-2.5 bg-indigo-500 rounded-full -left-[6px] top-1"></div><p class="text-[9px] text-slate-400 font-bold mb-1">NOTA ORIGINAL</p><p class="text-xs font-medium text-slate-700 italic">${a.observacion}</p></div>`;
    if(a.bitacora && a.bitacora.length > 0) {
        a.bitacora.forEach(b => {
            let mediaHtml = "";
            if(b.mediaUrl) {
                if(b.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) mediaHtml = `<video src="${b.mediaUrl}" controls class="max-h-32 rounded-lg mt-2 border"></video>`;
                else mediaHtml = `<a href="${b.mediaUrl}" target="_blank"><img src="${b.mediaUrl}" loading="lazy" class="max-h-24 object-contain rounded-lg mt-2 border hover:opacity-80"></a>`;
            }
            bHtml += `<div class="relative pl-4 border-l-2 border-slate-200 pb-4"><div class="absolute w-2.5 h-2.5 bg-slate-400 rounded-full -left-[6px] top-1"></div><div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"><p class="text-[9px] text-slate-400 font-bold mb-1 flex justify-between"><span>${b.usuario.toUpperCase()}</span><span>${b.fecha}</span></p><p class="text-xs text-slate-700 whitespace-pre-wrap">${b.nota}</p>${mediaHtml}</div></div>`;
        });
    } else if (!a.observacion) bHtml += `<p class="text-xs text-slate-400 italic">No hay notas registradas.</p>`;
    document.getElementById("activo-bitacora-timeline").innerHTML = bHtml;
    document.getElementById("activo-bitacora-texto").value = ""; document.getElementById("activo-bitacora-url").value = ""; document.getElementById("activo-bitacora-badge").classList.add("hidden");
    document.getElementById("modal-activo-detalles").classList.remove("hidden");
};
window.cerrarDetallesActivo = () => { document.getElementById("modal-activo-detalles").classList.add("hidden"); };
window.guardarBitacoraActivo = async () => {
    const id = document.getElementById("activo-bitacora-id").value; const txt = document.getElementById("activo-bitacora-texto").value.trim(); const url = document.getElementById("activo-bitacora-url").value;
    if(!txt && !url) return alert("Escribe o adjunta algo.");
    const aRef = doc(db, "activos", id); const aSnap = await getDoc(aRef);
    if(aSnap.exists()) {
        const bitacoraAnterior = aSnap.data().bitacora || [];
        await updateDoc(aRef, { bitacora: [...bitacoraAnterior, { nota: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] });
        window.abrirDetallesActivo(id);
    }
};

// MANTENIMIENTO PREVENTIVO
window.abrirModalMantenimiento = () => {
    document.getElementById("mant-equipo").value=""; document.getElementById("mant-fecha").value=""; document.getElementById("mant-fecha-notificacion").value=""; document.getElementById("mant-correo").value=""; document.getElementById("mant-responsable").value=""; document.getElementById("mant-detalle").value=""; document.getElementById("modal-mantenimiento").classList.remove("hidden");
};
window.guardarMantenimiento = async () => {
    const eq = document.getElementById("mant-equipo").value.trim(); const fe = document.getElementById("mant-fecha").value; const fnot = document.getElementById("mant-fecha-notificacion").value; const correoNot = document.getElementById("mant-correo").value.trim(); const re = document.getElementById("mant-responsable").value.trim(); const de = document.getElementById("mant-detalle").value.trim();
    if(!eq || !fe) return alert("Equipo y fecha programada son obligatorios.");
    try {
        await addDoc(collection(db, "mantenimiento"), { equipo: eq, fecha_programada: fe, fecha_notificacion: fnot, correo_notificacion: correoNot, responsable: re, detalle: de, estado: 'pendiente', grupo: window.grupoActivo, creado_por: window.usuarioActual.id, timestamp: Date.now(), bitacora: [] });
        if(correoNot) {
            const mensaje = `Hola. Se ha programado un mantenimiento en el sistema InsuManager.\n\nEquipo/Área: ${eq.toUpperCase()}\nFecha Programada: ${fe}\nResponsable: ${re.toUpperCase()}\nDetalle: ${de}\n\nPor favor, ten en cuenta esta fecha.`;
            window.enviarNotificacionEmail(correoNot, `Mantenimiento Programado: ${eq.toUpperCase()}`, mensaje);
        }
        document.getElementById("modal-mantenimiento").classList.add("hidden"); alert("Mantenimiento programado correctamente.");
    } catch(e) { alert("Error guardando mantenimiento."); }
};
window.iniciarMantenimiento = async (id) => { if(confirm("¿Cambiar estado a EN PROCESO?")) await updateDoc(doc(db, "mantenimiento", id), { estado: 'en_proceso', timestamp_inicio: Date.now() }); };
window.completarMantenimiento = async (id) => { if(confirm("¿Finalizar tarea?")) await updateDoc(doc(db, "mantenimiento", id), { estado: 'completado', timestamp_completado: Date.now(), fecha_completado: new Date().toLocaleString() }); };
window.abrirBitacora = async (id) => {
    document.getElementById("bitacora-mant-id").value = id; document.getElementById("bitacora-texto").value = ""; document.getElementById("bitacora-media-url").value = ""; document.getElementById("bitacora-media-badge").classList.add("hidden");
    const m = rawMantenimiento.find(x => x.id === id); if(!m) return; document.getElementById("bitacora-equipo-titulo").innerText = m.equipo.toUpperCase();
    const tl = document.getElementById("bitacora-timeline"); let html = "";
    html += `<div class="relative pl-6 border-l-2 border-indigo-200 pb-4"><div class="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1"></div><p class="text-[10px] text-slate-400 font-bold mb-1">TAREA ORIGINAL • ${new Date(m.timestamp).toLocaleString()}</p><p class="text-sm font-medium text-slate-700">${m.detalle || 'Sin descripción inicial.'}</p></div>`;
    if(m.bitacora && m.bitacora.length > 0) {
        m.bitacora.forEach(b => {
            let mediaHtml = "";
            if(b.mediaUrl) {
                if(b.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) mediaHtml = `<video src="${b.mediaUrl}" controls class="max-h-40 rounded-lg mt-2 border border-slate-200"></video>`;
                else mediaHtml = `<a href="${b.mediaUrl}" target="_blank"><img src="${b.mediaUrl}" loading="lazy" class="max-h-32 object-contain rounded-lg mt-2 border border-slate-200 hover:opacity-80 transition"></a>`;
            }
            html += `<div class="relative pl-6 border-l-2 border-slate-200 pb-4"><div class="absolute w-3 h-3 bg-slate-400 rounded-full -left-[7px] top-1"></div><div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"><p class="text-[10px] text-slate-400 font-bold mb-1 flex justify-between"><span>${b.usuario.toUpperCase()}</span><span>${b.fecha}</span></p><p class="text-sm text-slate-700 whitespace-pre-wrap">${b.observacion}</p>${mediaHtml}</div></div>`;
        });
    } else html += `<p class="text-xs text-slate-400 italic mt-4">No hay observaciones registradas aún.</p>`;
    tl.innerHTML = html; document.getElementById("modal-bitacora").classList.remove("hidden");
};
window.guardarBitacora = async () => {
    const id = document.getElementById("bitacora-mant-id").value; const txt = document.getElementById("bitacora-texto").value.trim(); const url = document.getElementById("bitacora-media-url").value;
    if(!txt && !url) return alert("Escribe o adjunta algo.");
    const mRef = doc(db, "mantenimiento", id); const mSnap = await getDoc(mRef);
    if(mSnap.exists()) { const bitacoraAnterior = mSnap.data().bitacora || []; await updateDoc(mRef, { bitacora: [...bitacoraAnterior, { observacion: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] }); window.abrirBitacora(id); }
};
window.cerrarBitacora = () => { document.getElementById("modal-bitacora").classList.add("hidden"); };

// GESTIÓN DE CONFIGURACIÓN Y USUARIOS
window.eliminarDato = async (col, id) => { if(confirm("¿Seguro que deseas eliminar este dato?")) await deleteDoc(doc(db, col, id)); };
window.guardarSede = async () => { const s = document.getElementById("new-sede").value.trim().toUpperCase(); if(!s) return alert("Ingrese sede."); try { await addDoc(collection(db, "sedes"), { nombre: s, timestamp: Date.now() }); document.getElementById("new-sede").value = ""; alert("Sede guardada."); } catch(e) { alert("Error."); } };
window.guardarGrupo = async () => { const g = document.getElementById("new-grupo").value.trim().toUpperCase(); if(!g) return alert("Ingrese grupo."); try { await addDoc(collection(db, "grupos"), { nombre: g, timestamp: Date.now() }); document.getElementById("new-grupo").value = ""; alert("Grupo creado."); } catch(e) { alert("Error."); } };
window.guardarConfigCorreos = async () => { const emailA = document.getElementById("config-admin-email").value.trim(); const emailS = document.getElementById("config-stock-email").value.trim(); try { if(emailA) await setDoc(doc(db, "configuracion", "notificaciones"), { emailAdmin: emailA }, { merge: true }); if(emailS) await setDoc(doc(db, "configuracion", "alertas_stock"), { [window.grupoActivo]: emailS }, { merge: true }); alert("Correos actualizados exitosamente."); } catch(e) { alert("Error al guardar correos."); } };

window.guardarUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase(); const p = document.getElementById("new-pass").value.trim(); const e = document.getElementById("new-email").value.trim(); const r = document.getElementById("new-role").value;
    const checkboxes = document.querySelectorAll('.chk-grupo:checked'); let gruposSeleccionados = Array.from(checkboxes).map(chk => chk.value); if(gruposSeleccionados.length === 0) gruposSeleccionados = ["SERVICIOS GENERALES"];
    const perms = { comprar: document.getElementById("perm-comprar").checked, recibir: document.getElementById("perm-recibir").checked, aprobar: document.getElementById("perm-aprobar").checked, activos: document.getElementById("perm-activos").checked };
    if(!id || !p) return alert("Faltan datos.");
    await setDoc(doc(db,"usuarios",id), { pass: p, rol: r, email: e, grupos: gruposSeleccionados, permisos: perms }, { merge: true }); alert("Usuario guardado."); window.cancelarEdicionUsuario();
};

window.prepararEdicionUsuario = async (userId) => {
    const snap = await getDoc(doc(db, "usuarios", userId)); if(!snap.exists()) return; const u = snap.data();
    document.getElementById("edit-mode-id").value = userId; const inpU = document.getElementById("new-user"); inpU.value = userId; inpU.disabled = true;
    document.getElementById("new-pass").value = u.pass; document.getElementById("new-email").value = u.email || ""; document.getElementById("new-role").value = u.rol;
    const p = u.permisos || {}; document.getElementById("perm-comprar").checked = !!p.comprar; document.getElementById("perm-recibir").checked = !!p.recibir; document.getElementById("perm-aprobar").checked = !!p.aprobar; document.getElementById("perm-activos").checked = !!p.activos;
    const gruposUsuario = u.grupos || ["SERVICIOS GENERALES"]; document.querySelectorAll('.chk-grupo').forEach(chk => { chk.checked = gruposUsuario.includes(chk.value); });
    document.getElementById("btn-guardar-usuario").innerText = "Actualizar"; document.getElementById("cancel-edit-msg").classList.remove("hidden");
};

window.cancelarEdicionUsuario = () => {
    document.getElementById("edit-mode-id").value = ""; const inpU = document.getElementById("new-user"); inpU.value = ""; inpU.disabled = false;
    document.getElementById("new-pass").value = ""; document.getElementById("new-email").value = ""; document.getElementById("new-role").value = "user";
    document.getElementById("perm-comprar").checked = false; document.getElementById("perm-recibir").checked = false; document.getElementById("perm-aprobar").checked = false; document.getElementById("perm-activos").checked = false;
    document.querySelectorAll('.chk-grupo').forEach(chk => chk.checked = false); document.getElementById("btn-guardar-usuario").innerText = "Guardar"; document.getElementById("cancel-edit-msg").classList.add("hidden");
};

// EDICION DE ENTRADAS HISTORICAS
window.abrirModalEditarEntrada = (idEntrada, insumo, cantidadActual) => { document.getElementById('edit-entrada-id').value = idEntrada; document.getElementById('edit-entrada-insumo').value = insumo; document.getElementById('edit-entrada-insumo-display').value = insumo; document.getElementById('edit-entrada-cant-original').value = cantidadActual; document.getElementById('edit-entrada-cantidad').value = cantidadActual; document.getElementById('edit-entrada-motivo').value = ""; document.getElementById('modal-editar-entrada').classList.remove('hidden'); };
window.guardarEdicionEntrada = async () => { const idEntrada = document.getElementById('edit-entrada-id').value; const insumo = document.getElementById('edit-entrada-insumo').value; const cantOriginal = parseInt(document.getElementById('edit-entrada-cant-original').value); const cantNueva = parseInt(document.getElementById('edit-entrada-cantidad').value); const motivo = document.getElementById('edit-entrada-motivo').value.trim(); if (isNaN(cantNueva) || cantNueva < 0) return alert("Cantidad inválida."); if (!motivo) return alert("Ingrese motivo."); const diferencia = cantNueva - cantOriginal; if (diferencia === 0) { document.getElementById('modal-editar-entrada').classList.add('hidden'); return; } try { const invRef = doc(db, "inventario", insumo); const invSnap = await getDoc(invRef); if (!invSnap.exists()) return; await updateDoc(invRef, { cantidad: invSnap.data().cantidad + diferencia }); await updateDoc(doc(db, "entradas_stock", idEntrada), { cantidad: cantNueva, motivo_edicion: motivo }); alert("Entrada corregida."); document.getElementById('modal-editar-entrada').classList.add('hidden'); } catch(e) { alert("Error."); } };

// FACTURAS DIRECTAS
window.abrirModalFactura = () => { document.getElementById("fact-proveedor").value = ""; document.getElementById("fact-gasto").value = ""; document.getElementById("fact-fecha").value = ""; document.getElementById("fact-archivo-url").value = ""; document.getElementById("factura-file-name").innerText = "Ninguno"; document.getElementById("modal-factura").classList.remove("hidden"); };
window.cerrarModalFactura = () => { document.getElementById("modal-factura").classList.add("hidden"); };
window.guardarFactura = async () => { const pv = document.getElementById("fact-proveedor").value.trim(); const ga = parseFloat(document.getElementById("fact-gasto").value); const fe = document.getElementById("fact-fecha").value; const ar = document.getElementById("fact-archivo-url").value; if(!pv || isNaN(ga) || !fe) return alert("Campos requeridos."); try { await addDoc(collection(db, "facturas"), { proveedor: pv, gasto: ga, fecha_compra: fe, archivo_url: ar, grupo: window.grupoActivo, usuarioRegistro: window.usuarioActual.id, timestamp: Date.now(), fecha_registro: new Date().toLocaleString() }); alert("Factura registrada."); window.cerrarModalFactura(); } catch(e) { alert("Error."); } };

// ESCANER
window.iniciarScanner = (inputIdTarget) => {
    document.getElementById("modal-scanner").classList.remove("hidden");
    window.html5QrcodeScanner = new Html5Qrcode("reader");
    window.html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (txt) => {
        window.detenerScanner();
        const i = document.getElementById(inputIdTarget);
        if(i) {
            i.value = txt;
            if(inputIdTarget === 'buscador-activos') window.debounceFiltrarTarjetas('lista-activos-db', txt);
            else window.debounceFiltrarTarjetas('lista-inventario', txt);
        }
    }, () => {}).catch(err => { alert("Error de cámara."); window.detenerScanner(); });
};
window.detenerScanner = () => { if(window.html5QrcodeScanner) window.html5QrcodeScanner.stop().catch(()=>{}); document.getElementById("modal-scanner").classList.add("hidden"); };

// ==========================================
// 10. EXPORTACIÓN EXCEL
// ==========================================
window.descargarReporte = async () => {
    if(typeof XLSX === 'undefined') return alert("Cargando Excel...");
    const inputDesde = document.getElementById("dash-desde")?.value || document.getElementById("rep-desde")?.value;
    const inputHasta = document.getElementById("dash-hasta")?.value || document.getElementById("rep-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity;
    if(inputDesde) tDesde = new Date(inputDesde + 'T00:00:00').getTime();
    if(inputHasta) tHasta = new Date(inputHasta + 'T23:59:59').getTime();
    
    if(!confirm(`¿Generar reporte general (Exportar Datos) del grupo ${window.grupoActivo}?`)) return;
    
    const uSnap = await getDocs(collection(db, "usuarios")); const usersMap = {}; uSnap.forEach(u => { usersMap[u.id] = u.data(); });
    const obtenerMesAno = (timestamp) => { if(!timestamp) return 'N/A'; const d = new Date(timestamp); return `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]} ${d.getFullYear()}`; };
    
    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const stockData = invActivo.map(p => ({ "Insumo": (p.id||'').toUpperCase(), "Cantidad Disponible": p.cantidad || 0, "Stock Mínimo": p.stockMinimo || 0, "Precio Unit. ($)": p.precio || 0 }));
    
    const entActivas = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo && e.timestamp >= tDesde && e.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp);
    const entradasData = entActivas.map(mov => ({ "Mes y Año": obtenerMesAno(mov.timestamp), "Fecha de Entrada": mov.fecha || 'N/A', "Insumo": (mov.insumo || '').toUpperCase(), "Cantidad Ingresada": mov.cantidad || 0, "Usuario Responsable": (mov.usuario || '').toUpperCase() }));
    
    const salActivas = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp);
    const salidasData = salActivas.map(mov => {
        const uId = mov.usuarioId || ''; const userObj = usersMap[uId] || {};
        return {
            "Mes y Año": obtenerMesAno(mov.timestamp), "ID Pedido": mov.batchId || 'N/A', "Fecha Solicitud": mov.fecha_solicitud || mov.fecha || 'N/A',
            "Hora Solicitud": mov.timestamp ? new Date(mov.timestamp).toLocaleTimeString() : 'N/A',
            "Tiempo en Atender": mov.timestamp_aprobado ? window.formatoTiempoDiferencia(mov.timestamp, mov.timestamp_aprobado) : 'Pendiente',
            "Tiempo en Recibir": mov.timestamp_recibido ? window.formatoTiempoDiferencia(mov.timestamp_aprobado || mov.timestamp, mov.timestamp_recibido) : (mov.estado === 'recibido' ? 'N/A' : 'Pendiente/No recibido'),
            "Prioridad": (mov.prioridad || 'NORMAL').toUpperCase(), "Insumo": (mov.insumoNom || '').toUpperCase(), "Cant.": mov.cantidad || 0,
            "Sede Destino": (mov.ubicacion || '').toUpperCase(), "Usuario Solicitante": uId.toUpperCase(), "Estado Actual": (mov.estado || '').toUpperCase(), "Entregado Por": (mov.entregado_por || 'N/A').toUpperCase()
        };
    });
    
    const equiposActivos = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const activosData = equiposActivos.map(a => ({ "ID Único": a.id, "Nombre": a.nombre, "Clasificación": a.categoria, "Marca/Modelo": a.marca, "Estado": a.estado, "Ubicación": a.ubicacion, "Precio ($)": a.precio }));
    
    const mantActivos = rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo && m.timestamp >= tDesde && m.timestamp <= tHasta);
    const mantData = mantActivos.map(m => ({ "Equipo": m.equipo, "Fecha Programada": m.fecha_programada, "Fecha Notificación": m.fecha_notificacion || 'No Aplica', "Responsable": m.responsable, "Estado": (m.estado || 'N/A').toUpperCase(), "Detalle Tarea": m.detalle || '' }));

    const compActivas = rawCompras.filter(c => (c.grupo || "SERVICIOS GENERALES") === window.grupoActivo && c.timestamp >= tDesde && c.timestamp <= tHasta);
    const compData = compActivas.map(c => ({ "Proveedor": c.proveedor, "Factura": c.factura, "Fecha Compra": c.fecha_compra, "Estado": c.estado, "Registrado Por": c.registrado_por, "Total Items": c.items.length }));

    const wb = XLSX.utils.book_new();
    if(stockData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), "Inventario");
    if(activosData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activosData), "Activos Fijos");
    if(compData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compData), "Compras Generales");
    if(entradasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entradasData), "Entradas de Stock");
    if(salidasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salidasData), "Salidas (Pedidos)");
    if(mantData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mantData), "Mantenimientos");
    
    XLSX.writeFile(wb, `ReporteCompleto_FCILog_${window.grupoActivo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// ==========================================
// 11. INICIALIZACIÓN FINAL (CLOUDINARY)
// ==========================================
const inicializarApp = () => {
    const sesion = localStorage.getItem("fcilog_session");
    if(sesion) window.cargarSesion(JSON.parse(sesion));
    
    if (typeof cloudinary !== "undefined") {
        window.cloudinaryEditProdWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('edit-prod-img').value = result.info.secure_url; const preview = document.getElementById('preview-img'); preview.src = result.info.secure_url; preview.classList.remove('hidden'); } });
        document.getElementById("btn-upload-edit-prod")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryEditProdWidget.open(); }, false);
        
        window.cloudinaryActivosWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_activos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('activo-img-url').value = result.info.secure_url; const p = document.getElementById('activo-preview-img'); p.src = result.info.secure_url; p.classList.remove('hidden'); } });
        document.getElementById("btn-upload-activo")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryActivosWidget.open(); }, false);
        
        window.cloudinaryBitacoraWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, folder: 'fcilog_bitacora', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('bitacora-media-url').value = result.info.secure_url; const b = document.getElementById('bitacora-media-badge'); const formatoArchivo = (result.info && result.info.format) ? result.info.format.toUpperCase() : "ADJUNTO"; b.innerText = formatoArchivo; b.classList.remove('hidden'); } });
        document.getElementById("btn-upload-bitacora")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryBitacoraWidget.open(); }, false);
        
        window.cloudinaryActivosBitacoraWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, folder: 'fcilog_activos_bitacora', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('activo-bitacora-url').value = result.info.secure_url; const b = document.getElementById('activo-bitacora-badge'); b.innerText = (result.info.format || 'DOC').toUpperCase(); b.classList.remove('hidden'); } });
        document.getElementById("btn-upload-activo-bitacora")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryActivosBitacoraWidget.open(); }, false);
        
        window.cloudinaryFacturasWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local'], multiple: false, folder: 'fcilog_facturas', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('fact-archivo-url').value = result.info.secure_url; document.getElementById('factura-file-name').innerText = result.info.original_filename || "Documento"; } });
        document.getElementById("btn-upload-factura")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryFacturasWidget.open(); }, false);
    }
};

window.addEventListener('DOMContentLoaded', inicializarApp);

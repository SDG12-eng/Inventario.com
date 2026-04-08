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

const EMAILJS_PUBLIC_KEY = "2jVnfkJKKG0bpKN-U"; 
const EMAILJS_SERVICE_ID = "service_a7yozqh";
const EMAILJS_TEMPLATE_ID = "template_zglatmb";
if(EMAILJS_PUBLIC_KEY && typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

// ==========================================
// 2. DEFINICIÓN SEGURA DE GLOBALES
// ==========================================
window.usuarioActual = null; window.carritoGlobal = {}; window.carritoCompras = {}; window.cachePedidos = []; window.todosLosGrupos = ["SERVICIOS GENERALES"]; window.grupoActivo = "SERVICIOS GENERALES"; window.miGraficoStock = null; window.miGraficoUbicacion = null; window.html5QrcodeScanner = null; window.configCorreosData = {}; window.configStockData = {}; window.adminEmailGlobal = ""; window.stockAlertEmailGlobal = "";
window.chartPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#14b8a6', '#3b82f6', '#f97316', '#a855f7', '#ef4444'];
window.rawInventario = []; window.rawEntradas = []; window.rawFacturas = []; window.rawMantenimiento = []; window.rawActivos = []; window.rawCompras = []; window.pedidosRaw = []; window.rawCategorias = []; window.timeoutBusqueda = null;

// ==========================================
// 3. ANCLAJE DE FUNCIONES BASE AL WINDOW
// ==========================================
window.tienePermiso = function(modulo, accion = 'ver') {
    if (!window.usuarioActual) return false;
    if (window.usuarioActual.id === 'admin') return true; 
    if (!window.usuarioActual.permisos || !window.usuarioActual.permisos[modulo]) return false;
    if (accion === 'ver') return window.usuarioActual.permisos[modulo].ver === true || window.usuarioActual.permisos[modulo].gestionar === true;
    return window.usuarioActual.permisos[modulo].gestionar === true;
};

window.formatoTiempoDiferencia = function(t1, t2) { let diffMs = Math.abs(t2 - t1); let diffMins = Math.floor(diffMs / 60000); if (diffMins < 60) return diffMins + "m"; let diffHrs = Math.floor(diffMins / 60); let rem = diffMins % 60; if (diffHrs < 24) return diffHrs + "h " + rem + "m"; return Math.floor(diffHrs / 24) + "d " + (diffHrs % 24) + "h"; };

window.enviarNotificacionEmail = async function(correoDestino, asunto, mensaje) {
    if (typeof emailjs !== "undefined") {
        try { await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, { to_email: correoDestino, subject: asunto, message: mensaje }); console.log("Email enviado"); } 
        catch (error) { console.error("Error enviando email:", error); }
    }
};

window.solicitarPermisosNotificacion = function() { if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") { Notification.requestPermission(); } };
window.enviarNotificacionNavegador = function(titulo, cuerpo) { if ("Notification" in window && Notification.permission === "granted") { new Notification(titulo, { body: cuerpo, icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png" }); } };
window.debounceFiltrarTarjetas = function(idContenedor, texto) { clearTimeout(window.timeoutBusqueda); window.timeoutBusqueda = setTimeout(() => { const term = texto.toLowerCase(); const container = document.getElementById(idContenedor); if(container) { container.querySelectorAll('.item-tarjeta').forEach(c => { c.style.display = c.innerText.toLowerCase().includes(term) ? '' : 'none'; }); } }, 150); };
window.debounceFiltrarTabla = function(idTabla, texto) { clearTimeout(window.timeoutBusqueda); window.timeoutBusqueda = setTimeout(() => { const term = texto.toLowerCase(); document.querySelectorAll(`#${idTabla} tr`).forEach(f => { f.style.display = f.innerText.toLowerCase().includes(term) ? '' : 'none'; }); }, 150); };
window.verPagina = function(id) { document.querySelectorAll(".view").forEach(v => { v.classList.add("hidden"); v.classList.remove("animate-fade-in"); }); const t = document.getElementById(`pag-${id}`); if(t) { t.classList.remove("hidden"); setTimeout(() => t.classList.add("animate-fade-in"), 10); } if(window.innerWidth < 768) window.toggleMenu(false); };
window.toggleMenu = function(forceState) { const sb = document.getElementById("sidebar"); const ov = document.getElementById("sidebar-overlay"); if(!sb || !ov) return; const isClosed = sb.classList.contains("-translate-x-full"); const shouldOpen = forceState !== undefined ? forceState : isClosed; if (shouldOpen) { sb.classList.remove("-translate-x-full"); ov.classList.remove("hidden"); sb.style.zIndex = "100"; ov.style.zIndex = "90"; } else { sb.classList.add("-translate-x-full"); ov.classList.add("hidden"); } };
window.switchTab = function(tab) { document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden')); document.getElementById(`tab-content-${tab}`)?.classList.remove('hidden'); const onC = "flex-1 py-3 rounded-xl text-sm font-black bg-white text-indigo-600 shadow-sm transition"; const offC = "flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 transition"; if(tab === 'activos') { document.getElementById('tab-btn-activos').className = onC; document.getElementById('tab-btn-historial').className = offC; } else { document.getElementById('tab-btn-historial').className = onC; document.getElementById('tab-btn-activos').className = offC; } };
window.switchTabCompras = function(tab) { document.getElementById('vista-compra-nueva').classList.add('hidden'); document.getElementById('vista-compra-historial').classList.add('hidden'); document.getElementById('btn-compra-nueva').className = "flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 transition"; document.getElementById('btn-compra-historial').className = "flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 transition"; document.getElementById(`vista-compra-${tab}`).classList.remove('hidden'); document.getElementById(`btn-compra-${tab}`).className = "flex-1 py-3 rounded-xl text-sm font-black bg-white text-indigo-600 shadow-sm transition"; };

window.renderChart = function(id, labels, data, title, palette, chartInstance, setInstance) {
    const ctx = document.getElementById(id); if(!ctx) return;
    if(chartInstance && typeof chartInstance.destroy === 'function') chartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'medium';
    const textColor = isDark ? '#cbd5e1' : '#64748b'; const bgColors = id === 'locationChart' ? palette : palette.map(c=>c+'CC');
    const newChart = new Chart(ctx, { type: id === 'locationChart' ? 'doughnut' : 'bar', data: { labels: labels, datasets: [{ label: title, data: data, backgroundColor: bgColors, borderColor: palette, borderWidth: 1, borderRadius: id === 'locationChart' ? 0 : 5 }] }, options: { responsive: true, maintainAspectRatio: false, color: textColor, plugins: { legend: { display: id === 'locationChart', position: 'bottom', labels: { color: textColor } } }, scales: id === 'locationChart' ? {} : { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } } });
    setInstance(newChart);
};

// ==========================================
// 4. AUTENTICACIÓN Y ENTORNO
// ==========================================
window.iniciarSesion = async function() {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    if(!user || !pass) { document.getElementById("btn-login-submit").innerText = "Iniciar Sesión"; return alert("Ingrese usuario y contraseña."); }
    if (user === "admin" && pass === "1130") { window.cargarSesion({ id: "admin", rol: "Súper Administrador", grupos: ["SERVICIOS GENERALES"] }); return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) { window.cargarSesion({ id: user, ...snap.data() }); } 
        else { document.getElementById("btn-login-submit").innerText = "Iniciar Sesión"; alert("Credenciales incorrectas."); }
    } catch (e) { document.getElementById("btn-login-submit").innerText = "Iniciar Sesión"; alert("Error de conexión al servidor."); }
};

window.cerrarSesion = function() { localStorage.removeItem("fcilog_session"); location.reload(); };

window.cargarSesion = function(datos) {
    window.usuarioActual = datos; localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden"); document.getElementById("interfaz-app").classList.remove("hidden");
    window.solicitarPermisosNotificacion();
    
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) { infoDiv.innerHTML = `<div class="flex flex-col items-center"><div class="w-12 h-12 bg-indigo-100 border border-indigo-200 rounded-full flex items-center justify-center text-indigo-600 mb-2 shadow-inner"><i class="fas fa-user text-xl"></i></div><span class="font-black text-slate-800 uppercase tracking-wide">${datos.id}</span><span class="text-[10px] uppercase font-black text-white bg-indigo-500 px-3 py-1 rounded-md mt-1 shadow-sm tracking-widest">${datos.rol || 'USUARIO'}</span></div>`; }

    const matrizBody = document.getElementById("matriz-permisos");
    if(matrizBody) {
        const mods = [ {id:'dashboard', n:'Dashboard'}, {id:'stock', n:'Inventario'}, {id:'compras', n:'Compras'}, {id:'pedir', n:'Pedir Insumos'}, {id:'aprobaciones', n:'Aprobaciones'}, {id:'activos', n:'Activos Fijos'}, {id:'mantenimiento', n:'Mantenimiento'}, {id:'historial', n:'Movimientos'}, {id:'facturas', n:'Facturas Directas'}, {id:'usuarios', n:'Usuarios'}, {id:'configuracion', n:'Configuración'} ];
        matrizBody.innerHTML = mods.map(m => `<tr class="hover:bg-slate-50 transition border-b border-slate-100"><td class="py-2 px-3 font-bold text-slate-700 text-[10px] uppercase">${m.n}</td><td class="text-center"><input type="checkbox" class="chk-permiso" data-modulo="${m.id}" data-accion="ver"></td><td class="text-center"><input type="checkbox" class="chk-permiso" data-modulo="${m.id}" data-accion="gestionar" onchange="if(this.checked) this.closest('tr').querySelector('[data-accion=\\'ver\\']').checked = true;"></td></tr>`).join('');
    }

    let menuHtml = ""; const addHeader = (t) => `<p class="text-[10px] font-black text-indigo-400 uppercase mt-4 mb-2 ml-2 tracking-widest">${t}</p>`; const addItem = (id, icon, n) => `<button onclick="window.verPagina('${id}')" class="w-full flex items-center gap-4 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-white border border-slate-200 group-hover:border-indigo-200 flex items-center justify-center transition-colors"><i class="fas fa-${icon} group-hover:text-indigo-500"></i></div>${n}</button>`;
    if(window.tienePermiso('dashboard', 'ver')) { menuHtml += addHeader("Analítica"); menuHtml += addItem('stats', 'chart-pie', 'Dashboard'); }
    menuHtml += addHeader("Logística & Operativa");
    if(window.tienePermiso('stock', 'ver')) menuHtml += addItem('stock', 'boxes', 'Inventario');
    if(window.tienePermiso('compras', 'ver')) menuHtml += addItem('compras', 'shopping-cart', 'Compras');
    if(window.tienePermiso('pedir', 'ver')) menuHtml += addItem('solicitar', 'hand-holding-box', 'Pedir Insumo');
    if(window.tienePermiso('aprobaciones', 'ver')) menuHtml += addItem('solicitudes', 'check-double', 'Aprobaciones');
    if(window.tienePermiso('activos', 'ver') || window.tienePermiso('mantenimiento', 'ver')) { menuHtml += addHeader("Técnico & Equipos"); if(window.tienePermiso('activos', 'ver')) menuHtml += addItem('activos', 'desktop', 'Activos Fijos'); if(window.tienePermiso('mantenimiento', 'ver')) menuHtml += addItem('mantenimiento', 'tools', 'Mantenimiento'); }
    menuHtml += addHeader("Auditoría");
    if(window.tienePermiso('mis_pedidos', 'ver') || window.usuarioActual.id !== 'admin') menuHtml += addItem('notificaciones', 'clipboard-list', 'Mis Pedidos');
    if(window.tienePermiso('historial', 'ver')) menuHtml += addItem('historial', 'history', 'Movimientos');
    if(window.tienePermiso('facturas', 'ver')) menuHtml += addItem('facturas', 'file-invoice-dollar', 'Facturas Directas');
    if(window.tienePermiso('usuarios', 'ver') || window.tienePermiso('configuracion', 'ver')) { menuHtml += addHeader("Avanzado"); if(window.tienePermiso('usuarios', 'ver')) menuHtml += addItem('usuarios', 'users-cog', 'Usuarios'); if(window.tienePermiso('configuracion', 'ver')) menuHtml += addItem('config', 'cogs', 'Configuración'); }
    
    const menuDin = document.getElementById("menu-dinamico"); if(menuDin) menuDin.innerHTML = menuHtml;

    let pageToLoad = 'stock'; const mapPages = { 'stats':'dashboard', 'stock':'stock', 'compras':'compras', 'solicitar':'pedir', 'solicitudes':'aprobaciones', 'activos':'activos', 'mantenimiento':'mantenimiento', 'notificaciones':'mis_pedidos', 'historial':'historial', 'facturas':'facturas', 'usuarios':'usuarios', 'config':'configuracion' };
    for(let p in mapPages) { if(window.tienePermiso(mapPages[p], 'ver')) { pageToLoad = p; break; } }

    let misGrupos = datos.grupos || ["SERVICIOS GENERALES"]; if(datos.id === 'admin') misGrupos = window.todosLosGrupos;
    window.grupoActivo = misGrupos[0]; window.renderizarSelectorGrupos(misGrupos); window.verPagina(pageToLoad); window.activarSincronizacion();
};

window.cambiarGrupoActivo = function(nuevoGrupo) {
    window.grupoActivo = nuevoGrupo; document.getElementById("dash-grupo-label").innerText = window.grupoActivo; document.getElementById("lbl-grupo-solicitud").innerText = window.grupoActivo; window.carritoGlobal = {};
    if(window.configCorreosData && window.configCorreosData[window.grupoActivo]) { window.adminEmailGlobal = window.configCorreosData[window.grupoActivo]; } else { window.adminEmailGlobal = ""; }
    if(window.configStockData && window.configStockData[window.grupoActivo]) { window.stockAlertEmailGlobal = window.configStockData[window.grupoActivo]; } else { window.stockAlertEmailGlobal = ""; }
    const elA = document.getElementById("config-admin-email"); if(elA) elA.value = window.adminEmailGlobal;
    const elS = document.getElementById("config-stock-email"); if(elS) elS.value = window.stockAlertEmailGlobal;
    window.procesarDatosInventario(); window.procesarDatosPedidos(); window.renderHistorialUnificado(); window.procesarDatosFacturas(); window.renderMantenimiento(); window.renderActivos(); window.renderCompras(); window.actualizarDashboard();
};

window.renderizarSelectorGrupos = function(misGrupos) { const sel = document.getElementById("selector-grupo-activo"); if(sel) { sel.innerHTML = misGrupos.map(g => `<option value="${g}">${g}</option>`).join(''); sel.value = window.grupoActivo; } const dashLbl = document.getElementById("dash-grupo-label"); if(dashLbl) dashLbl.innerText = window.grupoActivo; const solLbl = document.getElementById("lbl-grupo-solicitud"); if(solLbl) solLbl.innerText = window.grupoActivo; };
window.actualizarCheckboxesGrupos = function() { const container = document.getElementById("user-grupos-checkboxes"); if(container) { container.innerHTML = window.todosLosGrupos.map(g => `<label class="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-indigo-50 transition shadow-sm"><input type="checkbox" value="${g}" class="w-4 h-4 text-indigo-600 rounded border-slate-300 chk-grupo"><span class="text-xs font-bold text-slate-700 uppercase">${g}</span></label>`).join(''); } };

// ==========================================
// 5. FIREBASE SINCRONIZACIÓN (ONSNAPSHOT)
// ==========================================
window.activarSincronizacion = function() {
    if(window.tienePermiso('configuracion', 'ver')) {
        onSnapshot(doc(db, "configuracion", "notificaciones"), (docSnap) => { if (docSnap.exists()) { window.configCorreosData = docSnap.data(); window.adminEmailGlobal = window.configCorreosData[window.grupoActivo] || ""; } else { window.configCorreosData = {}; window.adminEmailGlobal = ""; } const elA = document.getElementById("config-admin-email"); if(elA) elA.value = window.adminEmailGlobal; });
        onSnapshot(doc(db, "configuracion", "alertas_stock"), (docSnap) => { if (docSnap.exists()) { window.configStockData = docSnap.data(); window.stockAlertEmailGlobal = window.configStockData[window.grupoActivo] || ""; } else { window.configStockData = {}; window.stockAlertEmailGlobal = ""; } const elS = document.getElementById("config-stock-email"); if(elS) elS.value = window.stockAlertEmailGlobal; });
    }

    onSnapshot(collection(db, "grupos"), snap => {
        window.todosLosGrupos = ["SERVICIOS GENERALES"]; let html = `<div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center"><span class="font-black text-indigo-700 text-xs uppercase"><i class="fas fa-lock mr-1"></i> SERVICIOS GENERALES</span></div>`;
        snap.forEach(d => { const n = d.data().nombre.toUpperCase(); if(n !== "SERVICIOS GENERALES") { window.todosLosGrupos.push(n); let btn = window.tienePermiso('configuracion', 'gestionar') ? `<button onclick="window.eliminarDato('grupos','${d.id}')" class="text-red-400 hover:text-red-600 p-2"><i class="fas fa-trash-alt"></i></button>` : ''; html += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm"><span class="font-bold text-slate-700 text-xs uppercase"><i class="fas fa-folder text-slate-300 mr-1"></i> ${n}</span>${btn}</div>`; } });
        window.renderizarSelectorGrupos(window.usuarioActual.id === 'admin' ? window.todosLosGrupos : window.usuarioActual.grupos); if(document.getElementById("lista-grupos-db")) document.getElementById("lista-grupos-db").innerHTML = html; window.actualizarCheckboxesGrupos();
    });

    onSnapshot(collection(db, "sedes"), snap => {
        let opt = '<option value="" disabled selected>Seleccionar Sede...</option>', lst = '';
        snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(s => { opt += `<option value="${s.nombre}">📍 ${s.nombre}</option>`; let btn = window.tienePermiso('configuracion', 'gestionar') ? `<button onclick="window.eliminarDato('sedes','${s.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button>` : ''; lst += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between shadow-sm items-center"><span class="font-bold text-xs uppercase"><i class="fas fa-map-marker-alt text-slate-300 mr-1"></i> ${s.nombre}</span>${btn}</div>`; });
        if(document.getElementById("sol-ubicacion")) document.getElementById("sol-ubicacion").innerHTML = opt; if(document.getElementById("lista-sedes-db")) document.getElementById("lista-sedes-db").innerHTML = lst;
    });

    onSnapshot(collection(db, "categorias"), snap => {
        window.rawCategorias = []; let html = ''; let opts = '<option value="">Sin Categoría</option>';
        snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(c => {
            window.rawCategorias.push(c); opts += `<option value="${c.nombre}">${c.nombre}</option>`;
            let btn = window.tienePermiso('configuracion', 'gestionar') ? `<button onclick="window.eliminarDato('categorias','${c.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button>` : '';
            html += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between shadow-sm items-center"><span class="font-bold text-xs uppercase"><i class="fas fa-tag text-slate-300 mr-1"></i> ${c.nombre}</span>${btn}</div>`;
        });
        if(document.getElementById("lista-categorias-db")) document.getElementById("lista-categorias-db").innerHTML = html;
        if(document.getElementById("categoria-prod")) document.getElementById("categoria-prod").innerHTML = opts;
        if(document.getElementById("edit-prod-categoria")) document.getElementById("edit-prod-categoria").innerHTML = opts;
    });

    if(window.tienePermiso('stock', 'ver') || window.tienePermiso('pedir', 'ver')) {
        onSnapshot(collection(db, "inventario"), snap => { window.rawInventario = []; snap.forEach(ds => { window.rawInventario.push({ id: ds.id, ...ds.data() }); }); window.procesarDatosInventario(); });
    }

    if(window.tienePermiso('compras', 'ver') || window.tienePermiso('mis_pedidos', 'ver')) {
        onSnapshot(collection(db, "compras"), snap => { window.rawCompras = []; snap.forEach(ds => { window.rawCompras.push({ id: ds.id, ...ds.data() }); }); window.renderCompras(); window.procesarDatosPedidos(); });
    }

    let isInitialPedidos = true;
    onSnapshot(collection(db, "pedidos"), snap => {
        if (!isInitialPedidos) {
            snap.docChanges().forEach(change => {
                const p = change.doc.data(); const miId = window.usuarioActual?.id;
                if (change.type === "added" && p.estado === 'pendiente' && window.tienePermiso('aprobaciones', 'gestionar') && p.usuarioId !== miId) { window.enviarNotificacionNavegador("🚨 Nueva Solicitud", `${p.usuarioId.toUpperCase()} pide ${p.cantidad}x ${p.insumoNom}.\nSede: ${p.ubicacion}`); }
                if (change.type === "modified" && p.usuarioId === miId && ['aprobado', 'rechazado'].includes(p.estado)) { window.enviarNotificacionNavegador("Actualización de Pedido", `Tu pedido de ${p.insumoNom} fue ${p.estado.toUpperCase()}.`); }
            });
        }
        window.pedidosRaw = []; snap.forEach(ds => { window.pedidosRaw.push({ id: ds.id, ...ds.data() }); }); window.procesarDatosPedidos(); isInitialPedidos = false;
    });

    if(window.tienePermiso('historial', 'ver')) { onSnapshot(collection(db, "entradas_stock"), snap => { window.rawEntradas = []; snap.forEach(x => { window.rawEntradas.push({id: x.id, ...x.data()}); }); window.renderHistorialUnificado(); }); }
    if(window.tienePermiso('mantenimiento', 'ver') || window.tienePermiso('dashboard', 'ver')) { onSnapshot(collection(db, "mantenimiento"), snap => { window.rawMantenimiento = []; snap.forEach(x => { window.rawMantenimiento.push({id: x.id, ...x.data()}); }); window.renderMantenimiento(); window.actualizarDashboard(); }); }
    if(window.tienePermiso('activos', 'ver') || window.tienePermiso('dashboard', 'ver')) { onSnapshot(collection(db, "activos"), snap => { window.rawActivos = []; snap.forEach(x => { window.rawActivos.push({id: x.id, ...x.data()}); }); window.renderActivos(); window.actualizarDashboard(); }); }
    if(window.tienePermiso('facturas', 'ver')) { onSnapshot(collection(db, "facturas"), snap => { window.rawFacturas = []; snap.forEach(d => window.rawFacturas.push({id: d.id, ...d.data()})); window.procesarDatosFacturas(); }); }
    
    if(window.tienePermiso('usuarios', 'ver')) {
        onSnapshot(collection(db, "usuarios"), snap => {
            let html = ""; const isManager = window.tienePermiso('usuarios', 'gestionar');
            snap.forEach(d => {
                const u = d.data(); const jsId = d.id.replace(/'/g, "\\'");
                let btns = isManager ? `<div class="flex gap-2"><button onclick="window.prepararEdicionUsuario('${jsId}')" class="text-indigo-400 hover:text-indigo-600 bg-indigo-50 p-2 rounded-lg transition"><i class="fas fa-pen"></i></button><button onclick="window.eliminarDato('usuarios','${jsId}')" class="text-red-400 hover:text-red-600 bg-red-50 p-2 rounded-lg transition"><i class="fas fa-trash"></i></button></div>` : '';
                html += `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm flex justify-between items-center"><div class="truncate w-full"><div class="flex items-center gap-2"><span class="font-black text-sm uppercase text-slate-800">${d.id}</span><span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold border border-slate-200">${u.rol}</span></div><span class="text-[10px] text-indigo-500 font-bold block truncate mt-1.5"><i class="fas fa-folder-open text-indigo-300"></i> ${(u.grupos||[]).join(", ")}</span></div>${btns}</div>`;
            });
            if(document.getElementById("lista-usuarios-db")) document.getElementById("lista-usuarios-db").innerHTML = html;
        });
    }
};

// ==========================================
// 6. RENDERIZACIÓN DE VISTAS Y DATOS
// ==========================================
window.renderCatalogoCompras = function() {
    const contenedor = document.getElementById("grid-insumos-compra"); const datalistCompras = document.getElementById("lista-sugerencias-compras");
    if(!contenedor || !datalistCompras) return; let listHTML = "";
    const invFiltrado = window.rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    contenedor.innerHTML = invFiltrado.map(p => {
        const nombreMostrar = (p.nombre || p.id || '').toUpperCase(); const jsId = (p.id || '').replace(/'/g, "\\'"); listHTML += `<option value="${nombreMostrar}">`;
        return `<div onclick="document.getElementById('compra-insumo').value='${jsId}'; document.getElementById('compra-cant').focus();" class="p-2 border border-slate-200 rounded-lg bg-white cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition text-[10px] font-bold truncate item-tarjeta flex justify-between items-center" title="${nombreMostrar}">
            <span class="truncate pr-2">${nombreMostrar}</span><span class="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[8px] border border-slate-200">${p.cantidad}</span>
        </div>`;
    }).join('');
    datalistCompras.innerHTML = listHTML;
};

window.renderCatalogoSolicitud = function() {
    const contenedor = document.getElementById("grid-insumos-solicitar"); if(!contenedor) return;
    const invFiltrado = window.rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    if(invFiltrado.length === 0) { contenedor.innerHTML = `<p class="text-center text-slate-400 text-xs py-4 col-span-full">No hay insumos disponibles en este entorno.</p>`; return; }
    
    contenedor.innerHTML = invFiltrado.map(p => {
        const nombreMostrar = (p.nombre || p.id || '').toUpperCase(); const jsId = (p.id || '').replace(/'/g, "\\'");
        const catBadge = p.categoria ? `<span class="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[8px] border border-indigo-200 mt-1 inline-block">${p.categoria}</span>` : '';
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-10 h-10 object-cover rounded-lg border border-slate-200 flex-shrink-0">` : `<div class="w-10 h-10 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0"><i class="fas fa-box"></i></div>`;
        if (p.cantidad <= 0) {
            return `<div class="flex items-center justify-between p-3 rounded-xl border border-red-100 bg-red-50/50 opacity-60"><div class="flex items-center gap-3 flex-1 min-w-0 pr-2">${img}<div class="flex-1 min-w-0"><p class="font-black text-xs uppercase text-slate-800 truncate line-through">${nombreMostrar}</p><p class="text-[10px] text-red-500 font-bold uppercase mt-0.5">Agotado</p></div></div><i class="fas fa-ban text-red-300 text-lg"></i></div>`;
        }
        return `<div onclick="window.ajustarCantidad('${jsId}', 1)" class="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition item-tarjeta"><div class="flex items-center gap-3 flex-1 min-w-0 pr-2">${img}<div class="flex-1 min-w-0"><p class="font-black text-xs uppercase text-slate-800 truncate">${nombreMostrar}</p>${catBadge}<p class="text-[10px] text-slate-500 font-bold uppercase mt-0.5">Stock: <span class="text-indigo-600">${p.cantidad || 0}</span></p></div></div><i class="fas fa-plus-circle text-indigo-400 text-lg"></i></div>`;
    }).join('');
};

window.renderCarritoPedidos = function() {
    const cartContainer = document.getElementById("contenedor-lista-pedidos"); if(!cartContainer) return;
    let html = ""; const invFiltrado = window.rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    
    Object.keys(window.carritoGlobal).forEach(idInsumo => {
        const cant = window.carritoGlobal[idInsumo];
        if (cant > 0) {
            const p = invFiltrado.find(x => x.id === idInsumo) || { id: idInsumo, cantidad: 0 };
            const nombreMostrar = (p.nombre || p.id).toUpperCase(); const jsId = p.id.replace(/'/g, "\\'");
            const disablePlus = cant >= p.cantidad ? 'opacity-30 cursor-not-allowed' : 'hover:bg-indigo-200 hover:text-indigo-800';
            
            html += `<div class="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-200 shadow-sm mb-2 item-tarjeta">
                <p class="font-black text-xs uppercase text-indigo-900 truncate flex-1 pr-2">${nombreMostrar}</p>
                <div class="flex items-center gap-2 bg-white rounded-lg p-1 border border-indigo-100 flex-shrink-0">
                    <button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 font-black text-slate-600 transition flex items-center justify-center">-</button>
                    <span class="w-6 text-center font-black text-indigo-700 text-xs">${cant}</span>
                    <button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-7 h-7 rounded bg-indigo-100 font-black text-indigo-700 transition flex items-center justify-center ${disablePlus}">+</button>
                </div>
            </div>`;
        }
    });
    cartContainer.innerHTML = html || `<div class="flex flex-col items-center justify-center py-6 text-slate-400"><i class="fas fa-shopping-basket text-3xl mb-2 opacity-50"></i><p class="text-[10px] font-medium">Sin insumos seleccionados.</p></div>`;
};

window.actualizarDashboard = function() {
    if(!window.cachePedidos || !window.tienePermiso('dashboard', 'ver')) return;
    const desdeInput = document.getElementById("dash-desde")?.value; const hastaInput = document.getElementById("dash-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity; if(desdeInput) tDesde = new Date(desdeInput + 'T00:00:00').getTime(); if(hastaInput) tHasta = new Date(hastaInput + 'T23:59:59').getTime();
    
    const panelFiltros = document.getElementById("panel-filtros-dashboard");
    if(panelFiltros && window.tienePermiso('dashboard', 'gestionar')) { if(!document.getElementById("btn-excel-dashboard")) { panelFiltros.insertAdjacentHTML('beforeend', `<button id="btn-excel-dashboard" onclick="window.descargarReporte()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow hover:bg-emerald-700 transition ml-2"><i class="fas fa-file-excel"></i></button>`); } } else if (document.getElementById("btn-excel-dashboard")) { document.getElementById("btn-excel-dashboard").remove(); }
    
    let pedidosFiltrados = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta);
    if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pedidosFiltrados.filter(p => p.estado === 'pendiente').length;
    let sedesCount = {}; pedidosFiltrados.forEach(p => { if(p.estado !== 'rechazado') sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad; });
    const activosFiltrados = window.rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo && a.timestamp >= tDesde && a.timestamp <= tHasta);
    if(document.getElementById("metrica-activos")) document.getElementById("metrica-activos").innerText = activosFiltrados.length;
    if(document.getElementById("metrica-activos-fallas")) document.getElementById("metrica-activos-fallas").innerText = activosFiltrados.filter(a => ['En Mantenimiento', 'Fuera de Servicio'].includes(a.estado)).length;
    const mantFiltrados = window.rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo && m.estado !== 'completado' && m.timestamp >= tDesde && m.timestamp <= tHasta);
    if(document.getElementById("metrica-mant-pend")) document.getElementById("metrica-mant-pend").innerText = mantFiltrados.length;
    const invActivo = window.rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let lblS = [], datS = []; invActivo.forEach(p => { const n = p.nombre || p.id || 'N/A'; lblS.push(n.toUpperCase().substring(0,10)); datS.push(p.cantidad); });
    
    window.renderChart('stockChart', lblS, datS, 'Stock', window.chartPalette, window.miGraficoStock, ch => window.miGraficoStock = ch); window.renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Demandas', window.chartPalette, window.miGraficoUbicacion, ch => window.miGraficoUbicacion = ch);
};

window.renderHistorialUnificado = function() {
    const t = document.getElementById("tabla-movimientos-unificados"); if(!t) return;
    const panelFiltros = document.getElementById("panel-filtros-historial");
    if(panelFiltros && window.tienePermiso('historial', 'gestionar')) { if(!document.getElementById("btn-excel-historial")) { panelFiltros.insertAdjacentHTML('beforeend', `<button id="btn-excel-historial" onclick="window.descargarReporte()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow hover:bg-emerald-700 ml-2"><i class="fas fa-file-excel"></i> Exportar</button>`); } } else if (document.getElementById("btn-excel-historial")) { document.getElementById("btn-excel-historial").remove(); }

    let html = "";
    const ent = window.rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo).map(e => ({ ts: e.timestamp, fecha: e.fecha || new Date(e.timestamp).toLocaleString(), tipo: '📥 ENTRADA', insumo: e.insumo || 'N/A', cant: e.cantidad || 0, solicito: e.usuario || 'SISTEMA', acepto: 'DIRECTO', motivo: e.motivo_edicion || 'Ingreso Almacén', tiempo: 'N/A', estado: 'COMPLETADO', id: e.id }));
    const sal = window.cachePedidos.map(p => { let tProc = (p.timestamp_aprobado && p.timestamp) ? window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado) : 'PEND'; return { ts: p.timestamp, fecha: p.fecha || new Date(p.timestamp).toLocaleString(), tipo: '📤 SALIDA', insumo: p.insumoNom || 'N/A', cant: p.cantidad || 0, solicito: p.usuarioId || 'N/A', acepto: p.entregado_por || (p.estado === 'pendiente' ? 'ESPERANDO' : 'RECHAZADO'), motivo: p.notas || 'Sin notas', tiempo: tProc, estado: p.estado ? p.estado.toUpperCase() : 'DESCONOCIDO', id: p.id, rawEstado: p.estado || 'pendiente' }; });
    const isGestor = window.tienePermiso('historial', 'gestionar'); const combinados = [...ent, ...sal].sort((a,b) => b.ts - a.ts);
    
    if (combinados.length === 0) { t.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 font-bold">No hay registros.</td></tr>`; return; }

    combinados.forEach(h => {
        let btnEdit = (h.tipo === '📥 ENTRADA' && isGestor) ? `<button onclick="window.abrirModalEditarEntrada('${h.id}', '${h.insumo.replace(/'/g,"\\'")}', ${h.cant})" class="text-amber-500 hover:text-amber-600 transition ml-2"><i class="fas fa-pen bg-amber-50 p-1.5 rounded"></i></button>` : '';
        let statusClass = h.rawEstado || h.estado.toLowerCase();
        html += `<tr class="border-b hover:bg-slate-50 transition">
            <td class="p-4 text-[10px] font-mono whitespace-nowrap">${h.fecha.split(',')[0]}</td>
            <td class="p-4 font-black text-xs">${h.tipo}</td>
            <td class="p-4 font-bold uppercase text-xs text-slate-700">${h.insumo}</td>
            <td class="p-4 font-black text-center text-indigo-600">${h.cant}</td>
            <td class="p-4 text-[10px] uppercase font-bold text-slate-500">${h.solicito}</td>
            <td class="p-4 text-[10px] uppercase font-bold text-emerald-600">${h.acepto}</td>
            <td class="p-4 text-center"><span class="badge status-${statusClass}">${h.estado}</span></td>
            <td class="p-4 text-[10px] italic text-slate-400 max-w-[150px] truncate" title="${h.motivo}">${h.motivo} ${btnEdit}</td>
            <td class="p-4 text-[10px] font-black text-indigo-400">${h.tiempo}</td>
        </tr>`;
    });
    t.innerHTML = html;
};

window.renderActivos = function() {
    const list = document.getElementById("lista-activos-db"); if(!list) return; let html = "";
    const btnReg = document.getElementById("btn-admin-activos"); if(window.tienePermiso('activos', 'gestionar') && btnReg) btnReg.classList.remove("hidden");
    const activosFiltrados = window.rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp); const isGestor = window.tienePermiso('activos', 'gestionar');
    activosFiltrados.forEach(a => {
        const jsId = a.id.replace(/'/g, "\\'"); const img = a.imagen ? `<img src="${a.imagen}" class="w-24 h-24 object-cover rounded-xl border shadow-sm">` : `<div class="w-24 h-24 bg-slate-100 rounded-xl flex items-center justify-center text-slate-300 border-2 border-dashed"><i class="fas fa-image text-2xl"></i></div>`;
        let bColor = "bg-emerald-50 text-emerald-600 border-emerald-200"; if(a.estado === "En Mantenimiento") bColor = "bg-amber-50 text-amber-600 border-amber-200"; if(a.estado === "Fuera de Servicio") bColor = "bg-red-50 text-red-600 border-red-200";
        let controls = isGestor ? `<button onclick="window.abrirModalActivo('${jsId}')" class="text-indigo-400 hover:bg-indigo-50 p-2 rounded-lg transition"><i class="fas fa-pen"></i></button><button onclick="window.eliminarDato('activos','${jsId}')" class="text-red-300 hover:bg-red-50 p-2 rounded-lg transition"><i class="fas fa-trash"></i></button>` : "";
        html += `<div class="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-indigo-200 transition flex items-center gap-6">${img}<div class="flex-1 min-w-0 grid grid-cols-2 lg:grid-cols-4 gap-4 items-center"><div class="col-span-1"><h4 class="font-black text-slate-800 uppercase text-sm truncate">${a.nombre}</h4><p class="text-[10px] font-mono text-indigo-500 font-bold">${a.id}</p><span class="badge ${bColor} mt-1">${a.estado}</span></div><div><p class="text-[9px] font-black text-slate-400 uppercase">Marca / Modelo</p><p class="text-xs font-bold text-slate-700 uppercase truncate">${a.marca || 'N/A'}</p></div><div><p class="text-[9px] font-black text-slate-400 uppercase">Ubicación</p><p class="text-xs font-bold text-slate-700 uppercase truncate"><i class="fas fa-map-marker-alt text-red-400 mr-1"></i> ${a.ubicacion || 'N/A'}</p></div><div class="flex justify-end gap-2 items-center"><button onclick="window.abrirDetallesActivo('${jsId}')" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md hover:bg-indigo-700 transition">Ver Ficha</button>${controls}</div></div></div>`;
    }); list.innerHTML = html || `<p class="text-center text-slate-400 py-10 font-bold">No hay activos en este entorno.</p>`;
};

window.renderMantenimiento = function() {
    const tb = document.getElementById("tabla-mantenimiento-db"); if(!tb) return; let html = "";
    const btnReg = document.getElementById("btn-admin-mantenimiento"); if(window.tienePermiso('mantenimiento', 'gestionar') && btnReg) btnReg.classList.remove("hidden");
    const mantGrupo = window.rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp); const isGestor = window.tienePermiso('mantenimiento', 'gestionar');
    mantGrupo.forEach(m => {
        let badgeHtml = "", actions = "";
        if (m.estado === 'completado') { badgeHtml = `<span class="badge status-recibido mb-1">Completado</span>`; } 
        else if (m.estado === 'en_proceso') { badgeHtml = `<span class="badge status-aprobado mb-1 animate-pulse">En Proceso</span>`; if(isGestor) actions = `<button onclick="window.completarMantenimiento('${m.id}')" class="text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition mr-1 mb-1"><i class="fas fa-flag-checkered"></i> Finalizar</button>`; } 
        else { badgeHtml = `<span class="badge status-pendiente">Pendiente</span>`; if(isGestor) actions = `<button onclick="window.iniciarMantenimiento('${m.id}')" class="text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition mr-1 mb-1"><i class="fas fa-play"></i> Iniciar</button>`; }
        actions += `<button onclick="window.abrirBitacora('${m.id}')" class="text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition"><i class="fas fa-book"></i> Bitácora</button>`;
        const trashBtn = isGestor ? `<button onclick="window.eliminarDato('mantenimiento','${m.id}')" class="text-red-400 hover:text-red-600 ml-2 p-1"><i class="fas fa-trash"></i></button>` : '';
        let notifTag = m.fecha_notificacion ? `<br><span class="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded mt-1 inline-block font-bold"><i class="fas fa-bell"></i> Alerta: ${m.fecha_notificacion}</span>` : '';
        html += `<tr class="hover:bg-slate-50 border-b border-slate-100 transition ${m.estado === 'completado' ? 'bg-slate-50/30' : ''}"><td class="p-4 align-top w-32">${badgeHtml}</td><td class="p-4 font-bold text-slate-700 uppercase text-xs align-top">${m.equipo}</td><td class="p-4 text-slate-500 text-xs font-mono font-medium align-top">${m.fecha_programada}${notifTag}</td><td class="p-4 text-indigo-600 text-[10px] font-bold uppercase align-top">${m.responsable}</td><td class="p-4 text-right align-top"><div class="flex flex-wrap justify-end gap-1">${actions}${trashBtn}</div></td></tr>`;
    }); tb.innerHTML = html || '<tr><td colspan="5" class="p-4 text-center text-slate-400">No hay mantenimientos.</td></tr>';
};

window.renderCompras = function() {
    const btnComprar = document.getElementById("panel-registrar-compra"); if(window.tienePermiso('compras', 'gestionar') && btnComprar) btnComprar.classList.remove("hidden");
    const tb = document.getElementById("lista-compras-db"); if(!tb) return; let html = "";
    
    // Aquí solo se muestran las RECIBIDAS (historial)
    const comprasGrupo = window.rawCompras.filter(c => (c.grupo || "SERVICIOS GENERALES") === window.grupoActivo && c.estado === 'recibido').sort((a,b) => b.timestamp - a.timestamp); 
    const isGestor = window.tienePermiso('compras', 'gestionar');
    
    comprasGrupo.forEach(c => {
        let badge = `<span class="badge status-recibido">Recibido</span>`;
        let itemsList = `<ul class="text-[11px] text-slate-600 font-medium mt-3 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 h-24 overflow-y-auto custom-scroll shadow-inner">`;
        let totalCosto = 0; c.items.forEach(i => { let pStr = i.precio > 0 ? `($${i.precio.toFixed(2)})` : ''; itemsList += `<li><span class="font-black text-slate-800">${i.cantidad}x</span> ${i.insumo} <span class="text-emerald-600 font-bold ml-1">${pStr}</span></li>`; totalCosto += i.precio; }); itemsList += `</ul>`;
        let trashBtn = isGestor ? `<button onclick="window.eliminarDato('compras','${c.id}')" class="text-red-300 hover:text-red-500 bg-red-50 p-1.5 rounded-lg transition"><i class="fas fa-trash text-xs"></i></button>` : '';
        html += `<div class="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col justify-between hover:shadow-lg transition"><div class="flex justify-between items-start mb-2"><div>${badge}<h4 class="font-black text-slate-800 uppercase text-base mt-2">${c.proveedor}</h4></div>${trashBtn}</div><p class="text-[10px] font-mono text-slate-400 mt-1">Fac: <span class="font-bold">${c.factura || 'N/A'}</span> • ${c.fecha_compra}</p>${itemsList}<div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-100"><span class="text-[10px] uppercase text-indigo-500 font-black tracking-wide"><i class="fas fa-user mr-1 text-indigo-300"></i> ${c.registrado_por}</span><span class="text-emerald-600 font-black text-lg">$${totalCosto.toFixed(2)}</span></div></div>`;
    }); 
    tb.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay compras finalizadas en este grupo.</p>`;
};

window.procesarDatosFacturas = function() {
    const tb = document.getElementById("tabla-facturas-db"); if(!tb) return;
    const btnReg = document.getElementById("btn-admin-facturas"); if(window.tienePermiso('facturas', 'gestionar') && btnReg) btnReg.classList.remove("hidden");
    const factGrupo = window.rawFacturas.filter(f => (f.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    let html = ""; const isGestor = window.tienePermiso('facturas', 'gestionar');
    factGrupo.forEach(f => {
        const docLink = f.archivo_url ? `<a href="${f.archivo_url}" target="_blank" class="text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px]"><i class="fas fa-file-pdf"></i> Ver</a>` : 'N/A';
        const trashBtn = isGestor ? `<button onclick="window.eliminarDato('facturas','${f.id}')" class="text-red-400 hover:text-red-600 ml-2 bg-red-50 p-1.5 rounded-lg"><i class="fas fa-trash"></i></button>` : '';
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition"><td class="p-4 text-xs font-mono text-slate-500">${f.fecha_compra}</td><td class="p-4 text-xs font-bold uppercase text-slate-800">${f.proveedor}</td><td class="p-4 text-xs font-black text-emerald-600 text-right">$${f.gasto.toFixed(2)}</td><td class="p-4 text-[10px] text-center uppercase font-bold text-slate-500">${f.usuarioRegistro}</td><td class="p-4 text-xs text-center">${docLink}</td><td class="p-4 text-center">${trashBtn}</td></tr>`;
    }); tb.innerHTML = html || '<tr><td colspan="6" class="p-4 text-center text-slate-400 font-medium">No hay facturas registradas.</td></tr>';
};

window.renderListaInsumos = function() {
    const contenedor = document.getElementById("lista-inventario"); if(!contenedor) return;
    let gridHTML = ""; let tr = 0, ts = 0;
    const invFiltrado = window.rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo); const isGestor = window.tienePermiso('stock', 'gestionar');
    invFiltrado.forEach(p => {
        const nombreMostrar = (p.nombre || p.id || '').toUpperCase(); const jsId = (p.id || '').replace(/'/g, "\\'"); tr++; ts += (p.cantidad || 0);
        let controls = isGestor ? `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 p-1.5 rounded transition"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 p-1.5 rounded transition"><i class="fas fa-trash"></i></button></div>` : "";
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-14 h-14 object-cover rounded-xl border border-slate-200 shadow-sm mb-3">` : `<div class="w-14 h-14 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-300 mb-3 shadow-inner"><i class="fas fa-image text-xl"></i></div>`;
        const catBadge = p.categoria ? `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[8px] ml-2 border border-indigo-200">${p.categoria}</span>` : '';
        const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo); const border = isLow ? "border-2 border-red-400 bg-red-50" : "border border-slate-200 bg-white";
        gridHTML += `<div class="${border} p-5 rounded-[1.5rem] shadow-sm hover:shadow-md transition flex flex-col item-tarjeta h-full"><div class="flex justify-between items-start mb-2">${img}${controls}</div><p class="font-black text-xs uppercase text-slate-800 break-words whitespace-normal leading-tight flex-1" title="${nombreMostrar}">${nombreMostrar} ${catBadge} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse inline-block ml-1"></i>':''}</p><div class="flex justify-between items-end mt-4 pt-4 border-t border-slate-100"><p class="text-3xl font-black text-indigo-900">${p.cantidad || 0}</p>${p.precio ? `<span class="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">$${p.precio}</span>` : ''}</div></div>`;
    });
    contenedor.innerHTML = gridHTML || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay insumos registrados en este grupo.</p>`;
    if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = tr; if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = ts;
};

window.procesarDatosInventario = function() {
    window.renderListaInsumos();
    window.renderCatalogoSolicitud();
    window.renderCarritoPedidos();
    window.renderCatalogoCompras();
    window.actualizarDashboard();
};

window.procesarDatosPedidos = function() {
    window.cachePedidos = window.pedidosRaw.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    
    // ============================================
    // APROBACIONES GESTOR
    // ============================================
    let grupos = {}; let htmlAdmin = "";
    window.cachePedidos.forEach(p => { const bKey = p.batchId || p.timestamp; if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp, notas: p.notas || '' }; grupos[bKey].items.push(p); });
    
    if(window.tienePermiso('aprobaciones', 'gestionar')) {
        Object.values(grupos).sort((a,b) => b.ts - a.ts).forEach(g => {
            const pendingItems = g.items.filter(i => i.estado === 'pendiente');
            if(pendingItems.length > 0) {
                let itemsStr = ""; const hasAlta = pendingItems.some(i => (i.prioridad || 'normal') === 'alta'); const badgeUrgente = hasAlta ? `<span class="bg-red-500 text-white px-2 py-1 rounded text-[9px] uppercase font-black animate-pulse ml-2 shadow-sm">Urgente</span>` : ''; const blockNota = g.notas ? `<div class="mb-4 text-[11px] text-indigo-800 bg-indigo-50 p-3 rounded-xl italic border border-indigo-100 shadow-inner">"${g.notas}"</div>` : '';
                pendingItems.forEach(i => { itemsStr += `<span class="bg-white px-3 py-1.5 rounded-lg text-[10px] border border-slate-200 uppercase font-black text-slate-700 break-words whitespace-normal text-left shadow-sm">${i.insumoNom} (x${i.cantidad})</span>`; });
                const timeStr = new Date(g.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                htmlAdmin += `<div class="bg-white p-6 rounded-[2rem] border-l-8 ${hasAlta?'border-l-red-500':'border-l-amber-400'} border-y border-r border-slate-200 shadow-md cursor-pointer group hover:shadow-lg transition" onclick="window.abrirModalGrupo('${g.items[0].batchId || g.ts}')"><div class="flex justify-between items-start mb-4"><div><h4 class="font-black text-slate-900 text-base uppercase flex items-center"><i class="fas fa-user-circle text-slate-300 mr-2 text-xl"></i> ${g.user} ${badgeUrgente}</h4><span class="text-xs text-slate-500 font-bold mt-1 block"><i class="fas fa-map-marker-alt text-slate-300 w-4"></i> ${g.sede} <br><i class="fas fa-calendar-alt text-slate-300 w-4 mt-1"></i> ${(g.date||'').split(',')[0]} a las ${timeStr}</span></div><span class="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition shadow-sm"><i class="fas fa-chevron-right text-sm"></i></span></div>${blockNota}<div class="flex flex-wrap gap-2">${itemsStr}</div></div>`;
            }
        });
    }
    if(document.getElementById("lista-pendientes-admin")) document.getElementById("lista-pendientes-admin").innerHTML = htmlAdmin || `<p class="col-span-full text-slate-400 text-sm font-medium">No hay solicitudes pendientes.</p>`;

    // ============================================
    // MIS PEDIDOS (USUARIO) Y COMPRAS EN TRÁNSITO (GESTOR)
    // ============================================
    let htmlActive = "", htmlHistory = "";
    
    // Inyectar compras en tránsito para los gestores
    if(window.tienePermiso('compras', 'gestionar')) {
        const comprasTransito = window.rawCompras.filter(c => (c.grupo || "SERVICIOS GENERALES") === window.grupoActivo && c.estado !== 'recibido').sort((a,b) => b.timestamp - a.timestamp);
        if(comprasTransito.length > 0) {
            htmlActive += `<div class="col-span-full border-b-2 border-indigo-100 pb-2 mb-2 mt-2"><h3 class="text-indigo-800 font-black text-sm uppercase tracking-widest"><i class="fas fa-truck-loading mr-2 text-indigo-500"></i>Recepciones Pendientes</h3></div>`;
            comprasTransito.forEach(c => {
                let itemsList = `<ul class="text-[11px] text-indigo-900 font-medium mt-3 space-y-1.5 bg-indigo-50 p-3 rounded-xl border border-indigo-100 h-20 overflow-y-auto custom-scroll shadow-inner">`;
                c.items.forEach(i => { itemsList += `<li><span class="font-black">${i.cantidad}x</span> ${i.insumo}</li>`; }); itemsList += `</ul>`;
                let btnRecibir = `<button onclick="window.confirmarRecepcionCompra('${c.id}')" class="bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-lg hover:bg-emerald-600 mt-4 w-full transition flex items-center justify-center gap-2"><i class="fas fa-box-open"></i> Recibir Físicamente</button>`;
                htmlActive += `<div class="bg-white p-5 rounded-[1.5rem] border-2 border-indigo-200 shadow-md item-tarjeta"><div class="flex justify-between items-start mb-2"><div><span class="badge status-en_transito animate-pulse border-indigo-200">COMPRA EN TRÁNSITO</span><h4 class="font-black text-slate-800 uppercase text-sm mt-2">${c.proveedor}</h4><p class="text-[10px] text-slate-400 mt-1">${c.fecha_compra}</p></div></div>${itemsList}${btnRecibir}</div>`;
            });
            htmlActive += `<div class="col-span-full border-b-2 border-slate-100 pb-2 mb-2 mt-6"><h3 class="text-slate-500 font-black text-sm uppercase tracking-widest"><i class="fas fa-user mr-2"></i>Mis Pedidos Personales</h3></div>`;
        }
    }

    const misPedidos = window.cachePedidos.filter(p => p.usuarioId === window.usuarioActual?.id).sort((a,b) => b.timestamp - a.timestamp);
    misPedidos.forEach(p => {
        let btns = "";
        if(p.estado === 'aprobado') { btns = `<div class="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-3"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-emerald-600 transition flex items-center gap-1"><i class="fas fa-check-circle"></i> Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-50 transition flex items-center gap-1"><i class="fas fa-exclamation-triangle"></i> Reportar</button></div>`; } 
        else if(['recibido', 'devuelto'].includes(p.estado)) { btns = `<div class="mt-4 pt-3 border-t border-slate-100 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-600 text-xs font-bold hover:underline bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 transition"><i class="fas fa-undo mr-1"></i> Devolver / Reportar</button></div>`; }
        const prio = p.prioridad || 'normal'; const notesHtml = p.notas ? `<div class="mt-3 bg-amber-50 p-2.5 rounded-xl border border-amber-100"><p class="text-[9px] font-black text-amber-600 uppercase mb-1">Tu Nota:</p><p class="text-[11px] text-amber-900 italic font-medium">"${p.notas}"</p></div>` : '';
        let tiemposHtml = `<div class="mt-3 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] font-mono text-slate-600 shadow-inner"><div class="flex justify-between items-center"><span class="flex items-center gap-1.5"><i class="fas fa-clock text-slate-400"></i> Pedido:</span> <span class="font-bold">${new Date(p.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>`;
        if (p.timestamp_aprobado) tiemposHtml += `<div class="flex justify-between items-center"><span class="flex items-center gap-1.5"><i class="fas fa-user-check text-indigo-500"></i> Atendido:</span> <span class="font-bold">${new Date(p.timestamp_aprobado).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-1 font-black">+${window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado)}</span></span></div>`;
        if (p.timestamp_recibido) tiemposHtml += `<div class="flex justify-between items-center text-emerald-700"><span class="flex items-center gap-1.5"><i class="fas fa-box-open"></i> Recibido:</span> <span class="font-bold">${new Date(p.timestamp_recibido).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-1 font-black">+${window.formatoTiempoDiferencia(p.timestamp_aprobado || p.timestamp, p.timestamp_recibido)}</span></span></div>`;
        if (p.entregado_por) tiemposHtml += `<div class="flex justify-between items-center text-slate-700 mt-2 border-t border-slate-200 pt-2"><span class="flex items-center gap-1.5"><i class="fas fa-handshake text-slate-400"></i> Entregado por:</span> <span class="font-black uppercase">${p.entregado_por}</span></div>`; tiemposHtml += `</div>`;
        const cardHtml = `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm item-tarjeta"><div class="flex justify-between items-start mb-2"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-800 uppercase text-sm mt-2 break-words whitespace-normal leading-tight">${p.insumoNom} <span class="badge status-pri-${prio} inline-block ml-1 shadow-sm">${prio}</span></h4><p class="text-xs text-indigo-600 font-black mt-1">x${p.cantidad} <span class="text-slate-400 font-medium ml-1">• ${p.ubicacion}</span></p><p class="text-[10px] text-slate-400 mt-1">${(p.fecha||'').split(',')[0]}</p></div></div>${notesHtml}${tiemposHtml}${btns}</div>`;
        if(['pendiente', 'aprobado'].includes(p.estado)) htmlActive += cardHtml; else htmlHistory += cardHtml;
    });

    if(document.getElementById("tab-content-activos")) document.getElementById("tab-content-activos").innerHTML = htmlActive || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No tienes elementos en curso.</p>`;
    if(document.getElementById("tab-content-historial")) document.getElementById("tab-content-historial").innerHTML = htmlHistory || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay historial de solicitudes.</p>`;
};

// ==========================================
// 8. ESCÁNER QR
// ==========================================
window.iniciarScanner = function(inputIdTarget) { document.getElementById("modal-scanner").classList.remove("hidden"); window.html5QrcodeScanner = new Html5Qrcode("reader"); window.html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (txt) => { window.detenerScanner(); const i = document.getElementById(inputIdTarget); if(i) { i.value = txt; if(inputIdTarget === 'buscador-activos') window.debounceFiltrarTarjetas('lista-activos-db', txt); else window.debounceFiltrarTarjetas('lista-inventario', txt); } }, () => {}).catch(err => { alert("Error de cámara al iniciar escáner."); window.detenerScanner(); }); };
window.detenerScanner = function() { if(window.html5QrcodeScanner) window.html5QrcodeScanner.stop().catch(()=>{}); document.getElementById("modal-scanner").classList.add("hidden"); };

// ==========================================
// 9. LÓGICA DE NEGOCIO CRUD Y LÍMITES
// ==========================================
window.ajustarCantidad = function(idInsumo, delta) {
    const safeId = idInsumo.replace(/[^a-zA-Z0-9]/g, '_');
    const item = window.rawInventario.find(p => p.id === idInsumo && (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const stockMaximo = item ? parseInt(item.cantidad) || 0 : 0;
    
    let current = window.carritoGlobal[idInsumo] || 0;
    let nuevoValor = current + delta;
    
    if (nuevoValor < 0) nuevoValor = 0;
    if (nuevoValor > stockMaximo) { nuevoValor = stockMaximo; if(delta > 0) alert(`Límite alcanzado: Solo hay ${stockMaximo} unidades disponibles en inventario.`); }
    
    window.carritoGlobal[idInsumo] = nuevoValor; window.renderCarritoPedidos();
};

window.prepararEdicionProducto = async function(id) { const s = await getDoc(doc(db,"inventario",id)); const d = s.data(); document.getElementById('edit-prod-id').value = id; document.getElementById('edit-prod-nombre').value = d.nombre || id.toUpperCase(); document.getElementById('edit-prod-categoria').value = d.categoria || ''; document.getElementById('edit-prod-precio').value = d.precio || ''; document.getElementById('edit-prod-min').value = d.stockMinimo || ''; if (d.imagen) { document.getElementById('edit-prod-img').value = d.imagen; document.getElementById('preview-img').src = d.imagen; document.getElementById('preview-img').classList.remove('hidden'); } else { document.getElementById('edit-prod-img').value = ''; document.getElementById('preview-img').classList.add('hidden'); } document.getElementById('qr-insumo-id-text').innerText = "ID: " + id.toUpperCase(); document.getElementById('qr-insumo-img').src = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=" + encodeURIComponent(id); document.getElementById('modal-detalles').classList.remove('hidden'); };
window.guardarDetallesProducto = async function() { const imgUrl = document.getElementById('edit-prod-img').value; const precio = parseFloat(document.getElementById('edit-prod-precio').value) || 0; const minimo = parseInt(document.getElementById('edit-prod-min').value) || 0; const nuevoNombre = document.getElementById('edit-prod-nombre').value.trim().toUpperCase(); const nuevaCat = document.getElementById('edit-prod-categoria').value; await updateDoc(doc(db,"inventario",document.getElementById('edit-prod-id').value),{ nombre: nuevoNombre, categoria: nuevaCat, precio: precio, stockMinimo: minimo, imagen: imgUrl }); document.getElementById('modal-detalles').classList.add('hidden'); };

window.agregarItemCompra = function() { const insumo = document.getElementById("compra-insumo").value.trim().toUpperCase(); const cant = parseInt(document.getElementById("compra-cant").value); const precio = parseFloat(document.getElementById("compra-precio").value) || 0; if(!insumo || isNaN(cant) || cant <= 0) return alert("Completa Insumo y Cantidad válida."); if(!window.carritoCompras) window.carritoCompras = {}; window.carritoCompras[insumo] = { cantidad: cant, precio: precio }; window.renderCarritoCompras(); document.getElementById("compra-insumo").value = ""; document.getElementById("compra-cant").value = ""; document.getElementById("compra-precio").value = ""; document.getElementById("compra-insumo").focus(); };
window.renderCarritoCompras = function() { const container = document.getElementById("lista-items-compra"); let items = Object.entries(window.carritoCompras || {}); if(items.length === 0) { container.innerHTML = `<p class="text-xs text-slate-400 text-center italic py-2">Sin items añadidos</p>`; return; } let html = ""; let total = 0; items.forEach(([ins, data]) => { let pStr = data.precio > 0 ? `<span class="text-emerald-600 font-bold">$${data.precio.toFixed(2)}</span>` : ''; html += `<div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 shadow-sm mb-2"><span>${data.cantidad}x ${ins}</span><div class="flex items-center gap-4">${pStr}<button onclick="delete window.carritoCompras['${ins}']; window.renderCarritoCompras()" class="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded"><i class="fas fa-times"></i></button></div></div>`; total += data.precio; }); if(total > 0) html += `<div class="text-right text-sm font-black text-slate-800 mt-3 pr-2 border-t border-slate-200 pt-2">Total Estimado: <span class="text-emerald-600">$${total.toFixed(2)}</span></div>`; container.innerHTML = html; };
window.procesarCompra = async function() { const prov = document.getElementById("compra-proveedor").value.trim().toUpperCase(); const fact = document.getElementById("compra-factura").value.trim().toUpperCase(); const items = Object.entries(window.carritoCompras || {}); if(!prov || items.length === 0) return alert("Proveedor y al menos 1 ítem son requeridos."); const itemsArray = items.map(([ins, data]) => ({ insumo: ins, cantidad: data.cantidad, precio: data.precio })); try { await addDoc(collection(db, "compras"), { proveedor: prov, factura: fact, items: itemsArray, estado: "en_transito", grupo: window.grupoActivo, registrado_por: window.usuarioActual.id, fecha_compra: new Date().toLocaleString(), timestamp: Date.now() }); window.carritoCompras = {}; window.renderCarritoCompras(); document.getElementById("compra-proveedor").value = ""; document.getElementById("compra-factura").value = ""; alert("Compra registrada en tránsito. Aparecerá en 'Mis Pedidos' para recibirla."); } catch(e) { alert("Error registrando compra."); } };
window.confirmarRecepcionCompra = async function(compraId) { if(!confirm("¿Confirmas recibir la compra en físico? Esto sumará el stock al inventario general.")) return; const cRef = doc(db, "compras", compraId); try { const cSnap = await getDoc(cRef); if(!cSnap.exists()) return; const cData = cSnap.data(); const batch = writeBatch(db); for (const item of cData.items) { const iRef = doc(db, "inventario", item.insumo); const iSnap = await getDoc(iRef); if (iSnap.exists()) { batch.update(iRef, { cantidad: iSnap.data().cantidad + item.cantidad }); } else { batch.set(iRef, { cantidad: item.cantidad, nombre: item.insumo, precio: 0, stockMinimo: 0, grupo: window.grupoActivo }); } const hRef = doc(collection(db, "entradas_stock")); batch.set(hRef, { insumo: item.insumo, cantidad: item.cantidad, grupo: window.grupoActivo, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now(), motivo_edicion: `Recepción Compra: ${cData.factura || cData.proveedor}` }); } batch.update(cRef, { estado: "recibido", recibido_por: window.usuarioActual.id, fecha_recepcion: new Date().toLocaleString(), timestamp_recepcion: Date.now() }); await batch.commit(); alert("✅ Inventario actualizado."); } catch(e) { console.error(e); alert("Error en la recepción."); } };

window.agregarProductoRapido = async function() { const n = document.getElementById("nombre-prod").value.trim().toUpperCase(); const c = parseInt(document.getElementById("cantidad-prod").value); const imgUrl = document.getElementById("new-prod-img-url").value; const cat = document.getElementById("categoria-prod").value; if(n && c>0){ const r = doc(db, "inventario", n); const s = await getDoc(r); let dataToSave = { nombre: n, cantidad: c, grupo: window.grupoActivo, categoria: cat }; if (imgUrl) dataToSave.imagen = imgUrl; if(s.exists()) { let updateData = { cantidad: s.data().cantidad + c }; if (imgUrl) updateData.imagen = imgUrl; if (cat) updateData.categoria = cat; await updateDoc(r, updateData); } else { await setDoc(r, dataToSave); } await addDoc(collection(db, "entradas_stock"), { insumo: n, cantidad: c, grupo: window.grupoActivo, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now(), motivo_edicion: "Ajuste Directo" }); document.getElementById("modal-insumo").classList.add("hidden"); document.getElementById("nombre-prod").value = ""; document.getElementById("cantidad-prod").value = ""; document.getElementById("new-prod-img-url").value = ""; document.getElementById("new-prod-preview-img").src = ""; document.getElementById("new-prod-preview-img").classList.add("hidden"); } };

window.procesarSolicitudMultiple = async function() { const ubi = document.getElementById("sol-ubicacion").value; const prio = document.getElementById("sol-prioridad").value; const notas = document.getElementById("sol-notas").value.trim(); const items = Object.entries(window.carritoGlobal).filter(([_, c]) => c > 0); if(!ubi || items.length === 0) return alert("Seleccione sede y al menos un producto."); const batchId = Date.now().toString(); const ts = Date.now(); const fs = new Date().toLocaleString(); const fIso = new Date().toISOString().split('T')[0]; try { const batch = writeBatch(db); let detalleInsumos = ""; items.forEach(([ins, cant]) => { const itemInv = window.rawInventario.find(x => x.id === ins); const nombreGuardar = itemInv && itemInv.nombre ? itemInv.nombre : ins; detalleInsumos += `- ${cant}x ${nombreGuardar}\n`; batch.set(doc(collection(db, "pedidos")), { usuarioId: window.usuarioActual.id, insumoNom: nombreGuardar, cantidad: cant, ubicacion: ubi, prioridad: prio, notas: notas, grupo: window.grupoActivo, estado: "pendiente", fecha: fs, fecha_iso: fIso, timestamp: ts, batchId: batchId }); }); await batch.commit(); if(window.adminEmailGlobal) { const mensajeAlmacen = `El usuario ${window.usuarioActual.id.toUpperCase()} ha realizado un nuevo pedido de insumos.\n\nSede destino: ${ubi}\nPrioridad: ${prio.toUpperCase()}\n\nInsumos solicitados:\n${detalleInsumos}\nNotas: ${notas || 'Ninguna'}`; window.enviarNotificacionEmail(window.adminEmailGlobal, `Nuevo Pedido de Insumos - ${window.usuarioActual.id.toUpperCase()}`, mensajeAlmacen); } window.carritoGlobal = {}; document.getElementById("sol-ubicacion").value=""; document.getElementById("sol-notas").value=""; window.procesarDatosInventario(); window.verPagina('notificaciones'); alert("Tu solicitud ha sido enviada."); } catch (error) { alert("Error procesando solicitud."); } };
window.gestionarPedido = async function(pid, accion, ins) { const pRef = doc(db, "pedidos", pid); const pData = (await getDoc(pRef)).data(); if(accion === 'aprobar') { const val = parseInt(document.getElementById(`qty-${pid}`).value); const invTarget = window.rawInventario.find(x => x.nombre === ins || x.id === ins); if(!invTarget) return alert("Insumo no encontrado en inventario."); const iRef = doc(db, "inventario", invTarget.id); const iSnap = await getDoc(iRef); if(iSnap.exists() && iSnap.data().cantidad >= val) { const nuevoStock = iSnap.data().cantidad - val; const stockMinimo = iSnap.data().stockMinimo || 0; await updateDoc(iRef, { cantidad: nuevoStock }); await updateDoc(pRef, { estado: "aprobado", cantidad: val, entregado_por: window.usuarioActual.id, timestamp_aprobado: Date.now(), fecha_aprobado: new Date().toLocaleString() }); if(nuevoStock <= stockMinimo && stockMinimo > 0 && window.stockAlertEmailGlobal) { const msg = `Alerta de Stock Crítico en InsuManager.\n\nEl insumo: ${ins.toUpperCase()}\nSe ha reducido a ${nuevoStock} unidades (El mínimo es ${stockMinimo}).\n\nPor favor proceda con la reposición.`; window.enviarNotificacionEmail(window.stockAlertEmailGlobal, `🔴 STOCK BAJO: ${ins.toUpperCase()}`, msg); } const pend = window.cachePedidos.filter(p => p.batchId === pData.batchId && p.estado === 'pendiente' && p.id !== pid); if(pend.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden"); else window.abrirModalGrupo(pData.batchId); } else { alert("Error: Stock insuficiente para esta cantidad."); } } else { await updateDoc(pRef, { estado: "rechazado", timestamp_aprobado: Date.now(), fecha_aprobado: new Date().toLocaleString() }); window.abrirModalGrupo(pData.batchId); } };
window.abrirModalGrupo = function(bKey) { const items = window.cachePedidos.filter(p => p.batchId === bKey || p.timestamp.toString() === bKey); if(items.length===0) return; document.getElementById("modal-grupo-titulo").innerHTML = `${items[0].usuarioId.toUpperCase()} | ${items[0].ubicacion}`; if(items[0].notas) { document.getElementById("modal-grupo-notas").innerHTML = `"${items[0].notas}"`; document.getElementById("modal-grupo-notas-container").classList.remove('hidden'); } else { document.getElementById("modal-grupo-notas-container").classList.add('hidden'); } let h = ""; items.forEach(p => { let act = `<span class="badge status-${p.estado}">${p.estado}</span>`; if(p.estado === 'pendiente' && window.tienePermiso('aprobaciones', 'gestionar')) { act = `<div class="flex gap-2"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border rounded text-center font-bold text-xs"><button onclick="window.gestionarPedido('${p.id}','aprobar','${p.insumoNom.replace(/'/g,"\\'")}')" class="text-white bg-emerald-500 px-2 rounded"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${p.id}','rechazar')" class="text-red-400 bg-red-50 px-2 rounded"><i class="fas fa-times"></i></button></div>`; } h += `<div class="flex justify-between items-center p-3 border-b"><div class="text-xs"><b>${p.insumoNom}</b> <span class="badge status-pri-${p.prioridad}">${p.prioridad}</span><br>Cant Original: ${p.cantidad}</div>${act}</div>`; }); document.getElementById("modal-grupo-contenido").innerHTML = h; document.getElementById("modal-grupo-admin").classList.remove("hidden"); };
window.confirmarRecibido = async function(pid) { if(confirm("¿Recibido?")) await updateDoc(doc(db, "pedidos", pid), { estado: "recibido", timestamp_recibido: Date.now(), fecha_recibido: new Date().toLocaleString() }); };
window.abrirIncidencia = function(pid) { document.getElementById('incidencia-pid').value = pid; document.getElementById('modal-incidencia').classList.remove('hidden'); };
window.confirmarIncidencia = async function(dev) { const pid = document.getElementById('incidencia-pid').value; const pRef = doc(db, "pedidos", pid); const pData = (await getDoc(pRef)).data(); if(dev){ const invTarget = window.rawInventario.find(x => x.nombre === pData.insumoNom || x.id === pData.insumoNom); if(invTarget) { const iRef = doc(db, "inventario", invTarget.id); const iSnap = await getDoc(iRef); if(iSnap.exists()) await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad }); } } await updateDoc(pRef, { estado: dev ? "devuelto" : "con_incidencia", detalleIncidencia: document.getElementById('incidencia-detalle').value, timestamp_incidencia: Date.now() }); document.getElementById('modal-incidencia').classList.add('hidden'); };
window.eliminarDato = async function(col, id) { if(confirm("¿Seguro que deseas eliminar este dato?")) await deleteDoc(doc(db, col, id)); };

window.abrirModalActivo = function(id = null) { document.getElementById("activo-preview-img").classList.add("hidden"); document.getElementById("activo-img-url").value = ""; if (id) { const a = window.rawActivos.find(x => x.id === id); if(!a) return; document.getElementById("activo-id").value = id; document.getElementById("activo-nombre").value = a.nombre || ""; document.getElementById("activo-categoria").value = a.categoria || ""; document.getElementById("activo-marca").value = a.marca || ""; document.getElementById("activo-proveedor").value = a.proveedor || ""; document.getElementById("activo-ubicacion").value = a.ubicacion || ""; document.getElementById("activo-precio").value = a.precio || ""; document.getElementById("activo-estado").value = a.estado || "Operativo"; document.getElementById("activo-descripcion").value = a.descripcion || ""; document.getElementById("activo-observacion").value = a.observacion || ""; if(a.imagen) { document.getElementById("activo-img-url").value = a.imagen; document.getElementById("activo-preview-img").src = a.imagen; document.getElementById("activo-preview-img").classList.remove("hidden"); } } else { document.getElementById("activo-id").value = ""; document.getElementById("activo-nombre").value = ""; document.getElementById("activo-categoria").value = ""; document.getElementById("activo-marca").value = ""; document.getElementById("activo-proveedor").value = ""; document.getElementById("activo-ubicacion").value = ""; document.getElementById("activo-precio").value = ""; document.getElementById("activo-estado").value = "Operativo"; document.getElementById("activo-descripcion").value = ""; document.getElementById("activo-observacion").value = ""; } document.getElementById("modal-activo").classList.remove("hidden"); };
window.guardarActivo = async function() { const actId = document.getElementById("activo-id").value; const nombre = document.getElementById("activo-nombre").value.trim().toUpperCase(); if (!nombre) return alert("El nombre del activo es obligatorio."); const data = { nombre: nombre, categoria: document.getElementById("activo-categoria").value.trim().toUpperCase(), marca: document.getElementById("activo-marca").value.trim().toUpperCase(), proveedor: document.getElementById("activo-proveedor").value.trim().toUpperCase(), ubicacion: document.getElementById("activo-ubicacion").value.trim().toUpperCase(), precio: parseFloat(document.getElementById("activo-precio").value) || 0, estado: document.getElementById("activo-estado").value, descripcion: document.getElementById("activo-descripcion").value.trim(), observacion: document.getElementById("activo-observacion").value.trim(), imagen: document.getElementById("activo-img-url").value, grupo: window.grupoActivo }; try { if (actId) { await updateDoc(doc(db, "activos", actId), data); alert("Activo actualizado."); } else { const newId = "ACT-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random()*100); data.id = newId; data.creado_por = window.usuarioActual.id; data.fecha_registro = new Date().toLocaleString(); data.timestamp = Date.now(); data.bitacora = []; await setDoc(doc(db, "activos", newId), data); alert("Activo registrado. ID: " + newId); } document.getElementById("modal-activo").classList.add("hidden"); } catch(e) { alert("Error al guardar activo."); } };
window.abrirDetallesActivo = function(id) { const a = window.rawActivos.find(x => x.id === id); if(!a) return; document.getElementById("activo-bitacora-id").value = id; document.getElementById("activo-det-nombre").innerText = a.nombre; document.getElementById("activo-det-id").innerText = "ID: " + a.id; document.getElementById("activo-det-qr-container").innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(a.id)}" alt="QR Code" class="w-16 h-16 object-contain">`; const imgEl = document.getElementById("activo-det-img"); if(a.imagen) { imgEl.src = a.imagen; imgEl.classList.remove("hidden"); } else { imgEl.classList.add("hidden"); } document.getElementById("activo-det-estado").innerHTML = `<span class="px-2 py-1 bg-slate-100 rounded text-slate-700 text-xs">${a.estado}</span>`; document.getElementById("activo-det-cat").innerText = a.categoria || '-'; document.getElementById("activo-det-marca").innerText = a.marca || '-'; document.getElementById("activo-det-ubi").innerText = a.ubicacion || '-'; document.getElementById("activo-det-fecha").innerText = a.fecha_registro || '-'; document.getElementById("activo-det-desc").innerText = a.descripcion || 'Sin detalles'; let bHtml = ""; if (a.observacion) bHtml += `<div class="relative pl-4 border-l-2 border-indigo-200 pb-3"><div class="absolute w-2.5 h-2.5 bg-indigo-500 rounded-full -left-[6px] top-1"></div><p class="text-[9px] text-slate-400 font-bold mb-1">NOTA ORIGINAL</p><p class="text-xs font-medium text-slate-700 italic">${a.observacion}</p></div>`; if(a.bitacora && a.bitacora.length > 0) { a.bitacora.forEach(b => { let mediaHtml = ""; if(b.mediaUrl) { if(b.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) mediaHtml = `<video src="${b.mediaUrl}" controls class="max-h-32 rounded-lg mt-2 border"></video>`; else mediaHtml = `<a href="${b.mediaUrl}" target="_blank"><img src="${b.mediaUrl}" loading="lazy" class="max-h-24 object-contain rounded-lg mt-2 border hover:opacity-80"></a>`; } bHtml += `<div class="relative pl-4 border-l-2 border-slate-200 pb-4"><div class="absolute w-2.5 h-2.5 bg-slate-400 rounded-full -left-[7px] top-1"></div><div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"><p class="text-[9px] text-slate-400 font-bold mb-1 flex justify-between"><span>${b.usuario.toUpperCase()}</span><span>${b.fecha}</span></p><p class="text-sm text-slate-700 whitespace-pre-wrap">${b.observacion}</p>${mediaHtml}</div></div>`; }); } else if (!a.observacion) bHtml += `<p class="text-xs text-slate-400 italic">No hay notas registradas.</p>`; document.getElementById("activo-bitacora-timeline").innerHTML = bHtml; document.getElementById("activo-bitacora-texto").value = ""; document.getElementById("activo-bitacora-url").value = ""; const bitacoraForm = document.getElementById("activo-bitacora-form"); if(window.tienePermiso('activos', 'gestionar')) { bitacoraForm.classList.remove("hidden"); } else { bitacoraForm.classList.add("hidden"); } document.getElementById("modal-activo-detalles").classList.remove("hidden"); };
window.cerrarDetallesActivo = function() { document.getElementById("modal-activo-detalles").classList.add("hidden"); };
window.guardarBitacoraActivo = async function() { const id = document.getElementById("activo-bitacora-id").value; const txt = document.getElementById("activo-bitacora-texto").value.trim(); const url = document.getElementById("activo-bitacora-url").value; if(!txt && !url) return alert("Escribe o adjunta algo."); const aRef = doc(db, "activos", id); const aSnap = await getDoc(aRef); if(aSnap.exists()) { const bitacoraAnterior = aSnap.data().bitacora || []; await updateDoc(aRef, { bitacora: [...bitacoraAnterior, { nota: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] }); window.abrirDetallesActivo(id); } };

window.abrirModalMantenimiento = function() { document.getElementById("mant-equipo").value=""; document.getElementById("mant-fecha").value=""; document.getElementById("mant-fecha-notificacion").value=""; document.getElementById("mant-correo").value=""; document.getElementById("mant-responsable").value=""; document.getElementById("mant-detalle").value=""; document.getElementById("modal-mantenimiento").classList.remove("hidden"); };
window.guardarMantenimiento = async function() { const eq = document.getElementById("mant-equipo").value.trim(); const fe = document.getElementById("mant-fecha").value; const fnot = document.getElementById("mant-fecha-notificacion").value; const correoNot = document.getElementById("mant-correo").value.trim(); const re = document.getElementById("mant-responsable").value.trim(); const de = document.getElementById("mant-detalle").value.trim(); if(!eq || !fe) return alert("Equipo y fecha programada son obligatorios."); try { await addDoc(collection(db, "mantenimiento"), { equipo: eq, fecha_programada: fe, fecha_notificacion: fnot, correo_notificacion: correoNot, responsable: re, detalle: de, estado: 'pendiente', grupo: window.grupoActivo, creado_por: window.usuarioActual.id, timestamp: Date.now(), bitacora: [] }); if(correoNot) { const mensaje = `Hola. Se ha programado un mantenimiento en el sistema InsuManager.\n\nEquipo/Área: ${eq.toUpperCase()}\nFecha Programada: ${fe}\nResponsable: ${re.toUpperCase()}\nDetalle: ${de}\n\nPor favor, ten en cuenta esta fecha.`; window.enviarNotificacionEmail(correoNot, `Mantenimiento Programado: ${eq.toUpperCase()}`, mensaje); } document.getElementById("modal-mantenimiento").classList.add("hidden"); alert("Mantenimiento programado correctamente."); } catch(e) { alert("Error guardando mantenimiento."); } };
window.iniciarMantenimiento = async function(id) { if(confirm("¿Cambiar estado a EN PROCESO?")) await updateDoc(doc(db, "mantenimiento", id), { estado: 'en_proceso', timestamp_inicio: Date.now() }); };
window.completarMantenimiento = async function(id) { if(confirm("¿Finalizar tarea?")) await updateDoc(doc(db, "mantenimiento", id), { estado: 'completado', timestamp_completado: Date.now(), fecha_completado: new Date().toLocaleString() }); };
window.abrirBitacora = function(id) { document.getElementById("bitacora-mant-id").value = id; document.getElementById("bitacora-texto").value = ""; document.getElementById("bitacora-media-url").value = ""; document.getElementById("bitacora-media-badge").classList.add("hidden"); const m = window.rawMantenimiento.find(x => x.id === id); if(!m) return; document.getElementById("bitacora-equipo-titulo").innerText = m.equipo.toUpperCase(); const tl = document.getElementById("bitacora-timeline"); let html = ""; html += `<div class="relative pl-6 border-l-2 border-indigo-200 pb-4"><div class="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1"></div><p class="text-[10px] text-slate-400 font-bold mb-1">TAREA ORIGINAL • ${new Date(m.timestamp).toLocaleString()}</p><p class="text-sm font-medium text-slate-700">${m.detalle || 'Sin descripción inicial.'}</p></div>`; if(m.bitacora && m.bitacora.length > 0) { m.bitacora.forEach(b => { let mediaHtml = ""; if(b.mediaUrl) { if(b.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) mediaHtml = `<video src="${b.mediaUrl}" controls class="max-h-40 rounded-lg mt-2 border border-slate-200"></video>`; else mediaHtml = `<a href="${b.mediaUrl}" target="_blank"><img src="${b.mediaUrl}" loading="lazy" class="max-h-32 object-contain rounded-lg mt-2 border border-slate-200 hover:opacity-80 transition"></a>`; } html += `<div class="relative pl-6 border-l-2 border-slate-200 pb-4"><div class="absolute w-3 h-3 bg-slate-400 rounded-full -left-[7px] top-1"></div><div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"><p class="text-[10px] text-slate-400 font-bold mb-1 flex justify-between"><span>${b.usuario.toUpperCase()}</span><span>${b.fecha}</span></p><p class="text-sm text-slate-700 whitespace-pre-wrap">${b.observacion}</p>${mediaHtml}</div></div>`; }); } else html += `<p class="text-xs text-slate-400 italic mt-4">No hay observaciones registradas aún.</p>`; tl.innerHTML = html; document.getElementById("modal-bitacora").classList.remove("hidden"); const bitacoraForm = document.getElementById("bitacora-form-container"); if(window.tienePermiso('mantenimiento', 'gestionar')) { bitacoraForm.classList.remove("hidden"); } else { bitacoraForm.classList.add("hidden"); } };
window.guardarBitacora = async function() { const id = document.getElementById("bitacora-mant-id").value; const txt = document.getElementById("bitacora-texto").value.trim(); const url = document.getElementById("bitacora-media-url").value; if(!txt && !url) return alert("Escribe o adjunta algo."); const mRef = doc(db, "mantenimiento", id); const mSnap = await getDoc(mRef); if(mSnap.exists()) { const bitacoraAnterior = mSnap.data().bitacora || []; await updateDoc(mRef, { bitacora: [...bitacoraAnterior, { observacion: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] }); window.abrirBitacora(id); } };
window.cerrarBitacora = function() { document.getElementById("modal-bitacora").classList.add("hidden"); };

window.guardarCategoria = async function() { const c = document.getElementById("new-categoria").value.trim().toUpperCase(); if(!c) return alert("Ingrese categoría."); try { await addDoc(collection(db, "categorias"), { nombre: c, timestamp: Date.now() }); document.getElementById("new-categoria").value = ""; alert("Categoría guardada."); } catch(e) { alert("Error."); } };
window.guardarSede = async function() { const s = document.getElementById("new-sede").value.trim().toUpperCase(); if(!s) return alert("Ingrese sede."); try { await addDoc(collection(db, "sedes"), { nombre: s, timestamp: Date.now() }); document.getElementById("new-sede").value = ""; alert("Sede guardada."); } catch(e) { alert("Error."); } };
window.guardarGrupo = async function() { const g = document.getElementById("new-grupo").value.trim().toUpperCase(); if(!g) return alert("Ingrese grupo."); try { await addDoc(collection(db, "grupos"), { nombre: g, timestamp: Date.now() }); document.getElementById("new-grupo").value = ""; alert("Grupo creado."); } catch(e) { alert("Error."); } };
window.guardarConfigCorreos = async function() { const emailA = document.getElementById("config-admin-email").value.trim(); const emailS = document.getElementById("config-stock-email").value.trim(); try { if(emailA) await setDoc(doc(db, "configuracion", "notificaciones"), { [window.grupoActivo]: emailA }, { merge: true }); if(emailS) await setDoc(doc(db, "configuracion", "alertas_stock"), { [window.grupoActivo]: emailS }, { merge: true }); alert("Correos actualizados exitosamente para el entorno " + window.grupoActivo); } catch(e) { alert("Error al guardar correos."); } };

window.guardarUsuario = async function() { const id = document.getElementById("new-user").value.trim().toLowerCase(); const p = document.getElementById("new-pass").value.trim(); const e = document.getElementById("new-email") ? document.getElementById("new-email").value.trim() : ""; const r = document.getElementById("new-role") ? document.getElementById("new-role").value.trim().toUpperCase() : "USUARIO BASE"; const checkboxes = document.querySelectorAll('.chk-grupo:checked'); let gruposSeleccionados = Array.from(checkboxes).map(chk => chk.value); if(gruposSeleccionados.length === 0) gruposSeleccionados = ["SERVICIOS GENERALES"]; const perms = {}; document.querySelectorAll('.chk-permiso').forEach(chk => { const mod = chk.dataset.modulo; const acc = chk.dataset.accion; if(!perms[mod]) perms[mod] = { ver: false, gestionar: false }; if(chk.checked) perms[mod][acc] = true; }); if(!id || !p) return alert("El ID y la contraseña son obligatorios."); try { await setDoc(doc(db,"usuarios",id), { pass: p, rol: r, email: e, grupos: gruposSeleccionados, permisos: perms }, { merge: true }); alert("Usuario guardado exitosamente."); window.cancelarEdicionUsuario(); } catch(e) { alert("Error al guardar usuario."); } };
window.prepararEdicionUsuario = async function(userId) { const snap = await getDoc(doc(db, "usuarios", userId)); if(!snap.exists()) return; const u = snap.data(); document.getElementById("edit-mode-id").value = userId; const inpU = document.getElementById("new-user"); inpU.value = userId; inpU.disabled = true; document.getElementById("new-pass").value = u.pass; const elEmail = document.getElementById("new-email"); if(elEmail) elEmail.value = u.email || ""; const elRole = document.getElementById("new-role"); if(elRole) elRole.value = u.rol || ""; const p = u.permisos || {}; document.querySelectorAll('.chk-permiso').forEach(chk => { const mod = chk.dataset.modulo; const acc = chk.dataset.accion; chk.checked = p[mod] && p[mod][acc] === true; }); const gruposUsuario = u.grupos || ["SERVICIOS GENERALES"]; document.querySelectorAll('.chk-grupo').forEach(chk => { chk.checked = gruposUsuario.includes(chk.value); }); document.getElementById("btn-guardar-usuario").innerText = "Actualizar Usuario"; document.getElementById("cancel-edit-msg").classList.remove("hidden"); };
window.cancelarEdicionUsuario = function() { document.getElementById("edit-mode-id").value = ""; const inpU = document.getElementById("new-user"); inpU.value = ""; inpU.disabled = false; document.getElementById("new-pass").value = ""; const elEmail = document.getElementById("new-email"); if(elEmail) elEmail.value = ""; const elRole = document.getElementById("new-role"); if(elRole) elRole.value = ""; document.querySelectorAll('.chk-permiso').forEach(chk => chk.checked = false); document.querySelectorAll('.chk-grupo').forEach(chk => chk.checked = false); document.getElementById("btn-guardar-usuario").innerText = "Guardar Usuario"; document.getElementById("cancel-edit-msg").classList.add("hidden"); };

window.abrirModalEditarEntrada = function(idEntrada, insumo, cantidadActual) { document.getElementById('edit-entrada-id').value = idEntrada; document.getElementById('edit-entrada-insumo').value = insumo; document.getElementById('edit-entrada-insumo-display').value = insumo; document.getElementById('edit-entrada-cant-original').value = cantidadActual; document.getElementById('edit-entrada-cantidad').value = cantidadActual; document.getElementById('edit-entrada-motivo').value = ""; document.getElementById('modal-editar-entrada').classList.remove('hidden'); };
window.guardarEdicionEntrada = async function() { const idEntrada = document.getElementById('edit-entrada-id').value; const insumo = document.getElementById('edit-entrada-insumo').value; const cantOriginal = parseInt(document.getElementById('edit-entrada-cant-original').value); const cantNueva = parseInt(document.getElementById('edit-entrada-cantidad').value); const motivo = document.getElementById('edit-entrada-motivo').value.trim(); if (isNaN(cantNueva) || cantNueva < 0) return alert("Cantidad inválida."); if (!motivo) return alert("Ingrese motivo."); const diferencia = cantNueva - cantOriginal; if (diferencia === 0) { document.getElementById('modal-editar-entrada').classList.add('hidden'); return; } try { const invTarget = window.rawInventario.find(x => x.nombre === insumo || x.id === insumo); if(!invTarget) return alert("Insumo no encontrado."); const invRef = doc(db, "inventario", invTarget.id); const invSnap = await getDoc(invRef); if (!invSnap.exists()) return; await updateDoc(invRef, { cantidad: invSnap.data().cantidad + diferencia }); await updateDoc(doc(db, "entradas_stock", idEntrada), { cantidad: cantNueva, motivo_edicion: motivo }); alert("Entrada corregida."); document.getElementById('modal-editar-entrada').classList.add('hidden'); } catch(e) { alert("Error."); } };
window.abrirModalFactura = function() { document.getElementById("fact-proveedor").value = ""; document.getElementById("fact-gasto").value = ""; document.getElementById("fact-fecha").value = ""; document.getElementById("fact-archivo-url").value = ""; document.getElementById("factura-file-name").innerText = "Ninguno"; document.getElementById("modal-factura").classList.remove("hidden"); };
window.cerrarModalFactura = function() { document.getElementById("modal-factura").classList.add("hidden"); };
window.guardarFactura = async function() { const pv = document.getElementById("fact-proveedor").value.trim(); const ga = parseFloat(document.getElementById("fact-gasto").value); const fe = document.getElementById("fact-fecha").value; const ar = document.getElementById("fact-archivo-url").value; if(!pv || isNaN(ga) || !fe) return alert("Campos requeridos."); try { await addDoc(collection(db, "facturas"), { proveedor: pv, gasto: ga, fecha_compra: fe, archivo_url: ar, grupo: window.grupoActivo, usuarioRegistro: window.usuarioActual.id, timestamp: Date.now(), fecha_registro: new Date().toLocaleString() }); alert("Factura registrada."); window.cerrarModalFactura(); } catch(e) { alert("Error."); } };

window.descargarReporte = async function() {
    if(typeof XLSX === 'undefined') return alert("Cargando Excel...");
    const inputDesde = document.getElementById("dash-desde")?.value || document.getElementById("rep-desde")?.value; const inputHasta = document.getElementById("dash-hasta")?.value || document.getElementById("rep-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity; if(inputDesde) tDesde = new Date(inputDesde + 'T00:00:00').getTime(); if(inputHasta) tHasta = new Date(inputHasta + 'T23:59:59').getTime();
    if(!confirm(`¿Generar reporte general (Exportar Datos) del grupo ${window.grupoActivo}?`)) return;
    
    const uSnap = await getDocs(collection(db, "usuarios")); const usersMap = {}; uSnap.forEach(u => { usersMap[u.id] = u.data(); }); const obtenerMesAno = (timestamp) => { if(!timestamp) return 'N/A'; const d = new Date(timestamp); return `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]} ${d.getFullYear()}`; };
    
    const invActivo = window.rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo); const stockData = invActivo.map(p => ({ "Insumo": (p.nombre || p.id||'').toUpperCase(), "Categoría": (p.categoria || 'N/A').toUpperCase(), "Cantidad Disponible": p.cantidad || 0, "Stock Mínimo": p.stockMinimo || 0, "Precio Unit. ($)": p.precio || 0 }));
    const entActivas = window.rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo && e.timestamp >= tDesde && e.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp); const entradasData = entActivas.map(mov => ({ "Mes y Año": obtenerMesAno(mov.timestamp), "Fecha de Entrada": mov.fecha || 'N/A', "Insumo": (mov.insumo || '').toUpperCase(), "Cantidad Ingresada": mov.cantidad || 0, "Usuario Responsable": (mov.usuario || '').toUpperCase() }));
    const salActivas = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp); const salidasData = salActivas.map(mov => { const uId = mov.usuarioId || ''; return { "Mes y Año": obtenerMesAno(mov.timestamp), "ID Pedido": mov.batchId || 'N/A', "Fecha Solicitud": mov.fecha_solicitud || mov.fecha || 'N/A', "Hora Solicitud": mov.timestamp ? new Date(mov.timestamp).toLocaleTimeString() : 'N/A', "Tiempo en Atender": mov.timestamp_aprobado ? window.formatoTiempoDiferencia(mov.timestamp, mov.timestamp_aprobado) : 'Pendiente', "Tiempo en Recibir": mov.timestamp_recibido ? window.formatoTiempoDiferencia(mov.timestamp_aprobado || mov.timestamp, mov.timestamp_recibido) : (mov.estado === 'recibido' ? 'N/A' : 'Pendiente/No recibido'), "Prioridad": (mov.prioridad || 'NORMAL').toUpperCase(), "Insumo": (mov.insumoNom || '').toUpperCase(), "Cant.": mov.cantidad || 0, "Sede Destino": (mov.ubicacion || '').toUpperCase(), "Usuario Solicitante": uId.toUpperCase(), "Estado Actual": (mov.estado || '').toUpperCase(), "Entregado Por": (mov.entregado_por || 'N/A').toUpperCase() }; });
    const equiposActivos = window.rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo); const activosData = equiposActivos.map(a => ({ "ID Único": a.id, "Nombre": a.nombre, "Clasificación": a.categoria, "Marca/Modelo": a.marca, "Estado": a.estado, "Ubicación": a.ubicacion, "Precio ($)": a.precio }));
    const mantActivos = window.rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo && m.timestamp >= tDesde && m.timestamp <= tHasta); const mantData = mantActivos.map(m => ({ "Equipo": m.equipo, "Fecha Programada": m.fecha_programada, "Fecha Notificación": m.fecha_notificacion || 'No Aplica', "Responsable": m.responsable, "Estado": (m.estado || 'N/A').toUpperCase(), "Detalle Tarea": m.detalle || '' }));
    const compActivas = window.rawCompras.filter(c => (c.grupo || "SERVICIOS GENERALES") === window.grupoActivo && c.timestamp >= tDesde && c.timestamp <= tHasta); const compData = compActivas.map(c => ({ "Proveedor": c.proveedor, "Factura": c.factura, "Fecha Compra": c.fecha_compra, "Estado": c.estado, "Registrado Por": c.registrado_por, "Total Items": c.items.length }));

    const wb = XLSX.utils.book_new(); if(stockData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), "Inventario"); if(activosData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activosData), "Activos Fijos"); if(compData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compData), "Compras Generales"); if(entradasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entradasData), "Entradas de Stock"); if(salidasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salidasData), "Salidas (Pedidos)"); if(mantData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mantData), "Mantenimientos"); XLSX.writeFile(wb, `Reporte_FCILog_${window.grupoActivo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// ==========================================
// 10. INICIALIZACIÓN FINAL Y CLOUDINARY
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    
    window.sistemaCargado = true;
    const btn = document.getElementById("btn-login-submit");
    if (btn) {
        btn.innerText = "Iniciar Sesión";
        btn.classList.replace("bg-slate-400", "bg-indigo-600");
        btn.classList.add("hover:bg-indigo-700");
    }

    const sesion = localStorage.getItem("fcilog_session");
    if(sesion) { window.cargarSesion(JSON.parse(sesion)); }
    
    if (typeof cloudinary !== "undefined") {
        window.cloudinaryEditProdWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('edit-prod-img').value = result.info.secure_url; const preview = document.getElementById('preview-img'); preview.src = result.info.secure_url; preview.classList.remove('hidden'); } });
        document.getElementById("btn-upload-edit-prod")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryEditProdWidget.open(); }, false);
        
        window.cloudinaryActivosWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_activos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('activo-img-url').value = result.info.secure_url; const p = document.getElementById('activo-preview-img'); p.src = result.info.secure_url; p.classList.remove('hidden'); } });
        document.getElementById("btn-upload-activo")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryActivosWidget.open(); }, false);
        
        window.cloudinaryBitacoraWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, folder: 'fcilog_bitacora', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('bitacora-media-url').value = result.info.secure_url; const b = document.getElementById('bitacora-media-badge'); b.innerText = "ADJUNTO"; b.classList.remove('hidden'); } });
        document.getElementById("btn-upload-bitacora")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryBitacoraWidget.open(); }, false);
        
        window.cloudinaryActivosBitacoraWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, folder: 'fcilog_activos_bitacora', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('activo-bitacora-url').value = result.info.secure_url; const b = document.getElementById('activo-bitacora-badge'); b.innerText = "ADJUNTO"; b.classList.remove('hidden'); } });
        document.getElementById("btn-upload-activo-bitacora")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryActivosBitacoraWidget.open(); }, false);
        
        window.cloudinaryFacturasWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local'], multiple: false, folder: 'fcilog_facturas', resourceType: 'auto' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('fact-archivo-url').value = result.info.secure_url; document.getElementById('factura-file-name').innerText = result.info.original_filename || "Documento"; } });
        document.getElementById("btn-upload-factura")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryFacturasWidget.open(); }, false);
        
        window.cloudinaryNewProdWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('new-prod-img-url').value = result.info.secure_url; const p = document.getElementById('new-prod-preview-img'); p.src = result.info.secure_url; p.classList.remove('hidden'); } });
        document.getElementById("btn-upload-new-prod")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryNewProdWidget.open(); }, false);
    }
});

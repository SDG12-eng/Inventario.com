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
window.configCorreosData = {};
window.configStockData = {};
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
// 3. UTILIDADES GENERALES
// ==========================================
window.tienePermiso = function(modulo, accion = 'ver') {
    if (!window.usuarioActual) return false;
    if (window.usuarioActual.id === 'admin') return true; 
    if (!window.usuarioActual.permisos || !window.usuarioActual.permisos[modulo]) return false;
    
    if (accion === 'ver') {
        return window.usuarioActual.permisos[modulo].ver === true || window.usuarioActual.permisos[modulo].gestionar === true;
    }
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
    if(EMAILJS_PUBLIC_KEY === "TU_PUBLIC_KEY_AQUI") return;
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: correoDestino,
            subject: asunto,
            message: mensaje
        });
    } catch (error) { console.error("Error email:", error); }
};

window.solicitarPermisosNotificacion = function() {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
};

window.enviarNotificacionNavegador = function(titulo, cuerpo) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(titulo, { body: cuerpo, icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png" });
    }
};

window.debounceFiltrarTarjetas = function(idContenedor, texto) {
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

window.debounceFiltrarTabla = function(idTabla, texto) {
    clearTimeout(timeoutBusqueda);
    timeoutBusqueda = setTimeout(() => {
        const term = texto.toLowerCase();
        document.querySelectorAll(`#${idTabla} tr`).forEach(f => {
            f.style.display = f.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
    }, 150);
};

// ==========================================
// 4. CONTROL DE NAVEGACIÓN Y MENÚS
// ==========================================
window.verPagina = function(id) {
    document.querySelectorAll(".view").forEach(v => {
        v.classList.add("hidden");
        v.classList.remove("animate-fade-in");
    });
    const t = document.getElementById(`pag-${id}`);
    if(t) {
        t.classList.remove("hidden");
        setTimeout(() => t.classList.add("animate-fade-in"), 10);
    }
    if(window.innerWidth < 768) window.toggleMenu(false);
};

window.toggleMenu = function(forceState) {
    const sb = document.getElementById("sidebar");
    const ov = document.getElementById("sidebar-overlay");
    if(!sb || !ov) return;
    const isClosed = sb.classList.contains("-translate-x-full");
    const shouldOpen = forceState !== undefined ? forceState : isClosed;
    if (shouldOpen) {
        sb.classList.remove("-translate-x-full");
        ov.classList.remove("hidden");
        sb.style.zIndex = "100";
        ov.style.zIndex = "90";
    } else {
        sb.classList.add("-translate-x-full");
        ov.classList.add("hidden");
    }
};

window.switchTab = function(tab) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`)?.classList.remove('hidden');
    const onC = "flex-1 py-3 rounded-xl text-sm font-black bg-white text-indigo-600 shadow-sm transition";
    const offC = "flex-1 py-3 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 transition";
    if(tab === 'activos') {
        document.getElementById('tab-btn-activos').className = onC;
        document.getElementById('tab-btn-historial').className = offC;
    } else {
        document.getElementById('tab-btn-historial').className = onC;
        document.getElementById('tab-btn-activos').className = offC;
    }
};

// ==========================================
// 5. AUTENTICACIÓN Y GRUPOS
// ==========================================
window.iniciarSesion = async function() {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    if(!user || !pass) return alert("Ingrese usuario y contraseña.");
    
    if (user === "admin" && pass === "1130") {
        window.cargarSesion({ id: "admin", rol: "Administrador Supremo", grupos: ["SERVICIOS GENERALES"] });
        return;
    }
    
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            window.cargarSesion({ id: user, ...snap.data() });
        } else {
            alert("Credenciales incorrectas.");
        }
    } catch (e) {
        alert("Error de conexión.");
    }
};

window.cerrarSesion = function() {
    localStorage.removeItem("fcilog_session");
    location.reload();
};

window.cargarSesion = function(datos) {
    window.usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    
    const pantallaLogin = document.getElementById("pantalla-login");
    const interfazApp = document.getElementById("interfaz-app");
    if(pantallaLogin) pantallaLogin.classList.add("hidden");
    if(interfazApp) interfazApp.classList.remove("hidden");
    
    window.solicitarPermisosNotificacion();
    
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) {
        infoDiv.innerHTML = `<div class="flex flex-col items-center"><div class="w-12 h-12 bg-indigo-100 border border-indigo-200 rounded-full flex items-center justify-center text-indigo-600 mb-2 shadow-inner"><i class="fas fa-user text-xl"></i></div><span class="font-black text-slate-800 uppercase tracking-wide">${datos.id}</span><span class="text-[10px] uppercase font-black text-white bg-indigo-500 px-3 py-1 rounded-md mt-1 shadow-sm tracking-widest">${datos.rol}</span></div>`;
    }

    let menuHtml = "";
    const addHeader = (title) => `<p class="text-[10px] font-black text-indigo-400 uppercase mt-4 mb-2 ml-2 tracking-widest">${title}</p>`;
    const addItem = (id, icon, name) => `<button onclick="window.verPagina('${id}')" class="w-full flex items-center gap-4 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-white border border-slate-200 group-hover:border-indigo-200 flex items-center justify-center transition-colors"><i class="fas fa-${icon} group-hover:text-indigo-500"></i></div>${name}</button>`;

    if(window.tienePermiso('dashboard', 'ver')) { menuHtml += addHeader("Analítica"); menuHtml += addItem('stats', 'chart-pie', 'Dashboard'); }
    
    menuHtml += addHeader("Operaciones & Logística");
    if(window.tienePermiso('stock', 'ver')) menuHtml += addItem('stock', 'boxes', 'Inventario');
    if(window.tienePermiso('compras', 'ver')) menuHtml += addItem('compras', 'truck-loading', 'Compras');
    if(window.tienePermiso('pedir', 'ver')) menuHtml += addItem('solicitar', 'cart-plus', 'Pedir Insumo');
    if(window.tienePermiso('aprobaciones', 'ver')) menuHtml += addItem('solicitudes', 'check-double', 'Aprobaciones');

    if(window.tienePermiso('activos', 'ver') || window.tienePermiso('mantenimiento', 'ver')) {
        menuHtml += addHeader("Equipos & Mtto");
        if(window.tienePermiso('activos', 'ver')) menuHtml += addItem('activos', 'desktop', 'Activos Fijos');
        if(window.tienePermiso('mantenimiento', 'ver')) menuHtml += addItem('mantenimiento', 'tools', 'Mantenimiento');
    }

    menuHtml += addHeader("Registros");
    if(window.tienePermiso('mis_pedidos', 'ver')) menuHtml += addItem('notificaciones', 'clipboard-list', 'Mis Pedidos');
    if(window.tienePermiso('historial', 'ver')) menuHtml += addItem('historial', 'history', 'Movimientos');
    if(window.tienePermiso('facturas', 'ver')) menuHtml += addItem('facturas', 'file-invoice-dollar', 'Facturas Directas');

    if(window.tienePermiso('usuarios', 'ver') || window.tienePermiso('configuracion', 'ver')) {
        menuHtml += addHeader("Administración");
        if(window.tienePermiso('usuarios', 'ver')) menuHtml += addItem('usuarios', 'users-cog', 'Accesos');
        if(window.tienePermiso('configuracion', 'ver')) menuHtml += addItem('config', 'cogs', 'Configuración');
    }

    const menuDin = document.getElementById("menu-dinamico");
    if(menuDin) menuDin.innerHTML = menuHtml;

    let pageToLoad = 'stock';
    const mapPages = { 'stats':'dashboard', 'stock':'stock', 'compras':'compras', 'solicitar':'pedir', 'solicitudes':'aprobaciones', 'activos':'activos', 'mantenimiento':'mantenimiento', 'notificaciones':'mis_pedidos', 'historial':'historial', 'facturas':'facturas', 'usuarios':'usuarios', 'config':'configuracion' };
    for(let p in mapPages) { if(window.tienePermiso(mapPages[p], 'ver')) { pageToLoad = p; break; } }

    const matrizBody = document.getElementById("matriz-permisos");
    if(matrizBody) {
        let matrixHtml = "";
        const modules = [ { id: 'dashboard', name: 'Dashboard' }, { id: 'stock', name: 'Inventario' }, { id: 'compras', name: 'Compras' }, { id: 'pedir', name: 'Pedir Insumos' }, { id: 'aprobaciones', name: 'Aprobaciones' }, { id: 'mis_pedidos', name: 'Mis Pedidos' }, { id: 'activos', name: 'Activos Fijos' }, { id: 'mantenimiento', name: 'Mantenimiento' }, { id: 'historial', name: 'Movimientos' }, { id: 'facturas', name: 'Facturas' }, { id: 'usuarios', name: 'Usuarios' }, { id: 'configuracion', name: 'Configuración' } ];
        modules.forEach(m => { matrixHtml += `<tr class="hover:bg-slate-50 transition"><td class="py-3 px-4 font-bold text-slate-700 text-xs uppercase">${m.name}</td><td class="py-3 px-4 text-center"><input type="checkbox" class="chk-permiso w-5 h-5 text-indigo-600 rounded border-slate-300 cursor-pointer shadow-sm" data-modulo="${m.id}" data-accion="ver"></td><td class="py-3 px-4 text-center"><input type="checkbox" class="chk-permiso w-5 h-5 text-indigo-600 rounded border-slate-300 cursor-pointer shadow-sm" data-modulo="${m.id}" data-accion="gestionar" onchange="if(this.checked) this.closest('tr').querySelector('[data-accion=\\'ver\\']').checked = true;"></td></tr>`; });
        matrizBody.innerHTML = matrixHtml;
    }

    let misGrupos = datos.grupos || ["SERVICIOS GENERALES"];
    if(datos.id === 'admin') misGrupos = window.todosLosGrupos;
    window.grupoActivo = misGrupos[0];
    window.renderizarSelectorGrupos(misGrupos);
    window.verPagina(pageToLoad);
    window.activarSincronizacion();
};

window.cambiarGrupoActivo = function(nuevoGrupo) {
    window.grupoActivo = nuevoGrupo;
    document.getElementById("dash-grupo-label").innerText = window.grupoActivo;
    document.getElementById("lbl-grupo-solicitud").innerText = window.grupoActivo;
    window.carritoGlobal = {};
    
    if(window.configCorreosData && window.configCorreosData[window.grupoActivo]) { window.adminEmailGlobal = window.configCorreosData[window.grupoActivo]; } else { window.adminEmailGlobal = ""; }
    if(window.configStockData && window.configStockData[window.grupoActivo]) { window.stockAlertEmailGlobal = window.configStockData[window.grupoActivo]; } else { window.stockAlertEmailGlobal = ""; }

    const elA = document.getElementById("config-admin-email"); if(elA) elA.value = window.adminEmailGlobal;
    const elS = document.getElementById("config-stock-email"); if(elS) elS.value = window.stockAlertEmailGlobal;

    window.procesarDatosInventario(); window.procesarDatosPedidos(); window.renderHistorialUnificado(); window.procesarDatosFacturas(); window.renderMantenimiento(); window.renderActivos(); window.renderCompras(); window.actualizarDashboard();
};

window.renderizarSelectorGrupos = function(misGrupos) {
    const sel = document.getElementById("selector-grupo-activo");
    if(sel) { sel.innerHTML = misGrupos.map(g => `<option value="${g}">${g}</option>`).join(''); sel.value = window.grupoActivo; }
    const dashLbl = document.getElementById("dash-grupo-label"); if(dashLbl) dashLbl.innerText = window.grupoActivo;
    const solLbl = document.getElementById("lbl-grupo-solicitud"); if(solLbl) solLbl.innerText = window.grupoActivo;
};

window.actualizarCheckboxesGrupos = function() {
    const container = document.getElementById("user-grupos-checkboxes");
    if(container) { container.innerHTML = window.todosLosGrupos.map(g => `<label class="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-indigo-50 transition shadow-sm"><input type="checkbox" value="${g}" class="w-4 h-4 text-indigo-600 rounded border-slate-300 chk-grupo"><span class="text-xs font-bold text-slate-700 uppercase">${g}</span></label>`).join(''); }
};

// ==========================================
// 6. FIREBASE SINCRONIZACIÓN
// ==========================================
window.activarSincronizacion = function() {
    
    if(window.tienePermiso('configuracion', 'ver')) {
        onSnapshot(doc(db, "configuracion", "notificaciones"), (docSnap) => {
            if (docSnap.exists()) {
                window.configCorreosData = docSnap.data();
                window.adminEmailGlobal = window.configCorreosData[window.grupoActivo] || "";
            } else {
                window.configCorreosData = {};
                window.adminEmailGlobal = "";
            }
            const elA = document.getElementById("config-admin-email");
            if(elA) elA.value = window.adminEmailGlobal;
        });

        onSnapshot(doc(db, "configuracion", "alertas_stock"), (docSnap) => {
            if (docSnap.exists()) {
                window.configStockData = docSnap.data();
                window.stockAlertEmailGlobal = window.configStockData[window.grupoActivo] || "";
            } else {
                window.configStockData = {};
                window.stockAlertEmailGlobal = "";
            }
            const elS = document.getElementById("config-stock-email");
            if(elS) elS.value = window.stockAlertEmailGlobal;
        });
    }

    onSnapshot(collection(db, "grupos"), snap => {
        window.todosLosGrupos = ["SERVICIOS GENERALES"];
        let html = `<div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center"><span class="font-black text-indigo-700 text-xs uppercase"><i class="fas fa-lock mr-1"></i> SERVICIOS GENERALES</span><span class="text-[10px] bg-indigo-200 text-indigo-700 px-2 rounded-full">Base</span></div>`;
        snap.forEach(d => {
            const n = d.data().nombre.toUpperCase();
            if(n !== "SERVICIOS GENERALES") {
                window.todosLosGrupos.push(n);
                let btn = window.tienePermiso('configuracion', 'gestionar') ? `<button onclick="window.eliminarDato('grupos','${d.id}')" class="text-red-400 hover:text-red-600 p-2"><i class="fas fa-trash-alt"></i></button>` : '';
                html += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm"><span class="font-bold text-slate-700 text-xs uppercase"><i class="fas fa-folder text-slate-300 mr-1"></i> ${n}</span>${btn}</div>`;
            }
        });
        window.renderizarSelectorGrupos(window.usuarioActual.id === 'admin' ? window.todosLosGrupos : window.usuarioActual.grupos);
        if(document.getElementById("lista-grupos-db")) document.getElementById("lista-grupos-db").innerHTML = html;
        window.actualizarCheckboxesGrupos();
    });

    onSnapshot(collection(db, "sedes"), snap => {
        let opt = '<option value="" disabled selected>Seleccionar Sede...</option>', lst = '';
        snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(s => {
            opt += `<option value="${s.nombre}">📍 ${s.nombre}</option>`;
            let btn = window.tienePermiso('configuracion', 'gestionar') ? `<button onclick="window.eliminarDato('sedes','${s.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button>` : '';
            lst += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between shadow-sm items-center"><span class="font-bold text-xs uppercase"><i class="fas fa-map-marker-alt text-slate-300 mr-1"></i> ${s.nombre}</span>${btn}</div>`;
        });
        if(document.getElementById("sol-ubicacion")) document.getElementById("sol-ubicacion").innerHTML = opt;
        if(document.getElementById("lista-sedes-db")) document.getElementById("lista-sedes-db").innerHTML = lst;
    });

    if(window.tienePermiso('stock', 'ver') || window.tienePermiso('pedir', 'ver')) {
        onSnapshot(collection(db, "inventario"), snap => {
            rawInventario = [];
            snap.forEach(ds => { rawInventario.push({ id: ds.id, ...ds.data() }); });
            window.procesarDatosInventario();
        });
    }

    if(window.tienePermiso('compras', 'ver')) {
        onSnapshot(collection(db, "compras"), snap => {
            rawCompras = [];
            snap.forEach(ds => { rawCompras.push({ id: ds.id, ...ds.data() }); });
            window.renderCompras();
        });
    }

    let isInitialPedidos = true;
    onSnapshot(collection(db, "pedidos"), snap => {
        if (!isInitialPedidos) {
            snap.docChanges().forEach(change => {
                const p = change.doc.data();
                const miId = window.usuarioActual?.id;
                if (change.type === "added" && p.estado === 'pendiente' && window.tienePermiso('aprobaciones', 'gestionar') && p.usuarioId !== miId) {
                    window.enviarNotificacionNavegador("🚨 Nueva Solicitud", `${p.usuarioId.toUpperCase()} pide ${p.cantidad}x ${p.insumoNom}.\nSede: ${p.ubicacion}`);
                }
                if (change.type === "modified" && p.usuarioId === miId && ['aprobado', 'rechazado'].includes(p.estado)) {
                    window.enviarNotificacionNavegador("Actualización de Pedido", `Tu pedido de ${p.insumoNom} fue ${p.estado.toUpperCase()}.`);
                }
            });
        }
        window.pedidosRaw = [];
        snap.forEach(ds => { window.pedidosRaw.push({ id: ds.id, ...ds.data() }); });
        window.procesarDatosPedidos();
        isInitialPedidos = false;
    });

    if(window.tienePermiso('historial', 'ver')) {
        onSnapshot(collection(db, "entradas_stock"), snap => {
            rawEntradas = [];
            snap.forEach(x => { rawEntradas.push({id: x.id, ...x.data()}); });
            window.renderHistorialUnificado();
        });
    }

    if(window.tienePermiso('mantenimiento', 'ver') || window.tienePermiso('dashboard', 'ver')) {
        onSnapshot(collection(db, "mantenimiento"), snap => {
            rawMantenimiento = [];
            snap.forEach(x => { rawMantenimiento.push({id: x.id, ...x.data()}); });
            window.renderMantenimiento();
            window.actualizarDashboard();
        });
    }

    if(window.tienePermiso('activos', 'ver') || window.tienePermiso('dashboard', 'ver')) {
        onSnapshot(collection(db, "activos"), snap => {
            rawActivos = [];
            snap.forEach(x => { rawActivos.push({id: x.id, ...x.data()}); });
            window.renderActivos();
            window.actualizarDashboard();
        });
    }

    if(window.tienePermiso('facturas', 'ver')) {
        onSnapshot(collection(db, "facturas"), snap => {
            rawFacturas = [];
            snap.forEach(d => rawFacturas.push({id: d.id, ...d.data()}));
            window.procesarDatosFacturas();
        });
    }

    if(window.tienePermiso('usuarios', 'ver')) {
        onSnapshot(collection(db, "usuarios"), snap => {
            let html = "";
            const isManager = window.tienePermiso('usuarios', 'gestionar');
            snap.forEach(d => {
                const u = d.data();
                const jsId = d.id.replace(/'/g, "\\'");
                let btns = isManager ? `<div class="flex gap-2"><button onclick="window.prepararEdicionUsuario('${jsId}')" class="text-indigo-400 hover:text-indigo-600 bg-indigo-50 p-2 rounded-lg transition"><i class="fas fa-pen"></i></button><button onclick="window.eliminarDato('usuarios','${jsId}')" class="text-red-400 hover:text-red-600 bg-red-50 p-2 rounded-lg transition"><i class="fas fa-trash"></i></button></div>` : '';
                html += `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm flex justify-between items-center"><div class="truncate w-full"><div class="flex items-center gap-2"><span class="font-black text-sm uppercase text-slate-800">${d.id}</span><span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold border border-slate-200">${u.rol}</span></div><span class="text-[10px] text-indigo-500 font-bold block truncate mt-1.5"><i class="fas fa-folder-open text-indigo-300"></i> ${(u.grupos||[]).join(", ")}</span></div>${btns}</div>`;
            });
            if(document.getElementById("lista-usuarios-db")) document.getElementById("lista-usuarios-db").innerHTML = html;
        });
    }
};

// ==========================================
// 7. DASHBOARD E HISTORIAL
// ==========================================
window.renderChart = function(id, labels, data, title, palette, chartInstance, setInstance) {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(chartInstance && typeof chartInstance.destroy === 'function') chartInstance.destroy();
    const bgColors = id === 'locationChart' ? palette : palette.map(c=>c+'CC');
    const newChart = new Chart(ctx, {
        type: id === 'locationChart' ? 'doughnut' : 'bar',
        data: {
            labels: labels,
            datasets: [{ label: title, data: data, backgroundColor: bgColors, borderColor: palette, borderWidth: 1, borderRadius: id === 'locationChart' ? 0 : 5 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: id === 'locationChart', position: 'bottom' } } }
    });
    setInstance(newChart);
};

window.actualizarDashboard = function() {
    if(!window.cachePedidos) return;
    const desdeInput = document.getElementById("dash-desde")?.value;
    const hastaInput = document.getElementById("dash-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity;
    if(desdeInput) tDesde = new Date(desdeInput + 'T00:00:00').getTime();
    if(hastaInput) tHasta = new Date(hastaInput + 'T23:59:59').getTime();

    let pedidosFiltrados = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta);
    if(document.getElementById("metrica-pedidos")) {
        document.getElementById("metrica-pedidos").innerText = pedidosFiltrados.filter(p => p.estado === 'pendiente').length;
    }

    let sedesCount = {};
    pedidosFiltrados.forEach(p => {
        if(p.estado !== 'rechazado') sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad;
    });

    const activosFiltrados = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo && a.timestamp >= tDesde && a.timestamp <= tHasta);
    if(document.getElementById("metrica-activos")) document.getElementById("metrica-activos").innerText = activosFiltrados.length;
    if(document.getElementById("metrica-activos-fallas")) document.getElementById("metrica-activos-fallas").innerText = activosFiltrados.filter(a => ['En Mantenimiento', 'Fuera de Servicio'].includes(a.estado)).length;

    const mantFiltrados = rawMantenimiento.filter(m => (m.grupo || "SERVICIOS GENERALES") === window.grupoActivo && m.estado !== 'completado' && m.timestamp >= tDesde && m.timestamp <= tHasta);
    if(document.getElementById("metrica-mant-pend")) document.getElementById("metrica-mant-pend").innerText = mantFiltrados.length;

    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let lblS = [], datS = [];
    invActivo.forEach(p => {
        const n = p.id || 'N/A';
        lblS.push(n.toUpperCase().substring(0,10));
        datS.push(p.cantidad);
    });
    window.renderChart('stockChart', lblS, datS, 'Stock', chartPalette, window.miGraficoStock, ch => window.miGraficoStock = ch);
    window.renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Demandas', chartPalette, window.miGraficoUbicacion, ch => window.miGraficoUbicacion = ch);
};

window.renderHistorialUnificado = function() {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    let html = "";
    
    const ent = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo).map(e => ({
        ts: e.timestamp,
        fecha: e.fecha || new Date(e.timestamp).toLocaleString(),
        tipo: '📥 ENTRADA',
        insumo: e.insumo || 'N/A',
        cant: e.cantidad || 0,
        solicito: e.usuario || 'SISTEMA',
        acepto: 'DIRECTO',
        motivo: e.motivo_edicion || 'Ingreso de Almacén',
        tiempo: 'N/A'
    }));

    const sal = window.cachePedidos.map(p => {
        let tProc = (p.timestamp_aprobado && p.timestamp) ? window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado) : 'PEND';
        return {
            ts: p.timestamp,
            fecha: p.fecha || new Date(p.timestamp).toLocaleString(),
            tipo: '📤 SALIDA',
            insumo: p.insumoNom || 'N/A',
            cant: p.cantidad || 0,
            solicito: p.usuarioId || 'N/A',
            acepto: p.entregado_por || (p.estado === 'pendiente' ? 'ESPERANDO' : 'RECHAZADO'),
            motivo: p.notas || 'Sin descripción',
            tiempo: tProc
        };
    });

    const combinados = [...ent, ...sal].sort((a,b) => b.ts - a.ts);
    if (combinados.length === 0) {
        t.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-bold">No hay registros.</td></tr>`;
        return;
    }

    combinados.forEach(h => {
        html += `<tr class="border-b hover:bg-slate-50 transition">
            <td class="p-4 text-[10px] font-mono whitespace-nowrap">${h.fecha.split(',')[0]}</td>
            <td class="p-4 font-black text-xs">${h.tipo}</td>
            <td class="p-4 font-bold uppercase text-xs text-slate-700">${h.insumo}</td>
            <td class="p-4 font-black text-center text-indigo-600">${h.cant}</td>
            <td class="p-4 text-[10px] uppercase font-bold text-slate-500">${h.solicito}</td>
            <td class="p-4 text-[10px] uppercase font-bold text-emerald-600">${h.acepto}</td>
            <td class="p-4 text-[10px] italic text-slate-400 max-w-xs truncate" title="${h.motivo}">${h.motivo}</td>
            <td class="p-4 text-[10px] font-black text-indigo-400">${h.tiempo}</td>
        </tr>`;
    });
    t.innerHTML = html;
};

// ==========================================
// 8. ESCÁNER QR
// ==========================================
window.iniciarScanner = function(inputIdTarget) {
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
    }, () => {}).catch(err => {
        alert("Error de cámara al iniciar escáner.");
        window.detenerScanner();
    });
};

window.detenerScanner = function() {
    if(window.html5QrcodeScanner) window.html5QrcodeScanner.stop().catch(()=>{});
    document.getElementById("modal-scanner").classList.add("hidden");
};

// ==========================================
// 9. LÓGICA DE NEGOCIO CRUD
// ==========================================
window.ajustarCantidad = function(idInsumo, delta) {
    const safeId = idInsumo.replace(/[^a-zA-Z0-9]/g, '_');
    const n = Math.max(0, (window.carritoGlobal[idInsumo] || 0) + delta);
    window.carritoGlobal[idInsumo] = n;
    const el = document.getElementById(`cant-${safeId}`);
    if(el) el.innerText = n;
    const row = document.getElementById(`row-${safeId}`);
    if(row) {
        if(n > 0){
            row.classList.add("border-indigo-500", "bg-indigo-50");
            row.classList.remove("border-slate-200", "bg-white");
        } else {
            row.classList.remove("border-indigo-500", "bg-indigo-50");
            row.classList.add("border-slate-200", "bg-white");
        }
    }
};

window.prepararEdicionProducto = async function(id) {
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

window.guardarDetallesProducto = async function() {
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

window.procesarSolicitudMultiple = async function() {
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

window.gestionarPedido = async function(pid, accion, ins) {
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

window.abrirModalGrupo = function(bKey) {
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
        if(p.estado === 'pendiente' && window.tienePermiso('aprobaciones', 'gestionar')) {
            act = `<div class="flex gap-2"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border rounded text-center font-bold text-xs"><button onclick="window.gestionarPedido('${p.id}','aprobar','${p.insumoNom.replace(/'/g,"\\'")}')" class="text-white bg-emerald-500 px-2 rounded"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${p.id}','rechazar')" class="text-red-400 bg-red-50 px-2 rounded"><i class="fas fa-times"></i></button></div>`;
        }
        h += `<div class="flex justify-between items-center p-3 border-b"><div class="text-xs"><b>${p.insumoNom}</b> <span class="badge status-pri-${p.prioridad}">${p.prioridad}</span><br>Cant: ${p.cantidad}</div>${act}</div>`;
    });
    document.getElementById("modal-grupo-contenido").innerHTML = h;
    document.getElementById("modal-grupo-admin").classList.remove("hidden");
};

window.confirmarRecibido = async function(pid) {
    if(confirm("¿Recibido?")) await updateDoc(doc(db, "pedidos", pid), { estado: "recibido", timestamp_recibido: Date.now(), fecha_recibido: new Date().toLocaleString() });
};

window.abrirIncidencia = function(pid) {
    document.getElementById('incidencia-pid').value = pid;
    document.getElementById('modal-incidencia').classList.remove('hidden');
};

window.confirmarIncidencia = async function(dev) {
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

window.eliminarDato = async function(col, id) {
    if(confirm("¿Seguro que deseas eliminar este dato?")) await deleteDoc(doc(db, col, id));
};

// ==========================================
// 10. ACTIVOS FIJOS
// ==========================================
window.abrirModalActivo = function(id = null) {
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

window.guardarActivo = async function() {
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

window.abrirDetallesActivo = function(id) {
    const a = rawActivos.find(x => x.id === id); if(!a) return;
    document.getElementById("activo-bitacora-id").value = id; document.getElementById("activo-det-nombre").innerText = a.nombre; document.getElementById("activo-det-id").innerText = "ID: " + a.id;
    document.getElementById("activo-det-qr-container").innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(a.id)}" alt="QR Code" class="w-20 h-20 object-contain">`;
    const imgEl = document.getElementById("activo-det-img");
    if(a.imagen) { imgEl.src = a.imagen; imgEl.classList.remove("hidden"); } else { imgEl.classList.add("hidden"); }
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
    document.getElementById("activo-bitacora-texto").value = ""; document.getElementById("activo-bitacora-url").value = "";
    
    // Validar permisos para escribir en bitácora
    const bitacoraForm = document.getElementById("activo-bitacora-form");
    if(window.tienePermiso('activos', 'gestionar')) {
        bitacoraForm.classList.remove("hidden");
    } else {
        bitacoraForm.classList.add("hidden");
    }

    document.getElementById("modal-activo-detalles").classList.remove("hidden");
};
window.cerrarDetallesActivo = function() { document.getElementById("modal-activo-detalles").classList.add("hidden"); };
window.guardarBitacoraActivo = async function() {
    const id = document.getElementById("activo-bitacora-id").value;
    const txt = document.getElementById("activo-bitacora-texto").value.trim();
    const url = document.getElementById("activo-bitacora-url").value;
    if(!txt && !url) return alert("Escribe o adjunta algo.");
    const aRef = doc(db, "activos", id); const aSnap = await getDoc(aRef);
    if(aSnap.exists()) {
        const bitacoraAnterior = aSnap.data().bitacora || [];
        await updateDoc(aRef, { bitacora: [...bitacoraAnterior, { nota: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] });
        window.abrirDetallesActivo(id);
    }
};

window.abrirModalMantenimiento = function() {
    document.getElementById("mant-equipo").value=""; document.getElementById("mant-fecha").value=""; document.getElementById("mant-fecha-notificacion").value=""; document.getElementById("mant-correo").value=""; document.getElementById("mant-responsable").value=""; document.getElementById("mant-detalle").value=""; document.getElementById("modal-mantenimiento").classList.remove("hidden");
};
window.guardarMantenimiento = async function() {
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
window.iniciarMantenimiento = async function(id) { if(confirm("¿Cambiar estado a EN PROCESO?")) await updateDoc(doc(db, "mantenimiento", id), { estado: 'en_proceso', timestamp_inicio: Date.now() }); };
window.completarMantenimiento = async function(id) { if(confirm("¿Finalizar tarea?")) await updateDoc(doc(db, "mantenimiento", id), { estado: 'completado', timestamp_completado: Date.now(), fecha_completado: new Date().toLocaleString() }); };
window.abrirBitacora = function(id) {
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
    
    const bitacoraForm = document.getElementById("bitacora-form-container");
    if(window.tienePermiso('mantenimiento', 'gestionar')) {
        bitacoraForm.classList.remove("hidden");
    } else {
        bitacoraForm.classList.add("hidden");
    }
};
window.guardarBitacora = async function() {
    const id = document.getElementById("bitacora-mant-id").value; const txt = document.getElementById("bitacora-texto").value.trim(); const url = document.getElementById("bitacora-media-url").value;
    if(!txt && !url) return alert("Escribe o adjunta algo.");
    const mRef = doc(db, "mantenimiento", id); const mSnap = await getDoc(mRef);
    if(mSnap.exists()) { const bitacoraAnterior = mSnap.data().bitacora || []; await updateDoc(mRef, { bitacora: [...bitacoraAnterior, { observacion: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] }); window.abrirBitacora(id); }
};
window.cerrarBitacora = function() { document.getElementById("modal-bitacora").classList.add("hidden"); };

window.guardarSede = async function() { const s = document.getElementById("new-sede").value.trim().toUpperCase(); if(!s) return alert("Ingrese sede."); try { await addDoc(collection(db, "sedes"), { nombre: s, timestamp: Date.now() }); document.getElementById("new-sede").value = ""; alert("Sede guardada."); } catch(e) { alert("Error."); } };
window.guardarGrupo = async function() { const g = document.getElementById("new-grupo").value.trim().toUpperCase(); if(!g) return alert("Ingrese grupo."); try { await addDoc(collection(db, "grupos"), { nombre: g, timestamp: Date.now() }); document.getElementById("new-grupo").value = ""; alert("Grupo creado."); } catch(e) { alert("Error."); } };

window.guardarUsuario = async function() {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const p = document.getElementById("new-pass").value.trim();
    const e = document.getElementById("new-email") ? document.getElementById("new-email").value.trim() : "";
    const r = document.getElementById("new-role").value.trim().toUpperCase() || "USUARIO BASE";
    
    const checkboxes = document.querySelectorAll('.chk-grupo:checked');
    let gruposSeleccionados = Array.from(checkboxes).map(chk => chk.value);
    if(gruposSeleccionados.length === 0) gruposSeleccionados = ["SERVICIOS GENERALES"];
    
    const perms = {};
    document.querySelectorAll('.chk-permiso').forEach(chk => {
        const mod = chk.dataset.modulo;
        const acc = chk.dataset.accion;
        if(!perms[mod]) perms[mod] = { ver: false, gestionar: false };
        if(chk.checked) perms[mod][acc] = true;
    });

    if(!id || !p) return alert("El ID y la contraseña son obligatorios.");
    try {
        await setDoc(doc(db,"usuarios",id), { pass: p, rol: r, email: e, grupos: gruposSeleccionados, permisos: perms }, { merge: true });
        alert("Usuario guardado exitosamente.");
        window.cancelarEdicionUsuario();
    } catch(e) {
        alert("Error al guardar usuario.");
    }
};

window.prepararEdicionUsuario = async function(userId) {
    const snap = await getDoc(doc(db, "usuarios", userId));
    if(!snap.exists()) return;
    const u = snap.data();
    
    document.getElementById("edit-mode-id").value = userId;
    const inpU = document.getElementById("new-user");
    inpU.value = userId; inpU.disabled = true;
    document.getElementById("new-pass").value = u.pass;
    
    const elEmail = document.getElementById("new-email");
    if(elEmail) elEmail.value = u.email || "";
    
    document.getElementById("new-role").value = u.rol || "";
    
    const p = u.permisos || {};
    document.querySelectorAll('.chk-permiso').forEach(chk => {
        const mod = chk.dataset.modulo;
        const acc = chk.dataset.accion;
        chk.checked = p[mod] && p[mod][acc] === true;
    });

    const gruposUsuario = u.grupos || ["SERVICIOS GENERALES"];
    document.querySelectorAll('.chk-grupo').forEach(chk => { chk.checked = gruposUsuario.includes(chk.value); });
    
    document.getElementById("btn-guardar-usuario").innerText = "Actualizar Usuario";
    document.getElementById("cancel-edit-msg").classList.remove("hidden");
};

window.cancelarEdicionUsuario = function() {
    document.getElementById("edit-mode-id").value = "";
    const inpU = document.getElementById("new-user");
    inpU.value = ""; inpU.disabled = false;
    document.getElementById("new-pass").value = "";
    
    const elEmail = document.getElementById("new-email");
    if(elEmail) elEmail.value = "";
    
    document.getElementById("new-role").value = "";
    
    document.querySelectorAll('.chk-permiso').forEach(chk => chk.checked = false);
    document.querySelectorAll('.chk-grupo').forEach(chk => chk.checked = false);
    
    document.getElementById("btn-guardar-usuario").innerText = "Guardar Usuario";
    document.getElementById("cancel-edit-msg").classList.add("hidden");
};

window.abrirModalEditarEntrada = function(idEntrada, insumo, cantidadActual) { document.getElementById('edit-entrada-id').value = idEntrada; document.getElementById('edit-entrada-insumo').value = insumo; document.getElementById('edit-entrada-insumo-display').value = insumo; document.getElementById('edit-entrada-cant-original').value = cantidadActual; document.getElementById('edit-entrada-cantidad').value = cantidadActual; document.getElementById('edit-entrada-motivo').value = ""; document.getElementById('modal-editar-entrada').classList.remove('hidden'); };
window.guardarEdicionEntrada = async function() { const idEntrada = document.getElementById('edit-entrada-id').value; const insumo = document.getElementById('edit-entrada-insumo').value; const cantOriginal = parseInt(document.getElementById('edit-entrada-cant-original').value); const cantNueva = parseInt(document.getElementById('edit-entrada-cantidad').value); const motivo = document.getElementById('edit-entrada-motivo').value.trim(); if (isNaN(cantNueva) || cantNueva < 0) return alert("Cantidad inválida."); if (!motivo) return alert("Ingrese motivo."); const diferencia = cantNueva - cantOriginal; if (diferencia === 0) { document.getElementById('modal-editar-entrada').classList.add('hidden'); return; } try { const invRef = doc(db, "inventario", insumo); const invSnap = await getDoc(invRef); if (!invSnap.exists()) return; await updateDoc(invRef, { cantidad: invSnap.data().cantidad + diferencia }); await updateDoc(doc(db, "entradas_stock", idEntrada), { cantidad: cantNueva, motivo_edicion: motivo }); alert("Entrada corregida."); document.getElementById('modal-editar-entrada').classList.add('hidden'); } catch(e) { alert("Error."); } };
window.abrirModalFactura = function() { document.getElementById("fact-proveedor").value = ""; document.getElementById("fact-gasto").value = ""; document.getElementById("fact-fecha").value = ""; document.getElementById("fact-archivo-url").value = ""; document.getElementById("factura-file-name").innerText = "Ninguno"; document.getElementById("modal-factura").classList.remove("hidden"); };
window.cerrarModalFactura = function() { document.getElementById("modal-factura").classList.add("hidden"); };
window.guardarFactura = async function() { const pv = document.getElementById("fact-proveedor").value.trim(); const ga = parseFloat(document.getElementById("fact-gasto").value); const fe = document.getElementById("fact-fecha").value; const ar = document.getElementById("fact-archivo-url").value; if(!pv || isNaN(ga) || !fe) return alert("Campos requeridos."); try { await addDoc(collection(db, "facturas"), { proveedor: pv, gasto: ga, fecha_compra: fe, archivo_url: ar, grupo: window.grupoActivo, usuarioRegistro: window.usuarioActual.id, timestamp: Date.now(), fecha_registro: new Date().toLocaleString() }); alert("Factura registrada."); window.cerrarModalFactura(); } catch(e) { alert("Error."); } };

// ==========================================
// 10. EXPORTACIÓN EXCEL
// ==========================================
window.descargarReporte = async function() {
    if(typeof XLSX === 'undefined') return alert("Cargando Excel...");
    const inputDesde = document.getElementById("dash-desde")?.value || document.getElementById("rep-desde")?.value;
    const inputHasta = document.getElementById("dash-hasta")?.value || document.getElementById("rep-hasta")?.value;
    let tDesde = 0; let tHasta = Infinity;
    if(inputDesde) tDesde = new Date(inputDesde + 'T00:00:00').getTime();
    if(inputHasta) tHasta = new Date(inputHasta + 'T23:59:59').getTime();
    
    if(!confirm(`¿Generar reporte general (Exportar Datos) del grupo ${window.grupoActivo}?`)) return;
    
    const uSnap = await getDocs(collection(db, "usuarios"));
    const usersMap = {};
    uSnap.forEach(u => { usersMap[u.id] = u.data(); });
    
    const obtenerMesAno = (timestamp) => {
        if(!timestamp) return 'N/A';
        const d = new Date(timestamp);
        return `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]} ${d.getFullYear()}`;
    };
    
    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const stockData = invActivo.map(p => ({ "Insumo": (p.id||'').toUpperCase(), "Cantidad Disponible": p.cantidad || 0, "Stock Mínimo": p.stockMinimo || 0, "Precio Unit. ($)": p.precio || 0 }));
    
    const entActivas = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo && e.timestamp >= tDesde && e.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp);
    const entradasData = entActivas.map(mov => ({ "Mes y Año": obtenerMesAno(mov.timestamp), "Fecha de Entrada": mov.fecha || 'N/A', "Insumo": (mov.insumo || '').toUpperCase(), "Cantidad Ingresada": mov.cantidad || 0, "Usuario Responsable": (mov.usuario || '').toUpperCase() }));
    
    const salActivas = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp);
    const salidasData = salActivas.map(mov => {
        const uId = mov.usuarioId || '';
        const userObj = usersMap[uId] || {};
        return {
            "Mes y Año": obtenerMesAno(mov.timestamp),
            "ID Pedido": mov.batchId || 'N/A',
            "Fecha Solicitud": mov.fecha_solicitud || mov.fecha || 'N/A',
            "Hora Solicitud": mov.timestamp ? new Date(mov.timestamp).toLocaleTimeString() : 'N/A',
            "Tiempo en Atender": mov.timestamp_aprobado ? window.formatoTiempoDiferencia(mov.timestamp, mov.timestamp_aprobado) : 'Pendiente',
            "Tiempo en Recibir": mov.timestamp_recibido ? window.formatoTiempoDiferencia(mov.timestamp_aprobado || mov.timestamp, mov.timestamp_recibido) : (mov.estado === 'recibido' ? 'N/A' : 'Pendiente/No recibido'),
            "Prioridad": (mov.prioridad || 'NORMAL').toUpperCase(),
            "Insumo": (mov.insumoNom || '').toUpperCase(),
            "Cant.": mov.cantidad || 0,
            "Sede Destino": (mov.ubicacion || '').toUpperCase(),
            "Usuario Solicitante": uId.toUpperCase(),
            "Estado Actual": (mov.estado || '').toUpperCase(),
            "Entregado Por": (mov.entregado_por || 'N/A').toUpperCase()
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
// 11. INICIALIZACIÓN FINAL Y CLOUDINARY
// ==========================================
const inicializarApp = function() {
    const sesion = localStorage.getItem("fcilog_session");
    if(sesion) {
        window.cargarSesion(JSON.parse(sesion));
    }
    
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

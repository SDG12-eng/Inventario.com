import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN FIREBASE Y GLOBALES ---
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.usuarioActual = null;
window.carritoGlobal = {};
window.cachePedidos = [];
window.cacheEntradas = [];
window.todosLosGrupos = ["SERVICIOS GENERALES"]; 
window.grupoActivo = "SERVICIOS GENERALES";
window.miGraficoStock = null;
window.miGraficoUbicacion = null;
window.html5QrcodeScanner = null;

const chartPalette = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#14b8a6', '#3b82f6', '#f97316', '#a855f7', '#ef4444'];

let rawInventario = [];
let rawEntradas = [];
let rawFacturas = [];
let rawMantenimiento = [];
let rawActivos = [];

// --- 2. NOTIFICACIONES CHROME (NUEVO) ---
window.solicitarPermisosNotificacion = () => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") console.log("Notificaciones habilitadas.");
        });
    }
};
window.enviarNotificacionNavegador = (titulo, cuerpo) => {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(titulo, { body: cuerpo, icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png" });
    }
};

// --- 3. OPTIMIZACIÓN DE RENDIMIENTO (DEBOUNCE) ---
let timeoutBusqueda;
window.debounceFiltrarTarjetas = (idContenedor, texto) => {
    clearTimeout(timeoutBusqueda);
    timeoutBusqueda = setTimeout(() => {
        const term = texto.toLowerCase();
        const container = document.getElementById(idContenedor);
        if(container) {
            const cards = container.querySelectorAll('.item-tarjeta');
            cards.forEach(c => { c.style.display = c.innerText.toLowerCase().includes(term) ? '' : 'none'; });
        }
    }, 150);
};

window.debounceFiltrarTabla = (idTabla, texto) => {
    clearTimeout(timeoutBusqueda);
    timeoutBusqueda = setTimeout(() => {
        const term = texto.toLowerCase();
        const filas = document.querySelectorAll(`#${idTabla} tr`);
        filas.forEach(f => { f.style.display = f.innerText.toLowerCase().includes(term) ? '' : 'none'; });
    }, 150);
};

// --- 4. INTERFAZ Y NAVEGACIÓN ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => { v.classList.add("hidden"); v.classList.remove("animate-fade-in"); });
    const target = document.getElementById(`pag-${id}`);
    if(target) { target.classList.remove("hidden"); setTimeout(() => target.classList.add("animate-fade-in"), 10); }
    if(window.innerWidth < 768) window.toggleMenu(false);
};

window.toggleMenu = (forceState) => {
    const sb = document.getElementById("sidebar"); const ov = document.getElementById("sidebar-overlay");
    if(!sb || !ov) return;
    const isClosed = sb.classList.contains("-translate-x-full");
    const shouldOpen = forceState !== undefined ? forceState : isClosed;
    if (shouldOpen) { sb.classList.remove("-translate-x-full"); ov.classList.remove("hidden"); sb.style.zIndex = "100"; ov.style.zIndex = "90"; } 
    else { sb.classList.add("-translate-x-full"); ov.classList.add("hidden"); }
};

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`)?.classList.remove('hidden');
    const onClass = "flex-1 py-2.5 rounded-xl text-xs font-bold bg-white text-indigo-600 shadow-sm transition-all"; 
    const offClass = "flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 transition-all";
    if(tab === 'activos') { document.getElementById('tab-btn-activos').className = onClass; document.getElementById('tab-btn-historial').className = offClass; } 
    else { document.getElementById('tab-btn-historial').className = onClass; document.getElementById('tab-btn-activos').className = offClass; }
};

// --- 5. SESIÓN Y GRUPOS ---
window.actualizarCheckboxesGrupos = () => {
    const container = document.getElementById("user-grupos-checkboxes");
    if(!container) return;
    container.innerHTML = window.todosLosGrupos.map(g => `<label class="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition"><input type="checkbox" value="${g}" class="w-4 h-4 text-indigo-600 rounded border-slate-300 chk-grupo"><span class="text-xs font-bold text-slate-700 uppercase">${g}</span></label>`).join('');
};

window.renderizarSelectorGrupos = (misGrupos) => {
    const sel = document.getElementById("selector-grupo-activo"); if(!sel) return;
    sel.innerHTML = misGrupos.map(g => `<option value="${g}">${g}</option>`).join(''); sel.value = window.grupoActivo;
    document.getElementById("dash-grupo-label").innerText = window.grupoActivo; document.getElementById("lbl-grupo-solicitud").innerText = window.grupoActivo;
};

window.cambiarGrupoActivo = (nuevoGrupo) => {
    window.grupoActivo = nuevoGrupo; document.getElementById("dash-grupo-label").innerText = window.grupoActivo; document.getElementById("lbl-grupo-solicitud").innerText = window.grupoActivo;
    window.carritoGlobal = {}; window.procesarDatosInventario(); window.procesarDatosPedidos(); window.renderHistorialUnificado(); window.procesarDatosFacturas(); window.renderMantenimiento(); window.renderActivos(); window.actualizarDashboard(); 
};

window.cargarSesion = (datos) => {
    window.usuarioActual = datos; localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login")?.classList.add("hidden"); document.getElementById("interfaz-app")?.classList.remove("hidden");
    
    window.solicitarPermisosNotificacion();

    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) infoDiv.innerHTML = `<div class="flex flex-col items-center"><div class="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2"><i class="fas fa-user"></i></div><span class="font-bold text-slate-700 uppercase tracking-wide">${datos.id}</span><span class="text-[10px] uppercase font-bold text-white bg-indigo-500 px-2 py-0.5 rounded-full mt-1 shadow-sm">${datos.rol}</span></div>`;

    if(document.getElementById("btn-admin-stock") && ['admin','manager'].includes(datos.rol)) {
        document.getElementById("btn-admin-stock").classList.remove("hidden");
        document.getElementById("btn-admin-activos")?.classList.remove("hidden");
    }

    const rutas = { st:{id:'stats',n:'Dashboard',i:'chart-pie'}, sk:{id:'stock',n:'Stock',i:'boxes'}, ac:{id:'activos',n:'Activos / Equipos',i:'desktop'}, pd:{id:'solicitar',n:'Pedir',i:'cart-plus'}, pe:{id:'solicitudes',n:'Aprobaciones',i:'check-double'}, mt:{id:'mantenimiento',n:'Mantenimiento',i:'tools'}, hs:{id:'historial',n:'Movimientos',i:'history'}, fc:{id:'facturas',n:'Facturas',i:'file-invoice-dollar'}, cf:{id:'config',n:'Configuración',i:'cogs'}, us:{id:'usuarios',n:'Accesos',i:'users-cog'}, mp:{id:'notificaciones',n:'Mis Pedidos',i:'truck'} };
    
    let menuActivo = [];
    if(datos.rol === 'admin') menuActivo = [rutas.st, rutas.sk, rutas.ac, rutas.pd, rutas.pe, rutas.mt, rutas.hs, rutas.fc, rutas.cf, rutas.us, rutas.mp]; 
    else if(datos.rol === 'manager') menuActivo = [rutas.st, rutas.sk, rutas.ac, rutas.pd, rutas.pe, rutas.mt, rutas.hs, rutas.fc, rutas.mp]; 
    else if(datos.rol === 'supervisor') menuActivo = [rutas.st, rutas.sk, rutas.ac, rutas.pd, rutas.pe, rutas.mt, rutas.hs, rutas.mp]; 
    else menuActivo = [rutas.sk, rutas.pd, rutas.mp];
    
    document.getElementById("menu-dinamico").innerHTML = menuActivo.map(x => `<button onclick="window.verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');

    let misGrupos = datos.grupos || ["SERVICIOS GENERALES"]; if(datos.rol === 'admin') misGrupos = window.todosLosGrupos; 
    window.grupoActivo = misGrupos[0]; window.renderizarSelectorGrupos(misGrupos);
    window.verPagina(['admin','manager','supervisor'].includes(datos.rol) ? 'stats' : 'stock');
    window.activarSincronizacion();
};

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase(); const pass = document.getElementById("login-pass").value.trim();
    if(!user || !pass) return alert("Ingrese usuario y contraseña.");
    if (user === "admin" && pass === "1130") { window.cargarSesion({ id: "admin", rol: "admin", grupos: ["SERVICIOS GENERALES"] }); return; }
    try { const snap = await getDoc(doc(db, "usuarios", user)); if (snap.exists() && snap.data().pass === pass) window.cargarSesion({ id: user, ...snap.data() }); else alert("Credenciales incorrectas."); } catch (e) { alert("Error de conexión."); }
};
window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };


// --- 6. REALTIME DB ---
window.activarSincronizacion = () => {
    const uRol = window.usuarioActual.rol;
    onSnapshot(collection(db, "grupos"), snap => {
        window.todosLosGrupos = ["SERVICIOS GENERALES"];
        let html = `<div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center"><span class="font-black text-indigo-700 text-xs uppercase"><i class="fas fa-lock mr-1"></i> SERVICIOS GENERALES</span><span class="text-[10px] bg-indigo-200 text-indigo-700 px-2 rounded-full">Base</span></div>`;
        snap.forEach(d => { const n = d.data().nombre.toUpperCase(); if(n !== "SERVICIOS GENERALES") { window.todosLosGrupos.push(n); html += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center"><span class="font-bold text-slate-700 text-xs uppercase">📂 ${n}</span><button onclick="window.eliminarDato('grupos','${d.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button></div>`; }});
        if(uRol === 'admin') window.renderizarSelectorGrupos(window.todosLosGrupos);
        if(document.getElementById("lista-grupos-db")) document.getElementById("lista-grupos-db").innerHTML = html;
        window.actualizarCheckboxesGrupos();
    });
    onSnapshot(collection(db, "sedes"), snap => {
        let opt = '<option value="" disabled selected>Seleccionar Sede...</option>', lst = '';
        snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(s => { opt += `<option value="${s.nombre}">📍 ${s.nombre}</option>`; lst += `<div class="bg-white p-4 rounded-xl border flex justify-between"><span class="font-bold text-xs uppercase">📍 ${s.nombre}</span><button onclick="window.eliminarDato('sedes','${s.id}')" class="text-red-400"><i class="fas fa-trash-alt"></i></button></div>`; });
        if(document.getElementById("sol-ubicacion")) document.getElementById("sol-ubicacion").innerHTML = opt;
        if(document.getElementById("lista-sedes-db")) document.getElementById("lista-sedes-db").innerHTML = lst;
    });
    onSnapshot(collection(db, "inventario"), snap => { rawInventario = []; snap.forEach(ds => { rawInventario.push({ id: ds.id, ...ds.data() }); }); window.procesarDatosInventario(); });
    
    // NOTIFICACIONES INTELIGENTES EN PEDIDOS
    let isInitialPedidos = true;
    onSnapshot(collection(db, "pedidos"), snap => { 
        if (!isInitialPedidos) {
            snap.docChanges().forEach(change => {
                const p = change.doc.data();
                const miRol = window.usuarioActual?.rol;
                const miId = window.usuarioActual?.id;
                
                // Notificar a Admin de nuevo pedido
                if (change.type === "added" && p.estado === 'pendiente' && ['admin','manager','supervisor'].includes(miRol) && p.usuarioId !== miId) {
                    window.enviarNotificacionNavegador("🚨 Nueva Solicitud", `${p.usuarioId.toUpperCase()} pide ${p.cantidad}x ${p.insumoNom}.\nSede: ${p.ubicacion}`);
                }
                // Notificar a Usuario de estado de pedido
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

    onSnapshot(collection(db, "entradas_stock"), snap => { rawEntradas = []; snap.forEach(x => { rawEntradas.push({id: x.id, ...x.data()}); }); window.renderHistorialUnificado(); });
    onSnapshot(collection(db, "mantenimiento"), snap => { rawMantenimiento = []; snap.forEach(x => { rawMantenimiento.push({id: x.id, ...x.data()}); }); window.renderMantenimiento(); });
    onSnapshot(collection(db, "activos"), snap => { rawActivos = []; snap.forEach(x => { rawActivos.push({id: x.id, ...x.data()}); }); window.renderActivos(); });

    if(['admin','manager'].includes(uRol)) onSnapshot(collection(db, "facturas"), snap => { rawFacturas = []; snap.forEach(d => rawFacturas.push({id: d.id, ...d.data()})); window.procesarDatosFacturas(); });
    if(uRol === 'admin') onSnapshot(collection(db, "usuarios"), snap => {
        let html = ""; snap.forEach(d => { const u = d.data(); const jsId = d.id.replace(/'/g, "\\'"); html += `<div class="bg-white p-4 rounded-xl border flex justify-between"><div class="truncate w-full"><div class="flex items-center gap-2"><span class="font-bold text-sm uppercase">${d.id}</span><span class="text-[9px] bg-slate-100 px-2 rounded uppercase">${u.rol}</span></div><span class="text-[9px] text-indigo-400 block truncate mt-1">${(u.grupos||[]).join(", ")}</span></div><div class="flex gap-2"><button onclick="window.prepararEdicionUsuario('${jsId}')" class="text-indigo-400"><i class="fas fa-pen"></i></button><button onclick="window.eliminarDato('usuarios','${jsId}')" class="text-red-400"><i class="fas fa-trash"></i></button></div></div>`; });
        if(document.getElementById("lista-usuarios-db")) document.getElementById("lista-usuarios-db").innerHTML = html;
    });
};


// --- 7. ACTIVOS FIJOS / EQUIPOS ---
window.renderActivos = () => {
    const list = document.getElementById("lista-activos-db"); if(!list) return;
    let html = "";
    const activosFiltrados = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    const isAdmin = ['admin','manager'].includes(window.usuarioActual.rol);

    activosFiltrados.forEach(a => {
        const jsId = a.id.replace(/'/g, "\\'");
        const img = a.imagen ? `<img src="${a.imagen}" loading="lazy" class="w-16 h-16 object-cover rounded-xl border border-slate-200">` : `<div class="w-16 h-16 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-300"><i class="fas fa-desktop text-2xl"></i></div>`;
        let bColor = "bg-emerald-50 text-emerald-600 border-emerald-200";
        if(a.estado === "En Mantenimiento") bColor = "bg-amber-50 text-amber-600 border-amber-200";
        if(a.estado === "Fuera de Servicio") bColor = "bg-red-50 text-red-600 border-red-200";
        if(a.estado === "Almacenado") bColor = "bg-slate-50 text-slate-600 border-slate-200";
        let controls = isAdmin ? `<button onclick="window.abrirModalActivo('${jsId}')" class="text-slate-300 hover:text-indigo-500 p-1"><i class="fas fa-pen text-xs"></i></button><button onclick="window.eliminarDato('activos','${jsId}')" class="text-slate-300 hover:text-red-400 p-1"><i class="fas fa-trash text-xs"></i></button>` : "";

        html += `<div class="bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition flex flex-col item-tarjeta"><div class="flex justify-between items-start mb-3"><span class="px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider ${bColor}">${a.estado || 'Activo'}</span><div class="flex gap-1">${controls}</div></div><div class="flex items-center gap-4 mb-4">${img}<div class="truncate flex-1"><h4 class="font-black text-slate-700 text-sm uppercase truncate" title="${a.nombre}">${a.nombre}</h4><p class="text-[10px] text-slate-400 font-mono mt-0.5">${a.id}</p><p class="text-[10px] text-slate-500 font-bold uppercase mt-1 truncate">${a.marca || ''}</p></div></div><div class="flex justify-between items-end mt-auto pt-3 border-t border-slate-50"><div class="text-[10px] text-slate-400"><p><i class="fas fa-map-marker-alt text-slate-300 w-3"></i> ${a.ubicacion || 'N/A'}</p><p class="mt-1"><i class="fas fa-tags text-slate-300 w-3"></i> ${a.categoria || 'N/A'}</p></div><button onclick="window.abrirDetallesActivo('${jsId}')" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm"><i class="fas fa-eye"></i> Detalles</button></div></div>`;
    });
    list.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm">No hay activos registrados en este grupo.</p>`;
};

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
    const actId = document.getElementById("activo-id").value; const nombre = document.getElementById("activo-nombre").value.trim().toUpperCase();
    if (!nombre) return alert("El nombre del activo es obligatorio.");
    const data = { nombre: nombre, categoria: document.getElementById("activo-categoria").value.trim().toUpperCase(), marca: document.getElementById("activo-marca").value.trim().toUpperCase(), proveedor: document.getElementById("activo-proveedor").value.trim().toUpperCase(), ubicacion: document.getElementById("activo-ubicacion").value.trim().toUpperCase(), precio: parseFloat(document.getElementById("activo-precio").value) || 0, estado: document.getElementById("activo-estado").value, descripcion: document.getElementById("activo-descripcion").value.trim(), observacion: document.getElementById("activo-observacion").value.trim(), imagen: document.getElementById("activo-img-url").value, grupo: window.grupoActivo };
    try {
        if (actId) { await updateDoc(doc(db, "activos", actId), data); alert("Activo actualizado."); } 
        else { const newId = "ACT-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random()*100); data.id = newId; data.creado_por = window.usuarioActual.id; data.fecha_registro = new Date().toLocaleString(); data.timestamp = Date.now(); data.bitacora = []; await setDoc(doc(db, "activos", newId), data); alert("Activo registrado. ID: " + newId); }
        document.getElementById("modal-activo").classList.add("hidden");
    } catch(e) { alert("Error al guardar activo."); }
};

window.abrirDetallesActivo = (id) => {
    const a = rawActivos.find(x => x.id === id); if(!a) return;
    document.getElementById("activo-bitacora-id").value = id; document.getElementById("activo-det-nombre").innerText = a.nombre; document.getElementById("activo-det-id").innerText = "ID: " + a.id;
    document.getElementById("activo-det-qr-container").innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=${encodeURIComponent(a.id)}" alt="QR Code" class="w-16 h-16 object-contain">`;
    const imgEl = document.getElementById("activo-det-img"); if(a.imagen) { imgEl.src = a.imagen; imgEl.classList.remove("hidden"); } else { imgEl.classList.add("hidden"); }
    document.getElementById("activo-det-estado").innerHTML = `<span class="px-2 py-1 bg-slate-100 rounded text-slate-700 text-xs">${a.estado}</span>`; document.getElementById("activo-det-cat").innerText = a.categoria || '-'; document.getElementById("activo-det-marca").innerText = a.marca || '-'; document.getElementById("activo-det-ubi").innerText = a.ubicacion || '-'; document.getElementById("activo-det-fecha").innerText = a.fecha_registro || '-'; document.getElementById("activo-det-desc").innerText = a.descripcion || 'Sin detalles';
    let bHtml = "";
    if (a.observacion) bHtml += `<div class="relative pl-4 border-l-2 border-indigo-200 pb-3"><div class="absolute w-2.5 h-2.5 bg-indigo-500 rounded-full -left-[6px] top-1"></div><p class="text-[9px] text-slate-400 font-bold mb-1">NOTA ORIGINAL</p><p class="text-xs font-medium text-slate-700 italic">${a.observacion}</p></div>`;
    if(a.bitacora && a.bitacora.length > 0) { a.bitacora.forEach(b => { let mediaHtml = ""; if(b.mediaUrl) { if(b.mediaUrl.match(/\.(mp4|webm|ogg)$/i)) mediaHtml = `<video src="${b.mediaUrl}" controls class="max-h-32 rounded-lg mt-2 border"></video>`; else mediaHtml = `<a href="${b.mediaUrl}" target="_blank"><img src="${b.mediaUrl}" loading="lazy" class="max-h-24 object-contain rounded-lg mt-2 border hover:opacity-80"></a>`; } bHtml += `<div class="relative pl-4 border-l-2 border-slate-200 pb-4"><div class="absolute w-2.5 h-2.5 bg-slate-400 rounded-full -left-[6px] top-1"></div><div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"><p class="text-[9px] text-slate-400 font-bold mb-1 flex justify-between"><span>${b.usuario.toUpperCase()}</span><span>${b.fecha}</span></p><p class="text-xs text-slate-700 whitespace-pre-wrap">${b.nota}</p>${mediaHtml}</div></div>`; }); } 
    else if (!a.observacion) bHtml += `<p class="text-xs text-slate-400 italic">No hay notas registradas.</p>`;
    document.getElementById("activo-bitacora-timeline").innerHTML = bHtml;
    document.getElementById("activo-bitacora-texto").value = ""; document.getElementById("activo-bitacora-url").value = ""; document.getElementById("activo-bitacora-badge").classList.add("hidden");
    document.getElementById("modal-activo-detalles").classList.remove("hidden");
};
window.cerrarDetallesActivo = () => { document.getElementById("modal-activo-detalles").classList.add("hidden"); };
window.guardarBitacoraActivo = async () => { const id = document.getElementById("activo-bitacora-id").value; const txt = document.getElementById("activo-bitacora-texto").value.trim(); const url = document.getElementById("activo-bitacora-url").value; if(!txt && !url) return alert("Escribe o adjunta algo."); const aRef = doc(db, "activos", id); const aSnap = await getDoc(aRef); if(aSnap.exists()) { const bitacoraAnterior = aSnap.data().bitacora || []; await updateDoc(aRef, { bitacora: [...bitacoraAnterior, { nota: txt, mediaUrl: url, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }] }); window.abrirDetallesActivo(id); } };


// --- 8. INVENTARIO Y PEDIDOS (CONSUMIBLES) ---
window.ajustarCantidad = (idInsumo, delta) => { const safeId = idInsumo.replace(/[^a-zA-Z0-9]/g, '_'); const n = Math.max(0, (window.carritoGlobal[idInsumo] || 0) + delta); window.carritoGlobal[idInsumo] = n; const el = document.getElementById(`cant-${safeId}`); if(el) el.innerText = n; const row = document.getElementById(`row-${safeId}`); if(row) { if(n > 0){ row.classList.add("border-indigo-500", "bg-indigo-50/50"); row.classList.remove("border-slate-100", "bg-white"); } else { row.classList.remove("border-indigo-500", "bg-indigo-50/50"); row.classList.add("border-slate-100", "bg-white"); } } };

window.procesarDatosInventario = () => {
    const grid = document.getElementById("lista-inventario"); const cartContainer = document.getElementById("contenedor-lista-pedidos"); const dataList = document.getElementById("lista-sugerencias");
    if(!grid) return;
    let gridHTML = ""; let cartHTML = ""; let listHTML = ""; let tr = 0, ts = 0;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const isAdmin = ['admin','manager'].includes(window.usuarioActual.rol);

    invFiltrado.forEach(p => {
        const nombre = p.id.toUpperCase(); const safeId = p.id.replace(/[^a-zA-Z0-9]/g, '_'); const jsId = p.id.replace(/'/g, "\\'"); 
        tr++; ts += p.cantidad; listHTML += `<option value="${nombre}">`;

        let controls = isAdmin ? `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>` : "";
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-12 h-12 object-cover rounded-lg border mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
        const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo);
        const border = isLow ? "border-2 border-red-500 bg-red-50" : "border border-slate-100 bg-white";
        
        gridHTML += `<div class="${border} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col item-tarjeta"><div class="flex justify-between items-start">${img}${controls}</div><h4 class="font-bold text-slate-700 text-xs truncate" title="${nombre}">${nombre} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse"></i>':''}</h4><div class="flex justify-between items-end mt-1"><p class="text-2xl font-black text-slate-800">${p.cantidad}</p>${p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : ''}</div></div>`;

        if(cartContainer && p.cantidad > 0) {
            const enCarro = window.carritoGlobal[p.id] || 0;
            const active = enCarro > 0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white";
            cartHTML += `<div id="row-${safeId}" class="flex items-center justify-between p-3 rounded-xl border ${active} transition-all shadow-sm item-tarjeta"><div class="flex items-center gap-3 overflow-hidden">${p.imagen?`<img src="${p.imagen}" loading="lazy" class="w-8 h-8 rounded-md object-cover">`:''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${nombre}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0 z-10"><button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition">-</button><span id="cant-${safeId}" class="w-8 text-center font-bold text-indigo-600 text-sm">${enCarro}</span><button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-600 transition" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
        }
    });

    grid.innerHTML = gridHTML; if(cartContainer) cartContainer.innerHTML = cartHTML || `<p class="text-center text-slate-300 text-xs py-8">Vacío.</p>`; if(dataList) dataList.innerHTML = listHTML;
    if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = tr; if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = ts;
    window.actualizarDashboard(); window.renderListaInsumos();
};

window.renderListaInsumos = () => {
    const contenedor = document.getElementById("contenedor-lista-insumos"); if(!contenedor) return;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    contenedor.innerHTML = invFiltrado.map(p => {
        const nombre = p.id.toUpperCase(); const jsId = p.id.replace(/'/g, "\\'");
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-10 h-10 object-cover rounded-lg border">` : `<div class="w-10 h-10 bg-white rounded-lg border flex items-center justify-center text-slate-300"><i class="fas fa-box text-lg"></i></div>`;
        return `<div onclick="window.seleccionarInsumoParaEntrada('${jsId}')" class="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm cursor-pointer hover:border-indigo-100 hover:bg-indigo-50/50 transition item-tarjeta"><div class="flex items-center gap-3 overflow-hidden">${img}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${nombre}</p><p class="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Stock: ${p.cantidad}</p></div></div><i class="fas fa-chevron-right text-indigo-300 text-xs"></i></div>`;
    }).join('');
};
window.seleccionarInsumoParaEntrada = (nombreInsumo) => { document.getElementById("nombre-prod").value = nombreInsumo; document.getElementById("cantidad-prod").focus(); };

window.procesarDatosPedidos = () => {
    window.cachePedidos = window.pedidosRaw.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let grupos = {}; let pendingCount = 0; let htmlAdmin = "", htmlActive = "", htmlHistory = "";
    window.cachePedidos.forEach(p => { const bKey = p.batchId || p.timestamp; if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp, notas: p.notas || '' }; grupos[bKey].items.push(p); if(p.estado === 'pendiente') pendingCount++; });
    const misPedidos = window.cachePedidos.filter(p => p.usuarioId === window.usuarioActual.id).sort((a,b) => b.timestamp - a.timestamp);
    misPedidos.forEach(p => {
        let btns = "";
        if(p.estado === 'aprobado') btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end gap-2"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow">Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold">Reportar</button></div>`;
        else if(['recibido', 'devuelto'].includes(p.estado)) btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-500 text-xs font-bold hover:underline"><i class="fas fa-undo"></i> Devolver / Reportar</button></div>`;
        const prio = p.prioridad || 'normal'; const notesHtml = p.notas ? `<p class="text-[10px] text-slate-500 mt-2 bg-slate-50 p-1.5 rounded border border-slate-100 italic">"${p.notas}"</p>` : '';
        const cardHtml = `<div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm item-tarjeta"><div class="flex justify-between items-start"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-700 uppercase text-sm mt-2">${p.insumoNom} <span class="badge status-pri-${prio} ml-1">${prio}</span></h4><p class="text-xs text-slate-400 font-mono mt-1">x${p.cantidad} • ${p.ubicacion}</p><p class="text-[10px] text-slate-300 mt-1">${p.fecha.split(',')[0]}</p>${notesHtml}</div></div>${btns}</div>`;
        if(['pendiente', 'aprobado'].includes(p.estado)) htmlActive += cardHtml; else htmlHistory += cardHtml;
    });

    if(['admin','manager','supervisor'].includes(window.usuarioActual.rol)) {
        Object.values(grupos).sort((a,b) => b.ts - a.ts).forEach(g => {
            const pendingItems = g.items.filter(i => i.estado === 'pendiente');
            if(pendingItems.length > 0) {
                let itemsStr = ""; const hasAlta = pendingItems.some(i => (i.prioridad || 'normal') === 'alta');
                const badgeUrgente = hasAlta ? `<span class="bg-red-500 text-white px-2 py-1 rounded text-[9px] uppercase font-black animate-pulse ml-2 shadow-sm">Urgente</span>` : '';
                const blockNota = g.notas ? `<div class="mb-3 text-[11px] text-indigo-700 bg-indigo-50/50 p-2 rounded-lg italic">"${g.notas}"</div>` : '';
                pendingItems.forEach(i => { itemsStr += `<span class="bg-slate-50 px-2 py-1 rounded text-[10px] border border-slate-200 uppercase font-bold text-slate-600">${i.insumoNom} (x${i.cantidad})</span>`; });
                htmlAdmin += `<div class="bg-white p-5 rounded-2xl border-l-4 ${hasAlta?'border-l-red-500':'border-l-amber-400'} shadow-sm cursor-pointer group" onclick="window.abrirModalGrupo('${g.items[0].batchId || g.ts}')"><div class="flex justify-between items-center mb-3"><div><h4 class="font-black text-slate-800 text-sm uppercase flex items-center"><i class="fas fa-user text-slate-300 mr-1"></i> ${g.user} ${badgeUrgente}</h4><span class="text-xs text-slate-400 font-medium">${g.sede} • ${g.date.split(',')[0]}</span></div><span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition"><i class="fas fa-chevron-right text-xs"></i></span></div>${blockNota}<div class="flex flex-wrap gap-1.5">${itemsStr}</div></div>`;
            }
        });
    }
    if(document.getElementById("lista-pendientes-admin")) document.getElementById("lista-pendientes-admin").innerHTML = htmlAdmin;
    if(document.getElementById("tab-content-activos")) document.getElementById("tab-content-activos").innerHTML = htmlActive;
    if(document.getElementById("tab-content-historial")) document.getElementById("tab-content-historial").innerHTML = htmlHistory;
    if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pendingCount;
};

// --- OTROS MÓDULOS (Modales, Edición, Entradas Rápidas) ---
window.abrirModalInsumo = () => { document.getElementById("modal-insumo").classList.remove("hidden"); };
window.agregarProductoRapido = async () => { 
    const n = document.getElementById("nombre-prod").value.trim(); const c = parseInt(document.getElementById("cantidad-prod").value); const imgUrl = document.getElementById("new-prod-img-url").value;
    if(n && c>0){ 
        const r = doc(db, "inventario", n); const s = await getDoc(r); 
        
        let dataToSave = { cantidad: c, grupo: window.grupoActivo };
        if (imgUrl) dataToSave.imagen = imgUrl;

        if(s.exists()) { 
            let updateData = { cantidad: s.data().cantidad + c };
            if (imgUrl) updateData.imagen = imgUrl; // Actualiza imagen si se proporcionó una nueva
            await updateDoc(r, updateData); 
        } 
        else { await setDoc(r, dataToSave); } 
        
        await addDoc(collection(db, "entradas_stock"), { insumo: n, cantidad: c, grupo: window.grupoActivo, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() }); 
        document.getElementById("modal-insumo").classList.add("hidden"); 
        
        // Reset Formulario
        document.getElementById("nombre-prod").value = ""; document.getElementById("cantidad-prod").value = ""; document.getElementById("new-prod-img-url").value = "";
        document.getElementById("new-prod-preview-img").src = ""; document.getElementById("new-prod-preview-img").classList.add("hidden");
    } 
};

// EDITAR INSUMO - AHORA CON QR
window.prepararEdicionProducto = async(id) => { 
    const s = await getDoc(doc(db,"inventario",id)); const d = s.data(); 
    document.getElementById('edit-prod-id').value = id; document.getElementById('edit-prod-precio').value = d.precio||''; document.getElementById('edit-prod-min').value = d.stockMinimo||''; 
    if (d.imagen) { document.getElementById('edit-prod-img').value = d.imagen; document.getElementById('preview-img').src = d.imagen; document.getElementById('preview-img').classList.remove('hidden'); } 
    else { document.getElementById('edit-prod-img').value = ''; document.getElementById('preview-img').classList.add('hidden'); }
    
    // Generar QR para el insumo basado en su ID (nombre)
    document.getElementById('qr-insumo-id-text').innerText = "ID: " + id.toUpperCase();
    document.getElementById('qr-insumo-img').src = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=1&data=" + encodeURIComponent(id);

    document.getElementById('modal-detalles').classList.remove('hidden'); 
};
window.guardarDetallesProducto = async () => { 
    const imgUrl = document.getElementById('edit-prod-img').value;
    await updateDoc(doc(db,"inventario",document.getElementById('edit-prod-id').value),{precio:parseFloat(document.getElementById('edit-prod-precio').value)||0, stockMinimo:parseInt(document.getElementById('edit-prod-min').value)||0, imagen: imgUrl}); 
    document.getElementById('modal-detalles').classList.add('hidden'); 
};

// Funciones Standar de Pedidos, Facturas, Reportes, etc.
window.gestionarPedido = async (pid, accion, ins) => { const pRef = doc(db, "pedidos", pid); const pData = (await getDoc(pRef)).data(); if(accion === 'aprobar') { const val = parseInt(document.getElementById(`qty-${pid}`).value); const iRef = doc(db, "inventario", ins); const iSnap = await getDoc(iRef); if(iSnap.exists() && iSnap.data().cantidad >= val) { await updateDoc(iRef, { cantidad: iSnap.data().cantidad - val }); await updateDoc(pRef, { estado: "aprobado", cantidad: val, entregado_por: window.usuarioActual.id }); const pend = window.cachePedidos.filter(p => p.batchId === pData.batchId && p.estado === 'pendiente' && p.id !== pid); if(pend.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden"); else window.abrirModalGrupo(pData.batchId); } else alert("Error: Stock insuficiente."); } else { await updateDoc(pRef, { estado: "rechazado" }); window.abrirModalGrupo(pData.batchId); } };
window.confirmarRecibido = async (pid) => { if(confirm("¿Recibido?")) await updateDoc(doc(db, "pedidos", pid), { estado: "recibido" }); };
window.abrirIncidencia = (pid) => { document.getElementById('incidencia-pid').value = pid; document.getElementById('modal-incidencia').classList.remove('hidden'); };
window.confirmarIncidencia = async (dev) => { const pid = document.getElementById('incidencia-pid').value; const pRef = doc(db, "pedidos", pid); const pData = (await getDoc(pRef)).data(); if(dev){ const iRef = doc(db, "inventario", pData.insumoNom); const iSnap = await getDoc(iRef); if(iSnap.exists()) await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad }); } await updateDoc(pRef, { estado: dev ? "devuelto" : "con_incidencia", detalleIncidencia: document.getElementById('incidencia-detalle').value }); document.getElementById('modal-incidencia').classList.add('hidden'); };
window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };

window.guardarSede = async () => { const s = document.getElementById("new-sede").value.trim().toUpperCase(); if(!s) return alert("Ingrese sede."); try { await addDoc(collection(db, "sedes"), { nombre: s, timestamp: Date.now() }); document.getElementById("new-sede").value = ""; alert("Sede guardada."); } catch(e) { alert("Error."); } };
window.guardarGrupo = async () => { const g = document.getElementById("new-grupo").value.trim().toUpperCase(); if(!g) return alert("Ingrese grupo."); try { await addDoc(collection(db, "grupos"), { nombre: g, timestamp: Date.now() }); document.getElementById("new-grupo").value = ""; alert("Grupo creado."); } catch(e) { alert("Error."); } };
window.guardarUsuario = async () => { const id = document.getElementById("new-user").value.trim().toLowerCase(); const p = document.getElementById("new-pass").value.trim(); const e = document.getElementById("new-email").value.trim(); const r = document.getElementById("new-role").value; const checkboxes = document.querySelectorAll('.chk-grupo:checked'); let gruposSeleccionados = Array.from(checkboxes).map(chk => chk.value); if(gruposSeleccionados.length === 0) gruposSeleccionados = ["SERVICIOS GENERALES"]; if(!id || !p) return alert("Faltan datos."); await setDoc(doc(db,"usuarios",id), { pass: p, rol: r, email: e, grupos: gruposSeleccionados }, { merge: true }); alert("Usuario guardado."); window.cancelarEdicionUsuario(); };
window.prepararEdicionUsuario = async (userId) => { const snap = await getDoc(doc(db, "usuarios", userId)); if(!snap.exists()) return; const u = snap.data(); document.getElementById("edit-mode-id").value = userId; const inpU = document.getElementById("new-user"); inpU.value = userId; inpU.disabled = true; document.getElementById("new-pass").value = u.pass; document.getElementById("new-email").value = u.email || ""; document.getElementById("new-role").value = u.rol; const gruposUsuario = u.grupos || ["SERVICIOS GENERALES"]; document.querySelectorAll('.chk-grupo').forEach(chk => { chk.checked = gruposUsuario.includes(chk.value); }); document.getElementById("btn-guardar-usuario").innerText = "Actualizar"; document.getElementById("cancel-edit-msg").classList.remove("hidden"); };
window.cancelarEdicionUsuario = () => { document.getElementById("edit-mode-id").value = ""; const inpU = document.getElementById("new-user"); inpU.value = ""; inpU.disabled = false; document.getElementById("new-pass").value = ""; document.getElementById("new-email").value = ""; document.getElementById("new-role").value = "user"; document.querySelectorAll('.chk-grupo').forEach(chk => chk.checked = false); document.getElementById("btn-guardar-usuario").innerText = "Guardar"; document.getElementById("cancel-edit-msg").classList.add("hidden"); };
window.abrirModalEditarEntrada = (idEntrada, insumo, cantidadActual) => { document.getElementById('edit-entrada-id').value = idEntrada; document.getElementById('edit-entrada-insumo').value = insumo; document.getElementById('edit-entrada-insumo-display').value = insumo; document.getElementById('edit-entrada-cant-original').value = cantidadActual; document.getElementById('edit-entrada-cantidad').value = cantidadActual; document.getElementById('edit-entrada-motivo').value = ""; document.getElementById('modal-editar-entrada').classList.remove('hidden'); };
window.guardarEdicionEntrada = async () => { const idEntrada = document.getElementById('edit-entrada-id').value; const insumo = document.getElementById('edit-entrada-insumo').value; const cantOriginal = parseInt(document.getElementById('edit-entrada-cant-original').value); const cantNueva = parseInt(document.getElementById('edit-entrada-cantidad').value); const motivo = document.getElementById('edit-entrada-motivo').value.trim(); if (isNaN(cantNueva) || cantNueva < 0) return alert("Cantidad inválida."); if (!motivo) return alert("Ingrese motivo."); const diferencia = cantNueva - cantOriginal; if (diferencia === 0) { document.getElementById('modal-editar-entrada').classList.add('hidden'); return; } try { const invRef = doc(db, "inventario", insumo); const invSnap = await getDoc(invRef); if (!invSnap.exists()) return; await updateDoc(invRef, { cantidad: invSnap.data().cantidad + diferencia }); await updateDoc(doc(db, "entradas_stock", idEntrada), { cantidad: cantNueva, motivo_edicion: motivo }); alert("✅ Entrada corregida."); document.getElementById('modal-editar-entrada').classList.add('hidden'); } catch(e) { alert("Error."); } };
window.abrirModalFactura = () => { document.getElementById("fact-proveedor").value = ""; document.getElementById("fact-gasto").value = ""; document.getElementById("fact-fecha").value = ""; document.getElementById("fact-archivo-url").value = ""; document.getElementById("factura-file-name").innerText = "Ninguno"; document.getElementById("modal-factura").classList.remove("hidden"); };
window.cerrarModalFactura = () => { document.getElementById("modal-factura").classList.add("hidden"); };
window.guardarFactura = async () => { const pv = document.getElementById("fact-proveedor").value.trim(); const ga = parseFloat(document.getElementById("fact-gasto").value); const fe = document.getElementById("fact-fecha").value; const ar = document.getElementById("fact-archivo-url").value; if(!pv || isNaN(ga) || !fe) return alert("Campos requeridos."); try { await addDoc(collection(db, "facturas"), { proveedor: pv, gasto: ga, fecha_compra: fe, archivo_url: ar, grupo: window.grupoActivo, usuarioRegistro: window.usuarioActual.id, timestamp: Date.now(), fecha_registro: new Date().toLocaleString() }); alert("Factura registrada."); window.cerrarModalFactura(); } catch(e) { alert("Error."); } };
window.abrirModalEliminarFactura = (id) => { document.getElementById("elim-factura-id").value = id; document.getElementById("elim-factura-motivo").value = ""; document.getElementById("modal-eliminar-factura").classList.remove("hidden"); };
window.confirmarEliminarFactura = async () => { const id = document.getElementById("elim-factura-id").value; const motivo = document.getElementById("elim-factura-motivo").value.trim(); if(!motivo) return alert("Justifique eliminación."); try { const refFactura = doc(db, "facturas", id); const snap = await getDoc(refFactura); if (snap.exists()) { await addDoc(collection(db, "facturas_eliminadas"), { ...snap.data(), motivo_eliminacion: motivo }); await deleteDoc(refFactura); alert("🗑️ Factura eliminada."); document.getElementById("modal-eliminar-factura").classList.add("hidden"); } } catch(e) { alert("Error."); } };
window.procesarSolicitudMultiple = async () => { const ubi = document.getElementById("sol-ubicacion").value; const prio = document.getElementById("sol-prioridad").value; const notas = document.getElementById("sol-notas").value.trim(); const items = Object.entries(window.carritoGlobal).filter(([_, c]) => c > 0); if(!ubi || items.length === 0) return alert("Seleccione sede y producto."); const batchId = Date.now().toString(); const ts = Date.now(); const fs = new Date().toLocaleString(); try { const batch = writeBatch(db); items.forEach(([ins, cant]) => { batch.set(doc(collection(db, "pedidos")), { usuarioId: window.usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi, prioridad: prio, notas: notas, grupo: window.grupoActivo, estado: "pendiente", fecha: fs, timestamp: ts, batchId: batchId }); }); await batch.commit(); window.carritoGlobal = {}; document.getElementById("sol-ubicacion").value=""; document.getElementById("sol-notas").value=""; window.procesarDatosInventario(); window.verPagina('notificaciones'); } catch (error) { alert("Error."); } };
window.iniciarScanner = (inputIdTarget) => { document.getElementById("modal-scanner").classList.remove("hidden"); window.html5QrcodeScanner = new Html5Qrcode("reader"); window.html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, (txt) => { window.detenerScanner(); const i = document.getElementById(inputIdTarget); if(i) { i.value = txt; window.debounceFiltrarTarjetas(inputIdTarget === 'buscador-activos' ? 'lista-activos-db' : 'lista-inventario', txt); } }, () => {}).catch(err => { alert("Error de cámara."); window.detenerScanner(); }); };
window.detenerScanner = () => { if(window.html5QrcodeScanner) window.html5QrcodeScanner.stop().catch(()=>{}); document.getElementById("modal-scanner").classList.add("hidden"); };
window.abrirModalGrupo = (bKey) => { const items = window.cachePedidos.filter(p => p.batchId === bKey || p.timestamp.toString() === bKey); if(items.length===0) return; document.getElementById("modal-grupo-titulo").innerHTML = `${items[0].usuarioId.toUpperCase()} | ${items[0].ubicacion}`; if(items[0].notas) { document.getElementById("modal-grupo-notas").innerHTML = `"${items[0].notas}"`; document.getElementById("modal-grupo-notas-container").classList.remove('hidden'); } else document.getElementById("modal-grupo-notas-container").classList.add('hidden'); let h = ""; items.forEach(p => { let act = `<span class="badge status-${p.estado}">${p.estado}</span>`; if(p.estado === 'pendiente' && window.usuarioActual.rol !== 'supervisor') act = `<div class="flex gap-2"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border rounded text-center font-bold text-xs"><button onclick="window.gestionarPedido('${p.id}','aprobar','${p.insumoNom.replace(/'/g,"\\'")}')" class="text-white bg-emerald-500 px-2 rounded"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${p.id}','rechazar')" class="text-red-400 bg-red-50 px-2 rounded"><i class="fas fa-times"></i></button></div>`; h += `<div class="flex justify-between items-center p-3 border-b"><div class="text-xs"><b>${p.insumoNom}</b> <span class="badge status-pri-${p.prioridad}">${p.prioridad}</span><br>Cant: ${p.cantidad}</div>${act}</div>`; }); document.getElementById("modal-grupo-contenido").innerHTML = h; document.getElementById("modal-grupo-admin").classList.remove("hidden"); };
window.descargarReporte = async () => { if(typeof XLSX === 'undefined') return alert("Cargando Excel..."); const inputDesde = document.getElementById("rep-desde")?.value; const inputHasta = document.getElementById("rep-hasta")?.value; let tDesde = 0; let tHasta = Infinity; if(inputDesde) tDesde = new Date(inputDesde + 'T00:00:00').getTime(); if(inputHasta) tHasta = new Date(inputHasta + 'T23:59:59').getTime(); if(!confirm(`¿Descargar reporte Excel del grupo ${window.grupoActivo}?`)) return; const uSnap = await getDocs(collection(db, "usuarios")); const usersMap = {}; uSnap.forEach(u => { usersMap[u.id] = u.data(); }); const obtenerMesAno = (timestamp) => { if(!timestamp) return 'N/A'; const d = new Date(timestamp); return `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]} ${d.getFullYear()}`; }; const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo); const stockData = invActivo.map(p => ({ "Insumo": p.id.toUpperCase(), "Cantidad Disponible": p.cantidad || 0, "Stock Mínimo": p.stockMinimo || 0, "Precio Unit. ($)": p.precio || 0 })); const entActivas = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo && e.timestamp >= tDesde && e.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp); const entradasData = entActivas.map(mov => ({ "Mes y Año": obtenerMesAno(mov.timestamp), "Fecha de Entrada": mov.fecha || 'N/A', "Insumo": (mov.insumo || '').toUpperCase(), "Cantidad Ingresada": mov.cantidad || 0, "Usuario Responsable": (mov.usuario || '').toUpperCase() })); const salActivas = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp); const salidasData = salActivas.map(mov => { const uId = mov.usuarioId || ''; const userObj = usersMap[uId] || {}; return { "Mes y Año": obtenerMesAno(mov.timestamp), "ID Pedido": mov.batchId || 'N/A', "Fecha Solicitud": mov.fecha_solicitud || mov.fecha || 'N/A', "Prioridad": (mov.prioridad || 'NORMAL').toUpperCase(), "Insumo": (mov.insumoNom || '').toUpperCase(), "Cant.": mov.cantidad || 0, "Sede Destino": (mov.ubicacion || '').toUpperCase(), "Usuario Solicitante": uId.toUpperCase(), "Departamento": (userObj.departamento || 'N/A').toUpperCase(), "Estado Actual": (mov.estado || '').toUpperCase() }; }); const equiposActivos = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo); const activosData = equiposActivos.map(a => ({ "ID Único": a.id, "Nombre": a.nombre, "Clasificación": a.categoria, "Marca/Modelo": a.marca, "Estado": a.estado, "Ubicación": a.ubicacion, "Precio ($)": a.precio })); const wb = XLSX.utils.book_new(); if(stockData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), "Inventario"); if(activosData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activosData), "Activos Fijos"); if(entradasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entradasData), "Entradas"); if(salidasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salidasData), "Salidas"); XLSX.writeFile(wb, `Reporte_FCILog_${window.grupoActivo}_${new Date().toISOString().slice(0, 10)}.xlsx`); };


// --- 9. CLOUDINARY E INICIALIZACIÓN ---
const inicializarApp = () => {
    const sesion = localStorage.getItem("fcilog_session"); if(sesion) window.cargarSesion(JSON.parse(sesion));
    if (typeof cloudinary !== "undefined") {
        
        // FOTOS INSUMOS NUEVOS (Entrada Rápida) - SE ASIGNÓ A SU PROPIO BOTÓN
        window.cloudinaryNewProdWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('new-prod-img-url').value = result.info.secure_url; const p = document.getElementById('new-prod-preview-img'); p.src = result.info.secure_url; p.classList.remove('hidden'); } });
        document.getElementById("btn-upload-new-prod")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryNewProdWidget.open(); }, false);

        // FOTOS INSUMOS EDITAR (Detalles) - SE ASIGNÓ A SU PROPIO BOTÓN EXCLUSIVO
        window.cloudinaryEditProdWidget = cloudinary.createUploadWidget({ cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos' }, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('edit-prod-img').value = result.info.secure_url; const preview = document.getElementById('preview-img'); preview.src = result.info.secure_url; preview.classList.remove('hidden'); } });
        document.getElementById("btn-upload-edit-prod")?.addEventListener("click", (e) => { e.preventDefault(); window.cloudinaryEditProdWidget.open(); }, false);
        
        // FOTOS ACTIVOS Y BITÁCORAS
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

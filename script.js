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

const EMAIL_CFG = { s: 'service_a7yozqh', t: 'template_zglatmb', k: '2jVnfkJKKG0bpKN-U', admin: 'Emanuel.cedeno@fcipty.com' };

// Paleta dinámica para las gráficas
const chartPalette = [
    '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', 
    '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#14b8a6', 
    '#3b82f6', '#f97316', '#a855f7', '#ef4444'
];

// Datos en crudo
let rawInventario = [];
let rawEntradas = [];
let rawFacturas = [];

// --- 2. FUNCIONES DE INTERFAZ Y NAVEGACIÓN ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => {
        v.classList.add("hidden");
        v.classList.remove("animate-fade-in");
    });
    const target = document.getElementById(`pag-${id}`);
    if(target) {
        target.classList.remove("hidden");
        setTimeout(() => target.classList.add("animate-fade-in"), 10);
    }
    if(window.innerWidth < 768) window.toggleMenu(false);
};

window.toggleMenu = (forceState) => {
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

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    const t = document.getElementById(`tab-content-${tab}`);
    if(t) t.classList.remove('hidden');
    
    const btnA = document.getElementById('tab-btn-activos');
    const btnH = document.getElementById('tab-btn-historial');
    const onClass = "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-600 shadow-sm transition-all"; 
    const offClass = "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-500 hover:text-slate-700 transition-all";

    if(tab === 'activos') { 
        if(btnA) btnA.className = onClass; 
        if(btnH) btnH.className = offClass; 
    } else { 
        if(btnH) btnH.className = onClass; 
        if(btnA) btnA.className = offClass; 
    }
};

window.filtrarTabla = (idTabla, texto) => {
    const term = texto.toLowerCase();
    const filas = document.querySelectorAll(`#${idTabla} tr`);
    filas.forEach(f => { f.style.display = f.innerText.toLowerCase().includes(term) ? '' : 'none'; });
};

window.filtrarTarjetas = (idContenedor, texto) => {
    const term = texto.toLowerCase();
    const container = document.getElementById(idContenedor);
    if(container) {
        const cards = container.querySelectorAll('.item-tarjeta');
        cards.forEach(c => { c.style.display = c.innerText.toLowerCase().includes(term) ? '' : 'none'; });
    }
};

// --- 3. SESIÓN Y GRUPOS ---
window.cargarSesion = (datos) => {
    window.usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    
    const pLogin = document.getElementById("pantalla-login");
    const iApp = document.getElementById("interfaz-app");
    if(pLogin) pLogin.classList.add("hidden");
    if(iApp) iApp.classList.remove("hidden");
    
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) {
        infoDiv.innerHTML = `
            <div class="flex flex-col items-center">
                <div class="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2"><i class="fas fa-user"></i></div>
                <span class="font-bold text-slate-700 uppercase tracking-wide">${datos.id}</span>
                <span class="text-[10px] uppercase font-bold text-white bg-indigo-500 px-2 py-0.5 rounded-full mt-1 shadow-sm">${datos.rol}</span>
            </div>`;
    }

    const btnAdmin = document.getElementById("btn-admin-stock");
    if(btnAdmin && ['admin','manager'].includes(datos.rol)) btnAdmin.classList.remove("hidden");

    const rutas = { 
        st:{id:'stats',n:'Dashboard',i:'chart-pie'}, 
        sk:{id:'stock',n:'Stock',i:'boxes'}, 
        pd:{id:'solicitar',n:'Realizar Pedido',i:'cart-plus'}, 
        pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, 
        hs:{id:'historial',n:'Movimientos',i:'history'}, 
        fc:{id:'facturas',n:'Facturas',i:'file-invoice-dollar'},
        cf:{id:'config',n:'Ajustes (Config)',i:'cogs'}, 
        us:{id:'usuarios',n:'Accesos',i:'users-cog'}, 
        mp:{id:'notificaciones',n:'Mis Solicitudes',i:'shipping-fast'} 
    };
    
    let menuActivo = [];
    if(datos.rol === 'admin') menuActivo = [rutas.st, rutas.sk, rutas.pd, rutas.pe, rutas.hs, rutas.fc, rutas.cf, rutas.us, rutas.mp]; 
    else if(datos.rol === 'manager') menuActivo = [rutas.st, rutas.sk, rutas.pd, rutas.pe, rutas.hs, rutas.fc, rutas.mp]; 
    else if(datos.rol === 'supervisor') menuActivo = [rutas.st, rutas.sk, rutas.pd, rutas.pe, rutas.hs, rutas.mp]; 
    else menuActivo = [rutas.sk, rutas.pd, rutas.mp];
    
    const menuEl = document.getElementById("menu-dinamico");
    if(menuEl) {
        menuEl.innerHTML = menuActivo.map(x => `<button onclick="window.verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');
    }

    let misGrupos = datos.grupos || ["SERVICIOS GENERALES"]; 
    if(datos.rol === 'admin') misGrupos = window.todosLosGrupos; 

    window.grupoActivo = misGrupos[0];
    window.renderizarSelectorGrupos(misGrupos);

    window.verPagina(['admin','manager','supervisor'].includes(datos.rol) ? 'stats' : 'stock');
    window.activarSincronizacion();
};

window.renderizarSelectorGrupos = (misGrupos) => {
    const sel = document.getElementById("selector-grupo-activo");
    if(!sel) return;
    sel.innerHTML = misGrupos.map(g => `<option value="${g}">${g}</option>`).join('');
    sel.value = window.grupoActivo;
    
    const lblDash = document.getElementById("dash-grupo-label");
    if(lblDash) lblDash.innerText = window.grupoActivo;
    
    const lblSol = document.getElementById("lbl-grupo-solicitud");
    if(lblSol) lblSol.innerText = window.grupoActivo;
};

window.cambiarGrupoActivo = (nuevoGrupo) => {
    window.grupoActivo = nuevoGrupo;
    const lblDash = document.getElementById("dash-grupo-label");
    if(lblDash) lblDash.innerText = window.grupoActivo;
    
    const lblSol = document.getElementById("lbl-grupo-solicitud");
    if(lblSol) lblSol.innerText = window.grupoActivo;

    window.carritoGlobal = {}; 
    window.procesarDatosInventario(); 
    window.procesarDatosPedidos(); 
    window.renderHistorialUnificado(); 
    window.procesarDatosFacturas(); 
    window.actualizarDashboard(); 
};

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if(!user || !pass) return alert("Ingrese usuario y contraseña.");
    if (user === "admin" && pass === "1130") { 
        window.cargarSesion({ id: "admin", rol: "admin", grupos: ["SERVICIOS GENERALES"] }); 
        return; 
    }
    
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            window.cargarSesion({ id: user, ...snap.data() });
        } else alert("Credenciales incorrectas.");
    } catch (e) { alert("Error de conexión a la base de datos."); }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

// --- 4. CORE REALTIME (Sincronización) ---
window.activarSincronizacion = () => {
    const uRol = window.usuarioActual.rol;

    onSnapshot(collection(db, "grupos"), snap => {
        window.todosLosGrupos = ["SERVICIOS GENERALES"];
        let listHTML = `<div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center shadow-sm"><span class="font-black uppercase text-indigo-700"><i class="fas fa-lock text-xs mr-1"></i> SERVICIOS GENERALES</span><span class="text-[10px] bg-indigo-200 text-indigo-700 px-2 rounded-full">Base</span></div>`;
        
        snap.forEach(d => {
            const nombre = d.data().nombre.toUpperCase();
            if(nombre !== "SERVICIOS GENERALES") {
                window.todosLosGrupos.push(nombre);
                listHTML += `
                <div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                    <span class="font-bold uppercase text-slate-700">📂 ${nombre}</span>
                    <button onclick="window.eliminarDato('grupos','${d.id}')" class="w-8 h-8 rounded bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition"><i class="fas fa-trash-alt text-xs"></i></button>
                </div>`;
            }
        });
        if(uRol === 'admin') window.renderizarSelectorGrupos(window.todosLosGrupos);
        const lG = document.getElementById("lista-grupos-db");
        if(lG) lG.innerHTML = listHTML;
        window.actualizarCheckboxesGrupos();
    });

    onSnapshot(collection(db, "sedes"), snap => {
        let options = '<option value="" disabled selected>Seleccionar Sede...</option>';
        let listHTML = '';
        const sedesArray = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.nombre.localeCompare(b.nombre));
        
        sedesArray.forEach(sede => {
            options += `<option value="${sede.nombre}">📍 ${sede.nombre}</option>`;
            listHTML += `
            <div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <span class="font-bold uppercase text-slate-700">📍 ${sede.nombre}</span>
                <button onclick="window.eliminarDato('sedes','${sede.id}')" class="w-8 h-8 rounded bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition"><i class="fas fa-trash-alt text-xs"></i></button>
            </div>`;
        });
        
        const selSedes = document.getElementById("sol-ubicacion");
        if(selSedes) selSedes.innerHTML = options;
        const divSedes = document.getElementById("lista-sedes-db");
        if(divSedes) divSedes.innerHTML = listHTML;
    });

    onSnapshot(collection(db, "inventario"), snap => {
        rawInventario = [];
        snap.forEach(ds => { rawInventario.push({ id: ds.id, ...ds.data() }); });
        window.procesarDatosInventario();
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        window.pedidosRaw = [];
        snap.forEach(ds => { window.pedidosRaw.push({ id: ds.id, ...ds.data() }); });
        window.procesarDatosPedidos();
    });

    onSnapshot(collection(db, "entradas_stock"), snap => {
        rawEntradas = [];
        snap.forEach(x => { rawEntradas.push({id: x.id, ...x.data()}); });
        window.renderHistorialUnificado();
    });

    if(['admin','manager'].includes(uRol)) {
        onSnapshot(collection(db, "facturas"), snap => {
            rawFacturas = [];
            snap.forEach(d => rawFacturas.push({id: d.id, ...d.data()}));
            window.procesarDatosFacturas();
        });
    }

    if(uRol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const divUsuarios = document.getElementById("lista-usuarios-db");
            if(!divUsuarios) return;
            divUsuarios.innerHTML = "";
            
            snap.forEach(d => {
                const u = d.data(); const jsId = d.id.replace(/'/g, "\\'");
                const gStr = (u.grupos || ["SERVICIOS GENERALES"]).join(", ");
                divUsuarios.innerHTML += `
                <div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                    <div class="truncate pr-2 w-full">
                        <div class="flex items-center gap-2">
                            <span class="font-bold uppercase text-slate-700">${d.id}</span>
                            <span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold">${u.rol}</span>
                        </div>
                        <span class="text-[9px] text-indigo-400 block font-bold uppercase mt-1 truncate"><i class="fas fa-layer-group"></i> ${gStr}</span>
                        <span class="text-[10px] text-slate-400 block mt-1"><i class="fas fa-envelope text-[9px]"></i> ${u.email || 'Sin correo'}</span>
                    </div>
                    <div class="flex gap-2 flex-shrink-0">
                        <button onclick="window.prepararEdicionUsuario('${jsId}')" class="w-8 h-8 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white transition"><i class="fas fa-pen text-xs"></i></button>
                        <button onclick="window.eliminarDato('usuarios','${jsId}')" class="w-8 h-8 rounded bg-slate-50 text-red-400 hover:bg-red-500 hover:text-white transition"><i class="fas fa-trash-alt text-xs"></i></button>
                    </div>
                </div>`;
            });
        });
    }
};

// --- 5. RENDERIZADO FILTRADO POR GRUPO ---

window.procesarDatosInventario = () => {
    const grid = document.getElementById("lista-inventario");
    const cartContainer = document.getElementById("contenedor-lista-pedidos");
    const dataList = document.getElementById("lista-sugerencias");
    
    if(grid) grid.innerHTML = ""; if(cartContainer) cartContainer.innerHTML = ""; if(dataList) dataList.innerHTML = "";
    let tr = 0, ts = 0;
    const invFiltrado = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);

    invFiltrado.forEach(p => {
        const nombre = p.id.toUpperCase();
        const safeId = p.id.replace(/[^a-zA-Z0-9]/g, '_');
        const jsId = p.id.replace(/'/g, "\\'"); 

        tr++; ts += p.cantidad; 
        if(dataList) dataList.innerHTML += `<option value="${nombre}">`;

        const isAdmin = ['admin','manager'].includes(window.usuarioActual.rol);
        let controls = "";
        if (isAdmin) {
            controls = `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>`;
        }

        const img = p.imagen ? `<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
        const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo);
        const border = isLow ? "border-2 border-red-500 bg-red-50" : "border border-slate-100 bg-white";
        
        if(grid) grid.innerHTML += `<div class="${border} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col item-tarjeta"><div class="flex justify-between items-start">${img}${controls}</div><h4 class="font-bold text-slate-700 text-xs truncate" title="${nombre}">${nombre} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse"></i>':''}</h4><div class="flex justify-between items-end mt-1"><p class="text-2xl font-black text-slate-800">${p.cantidad}</p>${p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : ''}</div></div>`;

        if(cartContainer && p.cantidad > 0) {
            const enCarro = window.carritoGlobal[p.id] || 0;
            const active = enCarro > 0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white";
            cartContainer.innerHTML += `<div id="row-${safeId}" class="flex items-center justify-between p-3 rounded-xl border ${active} transition-all shadow-sm item-tarjeta"><div class="flex items-center gap-3 overflow-hidden">${p.imagen?`<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">`:''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${nombre}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0 z-10 relative"><button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition">-</button><span id="cant-${safeId}" class="w-8 text-center font-bold text-indigo-600 text-sm">${enCarro}</span><button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-600 transition" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
        }
    });

    const elTotal = document.getElementById("metrica-total"); if(elTotal) elTotal.innerText = tr;
    const elStock = document.getElementById("metrica-stock"); if(elStock) elStock.innerText = ts;
    
    // Forzamos actualización para asegurar que el Dashboard dibuje correctamente
    window.actualizarDashboard();
};

window.procesarDatosPedidos = () => {
    window.cachePedidos = window.pedidosRaw.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);

    let grupos = {}; let pendingCount = 0;
    const lAdmin = document.getElementById("lista-pendientes-admin");
    const lActive = document.getElementById("tab-content-activos");
    const lHistory = document.getElementById("tab-content-historial");

    if(lAdmin) lAdmin.innerHTML = ""; if(lActive) lActive.innerHTML = ""; if(lHistory) lHistory.innerHTML = "";

    window.cachePedidos.forEach(p => {
        const bKey = p.batchId || p.timestamp;
        if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp };
        grupos[bKey].items.push(p);
        if(p.estado === 'pendiente') pendingCount++;
    });

    const misPedidos = window.cachePedidos.filter(p => p.usuarioId === window.usuarioActual.id).sort((a,b) => b.timestamp - a.timestamp);
    misPedidos.forEach(p => {
        let btns = "";
        if(p.estado === 'aprobado') {
            btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end gap-2"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-emerald-600">Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50">Reportar</button></div>`;
        } else if(['recibido', 'devuelto'].includes(p.estado)) {
            btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-500 text-xs font-bold hover:underline flex items-center gap-1"><i class="fas fa-undo"></i> Devolver / Reportar</button></div>`;
        }
        
        const prio = p.prioridad || 'normal';
        const cardHtml = `<div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm item-tarjeta"><div class="flex justify-between items-start"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-700 uppercase text-sm mt-2">${p.insumoNom} <span class="badge status-pri-${prio} ml-1">${prio}</span></h4><p class="text-xs text-slate-400 font-mono mt-1">x${p.cantidad} • ${p.ubicacion}</p><p class="text-[10px] text-slate-300 mt-1">${p.fecha.split(',')[0]}</p></div></div>${btns}</div>`;
        
        if(['pendiente', 'aprobado'].includes(p.estado)) { if(lActive) lActive.innerHTML += cardHtml; } 
        else { if(lHistory) lHistory.innerHTML += cardHtml; }
    });

    if(lAdmin && ['admin','manager','supervisor'].includes(window.usuarioActual.rol)) {
        Object.values(grupos).sort((a,b) => b.ts - a.ts).forEach(g => {
            const pendingItems = g.items.filter(i => i.estado === 'pendiente');
            if(pendingItems.length > 0) {
                let itemsStr = "";
                const hasAlta = pendingItems.some(i => (i.prioridad || 'normal') === 'alta');
                const headerBorder = hasAlta ? "border-l-red-500" : "border-l-amber-400";
                const badgeUrgente = hasAlta ? `<span class="bg-red-500 text-white px-2 py-1 rounded-lg text-[10px] uppercase font-black animate-pulse ml-2 shadow-sm"><i class="fas fa-exclamation-triangle"></i> Urgente</span>` : '';

                pendingItems.forEach(i => {
                    const iconPri = (i.prioridad==='alta') ? '<i class="fas fa-fire text-red-500 ml-1"></i>' : '';
                    itemsStr += `<span class="bg-slate-50 px-2 py-1 rounded text-[10px] border border-slate-200 uppercase font-bold text-slate-600">${i.insumoNom} (x${i.cantidad}) ${iconPri}</span>`;
                });

                lAdmin.innerHTML += `<div class="bg-white p-5 rounded-2xl border-l-4 ${headerBorder} shadow-sm cursor-pointer hover:shadow-md transition group" onclick="window.abrirModalGrupo('${g.items[0].batchId || g.ts}')"><div class="flex justify-between items-center mb-3"><div><h4 class="font-black text-slate-800 text-sm uppercase flex items-center"><i class="fas fa-user text-slate-300 mr-1"></i> ${g.user} ${badgeUrgente}</h4><span class="text-xs text-slate-400 font-medium">${g.sede} • ${g.date.split(',')[0]}</span></div><span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition"><i class="fas fa-chevron-right text-xs"></i></span></div><div class="flex flex-wrap gap-1.5">${itemsStr}</div></div>`;
            }
        });
    }

    const elPed = document.getElementById("metrica-pedidos"); if(elPed) elPed.innerText = pendingCount;
    window.actualizarDashboard();
    window.renderHistorialUnificado();
};

window.procesarDatosFacturas = () => {
    const tf = document.getElementById("tabla-facturas-db");
    if(!tf) return;
    tf.innerHTML = "";
    
    const facturasFiltradas = rawFacturas.filter(f => (f.grupo || "SERVICIOS GENERALES") === window.grupoActivo);

    facturasFiltradas.sort((a,b) => b.timestamp - a.timestamp).forEach(f => {
        const docLink = (f.archivo_url && f.archivo_url.trim() !== "") 
            ? `<a href="${f.archivo_url}" target="_blank" rel="noopener noreferrer" class="text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px] transition inline-flex items-center gap-1 cursor-pointer"><i class="fas fa-external-link-alt"></i> Ver Doc</a>` 
            : '<span class="text-slate-300 text-[10px] font-bold">N/A</span>';
            
        const btnDelete = `<button onclick="window.abrirModalEliminarFactura('${f.id}')" class="w-8 h-8 rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition inline-flex items-center justify-center" title="Eliminar Factura"><i class="fas fa-trash-alt text-xs"></i></button>`;

        tf.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0 transition">
            <td class="p-4 text-slate-500 text-xs font-mono">${f.fecha_compra}</td>
            <td class="p-4 font-bold text-slate-700 uppercase text-xs">${f.proveedor}</td>
            <td class="p-4 font-black text-emerald-600 text-right text-sm">$${parseFloat(f.gasto).toFixed(2)}</td>
            <td class="p-4 text-slate-400 uppercase text-[10px] text-center font-bold">${f.usuarioRegistro}</td>
            <td class="p-4 text-center">${docLink}</td>
            <td class="p-4 text-center">${btnDelete}</td>
        </tr>`;
    });
};

window.renderHistorialUnificado = () => {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    t.innerHTML = "";
    
    const entradasActivas = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo);

    const entradasFmt = entradasActivas.map(e => ({ 
        id: e.id, fecha: e.fecha, ts: e.timestamp, tipo: 'ENTRADA', insumo: e.insumo, cant: e.cantidad, 
        det: `${e.usuario} ${e.motivo_edicion ? `<br><span class="text-[9px] text-amber-500 font-bold leading-tight"><i class="fas fa-exclamation-triangle"></i> Editado: ${e.motivo_edicion}</span>` : '(Stock)'}`, 
        est: 'completado' 
    }));
    
    const salidasFmt = window.cachePedidos.map(p => ({ 
        id: p.id, fecha: p.fecha, ts: p.timestamp, tipo: 'SALIDA', insumo: p.insumoNom, cant: p.cantidad, 
        det: `${p.usuarioId} (${p.ubicacion}) ${p.entregado_por ? `<br><span class="text-[9px] text-indigo-500 font-bold"><i class="fas fa-hands-helping"></i> Por: ${p.entregado_por}</span>` : ''}`, 
        est: p.estado 
    }));
    
    const unificados = [...entradasFmt, ...salidasFmt].sort((a,b) => b.ts - a.ts);
    const isAdmin = ['admin', 'manager'].includes(window.usuarioActual.rol);

    unificados.forEach(h => {
        const icon = h.tipo==='ENTRADA' ? '<i class="fas fa-arrow-down text-emerald-500"></i>' : '<i class="fas fa-arrow-up text-amber-500"></i>';
        let actionBtn = `<span class="badge status-${h.est}">${h.est}</span>`;
        
        if(h.tipo === 'ENTRADA' && isAdmin) {
            const jsId = h.id.replace(/'/g, "\\'"); const jsInsumo = h.insumo.replace(/'/g, "\\'");
            actionBtn = `<div class="flex items-center gap-2"><span class="badge status-${h.est}">${h.est}</span><button onclick="window.abrirModalEditarEntrada('${jsId}', '${jsInsumo}', ${h.cant})" class="w-7 h-7 flex items-center justify-center text-amber-500 bg-amber-50 hover:bg-amber-100 hover:text-amber-700 rounded-lg transition" title="Corregir Entrada"><i class="fas fa-pen text-[10px]"></i></button></div>`;
        }

        t.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-50 transition"><td class="p-3 text-slate-400 text-[10px] font-mono whitespace-nowrap">${h.fecha.split(',')[0]}</td><td class="p-3 text-xs font-bold text-slate-600">${icon} ${h.tipo}</td><td class="p-3 font-bold text-slate-700 uppercase text-xs">${h.insumo}</td><td class="p-3 text-sm font-bold text-slate-800 text-center">${h.cant}</td><td class="p-3 text-xs text-slate-500 uppercase">${h.det}</td><td class="p-3">${actionBtn}</td></tr>`;
    });
};

// GRAFICAS ESTILIZADAS CON FILTROS DINAMICOS
window.renderChart = (id, labels, data, title, palette, chartInstance, setInstance) => { 
    const ctx = document.getElementById(id); 
    if(!ctx) return; 
    if(chartInstance) chartInstance.destroy(); 
    
    // Paleta con opacidad para fondo
    const bgColors = palette.map(c => c + 'CC');
    const borderColors = palette;

    setInstance(new Chart(ctx, { 
        type: id === 'locationChart' ? 'doughnut' : 'bar', 
        data: { 
            labels: labels, 
            datasets: [{ 
                label: title, 
                data: data, 
                backgroundColor: id === 'locationChart' ? palette : bgColors, 
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: id === 'locationChart' ? 0 : 8 
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: id === 'locationChart', position: 'bottom' } 
            },
            scales: id === 'locationChart' ? {} : { y: { beginAtZero: true } }
        } 
    })); 
};

window.actualizarDashboard = () => {
    const inputDesde = document.getElementById("dash-desde")?.value;
    const inputHasta = document.getElementById("dash-hasta")?.value;

    let dPedidos = window.cachePedidos;

    // Filtrar solicitudes por fecha
    if(inputDesde || inputHasta) {
        const tDesde = inputDesde ? new Date(inputDesde + 'T00:00:00').getTime() : 0;
        const tHasta = inputHasta ? new Date(inputHasta + 'T23:59:59').getTime() : Infinity;
        dPedidos = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta);
    }

    let sedesCount = {};
    dPedidos.forEach(p => { 
        if(p.estado !== 'rechazado') {
            sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad; 
        }
    });

    // Extracción directa de DB para stock
    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    let labelsStock = [];
    let dataStock = [];
    
    invActivo.forEach(p => {
        labelsStock.push(p.id.toUpperCase().substring(0,12));
        dataStock.push(p.cantidad);
    });

    window.renderChart('stockChart', labelsStock, dataStock, 'Stock Actual', chartPalette, window.stockChart, ch => window.stockChart = ch);
    window.renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Artículos Solicitados', chartPalette, window.locationChart, ch => window.locationChart = ch);
};

// --- 6. LOGICA DE NEGOCIO Y MODALES ---

window.ajustarCantidad = (idInsumo, delta) => {
    const safeId = idInsumo.replace(/[^a-zA-Z0-9]/g, '_');
    const n = Math.max(0, (window.carritoGlobal[idInsumo] || 0) + delta); 
    window.carritoGlobal[idInsumo] = n; 
    
    const el = document.getElementById(`cant-${safeId}`); 
    if(el) el.innerText = n;
    
    const row = document.getElementById(`row-${safeId}`);
    if(row) {
        if(n > 0){ row.classList.add("border-indigo-500", "bg-indigo-50/50"); row.classList.remove("border-slate-100", "bg-white"); } 
        else { row.classList.remove("border-indigo-500", "bg-indigo-50/50"); row.classList.add("border-slate-100", "bg-white"); }
    }
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const prio = document.getElementById("sol-prioridad").value;
    const items = Object.entries(window.carritoGlobal).filter(([_, c]) => c > 0);
    
    if(!ubi || items.length === 0) return alert("Seleccione sede y al menos un producto.");
    
    const batchId = Date.now().toString(); 
    const itemsData = items.map(([ins, cant]) => ({ insumo: ins, cantidad: cant }));
    
    try {
        const batch = writeBatch(db);
        const timestamp = Date.now();
        const fechaStr = new Date().toLocaleString();

        items.forEach(([ins, cant]) => {
            const newRef = doc(collection(db, "pedidos"));
            batch.set(newRef, {
                usuarioId: window.usuarioActual.id, 
                insumoNom: ins, 
                cantidad: cant, 
                ubicacion: ubi, 
                prioridad: prio,
                grupo: window.grupoActivo, 
                estado: "pendiente", 
                fecha: fechaStr, 
                timestamp: timestamp,
                fecha_solicitud: fechaStr,
                timestamp_solicitud: timestamp,
                batchId: batchId
            });
        });
        
        await batch.commit(); 
        window.enviarEmailNotificacion('nuevo_pedido', { usuario: window.usuarioActual.id, sede: ubi, items: itemsData, prioridad: prio });
        alert("✅ Pedido Enviado Exitosamente."); 
        window.carritoGlobal = {}; document.getElementById("sol-ubicacion").value=""; document.getElementById("sol-prioridad").value="normal";
        window.procesarDatosInventario(); 
        window.verPagina('notificaciones');
    } catch (error) { alert("Ocurrió un error al procesar el pedido."); }
};

// FACTURAS (AGREGAR Y ELIMINAR)
window.abrirModalFactura = () => { 
    document.getElementById("fact-proveedor").value = ""; 
    document.getElementById("fact-gasto").value = ""; 
    document.getElementById("fact-fecha").value = ""; 
    document.getElementById("fact-archivo-url").value = ""; 
    document.getElementById("factura-file-name").innerText = "Ninguno"; 
    document.getElementById("modal-factura").classList.remove("hidden");
};

window.cerrarModalFactura = () => { document.getElementById("modal-factura").classList.add("hidden"); };

window.guardarFactura = async () => {
    const pv = document.getElementById("fact-proveedor").value.trim();
    const ga = parseFloat(document.getElementById("fact-gasto").value);
    const fe = document.getElementById("fact-fecha").value;
    const ar = document.getElementById("fact-archivo-url").value;

    if(!pv || isNaN(ga) || !fe) return alert("Complete los campos requeridos.");

    try {
        await addDoc(collection(db, "facturas"), { 
            proveedor: pv, gasto: ga, fecha_compra: fe, archivo_url: ar, 
            grupo: window.grupoActivo, usuarioRegistro: window.usuarioActual.id, 
            timestamp: Date.now(), fecha_registro: new Date().toLocaleString() 
        });
        alert("✅ Factura registrada.");
        window.cerrarModalFactura();
    } catch(e) { alert("Error guardando factura."); }
};

window.abrirModalEliminarFactura = (id) => {
    document.getElementById("elim-factura-id").value = id;
    document.getElementById("elim-factura-motivo").value = "";
    document.getElementById("modal-eliminar-factura").classList.remove("hidden");
};

window.confirmarEliminarFactura = async () => {
    const id = document.getElementById("elim-factura-id").value;
    const motivo = document.getElementById("elim-factura-motivo").value.trim();
    
    if(!motivo) return alert("Debe justificar el motivo de la eliminación para la auditoría.");
    
    try {
        const refFactura = doc(db, "facturas", id);
        const snap = await getDoc(refFactura);
        
        if (snap.exists()) {
            const data = snap.data();
            await addDoc(collection(db, "facturas_eliminadas"), {
                ...data,
                motivo_eliminacion: motivo,
                eliminado_por: window.usuarioActual.id,
                fecha_eliminacion: new Date().toLocaleString(),
                timestamp_eliminacion: Date.now()
            });
            await deleteDoc(refFactura);
            alert("🗑️ Factura eliminada correctamente.");
            document.getElementById("modal-eliminar-factura").classList.add("hidden");
        }
    } catch(e) { console.error(e); alert("Hubo un error al eliminar la factura."); }
};

window.agregarProductoRapido = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toUpperCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);

    if (n && c > 0) {
        const idDoc = n.toLowerCase();
        const r = doc(db, "inventario", idDoc);
        const s = await getDoc(r);

        if (s.exists()) {
            await updateDoc(r, { cantidad: s.data().cantidad + c }); 
            alert(`✅ Stock actualizado: ${n}`);
        } else {
            if(confirm(`"${n}" no existe. ¿Crear nuevo en ${window.grupoActivo}?`)) {
                await setDoc(r, { cantidad: c, grupo: window.grupoActivo }); 
                alert(`✅ Producto creado: ${n}`);
            } else return;
        }
        
        await addDoc(collection(db, "entradas_stock"), { 
            insumo: n, cantidad: c, grupo: window.grupoActivo, 
            usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() 
        });
        
        document.getElementById("modal-insumo").classList.add("hidden");
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
    } else alert("Datos inválidos.");
};

window.abrirModalGrupo = (bKey) => {
    const m = document.getElementById("modal-grupo-admin");
    const c = document.getElementById("modal-grupo-contenido");
    const t = document.getElementById("modal-grupo-titulo");

    const items = window.cachePedidos.filter(p => (p.batchId === bKey) || (p.timestamp.toString() === bKey));
    if(items.length === 0) return;
    
    t.innerHTML = `${items[0].usuarioId.toUpperCase()} | ${items[0].ubicacion} | ${items[0].fecha}`; 
    c.innerHTML = "";
    
    items.forEach(p => {
        let act = `<span class="badge status-${p.estado}">${p.estado}</span>`;
        const jsId = p.id.replace(/'/g, "\\'"); const jsInsumo = p.insumoNom.replace(/'/g, "\\'");
        const prio = p.prioridad || 'normal';

        if(p.estado === 'pendiente' && window.usuarioActual.rol !== 'supervisor') {
            act = `<div class="flex gap-2 items-center"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border border-slate-200 rounded text-center p-1 font-bold text-slate-700"><button onclick="window.gestionarPedido('${jsId}','aprobar','${jsInsumo}')" class="text-white bg-emerald-500 hover:bg-emerald-600 p-1.5 rounded shadow"><i class="fas fa-check"></i></button><button onclick="window.gestionarPedido('${jsId}','rechazar')" class="text-slate-400 border border-slate-200 p-1.5 rounded hover:bg-red-50 hover:text-red-500"><i class="fas fa-times"></i></button></div>`;
        }
        c.innerHTML += `<div class="flex justify-between items-center p-3 border-b border-slate-50 hover:bg-slate-50"><div><b class="uppercase text-sm text-slate-700">${p.insumoNom}</b> <span class="badge status-pri-${prio} ml-1">${prio}</span><br><span class="text-xs text-slate-400">Solicitado: ${p.cantidad}</span></div>${act}</div>`;
    });
    m.classList.remove("hidden");
};

window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid); const pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return; const pData = pSnap.data();
    
    let emailSolicitante = ""; 
    try { const u = await getDoc(doc(db, "usuarios", pData.usuarioId)); if(u.exists()) emailSolicitante = u.data().email; } catch(e){}

    if(accion === 'aprobar') {
        const inp = document.getElementById(`qty-${pid}`);
        const val = inp ? parseInt(inp.value) : pData.cantidad;
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        
        if(iSnap.exists() && iSnap.data().cantidad >= val) {
            const newStock = iSnap.data().cantidad - val;
            await updateDoc(iRef, { cantidad: newStock });
            
            await updateDoc(pRef, { estado: "aprobado", cantidad: val, entregado_por: window.usuarioActual.id, fecha_aprobado: new Date().toLocaleString(), timestamp_aprobado: Date.now() });
            
            if(emailSolicitante) window.enviarEmailNotificacion('aprobado_parcial', { usuario: pData.usuarioId, items: [{insumo:ins, cantidad:val}], target_email: emailSolicitante });
            if (newStock <= (iSnap.data().stockMinimo || 0)) window.enviarEmailNotificacion('stock_bajo', { insumo: ins, actual: newStock, minimo: iSnap.data().stockMinimo });
            
            const pendientes = window.cachePedidos.filter(p => (p.batchId === pData.batchId) && p.estado === 'pendiente' && p.id !== pid);
            if(pendientes.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden");
            else window.abrirModalGrupo(pData.batchId); 
        } else alert("Stock insuficiente.");
    } else {
        await updateDoc(pRef, { estado: "rechazado", fecha_rechazo: new Date().toLocaleString() }); window.abrirModalGrupo(pData.batchId);
    }
};

window.confirmarRecibido = async (pid) => { 
    if(confirm("¿Confirmar recepción?")) {
        const pRef = doc(db, "pedidos", pid); const snap = await getDoc(pRef);
        await updateDoc(pRef, { estado: "recibido", fecha_recibido: new Date().toLocaleString(), timestamp_recibido: Date.now() });
        if(snap.exists()) window.enviarEmailNotificacion('recibido', {usuario: window.usuarioActual.id, items:[{insumo:snap.data().insumoNom, cantidad:snap.data().cantidad}], sede:snap.data().ubicacion});
    }
};

window.abrirIncidencia = (pid) => { document.getElementById('incidencia-pid').value = pid; document.getElementById('incidencia-detalle').value = ""; document.getElementById('modal-incidencia').classList.remove('hidden'); };
window.confirmarIncidencia = async (dev) => {
    const pid = document.getElementById('incidencia-pid').value; const det = document.getElementById('incidencia-detalle').value.trim();
    if(!det) return alert("Debe describir el motivo.");
    
    const pRef = doc(db, "pedidos", pid); const pData = (await getDoc(pRef)).data();
    if(dev){ const iRef = doc(db, "inventario", pData.insumoNom.toLowerCase()); const iSnap = await getDoc(iRef); if(iSnap.exists()) await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad }); }
    await updateDoc(pRef, { estado: dev ? "devuelto" : "con_incidencia", detalleIncidencia: det, fecha_incidencia: new Date().toLocaleString() });
    document.getElementById('modal-incidencia').classList.add('hidden'); alert("Registrado correctamente.");
};

// --- 7. EXCEL PRO CON FILTROS ---
window.descargarReporte = async () => {
    if(typeof XLSX === 'undefined') return alert("La librería Excel aún no ha cargado, intente en un segundo.");
    
    const inputDesde = document.getElementById("rep-desde")?.value;
    const inputHasta = document.getElementById("rep-hasta")?.value;
    
    let tDesde = 0; let tHasta = Infinity;
    if(inputDesde) tDesde = new Date(inputDesde + 'T00:00:00').getTime();
    if(inputHasta) tHasta = new Date(inputHasta + 'T23:59:59').getTime();

    if(!confirm(`¿Descargar reporte Excel del grupo ${window.grupoActivo}?`)) return;
    
    const uSnap = await getDocs(collection(db, "usuarios"));
    const usersMap = {}; uSnap.forEach(u => { usersMap[u.id] = u.data(); });

    const obtenerMesAno = (timestamp) => {
        if(!timestamp) return 'N/A';
        const d = new Date(timestamp);
        return `${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][d.getMonth()]} ${d.getFullYear()}`;
    };

    const calcularTiempo = (inicio, fin) => {
        if(!inicio || !fin) return "N/A";
        const diffMs = fin - inicio; if(diffMs < 0) return "N/A";
        const diffMins = Math.round(diffMs / 60000); if(diffMins < 60) return `${diffMins} min`;
        const diffHrs = (diffMins / 60).toFixed(1); if(diffHrs < 24) return `${diffHrs} hrs`;
        return `${(diffHrs / 24).toFixed(1)} días`;
    };

    const invActivo = rawInventario.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo);
    const stockData = invActivo.map(p => ({ "Insumo": p.id.toUpperCase(), "Cantidad Disponible": p.cantidad || 0, "Stock Mínimo": p.stockMinimo || 0, "Precio Unit. ($)": p.precio || 0 }));

    const entActivas = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo && e.timestamp >= tDesde && e.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp);
    const entradasData = entActivas.map(mov => ({ "Mes y Año": obtenerMesAno(mov.timestamp), "Fecha de Entrada": mov.fecha || 'N/A', "Insumo": (mov.insumo || '').toUpperCase(), "Cantidad Ingresada": mov.cantidad || 0, "Usuario Responsable": (mov.usuario || '').toUpperCase() }));

    const salActivas = window.pedidosRaw.filter(p => (p.grupo || "SERVICIOS GENERALES") === window.grupoActivo && p.timestamp >= tDesde && p.timestamp <= tHasta).sort((a,b) => b.timestamp - a.timestamp);
    const salidasData = salActivas.map(mov => {
        const uId = mov.usuarioId || ''; const userObj = usersMap[uId] || {};
        return {
            "Mes y Año": obtenerMesAno(mov.timestamp), "ID Pedido": mov.batchId || 'N/A', "Fecha Solicitud": mov.fecha_solicitud || mov.fecha || 'N/A', 
            "Prioridad": (mov.prioridad || 'NORMAL').toUpperCase(), "Insumo": (mov.insumoNom || '').toUpperCase(), "Cant.": mov.cantidad || 0, 
            "Sede Destino": (mov.ubicacion || '').toUpperCase(), "Usuario Solicitante": uId.toUpperCase(), "Departamento": (userObj.departamento || 'N/A').toUpperCase(),
            "Entregado / Aprobado Por": (mov.entregado_por || 'N/A').toUpperCase(), "Estado Actual": (mov.estado || '').toUpperCase(),
            "Fecha Aprobación": mov.fecha_aprobado || 'N/A', "Tiempo de Respuesta": calcularTiempo(mov.timestamp_solicitud || mov.timestamp, mov.timestamp_aprobado), 
            "Fecha Recepción": mov.fecha_recibido || 'N/A', "Tiempo de Entrega": calcularTiempo(mov.timestamp_aprobado, mov.timestamp_recibido), "Notas": mov.detalleIncidencia || ''
        };
    });

    const wb = XLSX.utils.book_new();
    if(stockData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), "Inventario"); 
    if(entradasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entradasData), "Entradas"); 
    if(salidasData.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salidasData), "Salidas");
    
    XLSX.writeFile(wb, `Reporte_FCILog_${window.grupoActivo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// --- 8. CONFIGURACIÓN ADMIN (SED Y GRUPOS) ---

window.guardarSede = async () => {
    const s = document.getElementById("new-sede").value.trim().toUpperCase();
    if(!s) return alert("Ingrese el nombre de la sede.");
    try {
        await addDoc(collection(db, "sedes"), { nombre: s, timestamp: Date.now() });
        document.getElementById("new-sede").value = "";
        alert("✅ Sede guardada exitosamente.");
    } catch(e) { alert("Error al guardar la sede."); }
};

window.guardarGrupo = async () => {
    const g = document.getElementById("new-grupo").value.trim().toUpperCase();
    if(!g) return alert("Ingrese el nombre del grupo.");
    try {
        await addDoc(collection(db, "grupos"), { nombre: g, timestamp: Date.now() });
        document.getElementById("new-grupo").value = "";
        alert("✅ Grupo creado exitosamente.");
    } catch(e) { alert("Error al crear el grupo."); }
};

window.actualizarCheckboxesGrupos = () => {
    const container = document.getElementById("user-grupos-checkboxes");
    if(!container) return;
    container.innerHTML = window.todosLosGrupos.map(g => `
        <label class="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition">
            <input type="checkbox" value="${g}" class="w-4 h-4 text-indigo-600 rounded border-slate-300 chk-grupo">
            <span class="text-xs font-bold text-slate-700 uppercase">${g}</span>
        </label>
    `).join('');
};

// --- 9. USUARIOS Y DOM ---

window.guardarUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase(); 
    const p = document.getElementById("new-pass").value.trim(); 
    const e = document.getElementById("new-email").value.trim(); 
    const r = document.getElementById("new-role").value; 
    
    const checkboxes = document.querySelectorAll('.chk-grupo:checked');
    let gruposSeleccionados = Array.from(checkboxes).map(chk => chk.value);
    
    if(gruposSeleccionados.length === 0) gruposSeleccionados = ["SERVICIOS GENERALES"]; 
    if(!id || !p) return alert("Faltan datos obligatorios."); 
    
    await setDoc(doc(db,"usuarios",id), { pass: p, rol: r, email: e, grupos: gruposSeleccionados }, { merge: true }); 
    alert("Usuario guardado exitosamente."); 
    window.cancelarEdicionUsuario();
};

window.prepararEdicionUsuario = async (userId) => { 
    const snap = await getDoc(doc(db, "usuarios", userId));
    if(!snap.exists()) return;
    const u = snap.data();

    document.getElementById("edit-mode-id").value = userId; 
    const inpU = document.getElementById("new-user"); 
    inpU.value = userId; inpU.disabled = true; 
    
    document.getElementById("new-pass").value = u.pass; 
    document.getElementById("new-email").value = u.email || ""; 
    document.getElementById("new-role").value = u.rol; 
    
    const gruposUsuario = u.grupos || ["SERVICIOS GENERALES"];
    document.querySelectorAll('.chk-grupo').forEach(chk => { chk.checked = gruposUsuario.includes(chk.value); });

    document.getElementById("btn-guardar-usuario").innerText = "Actualizar"; 
    document.getElementById("cancel-edit-msg").classList.remove("hidden"); 
};

window.cancelarEdicionUsuario = () => { 
    document.getElementById("edit-mode-id").value = ""; 
    const inpU = document.getElementById("new-user"); 
    inpU.value = ""; inpU.disabled = false; 
    
    document.getElementById("new-pass").value = ""; 
    document.getElementById("new-email").value = ""; 
    document.getElementById("new-role").value = "user"; 
    
    document.querySelectorAll('.chk-grupo').forEach(chk => chk.checked = false);

    document.getElementById("btn-guardar-usuario").innerText = "Guardar Usuario"; 
    document.getElementById("cancel-edit-msg").classList.add("hidden"); 
};

window.abrirModalInsumo = () => { document.getElementById("modal-insumo").classList.remove("hidden"); };
window.cerrarModalDetalles = () => { document.getElementById("modal-detalles").classList.add("hidden"); document.getElementById('preview-img').classList.add('hidden'); };

window.prepararEdicionProducto = async(id) => { 
    const s = await getDoc(doc(db,"inventario",id)); 
    if(!s.exists()) return; 
    const d = s.data(); 
    document.getElementById('edit-prod-id').value = id; 
    document.getElementById('edit-prod-precio').value = d.precio||''; 
    document.getElementById('edit-prod-min').value = d.stockMinimo||''; 
    document.getElementById('edit-prod-img').value = d.imagen||''; 
    
    const preview = document.getElementById('preview-img'); 
    if(d.imagen) { preview.src = d.imagen; preview.classList.remove('hidden'); } else { preview.classList.add('hidden'); } 
    document.getElementById('modal-detalles').classList.remove('hidden'); 
};

window.guardarDetallesProducto = async () => { 
    const id = document.getElementById('edit-prod-id').value; 
    const p = parseFloat(document.getElementById('edit-prod-precio').value)||0; 
    const m = parseInt(document.getElementById('edit-prod-min').value)||0; 
    const i = document.getElementById('edit-prod-img').value; 
    await updateDoc(doc(db,"inventario",id),{precio:p,stockMinimo:m,imagen:i}); 
    window.cerrarModalDetalles(); alert("Guardado"); 
};

window.eliminarDato = async (coleccion, id) => { 
    if(confirm("¿Eliminar registro permanentemente?")) await deleteDoc(doc(db, coleccion, id)); 
};

window.abrirModalEditarEntrada = (idEntrada, insumo, cantidadActual) => { 
    document.getElementById('edit-entrada-id').value = idEntrada; 
    document.getElementById('edit-entrada-insumo').value = insumo; 
    document.getElementById('edit-entrada-insumo-display').value = insumo; 
    document.getElementById('edit-entrada-cant-original').value = cantidadActual; 
    document.getElementById('edit-entrada-cantidad').value = cantidadActual; 
    document.getElementById('edit-entrada-motivo').value = ""; 
    document.getElementById('modal-editar-entrada').classList.remove('hidden'); 
};

window.guardarEdicionEntrada = async () => {
    const idEntrada = document.getElementById('edit-entrada-id').value; 
    const insumo = document.getElementById('edit-entrada-insumo').value.toLowerCase(); 
    const cantOriginal = parseInt(document.getElementById('edit-entrada-cant-original').value); 
    const cantNueva = parseInt(document.getElementById('edit-entrada-cantidad').value); 
    const motivo = document.getElementById('edit-entrada-motivo').value.trim();
    
    if (isNaN(cantNueva) || cantNueva < 0) return alert("Ingrese una cantidad válida mayor o igual a 0."); 
    if (!motivo) return alert("Debe ingresar el motivo de la corrección.");
    const diferencia = cantNueva - cantOriginal; 
    if (diferencia === 0) { document.getElementById('modal-editar-entrada').classList.add('hidden'); return; }
    
    try {
        const invRef = doc(db, "inventario", insumo); 
        const invSnap = await getDoc(invRef); 
        if (!invSnap.exists()) return alert("El insumo ya no existe.");
        
        const nuevoStock = invSnap.data().cantidad + diferencia; 
        if (nuevoStock < 0) return alert(`❌ Error matemático: El stock quedaría en negativo.`);
        
        await updateDoc(invRef, { cantidad: nuevoStock }); 
        await updateDoc(doc(db, "entradas_stock", idEntrada), { cantidad: cantNueva, motivo_edicion: motivo, editado_por: window.usuarioActual.id, fecha_edicion: new Date().toLocaleString() });
        
        alert("✅ Entrada corregida."); 
        document.getElementById('modal-editar-entrada').classList.add('hidden');
    } catch(e) { console.error(e); alert("Ocurrió un error."); }
};

window.enviarEmailNotificacion = async (tipo, datos) => {
    if(typeof emailjs === 'undefined') return;
    try {
        let templateParams = { tipo_notificacion: tipo, admin_email: EMAIL_CFG.admin, to_email: datos.target_email || EMAIL_CFG.admin, usuario: datos.usuario || 'Sistema', sede: datos.sede || 'N/A', detalles: '' };

        if (tipo === 'nuevo_pedido') {
            const prefix = datos.prioridad === 'alta' ? '🚨 URGENTE: ' : '';
            templateParams.asunto = `${prefix}NUEVO PEDIDO - ${datos.sede} - ${datos.usuario}`;
            templateParams.mensaje = `El usuario ${datos.usuario} ha solicitado insumos para la sede ${datos.sede}. (Prioridad: ${datos.prioridad})`;
            templateParams.detalles = datos.items.map(i => `${i.insumo}: ${i.cantidad}`).join('\n');
        } else if (tipo === 'aprobado_parcial' || tipo === 'aprobado') {
            templateParams.asunto = `PEDIDO APROBADO - ${datos.usuario}`;
            templateParams.mensaje = `Su pedido ha sido aprobado.`;
            templateParams.detalles = datos.items.map(i => `${i.insumo}: ${i.cantidad}`).join('\n');
        } else if (tipo === 'stock_bajo') {
            templateParams.asunto = `ALERTA DE STOCK BAJO - ${datos.insumo}`;
            templateParams.mensaje = `El insumo ${datos.insumo} ha alcanzado un nivel crítico.`;
            templateParams.detalles = `Stock Actual: ${datos.actual} | Mínimo: ${datos.minimo}`;
        } else if (tipo === 'recibido') {
            templateParams.asunto = `CONFIRMACIÓN DE RECEPCIÓN - ${datos.sede}`;
            templateParams.mensaje = `El usuario ${datos.usuario} ha confirmado la recepción en ${datos.sede}.`;
            templateParams.detalles = datos.items.map(i => `${i.insumo}: ${i.cantidad}`).join('\n');
        }

        await emailjs.send(EMAIL_CFG.s, EMAIL_CFG.t, templateParams, EMAIL_CFG.k);
    } catch (error) {}
};

// --- 10. INICIALIZACIÓN DE LA APP ---
const inicializarApp = () => {
    try {
        if(typeof emailjs !== "undefined") emailjs.init(EMAIL_CFG.k);
        const sesion = localStorage.getItem("fcilog_session"); 
        if(sesion) window.cargarSesion(JSON.parse(sesion));
        
        if (typeof cloudinary !== "undefined") {
            window.cloudinaryWidget = cloudinary.createUploadWidget({
                cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos'
            }, (error, result) => { 
                if (!error && result && result.event === "success") { 
                    document.getElementById('edit-prod-img').value = result.info.secure_url; 
                    const preview = document.getElementById('preview-img'); 
                    preview.src = result.info.secure_url; 
                    preview.classList.remove('hidden'); 
                } 
            });
            
            const btnUpload = document.getElementById("upload_widget"); 
            if(btnUpload) { 
                const newBtn = btnUpload.cloneNode(true); 
                btnUpload.parentNode.replaceChild(newBtn, btnUpload); 
                newBtn.addEventListener("click", (e) => { e.preventDefault(); if(window.cloudinaryWidget) window.cloudinaryWidget.open(); }, false); 
            }

            window.cloudinaryFacturasWidget = cloudinary.createUploadWidget({
                cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local'], multiple: false, folder: 'fcilog_facturas', resourceType: 'auto'
            }, (error, result) => { 
                if (!error && result && result.event === "success") { 
                    document.getElementById('fact-archivo-url').value = result.info.secure_url; 
                    document.getElementById('factura-file-name').innerText = result.info.original_filename + "." + result.info.format;
                } 
            });
            
            const btnUploadFactura = document.getElementById("btn-upload-factura"); 
            if(btnUploadFactura) { 
                const newBtnFact = btnUploadFactura.cloneNode(true); 
                btnUploadFactura.parentNode.replaceChild(newBtnFact, btnUploadFactura); 
                newBtnFact.addEventListener("click", (e) => { e.preventDefault(); if(window.cloudinaryFacturasWidget) window.cloudinaryFacturasWidget.open(); }, false); 
            }
        }
    } catch(e) {}
};
window.addEventListener('DOMContentLoaded', inicializarApp);

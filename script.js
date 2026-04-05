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
// 3. UTILIDADES GENERALES
// ==========================================
window.enviarNotificacionEmail = async (correoDestino, asunto, mensaje) => {
    if(EMAILJS_PUBLIC_KEY === "TU_PUBLIC_KEY_AQUI") {
        console.warn("Email simulado a", correoDestino);
        return;
    }
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: correoDestino,
            subject: asunto,
            message: mensaje
        });
        console.log("Email a", correoDestino);
    } catch (error) {
        console.error("Error email:", error);
    }
};

window.solicitarPermisosNotificacion = () => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission().then(p => {
            if (p === "granted") console.log("Notificaciones ON");
        });
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

window.formatoTiempoDiferencia = (t1, t2) => {
    let diffMs = Math.abs(t2 - t1);
    let diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return diffMins + "m";
    let diffHrs = Math.floor(diffMins / 60);
    let rem = diffMins % 60;
    if (diffHrs < 24) return diffHrs + "h " + rem + "m";
    return Math.floor(diffHrs / 24) + "d " + (diffHrs % 24) + "h";
};

window.tienePermiso = (permiso) => {
    if (!window.usuarioActual) return false;
    if (window.usuarioActual.rol === 'admin') return true;
    return window.usuarioActual.permisos && window.usuarioActual.permisos[permiso] === true;
};

// ==========================================
// 4. CONTROL DE NAVEGACIÓN (TABS Y MENÚS)
// ==========================================
window.verPagina = (id) => {
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
        } else {
            alert("Credenciales incorrectas.");
        }
    } catch (e) {
        alert("Error de conexión.");
    }
};

window.cerrarSesion = () => {
    localStorage.removeItem("fcilog_session");
    location.reload();
};

window.cargarSesion = (datos) => {
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

    const rutas = {
        st:{id:'stats',n:'Dashboard',i:'chart-pie'},
        sk:{id:'stock',n:'Stock',i:'boxes'},
        cm:{id:'compras',n:'Compras / Ingresos',i:'truck-loading'},
        ac:{id:'activos',n:'Activos Fijos',i:'desktop'},
        pd:{id:'solicitar',n:'Pedir Insumo',i:'cart-plus'},
        pe:{id:'solicitudes',n:'Aprobaciones',i:'check-double'},
        mt:{id:'mantenimiento',n:'Mantenimiento',i:'tools'},
        hs:{id:'historial',n:'Movimientos',i:'history'},
        fc:{id:'facturas',n:'Facturas Directas',i:'file-invoice-dollar'},
        cf:{id:'config',n:'Configuración',i:'cogs'},
        us:{id:'usuarios',n:'Accesos',i:'users-cog'},
        mp:{id:'notificaciones',n:'Mis Pedidos',i:'clipboard-list'}
    };

    let menuActivo = [];
    if(datos.rol === 'admin') {
        menuActivo = [rutas.st, rutas.sk, rutas.cm, rutas.ac, rutas.pd, rutas.pe, rutas.mt, rutas.hs, rutas.fc, rutas.cf, rutas.us, rutas.mp];
    } else if(datos.rol === 'manager') {
        menuActivo = [rutas.st, rutas.sk, rutas.cm, rutas.ac, rutas.pd, rutas.pe, rutas.mt, rutas.hs, rutas.fc, rutas.mp];
    } else if(datos.rol === 'supervisor') {
        menuActivo = [rutas.st, rutas.sk, rutas.ac, rutas.pd, rutas.pe, rutas.mt, rutas.hs, rutas.mp];
    } else {
        menuActivo = [rutas.sk, rutas.pd, rutas.mp];
    }
    
    const menuDin = document.getElementById("menu-dinamico");
    if(menuDin) {
        menuDin.innerHTML = menuActivo.map(x => `<button onclick="window.verPagina('${x.id}')" class="w-full flex items-center gap-4 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-white border border-slate-200 group-hover:border-indigo-200 flex items-center justify-center transition-colors"><i class="fas fa-${x.i} group-hover:text-indigo-500"></i></div>${x.n}</button>`).join('');
    }

    let misGrupos = datos.grupos || ["SERVICIOS GENERALES"];
    if(datos.rol === 'admin') misGrupos = window.todosLosGrupos;
    window.grupoActivo = misGrupos[0];
    window.renderizarSelectorGrupos(misGrupos);
    window.verPagina(['admin','manager','supervisor'].includes(datos.rol) ? 'stats' : 'stock');
    
    window.activarSincronizacion();
};

window.cambiarGrupoActivo = (nuevoGrupo) => {
    window.grupoActivo = nuevoGrupo;
    document.getElementById("dash-grupo-label").innerText = window.grupoActivo;
    document.getElementById("lbl-grupo-solicitud").innerText = window.grupoActivo;
    window.carritoGlobal = {};
    window.procesarDatosInventario();
    window.procesarDatosPedidos();
    window.renderHistorialUnificado();
    window.procesarDatosFacturas();
    window.renderMantenimiento();
    window.renderActivos();
    window.renderCompras();
    window.actualizarDashboard();
};

window.renderizarSelectorGrupos = (misGrupos) => {
    const sel = document.getElementById("selector-grupo-activo");
    if(sel) {
        sel.innerHTML = misGrupos.map(g => `<option value="${g}">${g}</option>`).join('');
        sel.value = window.grupoActivo;
    }
    const dashLbl = document.getElementById("dash-grupo-label");
    if(dashLbl) dashLbl.innerText = window.grupoActivo;
    const solLbl = document.getElementById("lbl-grupo-solicitud");
    if(solLbl) solLbl.innerText = window.grupoActivo;
};

window.actualizarCheckboxesGrupos = () => {
    const container = document.getElementById("user-grupos-checkboxes");
    if(container) {
        container.innerHTML = window.todosLosGrupos.map(g => `<label class="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition"><input type="checkbox" value="${g}" class="w-4 h-4 text-indigo-600 rounded border-slate-300 chk-grupo"><span class="text-xs font-bold text-slate-700 uppercase">${g}</span></label>`).join('');
    }
};

// ==========================================
// 6. FIREBASE SINCRONIZACIÓN
// ==========================================
window.activarSincronizacion = () => {
    const uRol = window.usuarioActual.rol;

    onSnapshot(doc(db, "configuracion", "notificaciones"), (docSnap) => {
        if (docSnap.exists()) {
            window.adminEmailGlobal = docSnap.data().emailAdmin || "";
            const elA = document.getElementById("config-admin-email");
            if(elA) elA.value = window.adminEmailGlobal;
        }
    });

    onSnapshot(doc(db, "configuracion", "alertas_stock"), (docSnap) => {
        window.stockAlertEmailGlobal = "";
        if (docSnap.exists() && docSnap.data()[window.grupoActivo]) {
            window.stockAlertEmailGlobal = docSnap.data()[window.grupoActivo];
            const elS = document.getElementById("config-stock-email");
            if(elS) elS.value = window.stockAlertEmailGlobal;
        } else {
            const elS = document.getElementById("config-stock-email");
            if(elS) elS.value = "";
        }
    });

    onSnapshot(collection(db, "grupos"), snap => {
        window.todosLosGrupos = ["SERVICIOS GENERALES"];
        let html = `<div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center"><span class="font-black text-indigo-700 text-xs uppercase"><i class="fas fa-lock mr-1"></i> SERVICIOS GENERALES</span><span class="text-[10px] bg-indigo-200 text-indigo-700 px-2 rounded-full">Base</span></div>`;
        snap.forEach(d => {
            const n = d.data().nombre.toUpperCase();
            if(n !== "SERVICIOS GENERALES") {
                window.todosLosGrupos.push(n);
                html += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm"><span class="font-bold text-slate-700 text-xs uppercase"><i class="fas fa-folder text-slate-300 mr-1"></i> ${n}</span><button onclick="window.eliminarDato('grupos','${d.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button></div>`;
            }
        });
        if(window.tienePermiso('comprar') || window.tienePermiso('aprobar') || uRol === 'admin') window.renderizarSelectorGrupos(window.todosLosGrupos);
        if(document.getElementById("lista-grupos-db")) document.getElementById("lista-grupos-db").innerHTML = html;
        window.actualizarCheckboxesGrupos();
    });

    onSnapshot(collection(db, "sedes"), snap => {
        let opt = '<option value="" disabled selected>Seleccionar Sede...</option>', lst = '';
        snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(s => {
            opt += `<option value="${s.nombre}">📍 ${s.nombre}</option>`;
            lst += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between shadow-sm"><span class="font-bold text-xs uppercase"><i class="fas fa-map-marker-alt text-slate-300 mr-1"></i> ${s.nombre}</span><button onclick="window.eliminarDato('sedes','${s.id}')" class="text-red-400 hover:text-red-600"><i class="fas fa-trash-alt"></i></button></div>`;
        });
        if(document.getElementById("sol-ubicacion")) document.getElementById("sol-ubicacion").innerHTML = opt;
        if(document.getElementById("lista-sedes-db")) document.getElementById("lista-sedes-db").innerHTML = lst;
    });

    onSnapshot(collection(db, "inventario"), snap => {
        rawInventario = [];
        snap.forEach(ds => { rawInventario.push({ id: ds.id, ...ds.data() }); });
        window.procesarDatosInventario();
    });

    onSnapshot(collection(db, "compras"), snap => {
        rawCompras = [];
        snap.forEach(ds => { rawCompras.push({ id: ds.id, ...ds.data() }); });
        window.renderCompras();
    });

    let isInitialPedidos = true;
    onSnapshot(collection(db, "pedidos"), snap => {
        if (!isInitialPedidos) {
            snap.docChanges().forEach(change => {
                const p = change.doc.data();
                const miId = window.usuarioActual?.id;
                if (change.type === "added" && p.estado === 'pendiente' && window.tienePermiso('aprobar') && p.usuarioId !== miId) {
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

    onSnapshot(collection(db, "entradas_stock"), snap => {
        rawEntradas = [];
        snap.forEach(x => { rawEntradas.push({id: x.id, ...x.data()}); });
        window.renderHistorialUnificado();
    });

    onSnapshot(collection(db, "mantenimiento"), snap => {
        rawMantenimiento = [];
        snap.forEach(x => { rawMantenimiento.push({id: x.id, ...x.data()}); });
        window.renderMantenimiento();
        window.actualizarDashboard();
    });

    onSnapshot(collection(db, "activos"), snap => {
        rawActivos = [];
        snap.forEach(x => { rawActivos.push({id: x.id, ...x.data()}); });
        window.renderActivos();
        window.actualizarDashboard();
    });

    if(['admin','manager'].includes(uRol)) {
        onSnapshot(collection(db, "facturas"), snap => {
            rawFacturas = [];
            snap.forEach(d => rawFacturas.push({id: d.id, ...d.data()}));
            window.procesarDatosFacturas();
        });
    }

    if(['admin'].includes(uRol)) {
        onSnapshot(collection(db, "usuarios"), snap => {
            let html = "";
            snap.forEach(d => {
                const u = d.data();
                const jsId = d.id.replace(/'/g, "\\'");
                html += `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm flex justify-between items-center"><div class="truncate w-full"><div class="flex items-center gap-2"><span class="font-black text-sm uppercase text-slate-800">${d.id}</span><span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold border border-slate-200">${u.rol}</span></div><span class="text-[10px] text-indigo-500 font-bold block truncate mt-1.5"><i class="fas fa-folder-open text-indigo-300"></i> ${(u.grupos||[]).join(", ")}</span></div><div class="flex gap-2"><button onclick="window.prepararEdicionUsuario('${jsId}')" class="text-indigo-400 hover:text-indigo-600 bg-indigo-50 p-2 rounded-lg transition"><i class="fas fa-pen"></i></button><button onclick="window.eliminarDato('usuarios','${jsId}')" class="text-red-400 hover:text-red-600 bg-red-50 p-2 rounded-lg transition"><i class="fas fa-trash"></i></button></div></div>`;
            });
            if(document.getElementById("lista-usuarios-db")) document.getElementById("lista-usuarios-db").innerHTML = html;
        });
    }
};

// ==========================================
// 7. RENDERIZADO Y DASHBOARD
// ==========================================
window.renderChart = (id, labels, data, title, palette, chartInstance, setInstance) => {
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

window.actualizarDashboard = () => {
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

// ==========================================
// 8. RENDERIZADO DE TABLAS Y TARJETAS
// ==========================================
window.renderHistorialUnificado = () => {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    let html = "";
    const ent = rawEntradas.filter(e => (e.grupo || "SERVICIOS GENERALES") === window.grupoActivo).map(e => ({ id: e.id, f: e.fecha || new Date(e.timestamp).toLocaleString(), ts: e.timestamp, t: 'ENTRADA', ins: e.insumo || 'N/A', c: e.cantidad || 0, det: `${e.usuario || 'N/A'} ${e.motivo_edicion ? `(Edit: ${e.motivo_edicion})` : ''}`, est: 'completado' }));
    const sal = window.cachePedidos.map(p => ({ id: p.id, f: p.fecha || new Date(p.timestamp).toLocaleString(), ts: p.timestamp, t: 'SALIDA', ins: p.insumoNom || 'N/A', c: p.cantidad || 0, det: `${p.usuarioId || 'N/A'} (${p.ubicacion || 'N/A'})`, est: p.estado || 'N/A' }));
    const isAdmin = window.tienePermiso('comprar') || window.tienePermiso('aprobar');
    
    const combinados = [...ent, ...sal].sort((a,b) => b.ts - a.ts);
    if (combinados.length === 0) {
        t.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 font-medium">No hay movimientos registrados.</td></tr>`;
        return;
    }
    combinados.forEach(h => {
        let btn = `<span class="badge status-${h.est}">${h.est}</span>`;
        if(h.t === 'ENTRADA' && isAdmin) {
            btn = `<div class="flex gap-2">${btn}<button onclick="window.abrirModalEditarEntrada('${h.id}', '${h.ins.replace(/'/g,"\\'")}', ${h.c})" class="text-amber-500 hover:text-amber-600 transition"><i class="fas fa-pen bg-amber-50 p-1.5 rounded"></i></button></div>`;
        }
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition"><td class="p-4 text-[10px] font-mono whitespace-nowrap">${h.f.split(',')[0]}</td><td class="p-4 text-xs font-black whitespace-nowrap text-slate-600">${h.t==='ENTRADA'?'<span class="text-emerald-500">📥</span>':'<span class="text-red-400">📤</span>'} ${h.t}</td><td class="p-4 font-bold uppercase text-xs text-slate-700">${h.ins}</td><td class="p-4 font-black text-center text-slate-800">${h.c}</td><td class="p-4 text-[10px] uppercase text-slate-500">${h.det}</td><td class="p-4">${btn}</td></tr>`;
    });
    t.innerHTML = html;
};

window.procesarDatosFacturas = () => {
    const tb = document.getElementById("tabla-facturas-db");
    if(!tb) return;
    const factGrupo = rawFacturas.filter(f => (f.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    let html = "";
    factGrupo.forEach(f => {
        const docLink = f.archivo_url ? `<a href="${f.archivo_url}" target="_blank" class="text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px]"><i class="fas fa-file-pdf"></i> Ver</a>` : 'N/A';
        const trashBtn = ['admin','manager'].includes(window.usuarioActual?.rol) ? `<button onclick="window.eliminarDato('facturas','${f.id}')" class="text-red-400 hover:text-red-600 ml-2 bg-red-50 p-1.5 rounded-lg"><i class="fas fa-trash"></i></button>` : '';
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition"><td class="p-4 text-xs font-mono text-slate-500">${f.fecha_compra}</td><td class="p-4 text-xs font-bold uppercase text-slate-800">${f.proveedor}</td><td class="p-4 text-xs font-black text-emerald-600 text-right">$${f.gasto.toFixed(2)}</td><td class="p-4 text-[10px] text-center uppercase font-bold text-slate-500">${f.usuarioRegistro}</td><td class="p-4 text-xs text-center">${docLink}</td><td class="p-4 text-center">${trashBtn}</td></tr>`;
    });
    tb.innerHTML = html || '<tr><td colspan="6" class="p-4 text-center text-slate-400 font-medium">No hay facturas registradas.</td></tr>';
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
            actions = `<button onclick="window.completarMantenimiento('${m.id}')" class="text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition mr-1 mb-1"><i class="fas fa-flag-checkered"></i> Finalizar</button>`;
        } else {
            badgeHtml = `<span class="badge status-pendiente">Pendiente</span>`;
            actions = `<button onclick="window.iniciarMantenimiento('${m.id}')" class="text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition mr-1 mb-1"><i class="fas fa-play"></i> Iniciar</button>`;
        }
        actions += `<button onclick="window.abrirBitacora('${m.id}')" class="text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition"><i class="fas fa-book"></i> Bitácora</button>`;
        const trashBtn = window.tienePermiso('activos') ? `<button onclick="window.eliminarDato('mantenimiento','${m.id}')" class="text-red-400 hover:text-red-600 ml-2 bg-red-50 p-1.5 rounded-lg transition"><i class="fas fa-trash"></i></button>` : '';
        let notifTag = m.fecha_notificacion ? `<br><span class="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded mt-1 inline-block font-bold"><i class="fas fa-bell"></i> Alerta: ${m.fecha_notificacion}</span>` : '';
        html += `<tr class="hover:bg-slate-50 border-b border-slate-100 transition ${m.estado === 'completado' ? 'bg-slate-50/30' : ''}"><td class="p-4 align-top w-32">${badgeHtml}</td><td class="p-4 font-black text-slate-800 uppercase text-xs align-top">${m.equipo}</td><td class="p-4 text-slate-500 text-xs font-mono font-medium align-top">${m.fecha_programada}${notifTag}</td><td class="p-4 text-indigo-600 text-[10px] font-black uppercase align-top">${m.responsable}</td><td class="p-4 text-right align-top"><div class="flex flex-wrap justify-end gap-1">${actions}${trashBtn}</div></td></tr>`;
    });
    tb.innerHTML = html || '<tr><td colspan="5" class="p-4 text-center text-slate-400 font-medium">No hay mantenimientos.</td></tr>';
};

window.renderActivos = () => {
    const list = document.getElementById("lista-activos-db");
    if(!list) return;
    let html = "";
    const activosFiltrados = rawActivos.filter(a => (a.grupo || "SERVICIOS GENERALES") === window.grupoActivo).sort((a,b) => b.timestamp - a.timestamp);
    const isAdmin = window.tienePermiso('activos');
    activosFiltrados.forEach(a => {
        const jsId = a.id.replace(/'/g, "\\'");
        const img = a.imagen ? `<img src="${a.imagen}" loading="lazy" class="w-16 h-16 object-cover rounded-xl border border-slate-200">` : `<div class="w-16 h-16 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-300"><i class="fas fa-desktop text-2xl"></i></div>`;
        let bColor = "bg-emerald-50 text-emerald-600 border-emerald-200";
        if(a.estado === "En Mantenimiento") bColor = "bg-amber-50 text-amber-600 border-amber-200";
        if(a.estado === "Fuera de Servicio") bColor = "bg-red-50 text-red-600 border-red-200";
        if(a.estado === "Almacenado") bColor = "bg-slate-50 text-slate-600 border-slate-200";
        let controls = isAdmin ? `<button onclick="window.abrirModalActivo('${jsId}')" class="text-slate-400 hover:text-indigo-600 p-1 transition"><i class="fas fa-pen text-xs"></i></button><button onclick="window.eliminarDato('activos','${jsId}')" class="text-slate-400 hover:text-red-500 p-1 transition"><i class="fas fa-trash text-xs"></i></button>` : "";
        html += `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col item-tarjeta"><div class="flex justify-between items-start mb-4"><span class="px-2.5 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider ${bColor}">${a.estado || 'Activo'}</span><div class="flex gap-2">${controls}</div></div><div class="flex items-center gap-4 mb-4">${img}<div class="truncate flex-1"><h4 class="font-black text-slate-800 text-sm uppercase truncate" title="${a.nombre}">${a.nombre}</h4><p class="text-[10px] text-slate-400 font-mono mt-0.5 border border-slate-100 bg-slate-50 inline-block px-1.5 rounded">${a.id}</p><p class="text-[10px] text-indigo-500 font-black uppercase mt-1.5 truncate">${a.marca || ''}</p></div></div><div class="flex justify-between items-end mt-auto pt-4 border-t border-slate-100"><div class="text-[10px] text-slate-500 font-medium"><p><i class="fas fa-map-marker-alt text-slate-300 w-4"></i> ${a.ubicacion || 'N/A'}</p><p class="mt-1.5"><i class="fas fa-tags text-slate-300 w-4"></i> ${a.categoria || 'N/A'}</p></div><button onclick="window.abrirDetallesActivo('${jsId}')" class="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-100 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"><i class="fas fa-eye"></i> Detalles</button></div></div>`;
    });
    list.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay activos registrados en este grupo.</p>`;
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
        let itemsList = `<ul class="text-[11px] text-slate-600 font-medium mt-3 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 h-24 overflow-y-auto custom-scroll shadow-inner">`;
        let totalCosto = 0;
        c.items.forEach(i => { 
            let pStr = i.precio > 0 ? `($${i.precio.toFixed(2)})` : '';
            itemsList += `<li><span class="font-black text-slate-800">${i.cantidad}x</span> ${i.insumo} <span class="text-emerald-600 font-bold ml-1">${pStr}</span></li>`; 
            totalCosto += i.precio; 
        });
        itemsList += `</ul>`;
        let btnRecibir = "";
        if (c.estado !== 'recibido' && window.tienePermiso('recibir')) {
            btnRecibir = `<button onclick="window.confirmarRecepcionCompra('${c.id}')" class="bg-emerald-500 text-white px-4 py-3 rounded-xl text-xs font-black shadow-lg hover:bg-emerald-600 mt-4 w-full transition flex items-center justify-center gap-2"><i class="fas fa-box-open text-lg"></i> Recibir Inventario Físico</button>`;
        }
        let trashBtn = window.tienePermiso('comprar') ? `<button onclick="window.eliminarDato('compras','${c.id}')" class="text-red-300 hover:text-red-500 bg-red-50 p-1.5 rounded-lg transition"><i class="fas fa-trash text-xs"></i></button>` : '';
        html += `<div class="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-md flex flex-col justify-between hover:shadow-lg transition"><div class="flex justify-between items-start mb-2"><div>${badge}<h4 class="font-black text-slate-800 uppercase text-base mt-2">${c.proveedor}</h4></div>${trashBtn}</div><p class="text-[10px] font-mono text-slate-400 mt-1">Factura: <span class="font-bold">${c.factura || 'N/A'}</span> • ${c.fecha_compra}</p>${itemsList}<div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-100"><span class="text-[10px] uppercase text-indigo-500 font-black tracking-wide"><i class="fas fa-user mr-1 text-indigo-300"></i> ${c.registrado_por}</span><span class="text-emerald-600 font-black text-lg">$${totalCosto.toFixed(2)}</span></div>${btnRecibir}</div>`;
    });
    tb.innerHTML = html || `<p class="col-span-full text-center text-slate-400 py-10 text-sm font-medium">No hay compras registradas en este grupo.</p>`;
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
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-10 h-10 object-cover rounded-lg border border-slate-200">` : `<div class="w-10 h-10 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center text-slate-300"><i class="fas fa-box"></i></div>`;
        return `<div onclick="window.seleccionarInsumoParaEntrada('${jsId}')" class="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition item-tarjeta mb-3"><div class="flex items-center gap-3 flex-1 min-w-0 pr-2">${img}<div class="flex-1 min-w-0"><p class="font-black text-xs uppercase text-slate-800 break-words whitespace-normal leading-tight">${nombre}</p><p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Stock Actual: <span class="text-indigo-600">${p.cantidad || 0}</span></p></div></div><i class="fas fa-chevron-right text-indigo-300 text-xs flex-shrink-0"></i></div>`;
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
        const nombre = (p.id || '').toUpperCase();
        const safeId = (p.id || '').replace(/[^a-zA-Z0-9]/g, '_');
        const jsId = (p.id || '').replace(/'/g, "\\'");
        tr++; ts += (p.cantidad || 0);
        listHTML += `<option value="${nombre}">`;
        
        let controls = isAdmin ? `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 p-1.5 rounded transition"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 p-1.5 rounded transition"><i class="fas fa-trash"></i></button></div>` : "";
        const img = p.imagen ? `<img src="${p.imagen}" loading="lazy" class="w-14 h-14 object-cover rounded-xl border border-slate-200 shadow-sm mb-3">` : `<div class="w-14 h-14 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-300 mb-3 shadow-inner"><i class="fas fa-image text-xl"></i></div>`;
        const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo);
        const border = isLow ? "border-2 border-red-400 bg-red-50" : "border border-slate-200 bg-white";
        
        gridHTML += `<div class="${border} p-5 rounded-[1.5rem] shadow-sm hover:shadow-md transition flex flex-col item-tarjeta h-full"><div class="flex justify-between items-start mb-2">${img}${controls}</div><h4 class="font-black text-slate-800 text-xs break-words whitespace-normal leading-tight flex-1" title="${nombre}">${nombre} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse inline-block ml-1"></i>':''}</h4><div class="flex justify-between items-end mt-4 pt-4 border-t border-slate-100"><p class="text-3xl font-black text-indigo-900">${p.cantidad || 0}</p>${p.precio ? `<span class="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">$${p.precio}</span>` : ''}</div></div>`;

        if(cartContainer && p.cantidad > 0) {
            const enCarro = window.carritoGlobal[p.id] || 0;
            const active = enCarro > 0 ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white";
            cartHTML += `<div id="row-${safeId}" class="flex items-center justify-between p-4 rounded-xl border ${active} transition-all shadow-sm item-tarjeta mb-3"><div class="flex items-center gap-4 flex-1 min-w-0 pr-3">${p.imagen?`<img src="${p.imagen}" loading="lazy" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-200">`:''}<div class="flex-1 min-w-0"><p class="font-black text-xs uppercase text-slate-800 break-words whitespace-normal leading-tight">${nombre}</p><p class="text-[10px] text-indigo-500 font-bold mt-1">Disponible: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1.5 border border-slate-200 flex-shrink-0 z-10 shadow-sm"><button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition flex items-center justify-center">-</button><span id="cant-${safeId}" class="w-8 text-center font-black text-indigo-700 text-sm">${enCarro}</span><button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-700 transition flex items-center justify-center" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
        }
    });
    grid.innerHTML = gridHTML;
    if(cartContainer) cartContainer.innerHTML = cartHTML || `<div class="flex flex-col items-center justify-center py-10 text-slate-400"><i class="fas fa-shopping-basket text-4xl mb-3 opacity-50"></i><p class="text-xs font-medium">Aún no has seleccionado insumos.</p><p class="text-[10px] mt-1">Usa la pestaña "Stock" para agregar.</p></div>`;
    if(dataList) dataList.innerHTML = listHTML;
    if(datalistCompras) datalistCompras.innerHTML = listHTML;
    if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = tr;
    if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = ts;
    window.actualizarDashboard();
    window.renderListaInsumos();
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
            btns = `<div class="mt-4 pt-4 border-t border-slate-100 flex justify-end gap-3"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-emerald-600 transition flex items-center gap-1"><i class="fas fa-check-circle"></i> Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-50 transition flex items-center gap-1"><i class="fas fa-exclamation-triangle"></i> Reportar</button></div>`;
        } else if(['recibido', 'devuelto'].includes(p.estado)) {
            btns = `<div class="mt-4 pt-3 border-t border-slate-100 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-600 text-xs font-bold hover:underline bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 transition"><i class="fas fa-undo mr-1"></i> Devolver / Reportar</button></div>`;
        }
        
        const prio = p.prioridad || 'normal';
        const notesHtml = p.notas ? `<div class="mt-3 bg-amber-50 p-2.5 rounded-xl border border-amber-100"><p class="text-[9px] font-black text-amber-600 uppercase mb-1">Tu Nota:</p><p class="text-[11px] text-amber-900 italic font-medium">"${p.notas}"</p></div>` : '';
        let tiemposHtml = `<div class="mt-3 space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] font-mono text-slate-600 shadow-inner"><div class="flex justify-between items-center"><span class="flex items-center gap-1.5"><i class="fas fa-clock text-slate-400"></i> Pedido:</span> <span class="font-bold">${new Date(p.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>`;
        if (p.timestamp_aprobado) tiemposHtml += `<div class="flex justify-between items-center"><span class="flex items-center gap-1.5"><i class="fas fa-user-check text-indigo-500"></i> Atendido:</span> <span class="font-bold">${new Date(p.timestamp_aprobado).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-1 font-black">+${window.formatoTiempoDiferencia(p.timestamp, p.timestamp_aprobado)}</span></span></div>`;
        if (p.timestamp_recibido) tiemposHtml += `<div class="flex justify-between items-center text-emerald-700"><span class="flex items-center gap-1.5"><i class="fas fa-box-open"></i> Recibido:</span> <span class="font-bold">${new Date(p.timestamp_recibido).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} <span class="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-1 font-black">+${window.formatoTiempoDiferencia(p.timestamp_aprobado || p.timestamp, p.timestamp_recibido)}</span></span></div>`;
        if (p.entregado_por) tiemposHtml += `<div class="flex justify-between items-center text-slate-700 mt-2 border-t border-slate-200 pt-2"><span class="flex items-center gap-1.5"><i class="fas fa-handshake text-slate-400"></i> Entregado por:</span> <span class="font-black uppercase">${p.entregado_por}</span></div>`;
        tiemposHtml += `</div>`;

        const cardHtml = `<div class="bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm item-tarjeta"><div class="flex justify-between items-start mb-2"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-black text-slate-800 uppercase text-sm mt-2 break-words whitespace-normal leading-tight">${p.insumoNom} <span class="badge status-pri-${prio} inline-block ml-1 shadow-sm">${prio}</span></h4><p class="text-xs text-indigo-600 font-black mt-1">x${p.cantidad} <span class="text-slate-400 font-medium ml-1">• ${p.ubicacion}</span></p><p class="text-[10px] text-slate-400 mt-1">${(p.fecha||'').split(',')[0]}</p></div></div>${notesHtml}${tiemposHtml}${btns}</div>`;
        if(['pendiente', 'aprobado'].includes(p.estado)) htmlActive += cardHtml; else htmlHistory += cardHtml;
    });

    if(window.tienePermiso('aprobar')) {
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
    if(document.getElementById("lista-pendientes-admin")) document.getElementById("lista-pendientes-admin").innerHTML = htmlAdmin || `<p class="col-span-full text-slate-400 text-sm">No hay solicitudes pendientes.</p>`;
    if(document.getElementById("tab-content-activos")) document.getElementById("tab-content-activos").innerHTML = htmlActive || `<p class="col-span-full text-center text-slate-400 py-10 text-sm">No tienes solicitudes en curso.</p>`;
    if(document.getElementById("tab-content-historial")) document.getElementById("tab-content-historial").innerHTML = htmlHistory || `<p class="col-span-full text-center text-slate-400 py-10 text-sm">No hay historial.</p>`;
    window.actualizarDashboard();
};


// ==========================================
// 9. LÓGICA DE MÓDULOS DE REGISTRO
// ==========================================

// COMPRAS
window.agregarItemCompra = () => {
    const insumo = document.getElementById("compra-insumo").value.trim().toUpperCase();
    const cant = parseInt(document.getElementById("compra-cant").value);
    const precio = parseFloat(document.getElementById("compra-precio").value) || 0; // OPCIONAL
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
        html += `<div class="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 shadow-sm mb-2"><span>${data.cantidad}x ${ins}</span><div class="flex items-center gap-4">${pStr}<button onclick="delete window.carritoCompras['${ins}']; window.renderCarritoCompras()" class="text-red-400 hover:text-red-600 bg-red-50 p-1.5 rounded"><i class="fas fa-times"></i></button></div></div>`;
        total += data.precio;
    });
    if(total > 0) html += `<div class="text-right text-sm font-black text-slate-800 mt-3 pr-2 border-t border-slate-200 pt-2">Total Estimado: <span class="text-emerald-600">$${total.toFixed(2)}</span></div>`;
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
        alert("Compra registrada exitosamente.");
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
        alert("Error en la recepción.");
    }
};

// EDICIÓN DE INSUMOS
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
    const precio = parseFloat(document.getElementById('edit-prod-precio').value) || 0; // OPCIONAL
    const minimo = parseInt(document.getElementById('edit-prod-min').value) || 0;
    
    await updateDoc(doc(db,"inventario",document.getElementById('edit-prod-id').value),{
        precio: precio,
        stockMinimo: minimo,
        imagen: imgUrl
    });
    document.getElementById('modal-detalles').classList.add('hidden');
};

// ==========================================
// 10. EXPORTAR A EXCEL (XLSX)
// ==========================================
window.descargarReporte = async () => {
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

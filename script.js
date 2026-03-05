import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- 2. VARIABLES GLOBALES SEGURAS ---
window.usuarioActual = null;
window.carritoGlobal = {};
window.pedidosRaw = [];
window.cacheEntradas = [];
window.cachePedidos = [];
window.stockChart = null;
window.locationChart = null;
window.cloudinaryWidget = null;
window.cloudinaryFacturasWidget = null; 

const chartPalette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#d946ef', '#14b8a6', '#3b82f6', '#f97316', '#0ea5e9', '#ec4899', '#eab308'];

const EMAIL_SERVICE_ID = 'service_a7yozqh'; 
const EMAIL_TEMPLATE_ID = 'template_zglatmb'; 
const EMAIL_PUBLIC_KEY = '2jVnfkJKKG0bpKN-U'; 
const ADMIN_EMAIL = 'Emanuel.cedeno@fcipty.com'; 

// --- 3. FUNCIONES DE INTERFAZ Y MENÚ ---
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

// --- 4. SESIÓN Y AUTENTICACIÓN ---
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
                <span class="text-[9px] text-slate-400 mt-1 uppercase block">${datos.departamento || 'Sin Depto'}</span>
            </div>`;
    }

    const btnAdmin = document.getElementById("btn-admin-stock");
    if(btnAdmin && ['admin','manager'].includes(datos.rol)) btnAdmin.classList.remove("hidden");

    window.configurarMenu();
    let inicio = ['admin','manager','supervisor'].includes(datos.rol) ? 'stats' : 'stock';
    window.verPagina(inicio);
    window.activarSincronizacion();
};

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if(!user || !pass) return alert("Ingrese usuario y contraseña.");
    if (user === "admin" && pass === "1130") { window.cargarSesion({ id: "admin", rol: "admin", departamento: "SISTEMAS" }); return; }
    
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            window.cargarSesion({ id: user, ...snap.data() });
        } else alert("Credenciales incorrectas.");
    } catch (e) { 
        console.error("Error Login:", e); alert("Error de conexión a la base de datos."); 
    }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

window.configurarMenu = () => {
    const rol = window.usuarioActual.rol;
    const menu = document.getElementById("menu-dinamico");
    if(!menu) return;

    const items = { 
        st:{id:'stats',n:'Dashboard',i:'chart-pie'}, 
        sk:{id:'stock',n:'Stock',i:'boxes'}, 
        pd:{id:'solicitar',n:'Realizar Pedido',i:'cart-plus'}, 
        pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, 
        hs:{id:'historial',n:'Movimientos',i:'history'}, 
        fc:{id:'facturas',n:'Facturas',i:'file-invoice-dollar'},
        us:{id:'usuarios',n:'Accesos',i:'users-cog'}, 
        mp:{id:'notificaciones',n:'Mis Solicitudes',i:'shipping-fast'} 
    };
    
    let rutas = [];
    if(rol==='admin') rutas=[items.st, items.sk, items.pd, items.pe, items.hs, items.fc, items.us, items.mp]; 
    else if(rol==='manager') rutas=[items.st, items.sk, items.pd, items.pe, items.hs, items.fc, items.mp]; 
    else if(rol==='supervisor') rutas=[items.st, items.sk, items.pd, items.pe, items.hs, items.mp]; 
    else rutas=[items.sk, items.pd, items.mp];
    
    menu.innerHTML = rutas.map(x => `<button onclick="window.verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');
};

// --- 5. LECTURA Y SINCRONIZACIÓN (REALTIME) ---
window.activarSincronizacion = () => {
    if(!window.usuarioActual) return;

    // A) STOCK / INVENTARIO
    onSnapshot(collection(db, "inventario"), snap => {
        const grid = document.getElementById("lista-inventario");
        const cartContainer = document.getElementById("contenedor-lista-pedidos");
        const dataList = document.getElementById("lista-sugerencias");
        
        if(grid) grid.innerHTML=""; 
        if(cartContainer) cartContainer.innerHTML=""; 
        if(dataList) dataList.innerHTML="";
        
        let tr=0, ts=0, labels=[], dataStock=[];

        snap.forEach(ds => {
            const p = ds.data(); 
            const nombre = ds.id.toUpperCase();
            const safeId = ds.id.replace(/[^a-zA-Z0-9]/g, '_');
            const jsId = ds.id.replace(/'/g, "\\'"); 

            tr++; ts += p.cantidad; 
            labels.push(nombre.substring(0, 10)); 
            dataStock.push(p.cantidad);

            if(dataList) dataList.innerHTML += `<option value="${nombre}">`;

            const isAdmin = ['admin','manager'].includes(window.usuarioActual.rol);
            let controls = "";
            if (isAdmin) {
                controls = `<div class="flex gap-2"><button onclick="window.prepararEdicionProducto('${jsId}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="window.eliminarDato('inventario','${jsId}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>`;
            }

            const img = p.imagen ? `<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo);
            const border = isLow ? "border-2 border-red-500 bg-red-50" : "border border-slate-100 bg-white";
            const price = p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : '';
            
            if(grid) {
                grid.innerHTML += `
                <div class="${border} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col item-tarjeta">
                    <div class="flex justify-between items-start">${img}${controls}</div>
                    <h4 class="font-bold text-slate-700 text-xs truncate" title="${nombre}">${nombre} ${isLow?'<i class="fas fa-exclamation-circle text-red-500 animate-pulse"></i>':''}</h4>
                    <div class="flex justify-between items-end mt-1"><p class="text-2xl font-black text-slate-800">${p.cantidad}</p>${price}</div>
                </div>`;
            }

            if(cartContainer && p.cantidad > 0) {
                const enCarro = window.carritoGlobal[ds.id] || 0;
                const active = enCarro > 0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white";
                
                cartContainer.innerHTML += `
                <div id="row-${safeId}" class="flex items-center justify-between p-3 rounded-xl border ${active} transition-all shadow-sm item-tarjeta">
                    <div class="flex items-center gap-3 overflow-hidden">
                        ${p.imagen?`<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">`:''}
                        <div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${nombre}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div>
                    </div>
                    <div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0 z-10 relative">
                        <button type="button" onclick="window.ajustarCantidad('${jsId}', -1)" class="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 font-black text-lg text-slate-600 transition cursor-pointer active:scale-90 flex items-center justify-center">-</button>
                        <span id="cant-${safeId}" class="w-8 text-center font-bold text-indigo-600 text-sm">${enCarro}</span>
                        <button type="button" onclick="window.ajustarCantidad('${jsId}', 1)" class="w-8 h-8 rounded-md bg-indigo-100 hover:bg-indigo-200 font-black text-lg text-indigo-600 transition cursor-pointer active:scale-90 flex items-center justify-center" ${enCarro>=p.cantidad?'disabled':''}>+</button>
                    </div>
                </div>`;
            }
        });

        const elTotal = document.getElementById("metrica-total"); if(elTotal) elTotal.innerText = tr;
        const elStock = document.getElementById("metrica-stock"); if(elStock) elStock.innerText = ts;
        window.actualizarDashboard();
    });

    // B) PEDIDOS Y PRIORIDADES
    onSnapshot(collection(db,"pedidos"), s => {
        window.pedidosRaw = []; window.cachePedidos = [];
        let grupos = {}; let pendingCount = 0;

        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lActive = document.getElementById("tab-content-activos");
        const lHistory = document.getElementById("tab-content-historial");

        if(lAdmin) lAdmin.innerHTML=""; if(lActive) lActive.innerHTML=""; if(lHistory) lHistory.innerHTML="";

        s.forEach(ds => {
            const p = ds.data(); p.id = ds.id; 
            window.pedidosRaw.push(p); window.cachePedidos.push(p);

            const bKey = p.batchId || p.timestamp;
            if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp };
            grupos[bKey].items.push(p);

            if(p.estado === 'pendiente') pendingCount++;
        });

        const misPedidos = window.cachePedidos.filter(p => p.usuarioId === window.usuarioActual.id).sort((a,b) => b.timestamp - a.timestamp);
        
        misPedidos.forEach(p => {
            let btns = "";
            if(p.estado === 'aprobado') {
                btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end gap-2"><button onclick="window.confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-emerald-600 transition">Recibir</button><button onclick="window.abrirIncidencia('${p.id}')" class="bg-white border border-red-200 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50">Reportar</button></div>`;
            } else if(p.estado === 'recibido' || p.estado === 'devuelto') {
                btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end"><button onclick="window.abrirIncidencia('${p.id}')" class="text-amber-500 text-xs font-bold hover:underline flex items-center gap-1"><i class="fas fa-undo"></i> Devolver / Reportar</button></div>`;
            }
            
            const prio = p.prioridad || 'normal';
            
            const cardHtml = `
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition item-tarjeta">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="badge status-${p.estado}">${p.estado}</span>
                        <h4 class="font-black text-slate-700 uppercase text-sm mt-2">${p.insumoNom} <span class="badge status-pri-${prio} ml-1">${prio}</span></h4>
                        <p class="text-xs text-slate-400 font-mono mt-1">x${p.cantidad} • ${p.ubicacion}</p>
                        <p class="text-[10px] text-slate-300 mt-1">${p.fecha.split(',')[0]}</p>
                    </div>
                </div>
                ${btns}
            </div>`;
            
            if(['pendiente', 'aprobado'].includes(p.estado)) { if(lActive) lActive.innerHTML += cardHtml; } 
            else { if(lHistory) lHistory.innerHTML += cardHtml; }
        });

        if(lAdmin && ['admin','manager','supervisor'].includes(window.usuarioActual.rol)) {
            const gruposOrdenados = Object.values(grupos).sort((a,b) => b.ts - a.ts);
            
            gruposOrdenados.forEach(g => {
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

                    lAdmin.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border-l-4 ${headerBorder} shadow-sm cursor-pointer hover:shadow-md transition group" onclick="window.abrirModalGrupo('${g.items[0].batchId || g.ts}')">
                        <div class="flex justify-between items-center mb-3">
                            <div>
                                <h4 class="font-black text-slate-800 text-sm uppercase flex items-center"><i class="fas fa-user text-slate-300 mr-1"></i> ${g.user} ${badgeUrgente}</h4>
                                <span class="text-xs text-slate-400 font-medium">${g.sede} • ${g.date.split(',')[0]}</span>
                            </div>
                            <span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition"><i class="fas fa-chevron-right text-xs"></i></span>
                        </div>
                        <div class="flex flex-wrap gap-1.5">${itemsStr}</div>
                    </div>`;
                }
            });
        }

        const elPed = document.getElementById("metrica-pedidos"); if(elPed) elPed.innerText = pendingCount;
        window.actualizarDashboard(); window.renderHistorialUnificado();
    });

    // C) ENTRADAS
    onSnapshot(collection(db,"entradas_stock"), s => {
        window.cacheEntradas = []; 
        s.forEach(x => { const d = x.data(); d.id = x.id; window.cacheEntradas.push(d); });
        window.renderHistorialUnificado();
    });

    // D) FACTURAS
    if(['admin','manager'].includes(window.usuarioActual.rol)) {
        onSnapshot(collection(db, "facturas"), snap => {
            const tf = document.getElementById("tabla-facturas-db");
            if(tf) {
                tf.innerHTML = "";
                let fData = [];
                snap.forEach(d => fData.push({id: d.id, ...d.data()}));
                
                fData.sort((a,b) => b.timestamp - a.timestamp).forEach(f => {
                    const docLink = (f.archivo_url && f.archivo_url.trim() !== "") 
                        ? `<a href="${f.archivo_url}" target="_blank" rel="noopener noreferrer" class="text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px] transition inline-flex items-center gap-1 cursor-pointer"><i class="fas fa-external-link-alt"></i> Ver Doc</a>` 
                        : '<span class="text-slate-300 text-[10px] font-bold">N/A</span>';

                    tf.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0 transition">
                        <td class="p-4 text-slate-500 text-xs font-mono">${f.fecha_compra}</td>
                        <td class="p-4 font-bold text-slate-700 uppercase text-xs">${f.proveedor}</td>
                        <td class="p-4 font-black text-emerald-600 text-right text-sm">$${parseFloat(f.gasto).toFixed(2)}</td>
                        <td class="p-4 text-slate-400 uppercase text-[10px] text-center font-bold">${f.usuarioRegistro}</td>
                        <td class="p-4 text-center">${docLink}</td>
                        <td class="p-4 text-slate-300 text-[10px] text-right font-mono">${f.fecha_registro.split(',')[0]}</td>
                    </tr>`;
                });
            }
        });
    }

    // E) USUARIOS
    if(window.usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) { 
                l.innerHTML = "";
                snap.forEach(d => {
                    const u = d.data(); const jsId = d.id.replace(/'/g, "\\'");
                    l.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm hover:shadow-md transition">
                        <div>
                            <div class="flex items-center gap-2"><span class="font-bold uppercase text-slate-700">${d.id}</span><span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold">${u.rol}</span></div>
                            <span class="text-[10px] text-indigo-400 block font-bold uppercase mt-1">${u.departamento || 'SIN DEPTO'}</span>
                            <span class="text-xs text-slate-400 block mt-1"><i class="fas fa-envelope text-[10px]"></i> ${u.email || 'Sin correo'}</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.prepararEdicionUsuario('${jsId}','${u.pass}','${u.rol}','${u.email||''}','${u.departamento||''}')" class="w-8 h-8 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white transition flex items-center justify-center"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="window.eliminarDato('usuarios','${jsId}')" class="w-8 h-8 rounded bg-slate-50 text-red-400 hover:bg-red-500 hover:text-white transition flex items-center justify-center"><i class="fas fa-trash-alt text-xs"></i></button>
                        </div>
                    </div>`;
                });
            }
        });
    }
};

// --- DASHBOARD ---
window.actualizarDashboard = () => {
    let dPedidos = window.cachePedidos;
    
    const inputDesde = document.getElementById("dash-desde")?.value;
    const inputHasta = document.getElementById("dash-hasta")?.value;

    if(inputDesde || inputHasta) {
        const tDesde = inputDesde ? new Date(inputDesde).getTime() : 0;
        const tHasta = inputHasta ? new Date(inputHasta).setHours(23,59,59,999) : Infinity;
        dPedidos = window.cachePedidos.filter(p => p.timestamp >= tDesde && p.timestamp <= tHasta);
    }

    let sedesCount = {};
    dPedidos.forEach(p => { if(p.estado !== 'rechazado') sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad; });

    const grid = document.querySelectorAll("#lista-inventario h4");
    const gridVals = document.querySelectorAll("#lista-inventario p.text-2xl");
    let labels = [], dataStock = [];
    for(let i=0; i<grid.length; i++) {
        labels.push(grid[i].title.substring(0,10));
        dataStock.push(parseInt(gridVals[i].innerText));
    }

    window.renderChart('stockChart', labels, dataStock, 'Stock', chartPalette, window.stockChart, ch => window.stockChart = ch);
    window.renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Sedes', chartPalette, window.locationChart, ch => window.locationChart = ch);
};

// --- HISTORIAL TABLA ---
window.renderHistorialUnificado = () => {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    t.innerHTML = "";
    
    const entradasFmt = window.cacheEntradas.map(e => ({ 
        id: e.id, fecha: e.fecha, ts: e.timestamp, tipo: 'ENTRADA', insumo: e.insumo, cant: e.cantidad, 
        det: `${e.usuario} ${e.motivo_edicion ? `<br><span class="text-[9px] text-amber-500 font-bold leading-tight"><i class="fas fa-exclamation-triangle"></i> Editado: ${e.motivo_edicion}</span>` : '(Stock)'}`, 
        est: 'completado' 
    }));
    
    const salidasFmt = window.cachePedidos.map(p => ({ 
        id: p.id, fecha: p.fecha, ts: p.timestamp, tipo: 'SALIDA', insumo: p.insumoNom, cant: p.cantidad, 
        det: `${p.usuarioId} (${p.ubicacion}) ${p.entregado_por ? `<br><span class="text-[9px] text-indigo-500 font-bold"><i class="fas fa-hands-helping"></i> Entregado por: ${p.entregado_por}</span>` : ''}`, 
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

        t.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0 transition"><td class="p-3 text-slate-400 text-[10px] font-mono whitespace-nowrap">${h.fecha.split(',')[0]}</td><td class="p-3 text-xs font-bold text-slate-600">${icon} ${h.tipo}</td><td class="p-3 font-bold text-slate-700 uppercase text-xs">${h.insumo}</td><td class="p-3 text-sm font-bold text-slate-800 text-center">${h.cant}</td><td class="p-3 text-xs text-slate-500 uppercase">${h.det}</td><td class="p-3">${actionBtn}</td></tr>`;
    });
};

// --- 6. FUNCIONES DE NEGOCIO ---
window.ajustarCantidad = (i,d) => {
    const safeId = i.replace(/[^a-zA-Z0-9]/g, '_');
    const n = Math.max(0, (window.carritoGlobal[i]||0) + d); 
    window.carritoGlobal[i] = n; 
    
    const el = document.getElementById(`cant-${safeId}`); if(el) el.innerText = n;
    
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
        window.activarSincronizacion(); window.verPagina('notificaciones');
    } catch (error) { console.error("Error batch:", error); alert("Ocurrió un error al procesar el pedido."); }
};

window.enviarEmailNotificacion = async (tipo, datos) => {
    if(typeof emailjs === 'undefined') return;
    try {
        let templateParams = { tipo_notificacion: tipo, admin_email: ADMIN_EMAIL, to_email: datos.target_email || ADMIN_EMAIL, usuario: datos.usuario || 'Sistema', sede: datos.sede || 'N/A', detalles: '' };

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

        await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, templateParams, EMAIL_PUBLIC_KEY);
    } catch (error) { console.error("Error EmailJS:", error); }
};

window.abrirModalFactura = () => {
    document.getElementById("fact-proveedor").value = "";
    document.getElementById("fact-gasto").value = "";
    document.getElementById("fact-fecha").value = "";
    document.getElementById("fact-archivo-url").value = "";
    document.getElementById("factura-file-name").innerText = "Ninguno";
    document.getElementById("modal-factura").classList.remove("hidden");
};

window.cerrarModalFactura = () => document.getElementById("modal-factura").classList.add("hidden");

window.guardarFactura = async () => {
    const prov = document.getElementById("fact-proveedor").value.trim();
    const gasto = parseFloat(document.getElementById("fact-gasto").value);
    const fecha = document.getElementById("fact-fecha").value;
    const archivoUrl = document.getElementById("fact-archivo-url").value;

    if(!prov || isNaN(gasto) || !fecha) return alert("Por favor complete todos los campos obligatorios.");

    try {
        await addDoc(collection(db, "facturas"), {
            proveedor: prov,
            gasto: gasto,
            fecha_compra: fecha,
            archivo_url: archivoUrl, 
            usuarioRegistro: window.usuarioActual.id,
            timestamp: Date.now(),
            fecha_registro: new Date().toLocaleString()
        });
        alert("✅ Factura registrada exitosamente.");
        window.cerrarModalFactura();
    } catch(e) {
        console.error("Error facturas: ", e);
        alert("Ocurrió un error al guardar la factura.");
    }
};

window.agregarProductoRapido = async () => {
    const nombre = document.getElementById("nombre-prod").value.trim().toUpperCase();
    const cantidad = parseInt(document.getElementById("cantidad-prod").value);

    if (nombre && cantidad > 0) {
        const id = nombre.toLowerCase(); const ref = doc(db, "inventario", id); const snap = await getDoc(ref);

        if (snap.exists()) { await updateDoc(ref, { cantidad: snap.data().cantidad + cantidad }); alert(`✅ Stock actualizado: ${nombre}`); } 
        else { if(confirm(`"${nombre}" no existe. ¿Crear nuevo?`)) { await setDoc(ref, { cantidad: cantidad }); alert(`✅ Producto creado: ${nombre}`); } else return; }
        
        await addDoc(collection(db, "entradas_stock"), { insumo: nombre, cantidad: cantidad, usuario: window.usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() });
        
        window.cerrarModalInsumo(); document.getElementById("nombre-prod").value=""; document.getElementById("cantidad-prod").value="";
    } else alert("Datos inválidos.");
};

window.abrirModalGrupo = (bKey) => {
    const m = document.getElementById("modal-grupo-admin"), c = document.getElementById("modal-grupo-contenido"), t = document.getElementById("modal-grupo-titulo");
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
            
            await updateDoc(pRef, { 
                estado: "aprobado", 
                cantidad: val, 
                entregado_por: window.usuarioActual.id,
                fecha_aprobado: new Date().toLocaleString(), 
                timestamp_aprobado: Date.now() 
            });
            
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

// --- 7. EXCEL PRO CON FILTROS DE FECHA ---
function calcularTiempo(inicio, fin) {
    if(!inicio || !fin) return "N/A";
    const diffMs = fin - inicio; if(diffMs < 0) return "N/A";
    const diffMins = Math.round(diffMs / 60000); if(diffMins < 60) return `${diffMins} min`;
    const diffHrs = (diffMins / 60).toFixed(1); if(diffHrs < 24) return `${diffHrs} hrs`;
    return `${(diffHrs / 24).toFixed(1)} días`;
}

window.descargarReporte = async () => {
    if(typeof XLSX === 'undefined') return alert("La librería Excel aún no ha cargado, intente en un segundo.");
    
    const inputDesde = document.getElementById("rep-desde")?.value;
    const inputHasta = document.getElementById("rep-hasta")?.value;
    
    let tDesde = 0;
    let tHasta = Infinity;

    if(inputDesde) tDesde = new Date(inputDesde + 'T00:00:00').getTime();
    if(inputHasta) tHasta = new Date(inputHasta + 'T23:59:59').getTime();

    const msgFiltro = (inputDesde || inputHasta) ? `\n\nSe filtrarán los datos del rango seleccionado.` : `\n\nSe exportará TODO el historial.`;
    if(!confirm(`¿Descargar reporte en Excel? ${msgFiltro}`)) return;
    
    const [sSnap, eSnap, pSnap, uSnap, fSnap] = await Promise.all([
        getDocs(collection(db, "inventario")), getDocs(collection(db, "entradas_stock")),
        getDocs(collection(db, "pedidos")), getDocs(collection(db, "usuarios")), getDocs(collection(db, "facturas"))
    ]);
    
    const usersMap = {}; uSnap.forEach(u => { usersMap[u.id] = u.data(); });

    const obtenerMesAno = (timestamp) => {
        if(!timestamp) return 'N/A';
        const d = new Date(timestamp);
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${meses[d.getMonth()]} ${d.getFullYear()}`;
    };

    const stockData = [];
    sSnap.forEach(d => { 
        const x = d.data(); 
        stockData.push({ "Insumo": d.id.toUpperCase(), "Cantidad Disponible": x.cantidad || 0, "Stock Mínimo": x.stockMinimo || 0, "Precio Unit. ($)": x.precio || 0 }); 
    });

    const entradasData = eSnap.docs.map(x => x.data())
        .filter(mov => mov.timestamp >= tDesde && mov.timestamp <= tHasta)
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(mov => ({ 
            "Mes y Año": obtenerMesAno(mov.timestamp),
            "Fecha de Entrada": mov.fecha || 'N/A', 
            "Insumo": (mov.insumo || '').toUpperCase(), 
            "Cantidad Ingresada": mov.cantidad || 0, 
            "Usuario Responsable": (mov.usuario || '').toUpperCase() 
        }));

    const salidasData = pSnap.docs.map(x => x.data())
        .filter(mov => mov.timestamp >= tDesde && mov.timestamp <= tHasta)
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(mov => {
            const uId = mov.usuarioId || ''; const userObj = usersMap[uId] || {};
            return {
                "Mes y Año": obtenerMesAno(mov.timestamp),
                "ID Pedido": mov.batchId || 'N/A', 
                "Fecha Solicitud": mov.fecha_solicitud || mov.fecha || 'N/A', 
                "Prioridad": (mov.prioridad || 'NORMAL').toUpperCase(),
                "Insumo": (mov.insumoNom || '').toUpperCase(), 
                "Cant.": mov.cantidad || 0, 
                "Sede Destino": (mov.ubicacion || '').toUpperCase(), 
                "Usuario Solicitante": uId.toUpperCase(), 
                "Departamento": (userObj.departamento || 'N/A').toUpperCase(),
                "Entregado / Aprobado Por": (mov.entregado_por || 'N/A').toUpperCase(),
                "Estado Actual": (mov.estado || '').toUpperCase(),
                "Fecha Aprobación": mov.fecha_aprobado || 'N/A', 
                "Tiempo de Respuesta": calcularTiempo(mov.timestamp_solicitud || mov.timestamp, mov.timestamp_aprobado), 
                "Fecha Recepción": mov.fecha_recibido || 'N/A', 
                "Tiempo de Entrega": calcularTiempo(mov.timestamp_aprobado, mov.timestamp_recibido), 
                "Notas": mov.detalleIncidencia || ''
            };
        });

    const facturasData = fSnap.docs.map(x => x.data())
        .filter(f => f.timestamp >= tDesde && f.timestamp <= tHasta)
        .sort((a,b) => b.timestamp - a.timestamp)
        .map(f => ({
            "Mes y Año": obtenerMesAno(f.timestamp),
            "Fecha de Compra": f.fecha_compra || 'N/A', 
            "Proveedor": (f.proveedor || '').toUpperCase(), 
            "Gasto ($)": f.gasto || 0, 
            "Registrado Por": (f.usuarioRegistro || '').toUpperCase(), 
            "Documento URL": f.archivo_url || 'Sin documento',
            "Fecha Registro Sistema": f.fecha_registro || 'N/A'
        }));

    if(entradasData.length === 0 && salidasData.length === 0 && facturasData.length === 0) {
        alert("📊 No hay movimientos registrados en el rango de fechas seleccionado.");
        return;
    }

    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), "Inventario Actual"); 
    if(entradasData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entradasData), "Historial Entradas"); 
    if(salidasData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salidasData), "Historial Salidas");
    if(facturasData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(facturasData), "Registro Facturas");
    
    let nombreArchivo = `Reporte_FCILog_${new Date().toISOString().slice(0, 10)}.xlsx`;
    if(inputDesde || inputHasta) {
        nombreArchivo = `Reporte_FCILog_Filtrado_${inputDesde||'Inicio'}_a_${inputHasta||'Hoy'}.xlsx`;
    }

    XLSX.writeFile(wb, nombreArchivo);
};

// --- 8. USUARIOS Y DOM ---
window.guardarUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase(); const p = document.getElementById("new-pass").value.trim(); const e = document.getElementById("new-email").value.trim(); const d = document.getElementById("new-dept").value.trim().toUpperCase(); const r = document.getElementById("new-role").value; 
    if(!id||!p) return alert("Faltan datos obligatorios."); 
    await setDoc(doc(db,"usuarios",id),{pass:p,rol:r,email:e,departamento:d},{merge:true}); 
    alert("Usuario guardado."); window.cancelarEdicionUsuario();
};
window.prepararEdicionUsuario = (i,p,r,e,d) => { document.getElementById("edit-mode-id").value = i; const u = document.getElementById("new-user"); u.value = i; u.disabled = true; document.getElementById("new-pass").value = p; document.getElementById("new-email").value = e||""; document.getElementById("new-dept").value = d||""; document.getElementById("new-role").value = r; document.getElementById("btn-guardar-usuario").innerText = "Actualizar"; document.getElementById("cancel-edit-msg").classList.remove("hidden"); };
window.cancelarEdicionUsuario = () => { document.getElementById("edit-mode-id").value = ""; const u = document.getElementById("new-user"); u.value = ""; u.disabled = false; document.getElementById("new-pass").value = ""; document.getElementById("new-email").value = ""; document.getElementById("new-dept").value = ""; document.getElementById("btn-guardar-usuario").innerText = "Guardar Usuario"; document.getElementById("cancel-edit-msg").classList.add("hidden"); };
window.prepararEdicionProducto = async(id) => { const s = await getDoc(doc(db,"inventario",id)); if(!s.exists()) return; const d = s.data(); document.getElementById('edit-prod-id').value = id; document.getElementById('edit-prod-precio').value = d.precio||''; document.getElementById('edit-prod-min').value = d.stockMinimo||''; document.getElementById('edit-prod-img').value = d.imagen||''; const preview = document.getElementById('preview-img'); if(d.imagen) { preview.src = d.imagen; preview.classList.remove('hidden'); } else { preview.classList.add('hidden'); } document.getElementById('modal-detalles').classList.remove('hidden'); };
window.guardarDetallesProducto = async () => { const id = document.getElementById('edit-prod-id').value; const p = parseFloat(document.getElementById('edit-prod-precio').value)||0; const m = parseInt(document.getElementById('edit-prod-min').value)||0; const i = document.getElementById('edit-prod-img').value; await updateDoc(doc(db,"inventario",id),{precio:p,stockMinimo:m,imagen:i}); window.cerrarModalDetalles(); alert("Guardado"); };
window.abrirModalInsumo = () => { const m = document.getElementById("modal-insumo"); if(m) m.classList.remove("hidden"); };
window.cerrarModalInsumo = () => { const m = document.getElementById("modal-insumo"); if(m) m.classList.add("hidden"); };
window.cerrarModalDetalles = () => { const m = document.getElementById("modal-detalles"); if(m) m.classList.add("hidden"); const img = document.getElementById('preview-img'); if(img) img.classList.add('hidden');};
window.eliminarDato = async (c,i) => { if(confirm("¿Eliminar registro permanentemente?")) await deleteDoc(doc(db,c,i)); };
window.renderChart = (id, l, d, t, c, i, s) => { const x = document.getElementById(id); if(!x) return; if(i) i.destroy(); s(new Chart(x, { type: id === 'locationChart' ? 'doughnut' : 'bar', data: { labels: l, datasets: [{ label: t, data: d, backgroundColor: c, borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: id === 'locationChart', position: 'bottom' } } } })); };

window.abrirModalEditarEntrada = (idEntrada, insumo, cantidadActual) => { document.getElementById('edit-entrada-id').value = idEntrada; document.getElementById('edit-entrada-insumo').value = insumo; document.getElementById('edit-entrada-insumo-display').value = insumo; document.getElementById('edit-entrada-cant-original').value = cantidadActual; document.getElementById('edit-entrada-cantidad').value = cantidadActual; document.getElementById('edit-entrada-motivo').value = ""; document.getElementById('modal-editar-entrada').classList.remove('hidden'); };
window.guardarEdicionEntrada = async () => {
    const idEntrada = document.getElementById('edit-entrada-id').value; const insumo = document.getElementById('edit-entrada-insumo').value.toLowerCase(); const cantOriginal = parseInt(document.getElementById('edit-entrada-cant-original').value); const cantNueva = parseInt(document.getElementById('edit-entrada-cantidad').value); const motivo = document.getElementById('edit-entrada-motivo').value.trim();
    if (isNaN(cantNueva) || cantNueva < 0) return alert("Ingrese una cantidad válida mayor o igual a 0."); if (!motivo) return alert("Debe ingresar el motivo de la corrección.");
    const diferencia = cantNueva - cantOriginal; if (diferencia === 0) { document.getElementById('modal-editar-entrada').classList.add('hidden'); return; }
    try {
        const invRef = doc(db, "inventario", insumo); const invSnap = await getDoc(invRef); if (!invSnap.exists()) return alert("El insumo ya no existe.");
        const nuevoStock = invSnap.data().cantidad + diferencia; if (nuevoStock < 0) return alert(`❌ Error matemático: El stock quedaría en negativo.`);
        await updateDoc(invRef, { cantidad: nuevoStock }); await updateDoc(doc(db, "entradas_stock", idEntrada), { cantidad: cantNueva, motivo_edicion: motivo, editado_por: window.usuarioActual.id, fecha_edicion: new Date().toLocaleString() });
        alert("✅ Entrada corregida."); document.getElementById('modal-editar-entrada').classList.add('hidden');
    } catch(e) { console.error("Error al corregir entrada: ", e); alert("Ocurrió un error."); }
};

// --- 9. INICIALIZACIÓN ---
const inicializarApp = () => {
    try {
        if(typeof emailjs !== "undefined") emailjs.init("2jVnfkJKKG0bpKN-U");
        const sesion = localStorage.getItem("fcilog_session"); if(sesion) window.cargarSesion(JSON.parse(sesion));
        
        if (typeof cloudinary !== "undefined") {
            // Widget para Insumos (Imágenes)
            window.cloudinaryWidget = cloudinary.createUploadWidget({cloudName: 'df79cjklp', uploadPreset: 'insumos', sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos'}, (error, result) => { if (!error && result && result.event === "success") { document.getElementById('edit-prod-img').value = result.info.secure_url; const preview = document.getElementById('preview-img'); preview.src = result.info.secure_url; preview.classList.remove('hidden'); } });
            const btnUpload = document.getElementById("upload_widget"); if(btnUpload) { const newBtn = btnUpload.cloneNode(true); btnUpload.parentNode.replaceChild(newBtn, btnUpload); newBtn.addEventListener("click", (e) => { e.preventDefault(); if(window.cloudinaryWidget) window.cloudinaryWidget.open(); }, false); }

            // Widget para Facturas (Documentos, PDFs, Imágenes, etc sin restricción de formato)
            window.cloudinaryFacturasWidget = cloudinary.createUploadWidget({
                cloudName: 'df79cjklp', 
                uploadPreset: 'insumos', 
                sources: ['local'], 
                multiple: false, 
                folder: 'fcilog_facturas',
                resourceType: 'auto' // Esto permite que Cloudinary detecte automáticamente si es PDF, Word, Excel, etc.
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
    } catch(e) { console.error("Error App:", e); }
};
window.addEventListener('DOMContentLoaded', inicializarApp);

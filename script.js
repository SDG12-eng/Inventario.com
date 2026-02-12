import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN ---
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

// CLOUDINARY
const CLOUD_NAME = 'df79cjklp'; 
const UPLOAD_PRESET = 'insumos'; 

// EMAILJS
const EMAIL_SERVICE_ID = 'service_a7yozqh'; 
const EMAIL_TEMPLATE_ID = 'template_mlcofoo'; 
const EMAIL_PUBLIC_KEY = '2jVnfkJKKG0bpKN-U'; 
const ADMIN_EMAIL = 'archivos@fcipty.com'; 

// INICIALIZAR APP
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// VARIABLES GLOBALES
let usuarioActual = null;
let stockChart = null;
let locationChart = null;
let carritoGlobal = {};
let cloudinaryWidget = null;

// CACHÉS DE DATOS (Para optimizar filtrado y agrupación)
let cacheInventario = [];
let cachePedidos = [];
let cacheEntradas = [];

// INICIALIZAR EMAILJS
emailjs.init(EMAIL_PUBLIC_KEY);

// --- 2. INICIO Y SESIÓN ---
window.addEventListener('DOMContentLoaded', () => {
    const sesion = localStorage.getItem("fcilog_session");
    if (sesion) cargarSesion(JSON.parse(sesion));
    setupCloudinary();
});

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    
    // UI Switch
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    
    // Info Usuario Sidebar
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) infoDiv.innerHTML = `
        <div class="flex flex-col items-center">
            <div class="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2">
                <i class="fas fa-user"></i>
            </div>
            <span class="font-bold text-slate-700 uppercase tracking-wide">${datos.id}</span>
            <span class="text-[10px] uppercase font-bold text-white bg-indigo-500 px-2 py-0.5 rounded-full mt-1 shadow-sm shadow-indigo-200">${datos.rol}</span>
        </div>`;

    // Permisos de Botón Stock
    if(['admin','manager'].includes(datos.rol)) {
        document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    }

    configurarMenu();
    
    // Redirección inicial según rol
    let paginaInicio = 'stock'; // Por defecto
    if(['admin','manager','supervisor'].includes(datos.rol)) paginaInicio = 'stats';
    
    window.verPagina(paginaInicio);
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if(!user || !pass) return alert("Por favor ingrese usuario y contraseña.");
    
    // Backdoor Admin
    if (user === "admin" && pass === "1130") { 
        cargarSesion({ id: "admin", rol: "admin" }); 
        return; 
    }
    
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else {
            alert("Credenciales incorrectas.");
        }
    } catch (e) { 
        console.error(e);
        alert("Error de conexión. Verifique su internet."); 
    }
};

window.cerrarSesion = () => { 
    localStorage.removeItem("fcilog_session"); 
    location.reload(); 
};

// --- 3. NAVEGACIÓN Y MENÚ ---
window.verPagina = (id) => {
    // Ocultar todas las vistas
    document.querySelectorAll(".view").forEach(v => {
        v.classList.add("hidden"); 
        v.classList.remove("animate-fade-in");
    });
    
    // Mostrar la seleccionada
    const target = document.getElementById(`pag-${id}`);
    if(target) { 
        target.classList.remove("hidden"); 
        setTimeout(() => target.classList.add("animate-fade-in"), 10); 
    }
    
    // Cerrar menú móvil si está abierto
    if(window.innerWidth < 768) window.toggleMenu(false);
};

window.toggleMenu = (forceState) => {
    const sb = document.getElementById("sidebar");
    const ov = document.getElementById("sidebar-overlay");
    const isClosed = sb.classList.contains("-translate-x-full");
    const shouldOpen = forceState !== undefined ? forceState : isClosed;

    if (shouldOpen) {
        sb.classList.remove("-translate-x-full");
        ov.classList.remove("hidden");
        // Forzar z-index alto
        sb.style.zIndex = "100";
        ov.style.zIndex = "90";
    } else {
        sb.classList.add("-translate-x-full");
        ov.classList.add("hidden");
    }
};

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');
    
    const btnA = document.getElementById('tab-btn-activos');
    const btnH = document.getElementById('tab-btn-historial');
    
    const activeClass = "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all bg-white text-indigo-600 shadow-sm";
    const inactiveClass = "flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-500 hover:text-slate-700 transition-all";

    if(tab === 'activos') { 
        btnA.className = activeClass; 
        btnH.className = inactiveClass; 
    } else { 
        btnH.className = activeClass; 
        btnA.className = inactiveClass; 
    }
};

function configurarMenu() {
    const rol = usuarioActual.rol;
    const menu = document.getElementById("menu-dinamico");
    
    const items = { 
        st:{id:'stats',n:'Dashboard',i:'chart-pie'}, 
        sk:{id:'stock',n:'Stock',i:'boxes'}, 
        pd:{id:'solicitar',n:'Realizar Pedido',i:'cart-plus'}, 
        pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, 
        hs:{id:'historial',n:'Historial',i:'history'}, 
        us:{id:'usuarios',n:'Accesos',i:'users-cog'}, 
        mp:{id:'notificaciones',n:'Mis Solicitudes',i:'shipping-fast'} 
    };
    
    let rutas = [];
    if(rol==='admin') rutas=[items.st, items.sk, items.pd, items.pe, items.hs, items.us, items.mp]; 
    else if(rol==='manager'||rol==='supervisor') rutas=[items.st, items.sk, items.pd, items.pe, items.hs, items.mp]; 
    else rutas=[items.sk, items.pd, items.mp];
    
    menu.innerHTML = rutas.map(x => `
        <button onclick="verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group">
            <div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors">
                <i class="fas fa-${x.i}"></i>
            </div>
            ${x.n}
        </button>`).join('');
}

// --- 4. NOTIFICACIONES (AGRUPADAS) ---
async function enviarNotificacionGrupo(tipo, datos) {
    let config = { 
        to_email: datos.target_email || ADMIN_EMAIL, 
        asunto: "", 
        titulo_principal: "", 
        mensaje_cuerpo: "", 
        fecha: new Date().toLocaleString() 
    };
    
    const lista = datos.items ? datos.items.map(i => `• ${i.insumo.toUpperCase()} (x${i.cantidad})`).join('\n') : "";

    switch (tipo) {
        case 'nuevo_pedido':
            config.asunto = `📦 Nuevo Pedido: ${datos.usuario}`;
            config.titulo_principal = "🚀 Solicitud Recibida";
            config.mensaje_cuerpo = `El usuario ${datos.usuario} ha solicitado:\n\n${lista}\n\n📍 Sede: ${datos.sede}\n\nIngresa al sistema para aprobar.`;
            break;
        case 'aprobado_parcial':
            config.asunto = `✅ Pedido Aprobado`;
            config.titulo_principal = "Solicitud Aprobada";
            config.mensaje_cuerpo = `Hola ${datos.usuario},\n\nTu pedido de:\n\n${lista}\n\nHa sido APROBADO. El despacho está en proceso.`;
            break;
        case 'stock_bajo':
            config.asunto = `⚠️ ALERTA STOCK: ${datos.insumo}`;
            config.titulo_principal = "Nivel de Stock Crítico";
            config.mensaje_cuerpo = `El insumo ${datos.insumo} ha bajado de su mínimo.\n\nStock Actual: ${datos.actual}\nMínimo: ${datos.minimo}`;
            break;
        case 'recibido':
            config.asunto = `🔵 Entrega Confirmada - ${datos.sede}`;
            config.titulo_principal = "Recepción Exitosa";
            config.mensaje_cuerpo = `El usuario ${datos.usuario} confirmó la recepción de:\n\n${lista}`;
            break;
    }

    try { 
        await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, { 
            asunto: config.asunto, 
            titulo_principal: config.titulo_principal, 
            mensaje_cuerpo: config.mensaje_cuerpo, 
            to_email: config.to_email, 
            fecha: config.fecha 
        }); 
        console.log("Email enviado:", tipo);
    } catch (e) { 
        console.error("Error EmailJS:", e); 
    }
}

// --- 5. SINCRONIZACIÓN Y LÓGICA CORE ---
function activarSincronizacion() {
    
    // A) INVENTARIO (Llena el Grid y el Datalist del Modal)
    onSnapshot(collection(db, "inventario"), snap => {
        cacheInventario = [];
        const grid = document.getElementById("lista-inventario");
        const cartContainer = document.getElementById("contenedor-lista-pedidos");
        const dataList = document.getElementById("lista-sugerencias");
        
        if(grid) grid.innerHTML=""; 
        if(cartContainer) cartContainer.innerHTML=""; 
        if(dataList) dataList.innerHTML="";
        
        let totalRefs=0, totalStock=0;
        let labels=[], dataStock=[];

        snap.forEach(ds => {
            const p = ds.data(); 
            const nombre = ds.id.toUpperCase();
            cacheInventario.push({id: ds.id, ...p});
            
            totalRefs++; 
            totalStock += p.cantidad;
            labels.push(nombre.substring(0, 10));
            dataStock.push(p.cantidad);

            // 1. Llenar Datalist (Para evitar duplicados en entrada)
            if(dataList) dataList.innerHTML += `<option value="${nombre}">`;

            // 2. Render Grid
            const isAdmin = ['admin','manager'].includes(usuarioActual.rol);
            const controls = isAdmin ? `
                <div class="flex gap-2">
                    <button onclick="prepararEdicionProducto('${ds.id}')" class="text-slate-300 hover:text-indigo-500 transition"><i class="fas fa-cog"></i></button>
                    <button onclick="eliminarDato('inventario','${ds.id}')" class="text-slate-300 hover:text-red-400 transition"><i class="fas fa-trash"></i></button>
                </div>` : '';
            
            const img = p.imagen ? `<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border border-slate-100 mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const isLow = (p.stockMinimo && p.cantidad <= p.stockMinimo);
            const borderClass = isLow ? "border-2 border-red-500 bg-red-50" : "border border-slate-100 bg-white";
            const priceHtml = p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : '';
            const alertIcon = isLow ? `<i class="fas fa-exclamation-circle text-red-500 animate-pulse ml-1" title="Stock Bajo"></i>` : '';

            if(grid) {
                grid.innerHTML += `
                <div class="${borderClass} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col group">
                    <div class="flex justify-between items-start">${img}${controls}</div>
                    <h4 class="font-bold text-slate-700 text-xs truncate uppercase" title="${nombre}">${nombre} ${alertIcon}</h4>
                    <div class="flex justify-between items-end mt-1">
                        <div>
                            <p class="text-2xl font-black text-slate-800 leading-none">${p.cantidad}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase">Unidades</p>
                        </div>
                        ${priceHtml}
                    </div>
                </div>`;
            }

            // 3. Render Carrito
            if(cartContainer && p.cantidad > 0) {
                const enCarro = carritoGlobal[ds.id] || 0;
                const activeStyle = enCarro > 0 ? "border-indigo-500 bg-indigo-50/50" : "border-slate-100 bg-white";
                
                cartContainer.innerHTML += `
                <div id="row-${ds.id}" class="flex items-center justify-between p-3 rounded-xl border ${activeStyle} transition-all shadow-sm">
                    <div class="flex items-center gap-3 overflow-hidden">
                        ${p.imagen ? `<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">` : ''}
                        <div class="truncate">
                            <p class="font-bold text-xs uppercase text-slate-700 truncate">${nombre}</p>
                            <p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-100 flex-shrink-0">
                        <button onclick="ajustarCantidad('${ds.id}', -1)" class="w-7 h-7 rounded-md bg-slate-50 hover:bg-slate-200 text-slate-600 font-bold">-</button>
                        <span id="cant-${ds.id}" class="w-6 text-center font-bold text-indigo-600 text-sm">${enCarro}</span>
                        <button onclick="ajustarCantidad('${ds.id}', 1)" class="w-7 h-7 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold" ${enCarro >= p.cantidad ? 'disabled' : ''}>+</button>
                    </div>
                </div>`;
            }
        });

        // Actualizar Dashboard Stats
        if(document.getElementById("metrica-total")) document.getElementById("metrica-total").innerText = totalRefs;
        if(document.getElementById("metrica-stock")) document.getElementById("metrica-stock").innerText = totalStock;
        
        renderChart('stockChart', labels, dataStock, 'Stock', '#6366f1', stockChart, c => stockChart = c);
    });

    // B) PEDIDOS (AGRUPACIÓN Y TABS)
    onSnapshot(collection(db,"pedidos"), s => {
        cachePedidos = [];
        let grupos = {}; 
        let pendingCount = 0;
        let sedesCount = {};

        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lActive = document.getElementById("tab-content-activos");
        const lHistory = document.getElementById("tab-content-historial");

        if(lAdmin) lAdmin.innerHTML=""; 
        if(lActive) lActive.innerHTML=""; 
        if(lHistory) lHistory.innerHTML="";

        s.forEach(ds => {
            const p = ds.data(); 
            p.id = ds.id; 
            cachePedidos.push(p);

            // Contar sedes para gráfico
            if(p.estado !== 'rechazado') {
                sedesCount[p.ubicacion] = (sedesCount[p.ubicacion] || 0) + p.cantidad;
            }

            // Agrupar por BatchID
            const bKey = p.batchId || p.timestamp;
            if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp };
            grupos[bKey].items.push(p);

            if(p.estado === 'pendiente') pendingCount++;

            // --- VISTA USUARIO (TABS) ---
            if(p.usuarioId === usuarioActual.id) {
                let btns = "";
                let cardHtml = "";

                // Acciones según estado
                if(p.estado === 'aprobado') {
                    btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end gap-2">
                        <button onclick="confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-emerald-600 transition">Confirmar Recibido</button>
                        <button onclick="abrirIncidencia('${p.id}')" class="bg-white border border-red-100 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 transition">Reportar</button>
                    </div>`;
                } else if(p.estado === 'recibido' || p.estado === 'devuelto') {
                    btns = `<div class="mt-3 pt-3 border-t border-slate-50 flex justify-end">
                        <button onclick="abrirIncidencia('${p.id}')" class="text-amber-500 text-xs font-bold hover:underline flex items-center gap-1"><i class="fas fa-undo"></i> Devolver / Reportar</button>
                    </div>`;
                }

                cardHtml = `
                <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="badge status-${p.estado}">${p.estado}</span>
                            <h4 class="font-black text-slate-700 uppercase text-sm mt-2">${p.insumoNom}</h4>
                            <p class="text-xs text-slate-400 font-mono mt-1">x${p.cantidad} • ${p.ubicacion}</p>
                        </div>
                    </div>
                    ${btns}
                </div>`;

                if(['pendiente', 'aprobado'].includes(p.estado)) {
                    if(lActive) lActive.innerHTML += cardHtml;
                } else {
                    if(lHistory) lHistory.innerHTML += cardHtml;
                }
            }
        });

        // --- VISTA ADMIN (GRUPOS) ---
        if(lAdmin && ['admin','manager','supervisor'].includes(usuarioActual.rol)) {
            Object.values(grupos).sort((a,b) => b.ts - a.ts).forEach(g => {
                const pendingItems = g.items.filter(i => i.estado === 'pendiente');
                if(pendingItems.length > 0) {
                    const itemsStr = pendingItems.map(i => `<span class="bg-slate-50 px-2 py-1 rounded text-[10px] border border-slate-200 uppercase font-bold text-slate-600">${i.insumoNom} (x${i.cantidad})</span>`).join('');
                    lAdmin.innerHTML += `
                    <div class="bg-white p-5 rounded-2xl border-l-4 border-l-amber-400 shadow-sm cursor-pointer hover:shadow-md transition group" onclick="abrirModalGrupo('${g.items[0].batchId || g.ts}')">
                        <div class="flex justify-between items-center mb-3">
                            <div>
                                <h4 class="font-black text-slate-800 text-sm uppercase"><i class="fas fa-user text-slate-300 mr-1"></i> ${g.user}</h4>
                                <span class="text-xs text-slate-400 font-medium">${g.sede} • ${g.date.split(',')[0]}</span>
                            </div>
                            <span class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition"><i class="fas fa-chevron-right text-xs"></i></span>
                        </div>
                        <div class="flex flex-wrap gap-1.5">${itemsStr}</div>
                    </div>`;
                }
            });
        }

        // Métricas y Gráficos
        if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pendingCount;
        renderChart('locationChart', Object.keys(sedesCount), Object.values(sedesCount), 'Sedes', '#10b981', locationChart, c => locationChart = c);
        
        renderHistorialUnificado();
    });

    // C) ENTRADAS (HISTORIAL)
    onSnapshot(collection(db,"entradas_stock"), s => {
        cacheEntradas = [];
        s.forEach(x => { const d = x.data(); d.id = x.id; cacheEntradas.push(d); });
        renderHistorialUnificado();
    });

    // D) USUARIOS (AHORA FUNCIONA)
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) { 
                l.innerHTML = "";
                snap.forEach(d => {
                    const u = d.data();
                    const id = d.id;
                    l.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm hover:shadow-md transition">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold uppercase text-slate-700">${id}</span>
                                <span class="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase font-bold">${u.rol}</span>
                            </div>
                            <span class="text-xs text-slate-400 block mt-1"><i class="fas fa-envelope text-[10px]"></i> ${u.email || 'Sin correo'}</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="prepararEdicionUsuario('${id}','${u.pass}','${u.rol}','${u.email||''}')" class="w-8 h-8 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-600 hover:text-white transition flex items-center justify-center"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="eliminarDato('usuarios','${id}')" class="w-8 h-8 rounded bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition flex items-center justify-center"><i class="fas fa-trash-alt text-xs"></i></button>
                        </div>
                    </div>`;
                });
            }
        });
    }
}

// --- 6. HISTORIAL UNIFICADO ---
function renderHistorialUnificado() {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    t.innerHTML = "";
    
    const entradasFmt = cacheEntradas.map(e => ({ fecha:e.fecha, ts:e.timestamp, tipo:'ENTRADA', insumo:e.insumo, cant:e.cantidad, det:`${e.usuario} (Stock)`, est:'completado' }));
    const salidasFmt = cachePedidos.map(p => ({ fecha:p.fecha, ts:p.timestamp, tipo:'SALIDA', insumo:p.insumoNom, cant:p.cantidad, det:`${p.usuarioId} (${p.ubicacion})`, est:p.estado }));
    
    const all = [...entradasFmt, ...salidasFmt].sort((a,b) => b.ts - a.ts);

    all.forEach(h => {
        const icon = h.tipo==='ENTRADA' ? '<i class="fas fa-arrow-down text-emerald-500"></i>' : '<i class="fas fa-arrow-up text-amber-500"></i>';
        t.innerHTML += `
        <tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0 transition">
            <td class="p-3 text-slate-400 text-[10px] font-mono whitespace-nowrap">${h.fecha.split(',')[0]}</td>
            <td class="p-3 text-xs font-bold text-slate-600">${icon} ${h.tipo}</td>
            <td class="p-3 font-bold text-slate-700 uppercase text-xs">${h.insumo}</td>
            <td class="p-3 text-sm font-bold text-slate-800 text-center">${h.cant}</td>
            <td class="p-3 text-xs text-slate-500 uppercase">${h.det}</td>
            <td class="p-3"><span class="badge status-${h.est}">${h.est}</span></td>
        </tr>`;
    });
}

// --- 7. MODALES Y GESTIÓN ---

// Entrada Rápida (Stock)
window.agregarProductoRápido = async () => {
    const nombre = document.getElementById("nombre-prod").value.trim().toUpperCase();
    const cantidad = parseInt(document.getElementById("cantidad-prod").value);

    if (nombre && cantidad > 0) {
        const id = nombre.toLowerCase();
        const ref = doc(db, "inventario", id);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            await updateDoc(ref, { cantidad: snap.data().cantidad + cantidad });
            alert(`✅ Stock actualizado: ${nombre} (+${cantidad})`);
        } else {
            if(confirm(`"${nombre}" no existe. ¿Crear nuevo?`)) {
                await setDoc(ref, { cantidad: cantidad });
                alert(`✅ Producto creado: ${nombre}`);
            } else return;
        }
        
        await addDoc(collection(db, "entradas_stock"), { insumo: nombre, cantidad: cantidad, usuario: usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() });
        cerrarModalInsumo(); 
        document.getElementById("nombre-prod").value=""; 
        document.getElementById("cantidad-prod").value="";
    } else alert("Datos inválidos.");
};

// Modal Grupo (Admin)
window.abrirModalGrupo = (bKey) => {
    const m = document.getElementById("modal-grupo-admin");
    const c = document.getElementById("modal-grupo-contenido");
    const t = document.getElementById("modal-grupo-titulo");
    
    // Filtrar items del lote
    const items = cachePedidos.filter(p => (p.batchId === bKey) || (p.timestamp.toString() === bKey));
    if(items.length === 0) return;
    
    t.innerHTML = `${items[0].usuarioId.toUpperCase()} | ${items[0].ubicacion} | ${items[0].fecha}`; 
    c.innerHTML = "";
    
    items.forEach(p => {
        let act = `<span class="badge status-${p.estado}">${p.estado}</span>`;
        if(p.estado === 'pendiente' && usuarioActual.rol !== 'supervisor') {
            act = `
            <div class="flex gap-2 items-center">
                <input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border border-slate-200 rounded text-center p-1 font-bold text-slate-700 focus:outline-none focus:border-indigo-500">
                <button onclick="gestionarPedido('${p.id}','aprobar','${p.insumoNom}')" class="text-white bg-emerald-500 hover:bg-emerald-600 p-1.5 rounded shadow transition"><i class="fas fa-check"></i></button>
                <button onclick="gestionarPedido('${p.id}','rechazar')" class="text-slate-400 border border-slate-200 p-1.5 rounded hover:bg-red-50 hover:text-red-500 transition"><i class="fas fa-times"></i></button>
            </div>`;
        }
        c.innerHTML += `
        <div class="flex justify-between items-center p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition rounded-lg">
            <div>
                <b class="uppercase text-sm text-slate-700">${p.insumoNom}</b>
                <br>
                <span class="text-xs text-slate-400">Solicitado: ${p.cantidad}</span>
            </div>
            ${act}
        </div>`;
    });
    m.classList.remove("hidden");
};

// Gestión Pedidos
window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid);
    const pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return;
    const pData = pSnap.data();
    
    let emailSolicitante = ""; 
    try {
        const u = await getDoc(doc(db, "usuarios", pData.usuarioId)); 
        if(u.exists()) emailSolicitante = u.data().email;
    } catch(e){}

    if(accion === 'aprobar') {
        const inp = document.getElementById(`qty-${pid}`);
        const val = inp ? parseInt(inp.value) : pData.cantidad;
        
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        
        if(iSnap.exists() && iSnap.data().cantidad >= val) {
            const newStock = iSnap.data().cantidad - val;
            await updateDoc(iRef, { cantidad: newStock });
            await updateDoc(pRef, { estado: "aprobado", cantidad: val });
            
            if(emailSolicitante) enviarNotificacionGrupo('aprobado_parcial', { usuario: pData.usuarioId, items: [{insumo:ins, cantidad:val}], target_email: emailSolicitante });
            if (newStock <= (iSnap.data().stockMinimo || 0)) enviarNotificacionGrupo('stock_bajo', { insumo: ins, actual: newStock, minimo: iSnap.data().stockMinimo });
            
            // Refrescar modal
            const pendientes = cachePedidos.filter(p => (p.batchId === pData.batchId) && p.estado === 'pendiente' && p.id !== pid);
            if(pendientes.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden");
            else window.abrirModalGrupo(pData.batchId); 

        } else alert("Stock insuficiente.");
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        window.abrirModalGrupo(pData.batchId);
    }
};

window.confirmarRecibido = async (pid) => { 
    if(confirm("¿Confirmar recepción?")) {
        const pRef = doc(db, "pedidos", pid);
        const snap = await getDoc(pRef);
        await updateDoc(pRef, { estado: "recibido" });
        if(snap.exists()) enviarNotificacionGrupo('recibido', {usuario:usuarioActual.id, items:[{insumo:snap.data().insumoNom, cantidad:snap.data().cantidad}], sede:snap.data().ubicacion});
    }
};

// --- UTILIDADES VARIAS ---
window.ajustarCantidad = (i,d) => {
    const n = Math.max(0, (carritoGlobal[i]||0) + d); 
    carritoGlobal[i] = n; 
    const el = document.getElementById(`cant-${i}`);
    if(el) el.innerText = n;
    document.getElementById(`row-${i}`).classList.toggle("border-indigo-500", n > 0);
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    
    if(!ubi || items.length === 0) return alert("Seleccione sede y productos.");
    
    const batchId = Date.now().toString(); 
    const itemsData = items.map(([ins, cant]) => ({ insumo: ins, cantidad: cant }));
    
    await Promise.all(items.map(async ([ins, cant]) => {
        await addDoc(collection(db, "pedidos"), { 
            usuarioId: usuarioActual.id, 
            insumoNom: ins, 
            cantidad: cant, 
            ubicacion: ubi, 
            estado: "pendiente", 
            fecha: new Date().toLocaleString(), 
            timestamp: Date.now(), 
            batchId: batchId 
        });
    }));
    
    enviarNotificacionGrupo('nuevo_pedido', { usuario: usuarioActual.id, sede: ubi, items: itemsData });
    alert("✅ Solicitud enviada."); 
    carritoGlobal = {}; 
    document.getElementById("sol-ubicacion").value=""; 
    activarSincronizacion(); 
    window.verPagina('notificaciones');
};

// Edición Productos
window.prepararEdicionProducto = async (id) => {
    const s = await getDoc(doc(db,"inventario",id)); 
    if(!s.exists()) return; 
    const d = s.data();
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('edit-prod-precio').value = d.precio || '';
    document.getElementById('edit-prod-min').value = d.stockMinimo || '';
    document.getElementById('edit-prod-img').value = d.imagen || '';
    
    const preview = document.getElementById('preview-img');
    if(d.imagen) { preview.src = d.imagen; preview.classList.remove('hidden'); }
    else { preview.classList.add('hidden'); }
    
    document.getElementById('modal-detalles').classList.remove('hidden');
};

window.guardarDetallesProducto = async () => {
    const id = document.getElementById('edit-prod-id').value;
    const p = parseFloat(document.getElementById('edit-prod-precio').value) || 0;
    const m = parseInt(document.getElementById('edit-prod-min').value) || 0;
    const i = document.getElementById('edit-prod-img').value;
    await updateDoc(doc(db,"inventario",id), { precio:p, stockMinimo:m, imagen:i });
    cerrarModalDetalles(); 
    alert("Detalles guardados.");
};

// Gestión Usuarios
window.guardarUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const p = document.getElementById("new-pass").value.trim();
    const e = document.getElementById("new-email").value.trim();
    const r = document.getElementById("new-role").value;
    if(!id || !p) return alert("Faltan datos obligatorios.");
    await setDoc(doc(db, "usuarios", id), { pass:p, rol:r, email:e }, { merge: true });
    alert("Usuario guardado."); 
    cancelarEdicionUsuario();
};

window.prepararEdicionUsuario = (i, p, r, e) => {
    document.getElementById("edit-mode-id").value = i;
    document.getElementById("new-user").value = i;
    document.getElementById("new-user").disabled = true;
    document.getElementById("new-pass").value = p;
    document.getElementById("new-email").value = e || "";
    document.getElementById("new-role").value = r;
    document.getElementById("btn-guardar-usuario").innerText = "Actualizar Usuario";
    document.getElementById("cancel-edit-msg").classList.remove("hidden");
};

window.cancelarEdicionUsuario = () => {
    document.getElementById("edit-mode-id").value = "";
    document.getElementById("new-user").value = "";
    document.getElementById("new-user").disabled = false;
    document.getElementById("new-pass").value = "";
    document.getElementById("new-email").value = "";
    document.getElementById("btn-guardar-usuario").innerText = "Guardar Usuario";
    document.getElementById("cancel-edit-msg").classList.add("hidden");
};

// Modales UI
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.cerrarModalDetalles = () => {
    document.getElementById("modal-detalles").classList.add("hidden");
    document.getElementById('preview-img').classList.add('hidden');
};
window.eliminarDato = async (c, i) => { if(confirm("¿Eliminar permanentemente?")) await deleteDoc(doc(db, c, i)); };

window.abrirIncidencia = (pid) => {
    document.getElementById('incidencia-pid').value = pid;
    document.getElementById('incidencia-detalle').value = "";
    document.getElementById('modal-incidencia').classList.remove('hidden');
};

window.confirmarIncidencia = async (dev) => {
    const pid = document.getElementById('incidencia-pid').value;
    const det = document.getElementById('incidencia-detalle').value.trim();
    if(!det) return alert("Describa el motivo.");
    
    const pRef = doc(db, "pedidos", pid);
    const pData = (await getDoc(pRef)).data();
    
    if(dev) {
        const iRef = doc(db, "inventario", pData.insumoNom.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists()) await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad });
    }
    await updateDoc(pRef, { estado: dev ? "devuelto" : "con_incidencia", detalleIncidencia: det });
    document.getElementById('modal-incidencia').classList.add('hidden');
    alert("Incidencia registrada.");
};

// EXCEL
window.descargarReporte = async () => {
    if(!confirm("¿Descargar Excel?")) return;
    const [s, e, p] = await Promise.all([
        getDocs(collection(db, "inventario")),
        getDocs(collection(db, "entradas_stock")),
        getDocs(collection(db, "pedidos"))
    ]);
    
    let h = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body>`;
    
    // TABLA STOCK
    h += `<h2>STOCK ACTUAL</h2><table border="1"><thead><tr style="background:#ddd"><th>INSUMO</th><th>CANTIDAD</th><th>PRECIO</th><th>MINIMO</th></tr></thead><tbody>`;
    s.forEach(d => { const x = d.data(); h += `<tr><td>${d.id}</td><td>${x.cantidad}</td><td>${x.precio||0}</td><td>${x.stockMinimo||0}</td></tr>`; });
    h += `</tbody></table>`;
    
    // TABLA MOVIMIENTOS
    h += `<h2>HISTORIAL DE MOVIMIENTOS</h2><table border="1"><thead><tr style="background:#ddd"><th>FECHA</th><th>TIPO</th><th>INSUMO</th><th>CANTIDAD</th><th>DETALLE</th><th>ESTADO</th></tr></thead><tbody>`;
    
    const movs = [];
    e.forEach(d => movs.push({ ...d.data(), tipo: 'ENTRADA' }));
    p.forEach(d => movs.push({ ...d.data(), tipo: 'SALIDA' }));
    
    movs.sort((a,b) => b.timestamp - a.timestamp).forEach(m => {
        const color = m.tipo === 'ENTRADA' ? '#d1fae5' : '#fffbeb';
        h += `<tr style="background:${color}"><td>${m.fecha}</td><td>${m.tipo}</td><td>${m.insumo || m.insumoNom}</td><td>${m.cantidad}</td><td>${m.usuario || m.ubicacion}</td><td>${m.estado || 'completado'}</td></tr>`;
    });
    h += `</tbody></table></body></html>`;
    
    const b = new Blob([h], { type: 'application/vnd.ms-excel' });
    const l = document.createElement("a");
    l.href = URL.createObjectURL(b);
    l.download = `FCI_Reporte_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(l);
    l.click();
    document.body.removeChild(l);
};

// GRÁFICAS (Utilidad)
function renderChart(id, l, d, t, c, i, s) {
    const x = document.getElementById(id);
    if(!x) return;
    if(i) i.destroy();
    
    // Tipo de gráfico dinámico (Doughnut para sedes, Bar para stock)
    const type = id === 'locationChart' ? 'doughnut' : 'bar';
    const bgColors = id === 'locationChart' ? ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] : c;

    s(new Chart(x, {
        type: type,
        data: { labels: l, datasets: [{ label: t, data: d, backgroundColor: bgColors, borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type === 'doughnut', position: 'bottom' } } }
    }));
}

// ----------------------------------------------------------------
// --- SOLUCIÓN DE CLOUDINARY (Widget) ---
document.getElementById("upload_widget")?.addEventListener("click", () => cloudinaryWidget ? cloudinaryWidget.open() : alert("Cargando Cloudinary..."), false);

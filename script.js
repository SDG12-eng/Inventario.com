import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;
let stockChart = null, userChart = null, locationChart = null;
let carritoGlobal = {}; 

emailjs.init("2jVnfkJKKG0bpKN-U");

window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) cargarSesion(JSON.parse(sesionGuardada));
});

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    
    // Mostrar info usuario
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) infoDiv.innerHTML = `<i class="fas fa-user-circle"></i> ${datos.id} <br> <span class="text-indigo-500">${datos.rol.toUpperCase()}</span>`;

    // Botón agregar stock: Visible para Admin y Manager
    if(datos.rol === 'admin' || datos.rol === 'manager') {
        document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    }

    configurarMenu();
    
    // Redirección inicial según rol
    let paginaInicio = 'stock';
    if (datos.rol === 'admin' || datos.rol === 'manager' || datos.rol === 'supervisor') paginaInicio = 'stats';
    
    window.verPagina(paginaInicio);
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) cargarSesion({ id: user, ...snap.data() });
        else alert("Credenciales incorrectas");
    }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`)?.classList.remove("hidden");
    if(window.innerWidth < 1024) toggleMenu(false);
};

window.toggleMenu = (open) => {
    const side = document.getElementById("sidebar");
    const over = document.getElementById("sidebar-overlay");
    if(open === false) { side.classList.add("-translate-x-full"); over.classList.add("hidden"); }
    else { side.classList.toggle("-translate-x-full"); over.classList.toggle("hidden"); }
};

// --- CONFIGURACIÓN DE MENÚ POR ROL ---
function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const rol = usuarioActual.rol;
    
    // Definición de módulos
    const items = {
        stats: {id:'stats', n:'Dashboard', i:'chart-line'},
        stock: {id:'stock', n:'Stock', i:'box'},
        pedir: {id:'solicitar', n:'Realizar Pedido', i:'cart-plus'},
        pendientes: {id:'solicitudes', n:'Pendientes', i:'bell'},
        historial: {id:'historial', n:'Historial', i:'clock'},
        usuarios: {id:'usuarios', n:'Usuarios', i:'users'},
        mis_pedidos: {id:'notificaciones', n:'Mis Pedidos', i:'history'}
    };

    let rutas = [];

    if(rol === 'admin') {
        // Admin Total
        rutas = [items.stats, items.stock, items.pedir, items.pendientes, items.historial, items.usuarios];
    } else if (rol === 'manager') {
        // Manager: Admin sin Usuarios
        rutas = [items.stats, items.stock, items.pedir, items.pendientes, items.historial];
    } else if (rol === 'supervisor') {
        // Supervisor: Ve stats, stock, historial y PUEDE PEDIR.
        // Opcional: Ve pendientes en modo lectura (definido en HTML/JS más abajo)
        rutas = [items.stats, items.stock, items.pedir, items.pendientes, items.historial];
    } else {
        // Usuario normal
        rutas = [items.stock, items.pedir, items.mis_pedidos];
    }

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold text-sm">
            <i class="fas fa-${r.i} w-6 text-center"></i> ${r.n}
        </button>`).join('');
}

// --- LOGICA DE PEDIDOS ---
window.ajustarCantidad = (insumo, delta) => {
    const actual = carritoGlobal[insumo] || 0;
    const nueva = Math.max(0, actual + delta);
    carritoGlobal[insumo] = nueva;
    document.getElementById(`cant-${insumo}`).innerText = nueva;
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const itemsParaPedir = Object.entries(carritoGlobal).filter(([_, cant]) => cant > 0);
    if(!ubi || itemsParaPedir.length === 0) return alert("Seleccione sede y al menos un insumo.");

    // Determine target redirection: Admin/Manager/Sup -> Pendientes/Historial, User -> Mis Pedidos
    const redirectPage = (usuarioActual.rol === 'user') ? 'notificaciones' : 'solicitudes';

    for(const [insumo, cantidad] of itemsParaPedir) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id,
            insumoNom: insumo,
            cantidad: cantidad,
            ubicacion: ubi,
            estado: "pendiente",
            fecha: new Date().toLocaleString(),
            timestamp: Date.now()
        });
    }
    alert("✅ Solicitud enviada correctamente.");
    carritoGlobal = {};
    activarSincronizacion();
    window.verPagina(redirectPage);
};

// --- GESTION DE ESTADOS (Recibir / Incidencia) ---
window.confirmarRecibido = async (pid) => {
    if(confirm("¿Confirmar recepción correcta?")) {
        await updateDoc(doc(db, "pedidos", pid), { estado: "recibido" });
    }
};

window.abrirIncidencia = (pid) => {
    document.getElementById('incidencia-pid').value = pid;
    document.getElementById('incidencia-detalle').value = "";
    document.getElementById('modal-incidencia').classList.remove('hidden');
};

window.confirmarIncidencia = async (devolverStock) => {
    const pid = document.getElementById('incidencia-pid').value;
    const detalle = document.getElementById('incidencia-detalle').value.trim();
    if(!detalle) return alert("Por favor detalla el problema.");

    const pRef = doc(db, "pedidos", pid);
    const pSnap = await getDoc(pRef);
    const pData = pSnap.data();

    const nuevoEstado = devolverStock ? "devuelto" : "con_incidencia";

    if(devolverStock) {
        const iRef = doc(db, "inventario", pData.insumoNom.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists()) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad });
        }
    }

    await updateDoc(pRef, { estado: nuevoEstado, detalleIncidencia: detalle });
    document.getElementById('modal-incidencia').classList.add('hidden');
    alert(devolverStock ? "Insumo devuelto al stock." : "Reporte enviado.");
};

// --- GESTIÓN DE USUARIOS (Solo Admin) ---
window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    
    if(id && pass) {
        await setDoc(doc(db, "usuarios", id), { pass, email, rol });
        alert("Usuario guardado/actualizado.");
        document.getElementById("new-user").value = "";
        document.getElementById("new-pass").value = "";
        document.getElementById("new-email").value = "";
    } else alert("Falta ID o Contraseña");
};

// --- SINCRONIZACIÓN DATOS ---
function activarSincronizacion() {
    // 1. INVENTARIO
    onSnapshot(collection(db, "inventario"), snap => {
        const listInv = document.getElementById("lista-inventario");
        const listPed = document.getElementById("contenedor-lista-pedidos");
        const dl = document.getElementById("admin-stock-dl");
        
        listInv.innerHTML = "";
        if(listPed) listPed.innerHTML = "";
        if(dl) dl.innerHTML = "";

        let lbs = [], vls = [], tot = 0;

        snap.forEach(d => {
            const p = d.data(); const n = d.id;
            tot += p.cantidad; lbs.push(n.toUpperCase()); vls.push(p.cantidad);

            // Boton eliminar solo Admin y Manager
            const puedeBorrar = (usuarioActual.rol === 'admin' || usuarioActual.rol === 'manager');
            const btnEliminar = puedeBorrar ? `<button onclick="eliminarDato('inventario','${n}')" class="text-red-400 p-2"><i class="fas fa-trash"></i></button>` : '';

            listInv.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div><b class="uppercase text-slate-700">${n}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                    ${btnEliminar}
                </div>`;
            
            // Lista para pedir (si hay stock)
            if(listPed && p.cantidad > 0) {
                listPed.innerHTML += `
                    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <span class="font-bold uppercase text-xs text-slate-700 w-1/3">${n}</span>
                        <div class="flex items-center gap-3 bg-white px-2 py-1 rounded-xl shadow-sm border">
                            <button onclick="ajustarCantidad('${n}', -1)" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">-</button>
                            <span id="cant-${n}" class="w-6 text-center font-bold text-indigo-600">${carritoGlobal[n] || 0}</span>
                            <button onclick="ajustarCantidad('${n}', 1)" class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 font-bold">+</button>
                        </div>
                    </div>`;
            }
            if(dl) dl.innerHTML += `<option value="${n}">`;
        });

        if(['admin','manager','supervisor'].includes(usuarioActual.rol)) {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = tot;
            renderChart('stockChart', lbs, vls, 'Stock', '#6366f1', stockChart, c => stockChart = c);
        }
    });

    // 2. PEDIDOS
    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        
        if(lAdmin) lAdmin.innerHTML = ""; 
        if(lUser) lUser.innerHTML = ""; 
        if(tHist) tHist.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            
            // ADMIN / MANAGER / SUPERVISOR (Vista Pendientes)
            const esStaff = ['admin', 'manager', 'supervisor'].includes(usuarioActual.rol);
            
            if(esStaff && p.estado === 'pendiente') {
                let acciones = "";
                
                // Admin y Manager pueden aprobar/editar
                if(usuarioActual.rol === 'admin' || usuarioActual.rol === 'manager') {
                    acciones = `
                    <div class="flex items-center gap-2">
                        <input type="number" id="qty-${d.id}" value="${p.cantidad}" class="w-14 p-2 bg-slate-100 rounded-lg text-center font-bold text-sm border outline-none" min="1">
                        <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}')" class="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center hover:bg-indigo-700 shadow"><i class="fas fa-check text-xs"></i></button>
                        <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-red-100 text-red-500 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-200"><i class="fas fa-times text-xs"></i></button>
                    </div>`;
                } else {
                    // Supervisor solo ve
                    acciones = `<span class="badge status-pendiente opacity-50">En revisión</span>`;
                }

                lAdmin.innerHTML += `
                <div class="bg-white p-4 rounded-2xl border flex justify-between items-center border-l-4 border-l-amber-400 shadow-sm">
                    <div>
                        <b class="text-sm uppercase">${p.insumoNom}</b>
                        <div class="flex items-center gap-2 text-[10px] mt-1">
                            <span class="bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold">${p.usuarioId}</span>
                            <span class="text-indigo-500 font-bold">${p.ubicacion}</span>
                            <span class="text-slate-400">Orig: ${p.cantidad}</span>
                        </div>
                    </div>
                    ${acciones}
                </div>`;
            }

            // HISTORIAL (Tabla General)
            if(p.estado !== 'pendiente' && tHist) {
                const detalle = p.detalleIncidencia ? `<div class="text-[10px] text-red-500 italic mt-1 bg-red-50 p-1 rounded">"${p.detalleIncidencia}"</div>` : '';
                tHist.innerHTML += `
                <tr class="border-b hover:bg-slate-50">
                    <td class="p-4 text-slate-500 text-xs">${p.fecha.split(',')[0]}</td>
                    <td class="p-4 font-bold uppercase text-xs">${p.insumoNom}</td>
                    <td class="p-4 text-xs">x${p.cantidad}</td>
                    <td class="p-4 text-indigo-600 font-bold text-xs">${p.ubicacion}</td>
                    <td class="p-4 text-xs font-bold text-slate-600">${p.usuarioId}</td>
                    <td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span>${detalle}</td>
                </tr>`;
            }

            // MIS PEDIDOS (Todos los que piden ven esto)
            if(p.usuarioId === usuarioActual.id && lUser) {
                let botones = `<span class="badge status-${p.estado}">${p.estado}</span>`;
                
                if(p.estado === 'aprobado') {
                    botones = `
                    <div class="flex gap-2 mt-3 justify-end border-t pt-2 w-full">
                        <button onclick="confirmarRecibido('${d.id}')" class="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow hover:bg-emerald-600 flex items-center gap-1"><i class="fas fa-check"></i> Recibir</button>
                        <button onclick="abrirIncidencia('${d.id}')" class="px-4 py-2 bg-white border border-red-200 text-red-500 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center gap-1"><i class="fas fa-exclamation-triangle"></i> Reportar</button>
                    </div>`;
                }

                lUser.innerHTML += `
                <div class="notif-card p-4 bg-white rounded-2xl border shadow-sm">
                    <div class="flex justify-between items-start mb-1">
                        <div>
                            <b class="text-indigo-900 uppercase">${p.insumoNom} (x${p.cantidad})</b>
                            <p class="text-xs text-slate-400 mt-1"><i class="fas fa-map-marker-alt"></i> ${p.ubicacion} &bull; ${p.fecha}</p>
                        </div>
                        ${p.estado !== 'aprobado' ? botones : ''}
                    </div>
                    ${p.estado === 'aprobado' ? botones : ''}
                </div>`;
            }
        });
    });

    // 3. LOGS ENTRADAS
    onSnapshot(collection(db, "entradas_stock"), snap => {
        const tEnt = document.getElementById("tabla-entradas-body");
        if(tEnt) {
            tEnt.innerHTML = "";
            let data = [];
            snap.forEach(d => data.push(d.data()));
            data.sort((a,b) => b.timestamp - a.timestamp);
            data.forEach(e => {
                tEnt.innerHTML += `
                    <tr class="border-b">
                        <td class="p-4 text-slate-500 text-xs">${e.fecha}</td>
                        <td class="p-4 font-bold uppercase text-emerald-800">${e.insumo}</td>
                        <td class="p-4 font-bold text-emerald-600">+${e.cantidad}</td>
                        <td class="p-4 text-xs text-slate-400 font-bold">${e.usuario}</td>
                    </tr>`;
            });
        }
    });

    // 4. USUARIOS (Solo Admin)
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const listUsers = document.getElementById("lista-usuarios-db");
            if(listUsers) {
                listUsers.innerHTML = "";
                snap.forEach(d => {
                    const u = d.data();
                    listUsers.innerHTML += `
                    <div class="bg-slate-50 p-4 rounded-2xl border flex justify-between items-center hover:bg-white transition shadow-sm">
                        <div>
                            <div class="font-bold text-indigo-900 flex items-center gap-2">
                                ${d.id} 
                                <span class="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase border border-indigo-200">${u.rol}</span>
                            </div>
                            <small class="text-slate-400 block mt-1 font-mono text-xs">Pass: ${u.pass}</small>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="eliminarDato('usuarios','${d.id}')" class="w-8 h-8 rounded-lg bg-white text-red-400 border border-red-100 hover:bg-red-50 flex items-center justify-center"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    </div>`;
                });
            }
        });
    }
}

// --- UTILIDADES ---
window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid);
    if(accion === 'aprobar') {
        const inputCant = document.getElementById(`qty-${pid}`);
        const cantAprobar = inputCant ? parseInt(inputCant.value) : 0;
        if(isNaN(cantAprobar) || cantAprobar <= 0) return alert("Cantidad inválida");

        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        
        if(iSnap.exists() && iSnap.data().cantidad >= cantAprobar) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cantAprobar });
            await updateDoc(pRef, { estado: "aprobado", cantidad: cantAprobar });
        } else alert("Stock insuficiente.");
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
    }
};

window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && !isNaN(c) && c > 0) {
        const docRef = doc(db, "inventario", n);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) await updateDoc(docRef, { cantidad: docSnap.data().cantidad + c });
        else await setDoc(docRef, { cantidad: c });
        
        await addDoc(collection(db, "entradas_stock"), { 
            insumo: n, cantidad: c, usuario: usuarioActual.id, 
            fecha: new Date().toLocaleString(), timestamp: Date.now() 
        });
        window.cerrarModalInsumo();
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
    }
};

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar este registro permanentemente?")) await deleteDoc(doc(db, col, id)); };

window.descargarReporte = async () => {
    const stockSnap = await getDocs(collection(db, "inventario"));
    const entradasSnap = await getDocs(collection(db, "entradas_stock"));
    const salidasSnap = await getDocs(collection(db, "pedidos"));

    let csv = "data:text/csv;charset=utf-8,";
    csv += "=== STOCK ===\r\nINSUMO,CANTIDAD\r\n";
    stockSnap.forEach(d => csv += `${d.id.toUpperCase()},${d.data().cantidad}\r\n`);
    
    csv += "\r\n=== ENTRADAS ===\r\nFECHA,INSUMO,CANTIDAD,RESPONSABLE\r\n";
    entradasSnap.forEach(d => { const x=d.data(); csv += `${x.fecha.replace(/,/g,'')},${x.insumo},${x.cantidad},${x.usuario}\r\n`; });

    csv += "\r\n=== PEDIDOS ===\r\nFECHA,INSUMO,CANTIDAD,SEDE,USUARIO,ESTADO,NOTA\r\n";
    salidasSnap.forEach(d => { const x=d.data(); if(x.estado !== 'pendiente') csv += `${x.fecha.replace(/,/g,'')},${x.insumoNom},${x.cantidad},${x.ubicacion},${x.usuarioId},${x.estado},${x.detalleIncidencia||''}\r\n`; });

    const link = document.createElement("a");
    link.href = encodeURI(csv); link.download = "Reporte_FCILog.csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

function renderChart(id, labels, data, title, color, instance, setInst) {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(instance) instance.destroy();
    setInst(new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: title, data, backgroundColor: color, borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } } } }));
}

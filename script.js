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
let stockChart = null;
let carritoGlobal = {}; 

window.addEventListener('DOMContentLoaded', () => {
    const sesion = localStorage.getItem("fcilog_session");
    if (sesion) cargarSesion(JSON.parse(sesion));
});

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    document.getElementById("info-usuario").innerHTML = `<i class="fas fa-user-circle"></i> ${datos.id} <br> <span class="text-indigo-500">${datos.rol.toUpperCase()}</span>`;

    if(['admin','manager'].includes(datos.rol)) {
        document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    }

    configurarMenu(datos.rol);
    verPagina(datos.rol === 'user' ? 'stock' : 'stats');
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

function configurarMenu(rol) {
    const menu = document.getElementById("menu-dinamico");
    const m = {
        stats: {id:'stats', n:'Dashboard', i:'chart-line'},
        stock: {id:'stock', n:'Stock', i:'box'},
        pedir: {id:'solicitar', n:'Realizar Pedido', i:'cart-plus'},
        pendientes: {id:'solicitudes', n:'Pendientes', i:'bell'},
        historial: {id:'historial', n:'Historial', i:'clock'},
        usuarios: {id:'usuarios', n:'Usuarios', i:'users'},
        mis_pedidos: {id:'notificaciones', n:'Mis Pedidos', i:'history'}
    };

    let rutas = [];
    if(rol === 'admin') rutas = [m.stats, m.stock, m.pedir, m.pendientes, m.historial, m.usuarios];
    else if(rol === 'manager') rutas = [m.stats, m.stock, m.pedir, m.pendientes, m.historial];
    else if(rol === 'supervisor') rutas = [m.stats, m.stock, m.pedir, m.pendientes, m.historial];
    else rutas = [m.stock, m.pedir, m.mis_pedidos];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold text-sm">
            <i class="fas fa-${r.i} w-6 text-center"></i> ${r.n}
        </button>`).join('');
}

// --- ACTUALIZAR STOCK ---
window.agregarProducto = async () => {
    // Normalizamos el nombre a minúsculas para el ID de Firebase
    const rawNombre = document.getElementById("nombre-prod").value.trim();
    const n = rawNombre.toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);

    if(n && !isNaN(c) && c > 0) {
        const docRef = doc(db, "inventario", n);
        const snap = await getDoc(docRef);
        
        if (snap.exists()) await updateDoc(docRef, { cantidad: snap.data().cantidad + c });
        else await setDoc(docRef, { cantidad: c });
        
        await addDoc(collection(db, "entradas_stock"), { 
            insumo: n, cantidad: c, usuario: usuarioActual.id, 
            fecha: new Date().toLocaleString(), timestamp: Date.now() 
        });

        alert(`Stock de ${n.toUpperCase()} actualizado.`);
        cerrarModalInsumo();
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
    } else alert("Datos inválidos");
};

// --- SINCRONIZACIÓN (Aquí está la magia del Datalist) ---
function activarSincronizacion() {
    // 1. INVENTARIO Y AUTOCOMPLETADO
    onSnapshot(collection(db, "inventario"), snap => {
        const listInv = document.getElementById("lista-inventario");
        const listPed = document.getElementById("contenedor-lista-pedidos");
        const dataList = document.getElementById("lista-sugerencias"); // Referencia al datalist
        
        listInv.innerHTML = "";
        if(listPed) listPed.innerHTML = "";
        if(dataList) dataList.innerHTML = ""; // Limpiar sugerencias

        let totStock = 0, lbs = [], vls = [];

        snap.forEach(d => {
            const n = d.id; // El nombre en minúsculas (ID)
            const p = d.data();
            totStock += p.cantidad;
            lbs.push(n.toUpperCase());
            vls.push(p.cantidad);

            // Agregar a la lista de sugerencias del Modal
            if(dataList) {
                const opt = document.createElement("option");
                opt.value = n.toUpperCase(); 
                dataList.appendChild(opt);
            }

            // Cards de Stock
            listInv.innerHTML += `
                <div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div><b class="uppercase text-slate-700">${n}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                    ${['admin','manager'].includes(usuarioActual.rol) ? `<button onclick="eliminarDato('inventario','${n}')" class="text-red-300 hover:text-red-500"><i class="fas fa-trash"></i></button>` : ''}
                </div>`;
            
            // Items para Pedir
            if(listPed && p.cantidad > 0) {
                listPed.innerHTML += `
                    <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <span class="font-bold uppercase text-xs text-slate-700 w-1/3">${n}</span>
                        <div class="flex items-center gap-3 bg-white px-2 py-1 rounded-xl shadow-sm border">
                            <button onclick="ajustarPedido('${n}', -1)" class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold">-</button>
                            <span id="cant-${n}" class="w-6 text-center font-bold text-indigo-600">${carritoGlobal[n] || 0}</span>
                            <button onclick="ajustarPedido('${n}', 1)" class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 font-bold">+</button>
                        </div>
                    </div>`;
            }
        });

        if(['admin','manager','supervisor'].includes(usuarioActual.rol)) {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = totStock;
            renderChart(lbs, vls);
        }
    });

    // 2. PEDIDOS Y NOTIFICACIONES
    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        
        if(lAdmin) lAdmin.innerHTML = ""; 
        if(lUser) lUser.innerHTML = ""; 
        if(tHist) tHist.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            const id = d.id;

            // Historial General
            if(p.estado !== 'pendiente' && tHist) {
                tHist.innerHTML += `
                <tr class="border-b">
                    <td class="p-4 text-slate-400 text-[10px]">${p.fecha.split(',')[0]}</td>
                    <td class="p-4 font-bold uppercase">${p.insumoNom}</td>
                    <td class="p-4">x${p.cantidad}</td>
                    <td class="p-4 text-xs font-bold text-slate-600">${p.usuarioId}</td>
                    <td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td>
                </tr>`;
            }

            // Panel de Aprobación
            if(['admin','manager','supervisor'].includes(usuarioActual.rol) && p.estado === 'pendiente' && lAdmin) {
                const canEdit = ['admin','manager'].includes(usuarioActual.rol);
                lAdmin.innerHTML += `
                <div class="bg-white p-4 rounded-2xl border flex justify-between items-center border-l-4 border-l-amber-400 shadow-sm">
                    <div>
                        <b class="text-sm uppercase">${p.insumoNom} (x${p.cantidad})</b>
                        <p class="text-[10px] text-slate-400 font-bold uppercase">${p.usuarioId} • ${p.ubicacion}</p>
                    </div>
                    <div class="flex gap-2">
                        ${canEdit ? `
                        <button onclick="gestionarPedido('${id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-md">Aprobar</button>
                        <button onclick="gestionarPedido('${id}','rechazar')" class="bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-bold text-xs">X</button>
                        ` : '<span class="text-[10px] font-bold text-amber-500 uppercase">En Espera</span>'}
                    </div>
                </div>`;
            }

            // Mis Pedidos (Vista Usuario)
            if(p.usuarioId === usuarioActual.id && lUser) {
                let accion = `<span class="badge status-${p.estado}">${p.estado}</span>`;
                if(p.estado === 'aprobado') {
                    accion = `
                    <div class="flex gap-2">
                        <button onclick="confirmarEntrega('${id}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold text-[10px]">RECIBIDO</button>
                        <button onclick="abrirIncidencia('${id}')" class="bg-white border border-red-200 text-red-500 px-3 py-1.5 rounded-lg font-bold text-[10px]">REPORTE</button>
                    </div>`;
                }
                lUser.innerHTML += `
                <div class="p-4 bg-white rounded-2xl border shadow-sm flex justify-between items-center">
                    <div><b class="uppercase text-indigo-900">${p.insumoNom} (x${p.cantidad})</b><p class="text-[10px] text-slate-400 italic">${p.fecha}</p></div>
                    ${accion}
                </div>`;
            }
        });
        if(['admin','manager','supervisor'].includes(usuarioActual.rol)) {
            document.getElementById("metrica-pedidos").innerText = snap.docs.filter(d => d.data().estado === 'pendiente').length;
        }
    });

    // 3. CARGAR USUARIOS
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const container = document.getElementById("lista-usuarios-db");
            if(container) {
                container.innerHTML = "";
                snap.forEach(d => {
                    const u = d.data();
                    container.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border shadow-sm flex justify-between items-center">
                        <div><b class="text-indigo-600">${d.id}</b><p class="text-[10px] uppercase font-bold text-slate-400">${u.rol}</p></div>
                        <button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-300 hover:text-red-500"><i class="fas fa-trash"></i></button>
                    </div>`;
                });
            }
        });
    }
}

// --- FUNCIONES DE PEDIDOS ---
window.ajustarPedido = (ins, delta) => {
    carritoGlobal[ins] = Math.max(0, (carritoGlobal[ins] || 0) + delta);
    document.getElementById(`cant-${ins}`).innerText = carritoGlobal[ins];
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Falta sede o productos");

    for(const [nom, cant] of items) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: nom, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: Date.now()
        });
    }
    alert("Solicitud enviada");
    carritoGlobal = {};
    verPagina(usuarioActual.rol === 'user' ? 'notificaciones' : 'solicitudes');
};

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const snap = await getDoc(iRef);
        if(snap.exists() && snap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: snap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
        } else alert("Stock insuficiente");
    } else await updateDoc(pRef, { estado: "rechazado" });
};

window.confirmarEntrega = async (pid) => { if(confirm("¿Recibiste el material conforme?")) await updateDoc(doc(db, "pedidos", pid), { estado: "recibido" }); };

window.abrirIncidencia = (id) => { document.getElementById("incidencia-pid").value = id; document.getElementById("modal-incidencia").classList.remove("hidden"); };

window.confirmarIncidencia = async (devolver) => {
    const id = document.getElementById("incidencia-pid").value;
    const det = document.getElementById("incidencia-detalle").value;
    const pRef = doc(db, "pedidos", id);
    const pSnap = await getDoc(pRef);
    const pData = pSnap.data();

    if(devolver) {
        const iRef = doc(db, "inventario", pData.insumoNom.toLowerCase());
        const iSnap = await getDoc(iRef);
        await updateDoc(iRef, { cantidad: iSnap.data().cantidad + pData.cantidad });
        await updateDoc(pRef, { estado: "devuelto", nota: det });
    } else {
        await updateDoc(pRef, { estado: "con_incidencia", nota: det });
    }
    document.getElementById("modal-incidencia").classList.add("hidden");
};

// --- OTROS ---
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };

function renderChart(lbs, vls) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: lbs, datasets: [{ label: 'Unidades en Stock', data: vls, backgroundColor: '#6366f1', borderRadius: 8 }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

window.descargarReporte = async () => {
    const snap = await getDocs(collection(db, "pedidos"));
    let csv = "Fecha,Insumo,Cantidad,Sede,Usuario,Estado\n";
    snap.forEach(d => { const p = d.data(); csv += `${p.fecha},${p.insumoNom},${p.cantidad},${p.ubicacion},${p.usuarioId},${p.estado}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.setAttribute('hidden', ''); a.setAttribute('href', url); a.setAttribute('download', 'reporte.csv');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const p = document.getElementById("new-pass").value.trim();
    const e = document.getElementById("new-email").value.trim();
    const r = document.getElementById("new-role").value;
    if(id && p) { await setDoc(doc(db, "usuarios", id), { pass: p, email: e, rol: r }); alert("Usuario Creado"); }
};

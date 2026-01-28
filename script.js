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
let carrito = {};
let idPedidoTemp = null;
let stockChart = null;

// --- GESTIÓN DE INTERFAZ ---
window.toggleMenu = () => {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    sidebar.classList.toggle("-translate-x-full");
    overlay.classList.toggle("hidden");
};

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
    if(window.innerWidth < 1024) toggleMenu(); // Cerrar menú en móvil al navegar
};

// --- LOGIN ---
window.iniciarSesion = async () => {
    const u = document.getElementById("login-user").value.trim().toLowerCase();
    const p = document.getElementById("login-pass").value.trim();
    if(u === "admin" && p === "1130") {
        cargarSesion({id:"admin", rol:"admin", email:"archivos@fcipty.com"});
    } else {
        const snap = await getDoc(doc(db, "usuarios", u));
        if(snap.exists() && snap.data().pass === p) cargarSesion({id:u, ...snap.data()});
        else alert("Acceso no autorizado");
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    if(datos.rol === 'admin') document.getElementById("btn-admin-stock").classList.remove("hidden");
    configurarMenu();
    window.verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
}

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

// --- MENÚ DINÁMICO ---
function configurarMenu() {
    const m = document.getElementById("menu-dinamico");
    const r = usuarioActual.rol;
    const items = [
        {id:'stats', n:'Dashboard', i:'chart-pie', show: r !== 'user'},
        {id:'stock', n:'Almacén', i:'box', show: true},
        {id:'solicitar', n:'Nuevo Pedido', i:'cart-plus', show: true},
        {id:'solicitudes', n:'Pendientes', i:'clock', show: r !== 'user'},
        {id:'historial', n:'Historial', i:'list-check', show: r !== 'user'},
        {id:'notificaciones', n:'Mis Pedidos', i:'receipt', show: true},
        {id:'usuarios', n:'Usuarios', i:'users', show: r === 'admin'}
    ];
    m.innerHTML = items.filter(x => x.show).map(x => `
        <button onclick="verPagina('${x.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition-all font-bold">
            <i class="fas fa-${x.i} w-6 text-lg"></i> <span class="text-sm">${x.n}</span>
        </button>`).join('');
}

// --- LÓGICA DE CARRITO ---
window.modificarCarrito = (id, delta) => {
    carrito[id] = Math.max(0, (carrito[id] || 0) + delta);
    document.getElementById(`cant-${id}`).innerText = carrito[id];
    document.getElementById("count-carrito").innerText = Object.values(carrito).reduce((a,b) => a+b, 0);
};

window.enviarPedidoMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value;
    const items = Object.entries(carrito).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Complete los datos requeridos");

    for (const [nom, cant] of items) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: nom, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", recibido: false,
            fecha: new Date().toLocaleString(), timestamp: Date.now()
        });
    }
    alert("Solicitud procesada");
    carrito = {};
    window.verPagina('notificaciones');
};

// --- SINCRONIZACIÓN FIREBASE ---
function activarSincronizacion() {
    // Inventario
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        const listPed = document.getElementById("lista-pedido-items");
        list.innerHTML = ""; listPed.innerHTML = "";
        let labels = [], dataChart = [], totalGlobal = 0;

        snap.forEach(d => {
            const p = d.data();
            const esBajo = p.cantidad <= (p.minimo || 0);
            totalGlobal += p.cantidad;
            labels.push(d.id.toUpperCase()); dataChart.push(p.cantidad);

            list.innerHTML += `
                <div class="bg-white p-4 rounded-2xl border flex justify-between items-center ${esBajo ? 'border-red-400 bg-red-50' : 'hover:shadow-md transition'}">
                    <div>
                        <b class="uppercase text-sm">${d.id}</b>
                        <p class="text-[10px] ${esBajo?'text-red-600 font-bold':'text-slate-400'}">STOCK: ${p.cantidad} (MIN: ${p.minimo})</p>
                    </div>
                    ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="w-8 h-8 rounded-lg text-red-300 hover:bg-red-50 hover:text-red-500"><i class="fas fa-trash"></i></button>` : ''}
                </div>`;
            
            listPed.innerHTML += `
                <div class="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <span class="font-bold text-xs uppercase">${d.id}</span>
                    <div class="flex items-center gap-3 bg-white p-1 rounded-xl shadow-sm">
                        <button onclick="modificarCarrito('${d.id}', -1)" class="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 font-bold">-</button>
                        <b id="cant-${d.id}" class="w-6 text-center text-sm">0</b>
                        <button onclick="modificarCarrito('${d.id}', 1)" class="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 font-bold">+</button>
                    </div>
                </div>`;
        });
        if(usuarioActual.rol !== 'user') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = totalGlobal;
            actualizarGrafico(labels, dataChart);
        }
    });

    // Pedidos
    onSnapshot(collection(db, "pedidos"), snap => {
        const pAdmin = document.getElementById("lista-pendientes-admin");
        const pUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        if(pAdmin) pAdmin.innerHTML = ""; if(pUser) pUser.innerHTML = ""; if(tHist) tHist.innerHTML = "";
        let countPend = 0;

        snap.forEach(d => {
            const p = d.data();
            if(p.estado === 'pendiente') countPend++;

            if(usuarioActual.rol !== 'user' && p.estado === 'pendiente') {
                pAdmin.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border-l-4 border-amber-400 flex justify-between items-center shadow-sm">
                        <div class="space-y-1">
                            <b class="uppercase text-sm">${p.insumoNom} (x${p.cantidad})</b>
                            <p class="text-[10px] text-slate-400 font-bold uppercase">${p.ubicacion} — ${p.usuarioId}</p>
                        </div>
                        <div class="flex gap-2">
                            ${usuarioActual.rol === 'admin' ? `
                            <button onclick="ajustarPedido('${d.id}')" class="bg-slate-100 p-2.5 rounded-xl text-slate-500"><i class="fas fa-edit"></i></button>
                            <button onclick="procesarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">OK</button>` : '<span class="text-[10px] italic">Sólo lectura</span>'}
                        </div>
                    </div>`;
            }

            if(p.usuarioId === usuarioActual.id) {
                const canFinalize = p.estado === 'aprobado' && !p.recibido;
                pUser.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border flex flex-col gap-3">
                        <div class="flex justify-between items-start">
                            <div><b class="uppercase text-sm">${p.insumoNom} (x${p.cantidad})</b><p class="text-[10px] text-slate-400">${p.fecha}</p></div>
                            <span class="badge status-${p.estadoRecibo || p.estado}">${p.estadoRecibo || p.estado}</span>
                        </div>
                        ${canFinalize ? `
                        <div class="grid grid-cols-3 gap-1">
                            <button onclick="preFinalizar('${d.id}','recibido')" class="text-[10px] font-bold bg-green-500 text-white py-2 rounded-lg">RECIBÍ</button>
                            <button onclick="preFinalizar('${d.id}','anomalia')" class="text-[10px] font-bold bg-amber-500 text-white py-2 rounded-lg">FALLA</button>
                            <button onclick="preFinalizar('${d.id}','devolver')" class="text-[10px] font-bold bg-red-500 text-white py-2 rounded-lg">DEVOLVER</button>
                        </div>` : ''}
                    </div>`;
            }

            if(p.estado !== 'pendiente') {
                tHist.innerHTML += `
                    <tr>
                        <td class="p-4 text-xs font-bold">${p.fecha.split(',')[0]}</td>
                        <td class="p-4 font-bold uppercase text-xs">${p.insumoNom}</td>
                        <td class="p-4 text-xs">x${p.cantidad}</td>
                        <td class="p-4 font-bold text-indigo-600 text-xs">${p.ubicacion}</td>
                        <td class="p-4"><span class="badge status-${p.estadoRecibo || p.estado}">${p.estadoRecibo || p.estado}</span></td>
                    </tr>`;
            }
        });
        if(usuarioActual.rol !== 'user') document.getElementById("metrica-pedidos").innerText = countPend;
    });
}

// --- FUNCIONES DE ACCIÓN ---
window.procesarPedido = async (id, accion, ins, cant) => {
    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(doc(db, "pedidos", id), { estado: "aprobado" });
        } else alert("Error: No hay suficiente stock disponible.");
    } else await updateDoc(doc(db, "pedidos", id), { estado: "rechazado" });
};

window.ajustarPedido = async (id) => {
    const val = prompt("Modificar cantidad final:");
    if(val && !isNaN(val)) await updateDoc(doc(db, "pedidos", id), { cantidad: parseInt(val) });
};

window.preFinalizar = (id, accion) => {
    idPedidoTemp = id;
    if(accion === 'recibido') finalizarEntrega('recibido');
    else if(accion === 'anomalia') document.getElementById("modal-anomalia").classList.remove("hidden");
    else if(confirm("¿Confirmar devolución de insumo?")) finalizarEntrega('devuelto');
};

window.finalizarEntrega = async (tipo) => {
    const mot = document.getElementById("motivo-anomalia").value;
    await updateDoc(doc(db, "pedidos", idPedidoTemp), { 
        estadoRecibo: tipo, recibido: true, motivo: mot || "", fechaRecibo: new Date().toLocaleString() 
    });
    document.getElementById("modal-anomalia").classList.add("hidden");
};

window.guardarNuevoInsumo = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    const p = parseFloat(document.getElementById("precio-prod").value) || 0;
    const m = parseInt(document.getElementById("minimo-prod").value) || 0;
    if(n && !isNaN(c)) {
        await setDoc(doc(db, "inventario", n), { cantidad: c, precio: p, minimo: m });
        document.getElementById("modal-insumo").classList.add("hidden");
    }
};

// --- EXPORTACIÓN ---
window.exportarStockCSV = async () => {
    const s = await getDocs(collection(db, "inventario"));
    let csv = "INSUMO,CANTIDAD,PRECIO,MINIMO,VALOR_ESTIMADO\n";
    s.forEach(d => {
        const x = d.data();
        csv += `${d.id.toUpperCase()},${x.cantidad},${x.precio},${x.minimo},${(x.cantidad*x.precio).toFixed(2)}\n`;
    });
    descargarFile(csv, "stock_total_fci.csv");
};

window.exportarHistorialCSV = async () => {
    const s = await getDocs(collection(db, "pedidos"));
    let csv = "FECHA,INSUMO,CANTIDAD,SEDE,USUARIO,ESTADO\n";
    s.forEach(d => {
        const x = d.data();
        csv += `${x.fecha},${x.insumoNom},${x.cantidad},${x.ubicacion},${x.usuarioId},${x.estadoRecibo || x.estado}\n`;
    });
    descargarFile(csv, "movimientos_fci.csv");
};

function descargarFile(c, n) {
    const blob = new Blob([c], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=n; a.click();
}

// --- OTROS ---
function actualizarGrafico(labels, data) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Stock Disponible', data, backgroundColor: '#6366f1', borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.eliminarDato = async (col, id) => { if(confirm("¿Seguro de eliminar este registro?")) await deleteDoc(doc(db, col, id)); };
window.crearUsuario = async () => {
    const u = document.getElementById("new-user").value.trim().toLowerCase();
    const p = document.getElementById("new-pass").value;
    const r = document.getElementById("new-role").value;
    if(u && p) { await setDoc(doc(db, "usuarios", u), { pass: p, rol: r }); alert("Acceso creado"); }
};
window.solicitarPermisoNotificaciones = () => { Notification.requestPermission().then(() => alert("Sistema de notificaciones activado")); };
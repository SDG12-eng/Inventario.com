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
let userChart = null;
let locationChart = null;
let insumoChart = null;

emailjs.init("2jVnfkJKKG0bpKN-U");

// --- PERSISTENCIA DE SESIÓN ---
window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) {
        cargarSesion(JSON.parse(sesionGuardada));
    }
});

// --- LÓGICA DE NOTIFICACIONES ---
window.solicitarPermisoNotificaciones = () => {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
};

const enviarNotificacionNavegador = (titulo, cuerpo) => {
    if ("Notification" in window && Notification.permission === "granted") {
        // Icono genérico de caja
        new Notification(titulo, { body: cuerpo, icon: "https://cdn-icons-png.flaticon.com/512/679/679720.png" });
    }
};

// --- FUNCIONES GLOBALES ---

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();

    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else { alert("Usuario o clave incorrectos"); }
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    
    if(datos.rol === 'admin') {
        const btnAdmin = document.getElementById("btn-admin-stock");
        if(btnAdmin) btnAdmin.classList.remove("hidden");
    }
    
    configurarMenu();
    window.verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
    window.solicitarPermisoNotificaciones(); // Solicitar permiso al entrar
}

window.cerrarSesion = () => {
    localStorage.removeItem("fcilog_session");
    location.reload();
};

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(`pag-${id}`);
    if(target) target.classList.remove("hidden");
    if(window.innerWidth < 1024) {
        document.getElementById("sidebar").classList.add("-translate-x-full");
        document.getElementById("sidebar-overlay").classList.add("hidden");
    }
};

window.toggleMenu = () => {
    document.getElementById("sidebar").classList.toggle("-translate-x-full");
    document.getElementById("sidebar-overlay").classList.toggle("hidden");
};

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

// --- GESTIÓN DE STOCK ---
window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    
    if(n && !isNaN(c) && c > 0) {
        const docRef = doc(db, "inventario", n);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            await updateDoc(docRef, { cantidad: docSnap.data().cantidad + c });
        } else {
            await setDoc(docRef, { cantidad: c });
        }

        await addDoc(collection(db, "entradas_stock"), {
            insumo: n,
            cantidad: c,
            usuario: usuarioActual.id,
            fecha: new Date().toLocaleString(),
            timestamp: Date.now()
        });
        
        window.cerrarModalInsumo();
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
        alert("Stock registrado con éxito.");
    } else {
        alert("Ingresa datos válidos.");
    }
};

// --- PROCESAR PEDIDOS ---
window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value;
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value;

    if(!ins || isNaN(cant) || cant <= 0 || !ubi) return alert("Selecciona sede, insumo y cantidad.");

    await addDoc(collection(db, "pedidos"), {
        usuarioId: usuarioActual.id,
        insumoNom: ins,
        cantidad: cant,
        ubicacion: ubi,
        estado: "pendiente",
        fecha: new Date().toLocaleString(),
        timestamp: Date.now()
    });
    
    enviarMail("archivos@fcipty.com", { usuario: usuarioActual.id, insumo: ins, cantidad: cant, estado: "SOLICITUD NUEVA", ubicacion: ubi });
    alert("Solicitud enviada correctamente.");
    document.getElementById("sol-cantidad").value = "";
    document.getElementById("sol-ubicacion").value = "";
    
    window.verPagina(usuarioActual.rol === 'admin' ? 'solicitudes' : 'notificaciones');
};

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    const pData = (await getDoc(pRef)).data();
    const uSnap = await getDoc(doc(db, "usuarios", pData.usuarioId));
    const uMail = uSnap.exists() ? uSnap.data().email : "";

    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
            enviarMail(uMail, { usuario: "Sistema", insumo: ins, cantidad: cant, estado: "APROBADO", ubicacion: pData.ubicacion });
        } else { alert("Stock insuficiente."); }
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        enviarMail(uMail, { usuario: "Sistema", insumo: ins, cantidad: cant, estado: "RECHAZADO", ubicacion: pData.ubicacion });
    }
};

// --- EXPORTAR REPORTE CSV ---
window.descargarReporte = async () => {
    if(!confirm("¿Descargar historial completo en CSV?")) return;

    const pedidosSnap = await getDocs(collection(db, "pedidos"));
    const entradasSnap = await getDocs(collection(db, "entradas_stock"));
    let data = [];

    pedidosSnap.forEach(doc => {
        const d = doc.data();
        data.push({ timestamp: d.timestamp || 0, fila: `${d.fecha.replace(/,/g, '')},SALIDA,${d.insumoNom},${d.cantidad},${d.usuarioId},${d.ubicacion},${d.estado}` });
    });

    entradasSnap.forEach(doc => {
        const d = doc.data();
        data.push({ timestamp: d.timestamp || 0, fila: `${d.fecha.replace(/,/g, '')},ENTRADA,${d.insumo},${d.cantidad},${d.usuario},ALMACEN,APROBADO` });
    });

    data.sort((a, b) => b.timestamp - a.timestamp);

    let csvContent = "data:text/csv;charset=utf-8,FECHA,TIPO,INSUMO,CANTIDAD,USUARIO,UBICACION,ESTADO\r\n";
    data.forEach(row => csvContent += row.fila + "\r\n");

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "reporte_fcilog.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    if(id && pass) {
        await setDoc(doc(db, "usuarios", id), { pass, email, rol });
        alert("Usuario creado");
        document.getElementById("new-user").value = "";
    }
};

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };

// --- LÓGICA DE INTERFAZ ---

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    const rutas = isAdmin ? 
        [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Stock', i:'box'}, {id:'solicitar', n:'Pedido', i:'plus'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'historial', n:'Historial', i:'clock'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
        [{id:'stock', n:'Stock', i:'eye'}, {id:'solicitar', n:'Pedir', i:'plus'}, {id:'notificaciones', n:'Mis Pedidos', i:'history'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${r.i} w-6"></i> ${r.n}
        </button>`).join('');
}

function activarSincronizacion() {
    // Escuchar Inventario
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        const sel = document.getElementById("sol-insumo");
        const dl = document.getElementById("admin-stock-dl");
        let lbs = [], vls = [], tot = 0;
        list.innerHTML = "";
        if(sel) sel.innerHTML = '<option value="">Seleccionar Insumo...</option>';
        if(dl) dl.innerHTML = '';

        snap.forEach(d => {
            const p = d.data(); const n = d.id;
            tot += p.cantidad; lbs.push(n.toUpperCase()); vls.push(p.cantidad);
            list.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                <div><b class="uppercase">${n}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${n}')" class="text-red-400 p-2"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
            if(sel) sel.innerHTML += `<option value="${n}">${n.toUpperCase()}</option>`;
            if(dl) dl.innerHTML += `<option value="${n}">`;
        });

        if(usuarioActual.rol === 'admin') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = tot;
            renderChart('stockChart', lbs, vls, 'Stock', '#6366f1', stockChart, c => stockChart = c);
        }
    });

    // Escuchar Pedidos (y Notificar)
    onSnapshot(collection(db, "pedidos"), snap => {
        
        // LOGICA DE NOTIFICACIONES (Solo cambios)
        snap.docChanges().forEach(change => {
            if (change.type === "modified") {
                const p = change.doc.data();
                // Si el pedido es del usuario actual y cambió de estado
                if (usuarioActual && p.usuarioId === usuarioActual.id) {
                    enviarNotificacionNavegador(
                        `Pedido ${p.estado.toUpperCase()}`,
                        `Tu solicitud de ${p.insumoNom.toUpperCase()} ha cambiado a: ${p.estado}`
                    );
                }
            }
        });

        const filtro = document.getElementById("filtro-fecha") ? document.getElementById("filtro-fecha").value : 'actual';
        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const añoActual = ahora.getFullYear();

        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        const tHist = document.getElementById("tabla-historial-body");
        let pCnt = 0;
        const sUsr = {}, sLoc = {}, sIns = {};

        if(lAdmin) lAdmin.innerHTML = ""; if(lUser) lUser.innerHTML = ""; if(tHist) tHist.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            const pFecha = new Date(p.timestamp || Date.now());

            let pasaFiltro = true;
            if(filtro === 'actual') pasaFiltro = pFecha.getMonth() === mesActual && pFecha.getFullYear() === añoActual;
            if(filtro === 'anterior') pasaFiltro = pFecha.getMonth() === (mesActual - 1 === -1 ? 11 : mesActual - 1);

            if(pasaFiltro && p.estado === 'aprobado' && usuarioActual.rol === 'admin') {
                sUsr[p.usuarioId] = (sUsr[p.usuarioId] || 0) + 1;
                sLoc[p.ubicacion] = (sLoc[p.ubicacion] || 0) + 1;
                sIns[p.insumoNom] = (sIns[p.insumoNom] || 0) + 1;
            }
            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                pCnt++;
                lAdmin.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center border-l-4 border-l-amber-400">
                    <div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small class="text-indigo-600 font-bold">${p.ubicacion}</small></div>
                    <div class="flex gap-2">
                        <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Aprobar</button>
                        <button onclick="gestionarPedido('${d.id}','rechazar','${p.insumoNom}',${p.cantidad})" class="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold">X</button>
                    </div>
                </div>`;
            }
            if(usuarioActual.rol === 'admin' && p.estado !== 'pendiente') {
                tHist.innerHTML += `<tr class="border-b"><td class="p-4 text-slate-500">${p.fecha.split(',')[0]}</td><td class="p-4 font-bold uppercase">${p.insumoNom}</td><td class="p-4">x${p.cantidad}</td><td class="p-4 text-indigo-600 font-bold">${p.ubicacion}</td><td class="p-4 text-xs">${p.usuarioId}</td><td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td></tr>`;
            }
            if(p.usuarioId === usuarioActual.id) {
                lUser.innerHTML += `<div class="notif-card"><div><b>${p.insumoNom.toUpperCase()} (x${p.cantidad})</b><br><small>${p.ubicacion}</small></div><span class="badge status-${p.estado}">${p.estado}</span></div>`;
            }
        });

        if(usuarioActual.rol === 'admin') {
            document.getElementById("metrica-pedidos").innerText = pCnt;
            renderChart('userChart', Object.keys(sUsr), Object.values(sUsr), 'Pedidos', '#818cf8', userChart, c => userChart = c, 'y');
            renderChart('locationChart', Object.keys(sLoc), Object.values(sLoc), 'Consumo', '#fbbf24', locationChart, c => locationChart = c, 'y');
            renderChart('insumoChart', Object.keys(sIns), Object.values(sIns), 'Insumo', '#34d399', insumoChart, c => insumoChart = c);
        }
    });

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "entradas_stock"), snap => {
            const tE = document.getElementById("tabla-entradas-body");
            if(tE) {
                tE.innerHTML = "";
                let docs = []; snap.forEach(d => docs.push(d.data()));
                docs.sort((a,b) => b.timestamp - a.timestamp).forEach(e => {
                    tE.innerHTML += `<tr class="border-b"><td class="p-4 text-slate-500">${e.fecha}</td><td class="p-4 font-bold uppercase text-emerald-800">${e.insumo}</td><td class="p-4 font-bold text-emerald-600">+${e.cantidad}</td><td class="p-4 text-xs text-slate-400">${e.usuario}</td></tr>`;
                });
            }
        });
        onSnapshot(collection(db, "usuarios"), snap => {
            const list = document.getElementById("lista-usuarios-db");
            if(list) {
                list.innerHTML = "";
                snap.forEach(d => list.innerHTML += `<div class="user-card flex justify-between items-center"><div><b>${d.id}</b><br><small>${d.data().rol}</small></div><button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`);
            }
        });
    }
}

async function enviarMail(dest, info) {
    if(!dest) return;
    emailjs.send("default_service", "vvoz2ae", { destinatario: dest, ...info, name: "FCILog System" });
}

function renderChart(id, labels, data, title, color, instance, setInst, axis = 'x') {
    const ctx = document.getElementById(id);
    if(!ctx) return;
    if(instance) instance.destroy();
    setInst(new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: title, data, backgroundColor: color, borderRadius: 5 }] },
        options: { indexAxis: axis, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { beginAtZero: true } } }
    }));
}

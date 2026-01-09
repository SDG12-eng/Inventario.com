import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

// INICIALIZAR EMAILJS
emailjs.init("2jVnfkJKKG0bpKN-U"); 

// --- LOGIN ---
window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else { alert("Datos incorrectos"); }
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    if(datos.rol === 'admin') document.getElementById("btn-admin-stock").classList.remove("hidden");
    configurarMenu();
    verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
    activarSincronizacion();
}

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    const rutas = isAdmin ? 
        [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Inventario', i:'box'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
        [{id:'stock', n:'Ver Stock', i:'eye'}, {id:'solicitar', n:'Pedir', i:'plus'}, {id:'notificaciones', n:'Mis Pedidos', i:'history'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl transition font-bold">
            <i class="fas fa-${r.i} w-6"></i> ${r.n}
        </button>`).join('');
}

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
};

window.toggleMenu = () => document.getElementById("sidebar").classList.toggle("-translate-x-full");

// --- FUNCIÓN DE CORREO (Ajustada a tus plantillas) ---
async function enviarNotificacion(emailDestino, info) {
    if(!emailDestino) return;
    emailjs.send("default_service", "vvoz2ae", {
        destinatario: emailDestino,
        usuario: info.usuario,
        insumo: info.insumo,
        cantidad: info.cantidad,
        estado: info.estado,
        ubicacion: info.ubicacion,
        name: "Administración FCILog"
    });
}

// --- ACCIONES ---
window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value.trim();
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value.trim();

    if(ins && cant > 0) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString()
        });
        enviarNotificacion("archivos@fcipty.com", {
            usuario: usuarioActual.id, insumo: ins, cantidad: cant, estado: "NUEVA SOLICITUD", ubicacion: ubi
        });
        alert("Pedido enviado");
        verPagina('notificaciones');
    }
};

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    const uSnap = await getDoc(doc(db, "usuarios", (await getDoc(pRef)).data().usuarioId));
    const userEmail = uSnap.exists() ? uSnap.data().email : "";

    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
            if(userEmail) enviarNotificacion(userEmail, { usuario: uSnap.id, insumo: ins, cantidad: cant, estado: "APROBADO", ubicacion: "Bodega" });
        }
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        if(userEmail) enviarNotificacion(userEmail, { usuario: uSnap.id, insumo: ins, cantidad: cant, estado: "RECHAZADO", ubicacion: "Bodega" });
    }
};

// --- SYNC ---
function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        let lbs = [], vls = [], tot = 0; list.innerHTML = "";
        snap.forEach(d => {
            const p = d.data(); tot += p.cantidad; lbs.push(d.id.toUpperCase()); vls.push(p.cantidad);
            list.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                <div><b class="uppercase">${d.id}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
        });
        if(usuarioActual.rol === 'admin') {
            document.getElementById("metrica-total").innerText = snap.size;
            document.getElementById("metrica-stock").innerText = tot;
            actualizarGrafica(lbs, vls);
        }
    });

    onSnapshot(collection(db, "pedidos"), snap => {
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lUser = document.getElementById("lista-notificaciones");
        let pCnt = 0; if(lAdmin) lAdmin.innerHTML = ""; if(lUser) lUser.innerHTML = "";

        snap.forEach(d => {
            const p = d.data();
            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                pCnt++;
                lAdmin.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center">
                    <div><b>${p.insumoNom}</b> (x${p.cantidad})<br><small>${p.usuarioId}</small></div>
                    <div class="flex gap-2"><button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Aprobar</button>
                    <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold">X</button></div>
                </div>`;
            }
            if(p.usuarioId === usuarioActual.id) {
                lUser.innerHTML += `<div class="notif-card flex justify-between items-center"><div><b>${p.insumoNom}</b><br><small>${p.fecha}</small></div><span class="badge status-${p.estado}">${p.estado}</span></div>`;
            }
        });
        if(usuarioActual.rol === 'admin') document.getElementById("metrica-pedidos").innerText = pCnt;
    });

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const list = document.getElementById("lista-usuarios-db"); list.innerHTML = "";
            snap.forEach(d => { list.innerHTML += `<div class="user-card flex justify-between p-4 bg-white border rounded-xl"><div><b>${d.id}</b><br><small>${d.data().email}</small></div><button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div>`; });
        });
    }
}

window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    if(id && pass && email) await setDoc(doc(db, "usuarios", id), { pass, email, rol });
};

window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && !isNaN(c)) await setDoc(doc(db, "inventario", n), { cantidad: c });
    cerrarModalInsumo();
};

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };
window.cerrarSesion = () => location.reload();
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

function actualizarGrafica(l, d) {
    const ctx = document.getElementById('stockChart'); if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, { type: 'bar', data: { labels: l, datasets: [{ label: 'Stock', data: d, backgroundColor: '#6366f1', borderRadius: 8 }] } });
}
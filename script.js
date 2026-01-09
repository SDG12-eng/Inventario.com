import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;
let stockChart = null;

// --- EMAILJS CONFIG (REMPLAZA ESTOS DATOS) ---
emailjs.init("2jVnfkJKKG0bpKN-U"); // Reemplaza con tu Public Key de EmailJS

// --- LOGIN ---
window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();

    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin", email: "Archivos@fcipty.com" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else { alert("Credenciales incorrectas"); }
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

// --- NAVEGACIÓN ---
window.toggleMenu = () => {
    document.getElementById("sidebar").classList.toggle("-translate-x-full");
    document.getElementById("sidebar-overlay").classList.toggle("hidden");
};

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const isAdmin = usuarioActual.rol === 'admin';
    const rutas = isAdmin ? 
        [{id:'stats', n:'Dashboard', i:'chart-line'}, {id:'stock', n:'Stock', i:'boxes-stacked'}, {id:'solicitudes', n:'Pendientes', i:'bell'}, {id:'historial', n:'Historial', i:'clock-rotate-left'}, {id:'usuarios', n:'Usuarios', i:'user-gear'}] :
        [{id:'stock', n:'Stock', i:'eye'}, {id:'solicitar', n:'Pedir', i:'plus'}, {id:'mis-pedidos', n:'Mis Pedidos', i:'list'}, {id:'notificaciones', n:'Avisos', i:'envelope'}];

    menu.innerHTML = rutas.map(r => `
        <button onclick="verPagina('${r.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition font-bold group">
            <i class="fas fa-${r.i} w-6 text-slate-300 group-hover:text-indigo-500"></i> ${r.n}
        </button>`).join('');
}

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`).classList.remove("hidden");
    if(window.innerWidth < 1024) toggleMenu();
};

// --- CORREOS (EMAILJS) ---
async function enviarCorreo(destinatario, datos) {
    // Template variables: usuario, insumo, cantidad, ubicacion, estado, destinatario
    emailjs.send("default_service", "TU_TEMPLATE_ID", {
        usuario: datos.usuario,
        insumo: datos.insumo,
        cantidad: datos.cantidad,
        ubicacion: datos.ubicacion,
        estado: datos.estado,
        destinatario: destinatario
    }).catch(err => console.log("Error EmailJS:", err));
}

// --- ACCIONES ---
window.crearUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim();
    const rol = document.getElementById("new-role").value;
    if(id && pass && email) {
        await setDoc(doc(db, "usuarios", id), { pass, email, rol });
        alert("Usuario creado");
    }
};

window.procesarSolicitud = async () => {
    const ins = document.getElementById("sol-insumo").value.trim();
    const cant = parseInt(document.getElementById("sol-cantidad").value);
    const ubi = document.getElementById("sol-ubicacion").value.trim();

    if(ins && cant > 0) {
        await addDoc(collection(db, "pedidos"), {
            usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant,
            ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: new Date()
        });
        
        // Correo a Archivos
        enviarCorreo("Archivos@fcipty.com", {
            usuario: usuarioActual.id, insumo: ins, cantidad: cant, ubicacion: ubi, estado: "NUEVA SOLICITUD"
        });

        alert("Solicitud registrada");
        verPagina('mis-pedidos');
    }
};

window.gestionarPedido = async (pid, accion, ins, cant) => {
    const pRef = doc(db, "pedidos", pid);
    const pSnap = await getDoc(pRef);
    const pData = pSnap.data();
    
    // Buscar correo del usuario
    const uSnap = await getDoc(doc(db, "usuarios", pData.usuarioId));
    const correoUser = uSnap.exists() ? uSnap.data().email : "";

    if(accion === 'aprobar') {
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= cant) {
            await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
            await updateDoc(pRef, { estado: "aprobado" });
            
            crearNotifInterna(pData.usuarioId, `✅ Tu solicitud de ${ins} ha sido Aprobada.`);
            if(correoUser) enviarCorreo(correoUser, { usuario: pData.usuarioId, insumo: ins, cantidad: cant, ubicacion: pData.ubicacion, estado: "APROBADO" });
        } else { alert("Sin stock suficiente"); }
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        crearNotifInterna(pData.usuarioId, `❌ Tu solicitud de ${ins} ha sido Rechazada.`);
        if(correoUser) enviarCorreo(correoUser, { usuario: pData.usuarioId, insumo: ins, cantidad: cant, ubicacion: pData.ubicacion, estado: "RECHAZADO" });
    }
};

async function crearNotifInterna(uid, msg) {
    await addDoc(collection(db, "notificaciones"), { para: uid, mensaje: msg, fecha: new Date().toLocaleString(), timestamp: new Date() });
}

// --- SYNC REALTIME ---
function activarSincronizacion() {
    // 1. Inventario
    onSnapshot(collection(db, "inventario"), snap => {
        const list = document.getElementById("lista-inventario");
        let lbs = [], vls = [], tot = 0;
        list.innerHTML = "";
        snap.forEach(d => {
            const p = d.data(); tot += p.cantidad; lbs.push(d.id.toUpperCase()); vls.push(p.cantidad);
            list.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                <div><b class="uppercase">${d.id}</b><p class="text-xs text-slate-400 font-bold">Stock: ${p.cantidad}</p></div>
                ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-slate-200 hover:text-red-400"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
        });
        document.getElementById("metrica-total").innerText = snap.size;
        document.getElementById("metrica-stock").innerText = tot;
        actualizarGrafica(lbs, vls);
    });

    // 2. Pedidos
    onSnapshot(collection(db, "pedidos"), snap => {
        const lPend = document.getElementById("lista-pendientes-admin");
        const lMis = document.getElementById("lista-mis-pedidos");
        const tHist = document.getElementById("tabla-historial");
        let pCnt = 0; lPend.innerHTML = ""; lMis.innerHTML = ""; tHist.innerHTML = "";

        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a,b) => b.timestamp - a.timestamp);

        docs.forEach(p => {
            const st = `status-${p.estado}`;
            if(usuarioActual.rol === 'admin') {
                tHist.innerHTML += `<tr><td class="p-4 text-xs font-bold text-slate-400">${p.fecha}</td><td class="p-4 font-bold uppercase text-slate-600">${p.usuarioId}</td><td class="p-4 font-bold uppercase text-indigo-600">${p.insumoNom}</td><td class="p-4 font-bold text-center">${p.cantidad}</td><td class="p-4"><span class="badge ${st}">${p.estado}</span></td></tr>`;
            }
            if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
                pCnt++;
                lPend.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div><b class="uppercase text-indigo-700">${p.insumoNom}</b> (x${p.cantidad})<br><small class="font-bold text-slate-400 uppercase">${p.usuarioId} - ${p.ubicacion}</small></div>
                    <div class="flex gap-2 w-full sm:w-auto">
                        <button onclick="gestionarPedido('${p.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="flex-1 sm:flex-none bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">Aprobar</button>
                        <button onclick="gestionarPedido('${p.id}','rechazar')" class="flex-1 sm:flex-none bg-slate-100 px-4 py-2 rounded-xl text-sm font-bold">Rechazar</button>
                    </div>
                </div>`;
            }
            if(p.usuarioId === usuarioActual.id) {
                lMis.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div><b class="uppercase text-slate-700">${p.insumoNom}</b><br><small class="text-slate-400 font-bold">${p.fecha}</small></div>
                    <span class="badge ${st}">${p.estado}</span>
                </div>`;
            }
        });
        document.getElementById("metrica-pedidos").innerText = pCnt;
    });

    // 3. Notificaciones e Insumos
    onSnapshot(collection(db, "notificaciones"), snap => {
        const list = document.getElementById("lista-notificaciones");
        if(!list) return; list.innerHTML = "";
        snap.forEach(d => {
            if(d.data().para === usuarioActual.id) {
                list.innerHTML += `<div class="notif-card"><p class="text-sm font-bold text-slate-700">${d.data().mensaje}</p><small class="text-slate-400 text-[10px]">${d.data().fecha}</small></div>`;
            }
        });
    });
}

window.eliminarDato = async (col, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, col, id)); };
window.cerrarSesion = () => location.reload();
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && !isNaN(c)) await setDoc(doc(db, "inventario", n), { nombre: n, cantidad: c }, { merge: true });
    cerrarModalInsumo();
};

function actualizarGrafica(l, d) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, { type: 'bar', data: { labels: l, datasets: [{ label: 'Stock', data: d, backgroundColor: '#6366f1', borderRadius: 8 }] }, options: { plugins: { legend: { display: false } } } });
}
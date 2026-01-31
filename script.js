import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = { apiKey: "TU_API_KEY", projectId: "mi-web-db" }; // Reemplazar con tus datos
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;
let stockChart = null;
let carritoGlobal = {};
let insumoEditando = null;

// --- LOGIN Y SESIÓN ---
window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    
    if (user === "admin" && pass === "1130") {
        cargarSesion({ id: "admin", rol: "admin" });
    } else {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) {
            cargarSesion({ id: user, ...snap.data() });
        } else alert("Error de acceso");
    }
};

function cargarSesion(datos) {
    usuarioActual = datos;
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    document.getElementById("info-usuario").innerText = `${datos.id} | ${datos.rol}`;
    
    if(['admin','manager'].includes(datos.rol)) {
        document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    }
    
    configurarMenu();
    verPagina(datos.rol === 'user' ? 'stock' : 'stats');
    activarSincronizacion();
}

window.cerrarSesion = () => location.reload();

// --- NAVEGACIÓN ---
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`)?.classList.remove("hidden");
    if(window.innerWidth < 1024) toggleMenu(false);
};

window.toggleMenu = (open) => {
    const side = document.getElementById("sidebar");
    const over = document.getElementById("sidebar-overlay");
    side.classList.toggle("-translate-x-full", open === false);
    over.classList.toggle("hidden", open === false);
};

function configurarMenu() {
    const menu = document.getElementById("menu-dinamico");
    const r = usuarioActual.rol;
    const items = [
        { id: 'stats', n: 'Dashboard', i: 'chart-line', show: ['admin', 'manager', 'supervisor'] },
        { id: 'stock', n: 'Inventario', i: 'box', show: 'all' },
        { id: 'solicitar', n: 'Realizar Pedido', i: 'cart-plus', show: 'all' },
        { id: 'solicitudes', n: 'Pendientes', i: 'bell', show: ['admin', 'manager', 'supervisor'] },
        { id: 'historial', n: 'Historial', i: 'history', show: ['admin', 'manager', 'supervisor'] },
        { id: 'usuarios', n: 'Usuarios', i: 'users', show: ['admin'] },
        { id: 'notificaciones', n: 'Mis Pedidos', i: 'user-clock', show: ['user'] }
    ];

    menu.innerHTML = items.filter(i => i.show === 'all' || i.show.includes(r))
        .map(i => `<button onclick="verPagina('${i.id}')" class="w-full flex items-center gap-3 p-4 text-slate-600 hover:bg-indigo-50 rounded-xl font-bold text-sm">
            <i class="fas fa-${i.i} w-5"></i> ${i.n}</button>`).join('');
}

// --- SINCRONIZACIÓN Y AUTOCOMPLETADO ---
function activarSincronizacion() {
    // 1. Inventario y Autocompletado
    onSnapshot(collection(db, "inventario"), snap => {
        const listInv = document.getElementById("lista-inventario");
        const listPed = document.getElementById("contenedor-lista-pedidos");
        const dataList = document.getElementById("lista-sugerencias");
        
        listInv.innerHTML = "";
        if(listPed) listPed.innerHTML = "";
        if(dataList) dataList.innerHTML = "";

        let globalStock = 0, bajoStock = 0, labels = [], vals = [];

        snap.forEach(d => {
            const p = d.data();
            const id = d.id;
            globalStock += p.cantidad;
            if(p.cantidad <= (p.minimo || 0)) bajoStock++;
            
            labels.push(id.toUpperCase());
            vals.push(p.cantidad);

            // Opción para Autocompletado
            const opt = document.createElement("option");
            opt.value = id.toUpperCase();
            dataList.appendChild(opt);

            // Tarjeta de Stock
            listInv.innerHTML += `
                <div class="bg-white p-4 rounded-3xl border shadow-sm flex flex-col gap-3 relative">
                    <img src="${p.img || 'https://placehold.co/100x100?text=📦'}" class="h-24 w-full object-contain bg-slate-50 rounded-2xl">
                    <div class="flex justify-between items-start">
                        <div>
                            <b class="uppercase text-sm">${id}</b>
                            <p class="text-[10px] text-slate-400 font-bold">$${p.precio || 0} | Min: ${p.minimo || 0}</p>
                        </div>
                        <span class="text-xl font-black ${p.cantidad <= (p.minimo||0) ? 'text-red-500' : 'text-indigo-600'}">${p.cantidad}</span>
                    </div>
                    ${['admin','manager'].includes(usuarioActual.rol) ? 
                        `<button onclick="abrirConfigInsumo('${id}')" class="absolute top-2 right-2 text-slate-300 hover:text-indigo-600"><i class="fas fa-cog"></i></button>` : ''}
                </div>`;

            // Lista Pedidos
            if(listPed && p.cantidad > 0) {
                listPed.innerHTML += `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                    <span class="text-xs font-bold uppercase">${id}</span>
                    <div class="flex items-center gap-2">
                        <button onclick="cambiarCant('${id}',-1)" class="w-8 h-8 bg-white border rounded-lg">-</button>
                        <span id="q-${id}" class="w-4 text-center font-bold text-indigo-600">${carritoGlobal[id] || 0}</span>
                        <button onclick="cambiarCant('${id}',1)" class="w-8 h-8 bg-white border rounded-lg">+</button>
                    </div>
                </div>`;
            }
        });

        document.getElementById("metrica-total").innerText = snap.size;
        document.getElementById("metrica-stock").innerText = globalStock;
        document.getElementById("metrica-alerta").innerText = bajoStock;
        actualizarGrafica(labels, vals);
    });

    // 2. Pedidos y solicitudes... (Lógica de aprobación y notificaciones)
}

// --- GESTIÓN DE INSUMOS ---
window.abrirConfigInsumo = async (id) => {
    insumoEditando = id;
    const snap = await getDoc(doc(db, "inventario", id));
    const p = snap.data();
    document.getElementById("edit-titulo").innerText = id;
    document.getElementById("edit-img").value = p.img || "";
    document.getElementById("edit-precio").value = p.precio || 0;
    document.getElementById("edit-minimo").value = p.minimo || 0;
    document.getElementById("modal-editar-insumo").classList.remove("hidden");
};

window.guardarConfigInsumo = async () => {
    await updateDoc(doc(db, "inventario", insumoEditando), {
        img: document.getElementById("edit-img").value,
        precio: parseFloat(document.getElementById("edit-precio").value),
        minimo: parseInt(document.getElementById("edit-minimo").value)
    });
    cerrarModalEditar();
};

window.agregarProducto = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toLowerCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && c > 0) {
        const ref = doc(db, "inventario", n);
        const snap = await getDoc(ref);
        if(snap.exists()) await updateDoc(ref, { cantidad: snap.data().cantidad + c });
        else await setDoc(ref, { cantidad: c, precio: 0, minimo: 0, img: "" });
        
        cerrarModalInsumo();
        document.getElementById("nombre-prod").value = "";
        document.getElementById("cantidad-prod").value = "";
    }
};

window.cambiarCant = (id, delta) => {
    carritoGlobal[id] = Math.max(0, (carritoGlobal[id] || 0) + delta);
    document.getElementById(`q-${id}`).innerText = carritoGlobal[id];
};

// --- AUXILIARES ---
function actualizarGrafica(labels, data) {
    const ctx = document.getElementById('stockChart');
    if(!ctx) return;
    if(stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Stock', data, backgroundColor: '#6366f1' }] } });
}

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.cerrarModalEditar = () => document.getElementById("modal-editar-insumo").classList.add("hidden");

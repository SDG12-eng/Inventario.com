import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;
let stockChart = null;

// --- LOGIN ---
window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    cargarSesion({ id: "admin", rol: "admin" });
  } else {
    const snap = await getDoc(doc(db, "usuarios", user));
    if (snap.exists() && snap.data().pass === pass) {
      cargarSesion({ id: user, ...snap.data() });
    } else { alert("Error de acceso"); }
  }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("interfaz-app").style.display = "flex";
  document.getElementById("sol-usuario").value = `USER: ${datos.id.toUpperCase()}`;
  
  construirMenu();
  verPagina(datos.rol === 'admin' ? 'stats' : 'solicitar');
  sincronizarRealtime();
}

// --- NAVEGACIÓN ---
window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(`pag-${id}`).classList.remove("hidden");
  if(window.innerWidth < 768) toggleMenu(); // Cerrar menú en móvil tras click
};

window.toggleMenu = () => {
  document.getElementById("sidebar").classList.toggle("-translate-x-full");
};

// --- ELIMINAR (CORREGIDO) ---
window.eliminarDato = async (coleccion, id) => {
  if (confirm(`¿Seguro que deseas eliminar este registro?`)) {
    try {
      await deleteDoc(doc(db, coleccion, id));
    } catch (e) { console.error("Error al borrar:", e); }
  }
};

// --- GESTIÓN PRODUCTOS ---
window.agregarProducto = async () => {
  const nom = document.getElementById("nombre-prod").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad-prod").value);
  if (!nom || isNaN(cant)) return;

  const ref = doc(db, "inventario", nom);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { cantidad: snap.data().cantidad + cant });
  } else {
    await setDoc(ref, { nombre: nom, cantidad: cant });
  }
  document.getElementById("nombre-prod").value = "";
  document.getElementById("cantidad-prod").value = "";
};

// --- USUARIOS ---
window.crearUsuario = async () => {
  const id = document.getElementById("new-user").value.trim().toLowerCase();
  const pass = document.getElementById("new-pass").value.trim();
  const rol = document.getElementById("new-role").value;
  if(id && pass) await setDoc(doc(db, "usuarios", id), { pass, rol });
};

// --- SINCRONIZACIÓN (LA CLAVE DEL ÉXITO) ---
function sincronizarRealtime() {
  // 1. Inventario
  onSnapshot(collection(db, "inventario"), snap => {
    const lAdmin = document.getElementById("lista-inventario");
    const sug = document.getElementById("productos-sugeridos");
    let labels = [], values = [], totalStock = 0;
    
    lAdmin.innerHTML = ""; sug.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      totalStock += p.cantidad;
      labels.push(d.id.toUpperCase());
      values.push(p.cantidad);

      lAdmin.innerHTML += `
        <div class="prod-card glass flex justify-between items-center p-4">
          <div><b class="text-indigo-300 uppercase">${d.id}</b><br>Stock: ${p.cantidad}</div>
          <button onclick="eliminarDato('inventario','${d.id}')" class="text-red-500 hover:scale-110 transition"><i class="fas fa-trash"></i></button>
        </div>`;
      sug.innerHTML += `<option value="${d.id}">`;
    });
    document.getElementById("metrica-total").innerText = snap.size;
    document.getElementById("metrica-stock").innerText = totalStock;
    actualizarGrafica(labels, values);
  });

  // 2. Pedidos
  onSnapshot(collection(db, "pedidos"), snap => {
    const lPend = document.getElementById("lista-pendientes-admin");
    const lMis = document.getElementById("lista-mis-pedidos");
    let pendCount = 0;
    lPend.innerHTML = ""; lMis.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const card = `
        <div class="pedido-card glass p-4 flex justify-between items-center">
          <div><b class="uppercase">${p.insumoNom}</b> (${p.cantidad})<br><small class="text-slate-400">${p.usuarioId} - ${p.ubicacion}</small></div>
          <div class="flex gap-2 items-center">
            ${usuarioActual.rol === 'admin' && p.estado === 'pendiente' ? 
              `<button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-green-600 px-3 py-1 rounded">✔</button>
               <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-red-600 px-3 py-1 rounded">✖</button>` : 
              `<span class="badge status-${p.estado}">${p.estado}</span>`
            }
          </div>
        </div>`;
      if(p.estado === 'pendiente') pendCount++;
      if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') lPend.innerHTML += card;
      if(p.usuarioId === usuarioActual.id) lMis.innerHTML += card;
    });
    document.getElementById("metrica-pedidos").innerText = pendCount;
  });

  // 3. Usuarios
  if(usuarioActual.rol === 'admin') {
    onSnapshot(collection(db, "usuarios"), snap => {
      const lUser = document.getElementById("lista-usuarios-db");
      lUser.innerHTML = "";
      snap.forEach(d => {
        lUser.innerHTML += `
          <div class="prod-card glass flex justify-between items-center p-3">
            <span><b>${d.id}</b> (${d.data().rol})</span>
            <button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-400"><i class="fas fa-user-minus"></i></button>
          </div>`;
      });
    });
  }
}

// --- UTILIDADES ---
function construirMenu() {
  const menu = document.getElementById("menu-dinamico");
  const isAdmin = usuarioActual.rol === "admin";
  const items = isAdmin ? 
    [{id:'stats', n:'Estadísticas', i:'chart-line'}, {id:'admin-stock', n:'Gestionar Stock', i:'boxes'}, {id:'solicitudes', n:'Solicitudes', i:'bell'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
    [{id:'solicitar', n:'Solicitar', i:'plus'}, {id:'mis-pedidos', n:'Mis Pedidos', i:'history'}];
  
  menu.innerHTML = items.map(it => `
    <button onclick="verPagina('${it.id}')" class="menu-btn"><i class="fas fa-${it.i} mr-2 w-5"></i> ${it.n}</button>
  `).join('');
}

window.gestionarPedido = async (id, accion, ins, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", ins.toLowerCase());
    const iSnap = await getDoc(iRef);
    if (iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
    } else { alert("Stock insuficiente"); }
  } else { await updateDoc(pRef, { estado: "rechazado" }); }
};

window.cerrarSesion = () => location.reload();

function actualizarGrafica(labels, data) {
  const ctx = document.getElementById('stockChart');
  if(!ctx) return;
  if(stockChart) stockChart.destroy();
  stockChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Stock Actual', data, backgroundColor: '#6366f1' }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}
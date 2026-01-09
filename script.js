import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;
let stockChart = null;

// --- INICIO DE SESIÓN ---
window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    cargarSesion({ id: "admin", rol: "admin" });
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
  
  if(datos.rol === 'admin') {
      document.getElementById("btn-agregar-insumo-trigger").classList.remove("hidden");
  }

  configurarMenu();
  verPagina(datos.rol === 'admin' ? 'stats' : 'stock');
  sincronizarDatos();
}

// --- MENÚ SEGÚN ROL ---
function configurarMenu() {
  const menu = document.getElementById("menu-dinamico");
  const isAdmin = usuarioActual.rol === 'admin';
  const links = isAdmin ? 
    [{id:'stats', n:'Dashboard', i:'chart-pie'}, {id:'stock', n:'Stock Actual', i:'boxes'}, {id:'solicitudes', n:'Aprobar Pedidos', i:'check-circle'}, {id:'historial', n:'Historial', i:'history'}, {id:'usuarios', n:'Usuarios', i:'users'}] :
    [{id:'stock', n:'Ver Stock', i:'boxes'}, {id:'solicitar', n:'Hacer Solicitud', i:'plus-circle'}, {id:'mis-pedidos', n:'Mis Pedidos', i:'clock'}];

  menu.innerHTML = links.map(l => `
    <button onclick="verPagina('${l.id}')" class="w-full flex items-center gap-3 p-3.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-2xl transition font-medium group">
      <i class="fas fa-${l.i} text-slate-400 group-hover:text-indigo-500 w-6"></i> ${l.n}
    </button>`).join('');
}

window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(`pag-${id}`).classList.remove("hidden");
};

// --- CRUD INSUMOS (ADMIN) ---
window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");

window.agregarProducto = async () => {
  const nom = document.getElementById("nombre-prod").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad-prod").value);
  if (!nom || isNaN(cant)) return;

  await setDoc(doc(db, "inventario", nom), { nombre: nom, cantidad: cant }, { merge: true });
  cerrarModalInsumo();
};

window.eliminarDato = async (col, id) => {
  if(confirm("¿Seguro de eliminar este registro?")) await deleteDoc(doc(db, col, id));
};

// --- GESTIÓN USUARIOS (ADMIN) ---
window.crearUsuario = async () => {
  const id = document.getElementById("new-user").value.trim().toLowerCase();
  const pass = document.getElementById("new-pass").value.trim();
  const rol = document.getElementById("new-role").value;
  if(id && pass) await setDoc(doc(db, "usuarios", id), { pass, rol });
};

// --- SOLICITUDES (SOLICITANTE) ---
window.procesarSolicitud = async () => {
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  const ubi = document.getElementById("sol-ubicacion").value.trim();

  if(!ins || isNaN(cant)) return alert("Datos incompletos");

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    insumoNom: ins,
    cantidad: cant,
    ubicacion: ubi,
    estado: "pendiente",
    fechaRaw: new Date(),
    fecha: new Date().toLocaleString()
  });
  alert("Solicitud enviada");
  verPagina('mis-pedidos');
};

// --- SINCRONIZACIÓN REALTIME ---
function sincronizarDatos() {
  // Insumos
  onSnapshot(collection(db, "inventario"), snap => {
    const list = document.getElementById("lista-inventario");
    const sug = document.getElementById("productos-sugeridos");
    let labels = [], values = [], total = 0;
    list.innerHTML = ""; sug.innerHTML = "";
    
    snap.forEach(d => {
      const p = d.data();
      total += p.cantidad; labels.push(d.id.toUpperCase()); values.push(p.cantidad);
      list.innerHTML += `
        <div class="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
          <div><b class="uppercase text-slate-900">${d.id}</b><p class="text-sm text-slate-500">En stock: ${p.cantidad}</p></div>
          ${usuarioActual.rol === 'admin' ? `<button onclick="eliminarDato('inventario','${d.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash"></i></button>` : ''}
        </div>`;
      sug.innerHTML += `<option value="${d.id}">`;
    });
    document.getElementById("metrica-total").innerText = snap.size;
    document.getElementById("metrica-stock").innerText = total;
    actualizarGrafica(labels, values);
  });

  // Pedidos
  const qPedidos = query(collection(db, "pedidos"), orderBy("fechaRaw", "desc"));
  onSnapshot(qPedidos, snap => {
    const lPend = document.getElementById("lista-pendientes-admin");
    const lMis = document.getElementById("lista-mis-pedidos");
    const tHist = document.getElementById("tabla-historial");
    let pendCount = 0;
    lPend.innerHTML = ""; lMis.innerHTML = ""; tHist.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const statusClass = `status-${p.estado}`;
      const row = `<tr><td class="p-4 text-xs">${p.fecha}</td><td class="p-4 font-bold uppercase">${p.usuarioId}</td><td class="p-4 uppercase">${p.insumoNom}</td><td class="p-4">${p.cantidad}</td><td class="p-4"><span class="badge ${statusClass}">${p.estado}</span></td></tr>`;
      
      tHist.innerHTML += row;

      if(p.usuarioId === usuarioActual.id) {
          lMis.innerHTML += `<div class="bg-white p-4 rounded-2xl border flex justify-between items-center"><div><b class="uppercase">${p.insumoNom}</b> (${p.cantidad})</div><span class="badge ${statusClass}">${p.estado}</span></div>`;
      }

      if(usuarioActual.rol === 'admin' && p.estado === 'pendiente') {
          pendCount++;
          lPend.innerHTML += `<div class="bg-white p-5 rounded-2xl border flex justify-between items-center">
            <div><b class="uppercase">${p.insumoNom}</b> por ${p.usuarioId}<br><small>${p.ubicacion}</small></div>
            <div class="flex gap-2">
                <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Aprobar</button>
                <button onclick="gestionarPedido('${d.id}','rechazar')" class="bg-slate-100 px-4 py-2 rounded-lg text-sm font-bold">Rechazar</button>
            </div>
          </div>`;
      }
    });
    document.getElementById("metrica-pedidos").innerText = pendCount;
  });

  // Usuarios (Solo Admin)
  if(usuarioActual.rol === 'admin') {
    onSnapshot(collection(db, "usuarios"), snap => {
      const list = document.getElementById("lista-usuarios-db");
      list.innerHTML = "";
      snap.forEach(d => {
        list.innerHTML += `<div class="bg-white p-4 rounded-2xl border flex justify-between items-center"><div><b>${d.id}</b><p class="text-xs uppercase text-slate-400">${d.data().rol}</p></div><button onclick="eliminarDato('usuarios','${d.id}')" class="text-red-300 hover:text-red-500"><i class="fas fa-user-times"></i></button></div>`;
      });
    });
  }
}

window.gestionarPedido = async (id, accion, ins, cant) => {
  const pRef = doc(db, "pedidos", id);
  if(accion === 'aprobar') {
    const iRef = doc(db, "inventario", ins.toLowerCase());
    const iSnap = await getDoc(iRef);
    if(iSnap.exists() && iSnap.data().cantidad >= cant) {
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
  stockChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Stock', data, backgroundColor: '#6366f1' }] } });
}
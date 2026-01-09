import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;

// --- LOGIN Y SESIÓN ---
window.iniciarSesion = async () => {
  const user = document.getElementById("login-user").value.trim().toLowerCase();
  const pass = document.getElementById("login-pass").value.trim();

  if (user === "admin" && pass === "1130") {
    cargarSesion({ id: "admin", rol: "admin" });
    return;
  }

  const userRef = doc(db, "usuarios", user);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists() && userSnap.data().pass === pass) {
    cargarSesion({ id: user, ...userSnap.data() });
  } else {
    alert("Usuario o contraseña incorrectos");
  }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("interfaz-app").style.display = "block";
  document.getElementById("sol-usuario").value = datos.id.toUpperCase();

  const isAdmin = datos.rol === "admin";
  
  // Mostrar u ocultar botones del menú según rol
  document.getElementById("nav-admin").style.display = isAdmin ? "inline-block" : "none";
  document.getElementById("nav-historial").style.display = isAdmin ? "inline-block" : "none";
  document.getElementById("nav-usuarios").style.display = isAdmin ? "inline-block" : "none";
  
  document.getElementById("nav-ver-stock").style.display = !isAdmin ? "inline-block" : "none";
  document.getElementById("nav-mis-pedidos").style.display = !isAdmin ? "inline-block" : "none";

  verPagina(isAdmin ? 'admin' : 'ver-stock');
  escucharMisPedidos(); // Activar historial personal
}

window.cerrarSesion = () => location.reload();

window.verPagina = (id) => {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(`pag-${id}`).style.display = 'block';
};

// --- GESTIÓN DE USUARIOS (ADMIN) ---
window.crearUsuario = async () => {
  const user = document.getElementById("new-user").value.trim().toLowerCase();
  const pass = document.getElementById("new-pass").value.trim();
  const rol = document.getElementById("new-role").value;
  if (!user || !pass) return alert("Llena todos los campos");
  await setDoc(doc(db, "usuarios", user), { pass, rol });
  alert("Usuario creado");
  document.getElementById("new-user").value = ""; document.getElementById("new-pass").value = "";
};

// --- INVENTARIO (ADMIN) ---
window.agregarProducto = async () => {
  const nom = document.getElementById("nombre").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad").value);
  if (!nom || isNaN(cant)) return;
  const ref = doc(db, "inventario", nom);
  const snap = await getDoc(ref);
  snap.exists() ? await updateDoc(ref, { cantidad: snap.data().cantidad + cant }) : await setDoc(ref, { nombre: nom, cantidad: cant });
  document.getElementById("nombre").value = ""; document.getElementById("cantidad").value = "";
};

// --- SOLICITUDES ---
window.procesarSolicitud = async () => {
  const ubi = document.getElementById("sol-ubicacion").value;
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  if (!ins || isNaN(cant)) return alert("Elige insumo y cantidad");

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    ubicacion: ubi,
    insumoNom: ins,
    cantidad: cant,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });
  alert("Enviado. Revisa 'Mis Estados' para ver el progreso.");
  document.getElementById("sol-insumo").value = ""; document.getElementById("sol-cantidad").value = "";
};

// --- APROBAR/RECHAZAR (ADMIN) ---
window.gestionarPedido = async (id, accion, insumo, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", insumo);
    const iSnap = await getDoc(iRef);
    if (iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
      alert("Aprobado y stock descontado");
    } else alert("Stock insuficiente");
  } else {
    await updateDoc(pRef, { estado: "rechazado" });
  }
};

// --- TIEMPO REAL ---

// Inventario (Admin y Usuario ven esto diferente)
onSnapshot(collection(db, "inventario"), (snap) => {
  const listAdmin = document.getElementById("lista-inventario");
  const listUser = document.getElementById("lista-solo-lectura");
  const suger = document.getElementById("productos-sugeridos");
  
  listAdmin.innerHTML = ""; listUser.innerHTML = ""; suger.innerHTML = "";
  
  snap.forEach(doc => {
    const p = doc.data();
    // Vista Admin
    listAdmin.innerHTML += `<div class="prod-card"><div><strong>${doc.id.toUpperCase()}</strong><br>Stock: ${p.cantidad}</div><button onclick="eliminarDato('inventario','${doc.id}')" style="color:red;background:none;border:none;cursor:pointer">🗑️</button></div>`;
    // Vista Usuario
    listUser.innerHTML += `<div class="prod-card-simple"><strong>${doc.id.toUpperCase()}</strong><br>Disponible: ${p.cantidad}</div>`;
    suger.innerHTML += `<option value="${doc.id}">`;
  });
});

// Pedidos (Admin ve todos los pendientes)
onSnapshot(query(collection(db, "pedidos"), where("estado", "==", "pendiente")), (snap) => {
  const list = document.getElementById("lista-pedidos");
  list.innerHTML = "";
  snap.forEach(d => {
    const p = d.data();
    list.innerHTML += `<div class="pedido-card">
      <div class="pedido-info"><h4>${p.insumoNom} (${p.cantidad})</h4><p>${p.usuarioId.toUpperCase()} - ${p.ubicacion}</p></div>
      <div class="acciones">
        <button class="btn-aprobar" onclick="gestionarPedido('${d.id}', 'aprobar', '${p.insumoNom}', ${p.cantidad})">✔</button>
        <button class="btn-rechazar" onclick="gestionarPedido('${d.id}', 'rechazar')">✖</button>
      </div></div>`;
  });
});

// Mis Pedidos (Usuario ve solo los suyos y su estado)
function escucharMisPedidos() {
  if(!usuarioActual) return;
  const q = query(collection(db, "pedidos"), where("usuarioId", "==", usuarioActual.id));
  onSnapshot(q, (snap) => {
    const list = document.getElementById("lista-mis-pedidos");
    list.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      const clase = p.estado === 'aprobado' ? 'status-aprobado' : (p.estado === 'rechazado' ? 'status-rechazado' : 'status-pendiente');
      list.innerHTML += `<div class="pedido-card">
        <div class="pedido-info"><h4>${p.insumoNom} (${p.cantidad} ud)</h4><p>Fecha: ${p.fecha}</p></div>
        <span class="badge ${clase}">${p.estado.toUpperCase()}</span>
      </div>`;
    });
  });
}

onSnapshot(collection(db, "usuarios"), (snap) => {
  const div = document.getElementById("lista-usuarios-db");
  div.innerHTML = "";
  snap.forEach(d => { div.innerHTML += `<div class="pedido-card"><div><strong>${d.id.toUpperCase()}</strong> - ${d.data().rol}</div><button class="btn-rechazar" onclick="eliminarDato('usuarios', '${d.id}')">🗑️</button></div>`; });
});

window.eliminarDato = async (coll, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, coll, id)); };
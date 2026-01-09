import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc 
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

  // Usuario maestro de emergencia
  if (user === "admin" && pass === "1234") {
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

  // Control de Roles: Si no es admin, ocultamos opciones
  if (datos.rol !== "admin") {
    document.getElementById("nav-admin").style.display = "none";
    document.getElementById("nav-historial").style.display = "none";
    document.getElementById("nav-usuarios").style.display = "none";
    verPagina('solicitar');
  } else {
    verPagina('admin');
  }
}

window.cerrarSesion = () => location.reload();

// --- NAVEGACIÓN ---
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
  alert("Usuario creado correctamente");
  document.getElementById("new-user").value = "";
  document.getElementById("new-pass").value = "";
};

// --- INVENTARIO ---
window.agregarProducto = async () => {
  const nom = document.getElementById("nombre").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad").value);
  if (!nom || isNaN(cant)) return;

  const ref = doc(db, "inventario", nom);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { cantidad: snap.data().cantidad + cant });
  } else {
    await setDoc(ref, { nombre: nom, cantidad: cant });
  }
  document.getElementById("nombre").value = ""; document.getElementById("cantidad").value = "";
};

// --- SOLICITUDES ---
window.procesarSolicitud = async () => {
  const ubi = document.getElementById("sol-ubicacion").value;
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);

  if (!ins || isNaN(cant)) return alert("Elige un insumo y cantidad");

  await addDoc(collection(db, "pedidos"), {
    usuario: usuarioActual.id,
    ubicacion: ubi,
    insumoNom: ins,
    cantidad: cant,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });
  alert("Solicitud enviada");
  document.getElementById("sol-insumo").value = "";
  document.getElementById("sol-cantidad").value = "";
};

window.gestionarPedido = async (id, accion, insumo, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", insumo);
    const iSnap = await getDoc(iRef);
    if (iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await deleteDoc(pRef);
      alert("✅ Aprobado");
    } else alert("❌ Stock insuficiente");
  } else {
    await deleteDoc(pRef);
    alert("Rechazado");
  }
};

// --- ACTUALIZACIONES EN TIEMPO REAL ---

// Usuarios
onSnapshot(collection(db, "usuarios"), (snap) => {
  const div = document.getElementById("lista-usuarios-db");
  div.innerHTML = "";
  snap.forEach(d => {
    div.innerHTML += `
      <div class="pedido-card">
        <div><strong>${d.id.toUpperCase()}</strong> - Rol: ${d.data().rol}</div>
        <button class="btn-rechazar" onclick="eliminarDato('usuarios', '${d.id}')">🗑️</button>
      </div>`;
  });
});

// Inventario
onSnapshot(collection(db, "inventario"), (snap) => {
  const list = document.getElementById("lista-inventario");
  const suger = document.getElementById("productos-sugeridos");
  list.innerHTML = ""; suger.innerHTML = "";
  snap.forEach(doc => {
    list.innerHTML += `<div class="prod-card"><div><strong>${doc.id.toUpperCase()}</strong><br>Stock: ${doc.data().cantidad}</div><button onclick="eliminarDato('inventario','${doc.id}')" style="color:red;background:none;border:none;cursor:pointer">🗑️</button></div>`;
    suger.innerHTML += `<option value="${doc.id}">`;
  });
});

// Pedidos
onSnapshot(collection(db, "pedidos"), (snap) => {
  const list = document.getElementById("lista-pedidos");
  list.innerHTML = "";
  snap.forEach(d => {
    const p = d.data();
    list.innerHTML += `<div class="pedido-card"><div class="pedido-info"><h4>${p.insumoNom} (${p.cantidad})</h4><p>${p.usuario} - ${p.ubicacion}</p></div><div class="acciones"><button class="btn-aprobar" onclick="gestionarPedido('${d.id}', 'aprobar', '${p.insumoNom}', ${p.cantidad})">✔</button><button class="btn-rechazar" onclick="gestionarPedido('${d.id}', 'rechazar')">✖</button></div></div>`;
  });
});

window.eliminarDato = async (coll, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, coll, id)); };
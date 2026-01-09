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

// --- LOGIN ---
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
  } else { alert("Usuario o contraseña incorrectos"); }
};

function cargarSesion(datos) {
  usuarioActual = datos;
  document.getElementById("pantalla-login").style.display = "none";
  document.getElementById("interfaz-app").style.display = "block";
  document.getElementById("sol-usuario").value = datos.id.toUpperCase();

  const isAdmin = (datos.rol === "admin");
  
  // Control de visibilidad de botones
  document.getElementById("nav-admin").style.display = isAdmin ? "inline-block" : "none";
  document.getElementById("nav-pedidos").style.display = isAdmin ? "inline-block" : "none";
  document.getElementById("nav-historial").style.display = isAdmin ? "inline-block" : "none";
  document.getElementById("nav-usuarios").style.display = isAdmin ? "inline-block" : "none";
  
  document.getElementById("nav-ver-stock").style.display = isAdmin ? "none" : "inline-block";
  document.getElementById("nav-solicitar").style.display = isAdmin ? "none" : "inline-block";
  document.getElementById("nav-mis-pedidos").style.display = isAdmin ? "none" : "inline-block";

  verPagina(isAdmin ? 'admin' : 'ver-stock');
  escucharTodo();
}

window.cerrarSesion = () => location.reload();

window.verPagina = (id) => {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(`pag-${id}`).style.display = 'block';
};

// --- GESTIÓN DE DATOS ---
window.agregarProducto = async () => {
  const nom = document.getElementById("nombre").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("cantidad").value);
  if (!nom || isNaN(cant)) return;
  const ref = doc(db, "inventario", nom);
  const snap = await getDoc(ref);
  snap.exists() ? await updateDoc(ref, { cantidad: snap.data().cantidad + cant }) : await setDoc(ref, { nombre: nom, cantidad: cant });
  document.getElementById("nombre").value = ""; document.getElementById("cantidad").value = "";
};

window.crearUsuario = async () => {
  const user = document.getElementById("new-user").value.trim().toLowerCase();
  const pass = document.getElementById("new-pass").value.trim();
  const rol = document.getElementById("new-role").value;
  if (user && pass) {
    await setDoc(doc(db, "usuarios", user), { pass, rol });
    alert("Usuario creado");
    document.getElementById("new-user").value = ""; document.getElementById("new-pass").value = "";
  }
};

window.procesarSolicitud = async () => {
  const ubi = document.getElementById("sol-ubicacion").value.trim();
  const ins = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cant = parseInt(document.getElementById("sol-cantidad").value);
  if (!ins || isNaN(cant) || !ubi) return alert("Completa todos los campos");

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    ubicacion: ubi,
    insumoNom: ins,
    cantidad: cant,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });
  alert("Solicitud enviada");
  document.getElementById("sol-insumo").value = ""; document.getElementById("sol-cantidad").value = "";
};

window.gestionarPedido = async (id, accion, insumo, cant) => {
  const pRef = doc(db, "pedidos", id);
  if (accion === 'aprobar') {
    const iRef = doc(db, "inventario", insumo);
    const iSnap = await getDoc(iRef);
    if (iSnap.exists() && iSnap.data().cantidad >= cant) {
      await updateDoc(iRef, { cantidad: iSnap.data().cantidad - cant });
      await updateDoc(pRef, { estado: "aprobado" });
    } else alert("Stock insuficiente");
  } else {
    await updateDoc(pRef, { estado: "rechazado" });
  }
};

// --- ESCUCHA DE DATOS EN TIEMPO REAL ---
function escucharTodo() {
  // Inventario
  onSnapshot(collection(db, "inventario"), (snap) => {
    const lA = document.getElementById("lista-inventario");
    const lU = document.getElementById("lista-solo-lectura");
    const sug = document.getElementById("productos-sugeridos");
    lA.innerHTML = ""; lU.innerHTML = ""; sug.innerHTML = "";
    snap.forEach(d => {
      const p = d.data();
      const st = p.cantidad < 5 ? 'color:red;font-weight:bold' : '';
      lA.innerHTML += `<div class="prod-card"><div><strong>${d.id.toUpperCase()}</strong><br><span style="${st}">Cant: ${p.cantidad}</span></div><button onclick="eliminarDato('inventario','${d.id}')" style="color:red;border:none;background:none">🗑️</button></div>`;
      lU.innerHTML += `<div class="prod-card-simple"><strong>${d.id.toUpperCase()}</strong><br><span style="${st}">Stock: ${p.cantidad}</span></div>`;
      sug.innerHTML += `<option value="${d.id}">`;
    });
  });

  // Usuarios (Solo para Admin)
  if (usuarioActual.rol === "admin") {
    onSnapshot(collection(db, "usuarios"), (snap) => {
      const div = document.getElementById("lista-usuarios-db");
      div.innerHTML = "";
      snap.forEach(d => div.innerHTML += `<div class="pedido-card"><div><strong>${d.id.toUpperCase()}</strong> - ${d.data().rol}</div><button onclick="eliminarDato('usuarios','${d.id}')">🗑️ Borrar</button></div>`);
    });
  }

  // Pedidos (Lógica unificada para evitar errores de índice)
  onSnapshot(collection(db, "pedidos"), (snap) => {
    const pAdmin = document.getElementById("lista-pendientes-admin");
    const hAdmin = document.getElementById("lista-historial-admin");
    const uMis = document.getElementById("lista-mis-pedidos");

    if(pAdmin) pAdmin.innerHTML = "";
    if(hAdmin) hAdmin.innerHTML = "";
    if(uMis) uMis.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const html = `<div class="pedido-card">
        <div class="pedido-info"><h4>${p.insumoNom} (${p.cantidad})</h4><p>${p.usuarioId.toUpperCase()} | ${p.ubicacion || ''}</p><p style="font-size:10px">${p.fecha}</p></div>
        ${usuarioActual.rol === 'admin' && p.estado === 'pendiente' ? 
          `<div class="acciones">
            <button class="btn-aprobar" onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})">✔</button>
            <button class="btn-rechazar" onclick="gestionarPedido('${d.id}','rechazar')">✖</button>
          </div>` : 
          `<span class="badge status-${p.estado}">${p.estado}</span>`
        }
      </div>`;

      // Si soy admin, clasifico en Pendientes o Historial
      if (usuarioActual.rol === "admin") {
        if (p.estado === "pendiente") pAdmin.innerHTML += html;
        else hAdmin.innerHTML += html;
      } 
      // Si soy usuario, solo muestro los míos
      else if (p.usuarioId === usuarioActual.id) {
        uMis.innerHTML += html;
      }
    });
  });
}

window.eliminarDato = async (coll, id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, coll, id)); };
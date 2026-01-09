import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;

window.iniciarSesion = async () => {
  const user = el("login-user").value.toLowerCase();
  const pass = el("login-pass").value;

  if (user === "admin" && pass === "1130") {
    iniciarApp({ id: "admin", rol: "admin" });
    return;
  }

  const snap = await getDoc(doc(db, "usuarios", user));
  if (!snap.exists() || snap.data().pass !== pass) {
    alert("Credenciales incorrectas");
    return;
  }
  iniciarApp({ id: user, ...snap.data() });
};

function iniciarApp(user) {
  usuarioActual = user;
  el("pantalla-login").style.display = "none";
  el("interfaz-app").style.display = "flex";
  configurarMenu();
  if(el("sol-usuario")) el("sol-usuario").value = `USUARIO: ${user.id.toUpperCase()}`;
  verPagina(user.rol === "admin" ? "admin" : "ver-stock");
  iniciarSincronizacion();
}

window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  const target = el(`pag-${id}`);
  if(target) target.style.display = "block";
};

window.agregarProducto = async () => {
  const nombre = el("nombre").value.trim().toLowerCase();
  const cantidad = parseInt(el("cantidad").value) || 0;
  if (!nombre || cantidad <= 0) return;
  await addDoc(collection(db, "inventario"), { nombre, cantidad, creado: serverTimestamp() });
  el("nombre").value = ""; el("cantidad").value = "";
};

function iniciarSincronizacion() {
  onSnapshot(collection(db, "inventario"), snap => {
    const adminList = el("lista-inventario");
    const userList = el("lista-solo-lectura");
    const sug = el("productos-sugeridos");

    if(adminList) adminList.innerHTML = "";
    if(userList) userList.innerHTML = "";
    if(sug) sug.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const card = `
        <div class="prod-card glass">
          <div>
            <div style="font-size: 0.8rem; color: #94a3b8;">PRODUCTO</div>
            <div style="font-weight: bold; text-transform: uppercase;">${p.nombre}</div>
            <div style="color: var(--success); font-weight: bold;">${p.cantidad} unidades</div>
          </div>
          <button onclick="eliminarDato('inventario','${d.id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2rem;">🗑️</button>
        </div>`;
      
      if(adminList) adminList.insertAdjacentHTML("beforeend", card);
      if(userList) userList.insertAdjacentHTML("beforeend", card.replace('🗑️', ''));
      if(sug) sug.insertAdjacentHTML("beforeend", `<option value="${p.nombre}">`);
    });
  });

  onSnapshot(collection(db, "pedidos"), snap => {
    const pA = el("lista-pendientes-admin");
    const hA = el("lista-historial-admin");
    if(pA) pA.innerHTML = ""; if(hA) hA.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const card = `
        <div class="prod-card glass" style="margin-bottom: 10px;">
          <div>
            <strong>${p.insumoNom.toUpperCase()}</strong> (${p.cantidad})<br>
            <small>${p.usuarioId} - ${p.ubicacion}</small>
          </div>
          <div>
            ${p.estado === 'pendiente' && usuarioActual.rol === 'admin' ? 
              `<button onclick="gestionarPedido('${d.id}','aprobar')" class="badge status-aprobado">✔</button>
               <button onclick="gestionarPedido('${d.id}','rechazar')" class="badge status-rechazado">✖</button>` :
              `<span class="badge status-${p.estado}">${p.estado}</span>`
            }
          </div>
        </div>`;
      if(p.estado === 'pendiente' && pA) pA.innerHTML += card;
      else if(hA) hA.innerHTML += card;
    });
  });
}

const el = id => document.getElementById(id);
window.eliminarDato = async (col, id) => confirm("¿Eliminar?") && await deleteDoc(doc(db, col, id));
window.cerrarSesion = () => location.reload();

const configurarMenu = () => {
  const isAdmin = usuarioActual.rol === "admin";
  const adminIds = ["nav-admin", "nav-pedidos", "nav-historial", "nav-usuarios"];
  adminIds.forEach(id => {
      if(el(id)) el(id).style.display = isAdmin ? "block" : "none";
  });
};
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  deleteDoc,
  updateDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/* 🔧 Firebase */
const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let usuarioActual = null;

/* 🔐 LOGIN */
window.iniciarSesion = async () => {
  const user = loginUser().toLowerCase();
  const pass = loginPass();

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
  ocultarLogin();
  configurarMenu();
  document.getElementById("sol-usuario").value = `USUARIO: ${user.id.toUpperCase()}`;
  verPagina(user.rol === "admin" ? "admin" : "ver-stock");
  iniciarSincronizacion();
}

/* 🧭 NAVEGACIÓN */
window.verPagina = (id) => {
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  document.getElementById(`pag-${id}`).style.display = "block";
};

/* 📦 INVENTARIO */
window.agregarProducto = async () => {
  const nombre = val("nombre").toLowerCase();
  const cantidad = num("cantidad");
  if (!nombre || cantidad <= 0) return;

  await addDoc(collection(db, "inventario"), {
    nombre,
    cantidad,
    creado: serverTimestamp()
  });
};

/* 🧾 SOLICITUD */
window.procesarSolicitud = async () => {
  const insumo = val("sol-insumo").toLowerCase();
  const cantidad = num("sol-cantidad");
  const ubicacion = val("sol-ubicacion");

  if (!insumo || cantidad <= 0 || !ubicacion) {
    alert("Completa los datos");
    return;
  }

  await addDoc(collection(db, "pedidos"), {
    usuarioId: usuarioActual.id,
    insumoNom: insumo,
    cantidad,
    ubicacion,
    estado: "pendiente",
    fecha: serverTimestamp()
  });

  alert("Solicitud enviada");
  verPagina("mis-pedidos");
};

/* ✔ / ✖ PEDIDOS */
window.gestionarPedido = async (id, accion, insumo, cantidad) => {
  const pedidoRef = doc(db, "pedidos", id);

  if (accion === "aprobar") {
    const q = await getDocs(collection(db, "inventario"));
    const prod = q.docs.find(d => d.data().nombre === insumo);

    if (!prod || prod.data().cantidad < cantidad) {
      alert("Stock insuficiente");
      return;
    }

    await updateDoc(doc(db, "inventario", prod.id), {
      cantidad: prod.data().cantidad - cantidad
    });

    await updateDoc(pedidoRef, { estado: "aprobado" });
  } else {
    await updateDoc(pedidoRef, { estado: "rechazado" });
  }
};

/* ❌ ELIMINAR */
window.eliminarDato = async (coleccion, id) => {
  if (!confirm("¿Eliminar definitivamente?")) return;
  await deleteDoc(doc(db, coleccion, id));
};

/* 👥 USUARIOS */
window.crearUsuario = async () => {
  const u = val("new-user").toLowerCase();
  const p = val("new-pass");
  const r = document.getElementById("new-role").value;
  if (!u || !p) return;

  await setDoc(doc(db, "usuarios", u), { pass: p, rol: r });
};

/* 🔄 SINCRONIZACIÓN REAL */
function iniciarSincronizacion() {

  /* INVENTARIO */
  onSnapshot(collection(db, "inventario"), snap => {
    const admin = el("lista-inventario");
    const user = el("lista-solo-lectura");
    const sug = el("productos-sugeridos");

    admin.innerHTML = user.innerHTML = sug.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();

      admin.insertAdjacentHTML("beforeend", `
        <div class="prod-card">
          <strong>${p.nombre.toUpperCase()}</strong> (${p.cantidad})
          <button onclick="eliminarDato('inventario','${d.id}')">🗑️</button>
        </div>
      `);

      user.insertAdjacentHTML("beforeend", `
        <div class="prod-card">
          <strong>${p.nombre.toUpperCase()}</strong> (${p.cantidad})
        </div>
      `);

      sug.insertAdjacentHTML("beforeend", `<option value="${p.nombre}">`);
    });
  });

  /* PEDIDOS */
  onSnapshot(collection(db, "pedidos"), snap => {
    const pA = el("lista-pendientes-admin");
    const hA = el("lista-historial-admin");
    const uM = el("lista-mis-pedidos");

    pA.innerHTML = hA.innerHTML = uM.innerHTML = "";

    snap.forEach(d => {
      const p = d.data();
      const base = `
        <div class="pedido-card">
          <div>
            <strong>${p.insumoNom.toUpperCase()}</strong> (${p.cantidad})
            <br><small>${p.usuarioId}</small>
          </div>
      `;

      if (usuarioActual.rol === "admin" && p.estado === "pendiente") {
        pA.innerHTML += base + `
          <div>
            <button onclick="gestionarPedido('${d.id}','aprobar','${p.insumoNom}',${p.cantidad})">✔</button>
            <button onclick="gestionarPedido('${d.id}','rechazar')">✖</button>
          </div></div>`;
      } else {
        const html = base + `<span class="badge status-${p.estado}">${p.estado}</span></div>`;
        hA.innerHTML += html;
        if (p.usuarioId === usuarioActual.id) uM.innerHTML += html;
      }
    });
  });
}

/* 🧰 UTILIDADES */
const el = id => document.getElementById(id);
const val = id => el(id).value.trim();
const num = id => parseInt(val(id)) || 0;
const loginUser = () => val("login-user");
const loginPass = () => val("login-pass");
const ocultarLogin = () => {
  el("pantalla-login").style.display = "none";
  el("interfaz-app").style.display = "block";
};
const configurarMenu = () => {
  const isAdmin = usuarioActual.rol === "admin";
  document.querySelectorAll("[id^='nav-']").forEach(btn => {
    const adminOnly = ["nav-admin","nav-pedidos","nav-historial","nav-usuarios"].includes(btn.id);
    btn.style.display = isAdmin === adminOnly ? "inline-block" : "none";
  });
};

window.cerrarSesion = () => location.reload();

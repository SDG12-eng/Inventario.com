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

// --- NAVEGACIÓN ---
window.verPagina = (id) => {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(`pag-${id}`).style.display = 'block';
};

// --- GESTIÓN INVENTARIO ---
window.agregarProducto = async () => {
  const nombre = document.getElementById("nombre").value.trim().toLowerCase();
  const cantidad = parseInt(document.getElementById("cantidad").value);

  if (!nombre || isNaN(cantidad)) return alert("Datos inválidos");

  const docRef = doc(db, "inventario", nombre);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    await updateDoc(docRef, { cantidad: docSnap.data().cantidad + cantidad });
  } else {
    await setDoc(docRef, { nombre, cantidad });
  }
  document.getElementById("nombre").value = "";
  document.getElementById("cantidad").value = "";
};

// --- PROCESAR SOLICITUD (PENDIENTE) ---
window.procesarSolicitud = async () => {
  const usuario = document.getElementById("sol-usuario").value;
  const ubicacion = document.getElementById("sol-ubicacion").value;
  const insumoNom = document.getElementById("sol-insumo").value.trim().toLowerCase();
  const cantSolicitada = parseInt(document.getElementById("sol-cantidad").value);

  if (!usuario || !insumoNom || isNaN(cantSolicitada)) return alert("Completa todos los campos");

  // Solo guardamos la solicitud, NO restamos del stock todavía hasta aprobar
  await addDoc(collection(db, "pedidos"), {
    usuario,
    ubicacion,
    insumoNom,
    cantidad: cantSolicitada,
    estado: "pendiente",
    fecha: new Date().toLocaleString()
  });

  alert("🚀 Solicitud enviada al panel de control.");
  document.getElementById("sol-insumo").value = "";
  document.getElementById("sol-cantidad").value = "";
};

// --- APROBAR / RECHAZAR ---
window.gestionarPedido = async (id, accion, insumo, cant) => {
  const pedidoRef = doc(db, "pedidos", id);
  
  if (accion === 'aprobar') {
    const invRef = doc(db, "inventario", insumo);
    const invSnap = await getDoc(invRef);

    if (invSnap.exists() && invSnap.data().cantidad >= cant) {
      await updateDoc(invRef, { cantidad: invSnap.data().cantidad - cant });
      await deleteDoc(pedidoRef); // O puedes marcarlo como 'aprobado'
      alert("✅ Aprobado y stock descontado.");
    } else {
      alert("❌ No hay suficiente stock para aprobar.");
    }
  } else {
    await deleteDoc(pedidoRef);
    alert("🗑️ Solicitud rechazada y eliminada.");
  }
};

// --- TIEMPO REAL: INVENTARIO Y SUGERENCIAS ---
onSnapshot(collection(db, "inventario"), (snapshot) => {
  const listaInv = document.getElementById("lista-inventario");
  const datalist = document.getElementById("productos-sugeridos");
  listaInv.innerHTML = "";
  datalist.innerHTML = "";

  snapshot.forEach(doc => {
    const p = doc.data();
    listaInv.innerHTML += `
      <div class="prod-card">
        <div><strong>${p.nombre.toUpperCase()}</strong><br>Stock: ${p.cantidad}</div>
        <button onclick="eliminarProd('${doc.id}')" style="background:none; border:none; color:red; cursor:pointer">🗑️</button>
      </div>`;
    datalist.innerHTML += `<option value="${p.nombre}">`;
  });
});

// --- TIEMPO REAL: SOLICITUDES ---
onSnapshot(collection(db, "pedidos"), (snapshot) => {
  const listaPedidos = document.getElementById("lista-pedidos");
  listaPedidos.innerHTML = "";

  snapshot.forEach(docSnap => {
    const ped = docSnap.data();
    const id = docSnap.id;
    listaPedidos.innerHTML += `
      <div class="pedido-card">
        <div class="pedido-info">
          <h4>${ped.insumoNom} (${ped.cantidad} ud)</h4>
          <p><i class="fas fa-user"></i> ${ped.usuario} | <i class="fas fa-map-marker-alt"></i> ${ped.ubicacion}</p>
          <span class="status-badge status-pendiente">${ped.estado}</span>
        </div>
        <div class="acciones">
          <button class="btn-aprobar" onclick="gestionarPedido('${id}', 'aprobar', '${ped.insumoNom}', ${ped.cantidad})"><i class="fas fa-check"></i></button>
          <button class="btn-rechazar" onclick="gestionarPedido('${id}', 'rechazar')"><i class="fas fa-times"></i></button>
        </div>
      </div>`;
  });
});

window.eliminarProd = async (id) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, "inventario", id)); };
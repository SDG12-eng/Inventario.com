import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
  authDomain: "mi-web-db.firebaseapp.com",
  projectId: "mi-web-db",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const lista = document.getElementById("lista");

async function agregarProducto() {
  const nombre = document.getElementById("nombre").value;
  const cantidad = document.getElementById("cantidad").value;

  if (!nombre || !cantidad) return;

  await addDoc(collection(db, "inventario"), {
    nombre,
    cantidad
  });

  cargarProductos();
}

async function cargarProductos() {
  lista.innerHTML = "";
  const querySnapshot = await getDocs(collection(db, "inventario"));

  querySnapshot.forEach((doc) => {
    const p = doc.data();
    lista.innerHTML += `<li>${p.nombre} - ${p.cantidad}</li>`;
  });
}

cargarProductos();

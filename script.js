import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- CONFIGURACIÓN DE LLAVES ---
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

// CLOUDINARY
const CLOUD_NAME = 'df79cjklp'; 
const UPLOAD_PRESET = 'insumos'; 

// EMAILJS (Configurado CORRECTAMENTE para tu plantilla)
const EMAIL_SERVICE_ID = 'service_a7yozqh'; 
const EMAIL_TEMPLATE_ID = 'template_zglatmb'; // Asegúrate que este sea el ID correcto
const EMAIL_PUBLIC_KEY = '2jVnfkJKKG0bpKN-U'; 
const ADMIN_EMAIL = 'oficinista.archivos@fcipty.com'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ESTADO GLOBAL
let usuarioActual = null;
let stockChart = null, userChart = null, locationChart = null;
let carritoGlobal = {};
let cloudinaryWidget = null;

// INICIALIZACIÓN
emailjs.init(EMAIL_PUBLIC_KEY);

window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) cargarSesion(JSON.parse(sesionGuardada));
    setupCloudinary();
});

function setupCloudinary() {
    if (typeof cloudinary !== "undefined") {
        cloudinaryWidget = cloudinary.createUploadWidget({
            cloudName: CLOUD_NAME, 
            uploadPreset: UPLOAD_PRESET,
            sources: ['local', 'camera'],
            multiple: false,
            cropping: true,
            folder: 'fcilog_insumos',
            styles: {
                palette: {window: "#FFFFFF",windowBorder: "#90A0B3",tabIcon: "#5A67D8",menuIcons: "#5A67D8",textDark: "#2D3748",textLight: "#FFFFFF",link: "#5A67D8",action: "#5A67D8",inactiveTabIcon: "#A0AEC0",error: "#E53E3E",inProgress: "#4299E1",complete: "#48BB78",sourceBg: "#F7FAFC"},
                fonts: {default: null, "'Plus Jakarta Sans', sans-serif": {url: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap",active: true}}
            }
        }, (error, result) => { 
            if (!error && result && result.event === "success") { 
                const imgInput = document.getElementById('edit-prod-img');
                const preview = document.getElementById('preview-img');
                if(imgInput) imgInput.value = result.info.secure_url;
                if(preview) {
                    preview.src = result.info.secure_url;
                    preview.classList.remove('hidden');
                }
            }
        });
        const btnUpload = document.getElementById("upload_widget");
        if(btnUpload) btnUpload.addEventListener("click", () => cloudinaryWidget.open(), false);
    }
}

// --- SESIÓN Y NAVEGACIÓN ---
function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) infoDiv.innerHTML = `<div class="flex flex-col items-center"><div class="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-indigo-500 mb-1 shadow-sm"><i class="fas fa-user"></i></div><span class="font-bold text-slate-700">${datos.id}</span><span class="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-50 px-2 rounded-full mt-1">${datos.rol}</span></div>`;

    if(datos.rol === 'admin' || datos.rol === 'manager') document.getElementById("btn-admin-stock")?.classList.remove("hidden");

    configurarMenu();
    let inicio = 'stock';
    if(['admin','manager','supervisor'].includes(datos.rol)) inicio = 'stats';
    window.verPagina(inicio);
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    if(!user || !pass) return alert("Ingrese usuario y contraseña.");
    if (user === "admin" && pass === "1130") { cargarSesion({ id: "admin", rol: "admin" }); return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) cargarSesion({ id: user, ...snap.data() });
        else alert("Credenciales incorrectas.");
    } catch (e) { alert("Error de conexión."); }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => { v.classList.add("hidden"); v.classList.remove("animate-fade-in"); });
    const target = document.getElementById(`pag-${id}`);
    if(target) { target.classList.remove("hidden"); setTimeout(() => target.classList.add("animate-fade-in"), 10); }
    if(window.innerWidth < 768) toggleMenu(false);
};

window.toggleMenu = (force) => {
    const side = document.getElementById("sidebar"), over = document.getElementById("sidebar-overlay");
    const open = force !== undefined ? force : side.classList.contains("-translate-x-full");
    side.classList.toggle("-translate-x-full", !open);
    over.classList.toggle("hidden", !open); over.classList.toggle("opacity-0", !open);
};

function configurarMenu() {
    const rol = usuarioActual.rol, menu = document.getElementById("menu-dinamico");
    const i = { st:{id:'stats',n:'Dashboard',i:'chart-pie'}, sk:{id:'stock',n:'Stock',i:'boxes'}, pd:{id:'solicitar',n:'Realizar Pedido',i:'cart-plus'}, pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, hs:{id:'historial',n:'Historial',i:'history'}, us:{id:'usuarios',n:'Accesos',i:'users-cog'}, mp:{id:'notificaciones',n:'Mis Pedidos / Recibir',i:'shipping-fast'} };
    let r = [];
    if(rol==='admin') r=[i.st,i.sk,i.pd,i.pe,i.hs,i.us,i.mp]; 
    else if(rol==='manager'||rol==='supervisor') r=[i.st,i.sk,i.pd,i.pe,i.hs,i.mp]; 
    else r=[i.sk,i.pd,i.mp];
    menu.innerHTML = r.map(x => `<button onclick="verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');
}

// --- FUNCIÓN DE NOTIFICACIONES CORREGIDA (Variables exactas) ---
async function enviarNotificacionGlobal(tipo, datos) {
    
    // Variables dinámicas para el template
    let config = {
        to_email: datos.target_email || ADMIN_EMAIL, 
        asunto: "",
        titulo_principal: "",
        mensaje_cuerpo: "",
        fecha: new Date().toLocaleString()
    };

    switch (tipo) {
        case 'nuevo_pedido':
            config.asunto = `📦 Nuevo Pedido: ${datos.insumo.toUpperCase()}`;
            config.titulo_principal = "🚀 Nueva Solicitud Recibida";
            config.mensaje_cuerpo = `El usuario ${datos.usuario} ha realizado un pedido nuevo.\n\n📍 Sede: ${datos.sede}\n📦 Insumo: ${datos.insumo.toUpperCase()}\n🔢 Cantidad: ${datos.cantidad}\n\nIngresa al sistema para aprobar o rechazar.`;
            break;

        case 'pedido_aprobado':
            config.asunto = `✅ Aprobado: ${datos.insumo.toUpperCase()}`;
            config.titulo_principal = "¡Tu Solicitud fue Aprobada!";
            config.mensaje_cuerpo = `Hola ${datos.usuario},\n\nTu pedido ha sido autorizado por la administración.\n\n📦 Insumo: ${datos.insumo.toUpperCase()}\n🔢 Cantidad: ${datos.cantidad}\n📍 Sede: ${datos.sede}\n\nEl despacho está en proceso.`;
            break;

        case 'pedido_rechazado':
            config.asunto = `❌ Rechazado: ${datos.insumo.toUpperCase()}`;
            config.titulo_principal = "Solicitud No Procesada";
            config.mensaje_cuerpo = `Hola ${datos.usuario},\n\nLo sentimos, tu solicitud de ${datos.insumo} para la sede ${datos.sede} no pudo ser aprobada en este momento.\n\nPor favor contacta al administrador para más detalles.`;
            break;

        case 'stock_bajo':
            config.asunto = `⚠️ ALERTA STOCK: ${datos.insumo.toUpperCase()}`;
            config.titulo_principal = "📉 Nivel de Inventario Crítico";
            config.mensaje_cuerpo = `ATENCIÓN ADMIN:\n\nEl insumo ${datos.insumo.toUpperCase()} ha bajado de su stock mínimo permitido.\n\n📊 Stock Actual: ${datos.cantidad_actual}\n🛑 Mínimo Configurado: ${datos.stock_minimo}\n\nSe requiere reabastecimiento urgente.`;
            break;

        case 'recibido':
            config.asunto = `🔵 Entrega Exitosa - ${datos.sede}`;
            config.titulo_principal = "Confirmación de Recepción";
            config.mensaje_cuerpo = `El usuario ${datos.usuario} ha confirmado que recibió los insumos correctamente.\n\n📦 Insumo: ${datos.insumo}\n📍 Sede: ${datos.sede}\n\nEl ciclo del pedido se ha cerrado en el historial.`;
            break;
    }

    try {
        // AQUÍ ESTÁ LA CLAVE: Enviamos las variables exactas que configuraste en EmailJS
        await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, {
            asunto: config.asunto,
            titulo_principal: config.titulo_principal,
            mensaje_cuerpo: config.mensaje_cuerpo,
            to_email: config.to_email,
            fecha: config.fecha
        });
        console.log(`✨ Correo enviado (${tipo}) a ${config.to_email}`);
    } catch (error) {
        console.error("Error enviando email:", error);
    }
}

// --- LÓGICA DE PEDIDOS ---
window.ajustarCantidad = (ins, d) => {
    const n = Math.max(0, (carritoGlobal[ins]||0) + d); carritoGlobal[ins] = n;
    const el = document.getElementById(`cant-${ins}`);
    const row = document.getElementById(`row-${ins}`);
    if(el) el.innerText = n;
    if(row) row.classList.toggle("border-indigo-500", n>0);
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value, items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede y productos.");
    
    await Promise.all(items.map(async ([ins, cant]) => {
        await addDoc(collection(db, "pedidos"), { 
            usuarioId: usuarioActual.id, 
            insumoNom: ins, 
            cantidad: cant, 
            ubicacion: ubi, 
            estado: "pendiente", 
            fecha: new Date().toLocaleString(), 
            timestamp: Date.now() 
        });
        enviarNotificacionGlobal('nuevo_pedido', { usuario: usuarioActual.id, insumo: ins, cantidad: cant, sede: ubi });
    }));

    alert("✅ Pedido enviado."); 
    carritoGlobal={}; 
    document.getElementById("sol-ubicacion").value=""; 
    activarSincronizacion(); 
    window.verPagina('notificaciones');
};

// --- GESTIÓN DE PEDIDOS ---
window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid);
    const pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return;
    const pData = pSnap.data();

    // Obtener correo del usuario
    let emailSolicitante = "";
    try {
        const uSnap = await getDoc(doc(db, "usuarios", pData.usuarioId));
        if(uSnap.exists() && uSnap.data().email) {
            emailSolicitante = uSnap.data().email;
        }
    } catch(e) { console.log("Usuario sin email"); }

    if(accion === 'aprobar') {
        const inp = document.getElementById(`qty-${pid}`), cantFinal = inp ? parseInt(inp.value) : 0;
        if(isNaN(cantFinal) || cantFinal <= 0) return alert("Cantidad inválida.");
        
        const iRef = doc(db, "inventario", ins.toLowerCase());
        const iSnap = await getDoc(iRef);
        
        if(iSnap.exists() && iSnap.data().cantidad >= cantFinal) {
            const nuevaCantidad = iSnap.data().cantidad - cantFinal;
            const stockMin = iSnap.data().stockMinimo || 0;
            
            await updateDoc(iRef, { cantidad: nuevaCantidad });
            await updateDoc(pRef, { estado: "aprobado", cantidad: cantFinal });

            // Notificar Aprobación
            if(emailSolicitante) {
                enviarNotificacionGlobal('pedido_aprobado', { 
                    usuario: pData.usuarioId, insumo: ins, cantidad: cantFinal, sede: pData.ubicacion, target_email: emailSolicitante 
                });
            }

            // Alerta Stock Bajo
            if (nuevaCantidad <= stockMin && stockMin > 0) {
                enviarNotificacionGlobal('stock_bajo', { 
                    insumo: ins, cantidad_actual: nuevaCantidad, stock_minimo: stockMin 
                });
            }

        } else alert("Stock insuficiente.");
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        // Notificar Rechazo
        if(emailSolicitante) {
            enviarNotificacionGlobal('pedido_rechazado', { 
                usuario: pData.usuarioId, insumo: ins, sede: pData.ubicacion, target_email: emailSolicitante 
            });
        }
    }
};

// --- ACCIONES USUARIO ---
window.confirmarRecibido = async (pid) => { 
    if(confirm("¿Confirmar recepción?")) {
        const pRef = doc(db, "pedidos", pid);
        const pSnap = await getDoc(pRef);
        await updateDoc(pRef, { estado: "recibido" });
        
        if(pSnap.exists()){
            const d = pSnap.data();
            enviarNotificacionGlobal('recibido', { usuario: d.usuarioId, insumo: d.insumoNom, sede: d.ubicacion });
        }
    }
};

window.abrirIncidencia = (pid) => { document.getElementById('incidencia-pid').value=pid; document.getElementById('incidencia-detalle').value=""; document.getElementById('modal-incidencia').classList.remove('hidden'); };
window.confirmarIncidencia = async (dev) => {
    const pid=document.getElementById('incidencia-pid').value, det=document.getElementById('incidencia-detalle').value.trim();
    if(!det) return alert("Describa el problema.");
    const pRef=doc(db,"pedidos",pid), pData=(await getDoc(pRef)).data();
    if(dev) { const iRef=doc(db,"inventario",pData.insumoNom.toLowerCase()), iSnap=await getDoc(iRef); if(iSnap.exists()) await updateDoc(iRef,{cantidad:iSnap.data().cantidad+pData.cantidad}); }
    await updateDoc(pRef, { estado: dev?"devuelto":"con_incidencia", detalleIncidencia: det });
    document.getElementById('modal-incidencia').classList.add('hidden'); alert("Reporte registrado.");
};

// --- GESTIÓN DE INVENTARIO ---
window.agregarProductoRápido = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toUpperCase();
    const c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && c > 0) {
        const id = n.toLowerCase(), ref = doc(db, "inventario", id), snap = await getDoc(ref);
        if (snap.exists()) await updateDoc(ref, { cantidad: snap.data().cantidad + c }); else await setDoc(ref, { cantidad: c });
        await addDoc(collection(db, "entradas_stock"), { insumo: n, cantidad: c, usuario: usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() });
        cerrarModalInsumo(); document.getElementById("nombre-prod").value=""; document.getElementById("cantidad-prod").value="";
    } else alert("Datos inválidos.");
};

window.prepararEdicionProducto = async (id) => {
    const snap = await getDoc(doc(db, "inventario", id));
    if(!snap.exists()) return;
    const data = snap.data();
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('edit-prod-precio').value = data.precio || '';
    document.getElementById('edit-prod-min').value = data.stockMinimo || '';
    document.getElementById('edit-prod-img').value = data.imagen || '';
    const preview = document.getElementById('preview-img');
    if(data.imagen) { preview.src = data.imagen; preview.classList.remove('hidden'); } else { preview.classList.add('hidden'); }
    document.getElementById('modal-detalles').classList.remove('hidden');
};

window.guardarDetallesProducto = async () => {
    const id = document.getElementById('edit-prod-id').value;
    const precio = parseFloat(document.getElementById('edit-prod-precio').value) || 0;
    const min = parseInt(document.getElementById('edit-prod-min').value) || 0;
    const img = document.getElementById('edit-prod-img').value;
    await updateDoc(doc(db, "inventario", id), { precio: precio, stockMinimo: min, imagen: img });
    cerrarModalDetalles(); alert("Detalles guardados.");
};

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.cerrarModalDetalles = () => { document.getElementById("modal-detalles").classList.add("hidden"); document.getElementById('preview-img').classList.add('hidden'); document.getElementById('edit-prod-img').value = ''; };
window.eliminarDato = async (c, i) => { if(confirm("¿Eliminar permanentemente?")) await deleteDoc(doc(db, c, i)); };

// --- GESTIÓN DE USUARIOS ---
window.guardarUsuario = async () => {
    const editId = document.getElementById("edit-mode-id").value;
    const idInput = document.getElementById("new-user");
    const id = idInput.value.trim().toLowerCase();
    const pass = document.getElementById("new-pass").value.trim();
    const email = document.getElementById("new-email").value.trim(); // Captura el email
    const rol = document.getElementById("new-role").value;

    if(!id || !pass) return alert("Faltan datos.");
    if(editId && editId !== id) return alert("No puedes cambiar el ID de un usuario existente.");
    await setDoc(doc(db, "usuarios", id), { pass, rol, email }, { merge: true }); 
    alert(editId ? "Usuario actualizado." : "Usuario creado.");
    cancelarEdicionUsuario(); 
};

window.prepararEdicionUsuario = (id, pass, rol, email) => {
    document.getElementById("edit-mode-id").value = id;
    document.getElementById("new-user").value = id;
    document.getElementById("new-user").disabled = true; 
    document.getElementById("new-pass").value = pass;
    document.getElementById("new-email").value = email || ""; // Pone el email si existe
    document.getElementById("new-role").value = rol;
    
    const title = document.getElementById("titulo-form-usuario");
    if(title) title.innerHTML = `<i class="fas fa-user-edit"></i> Editando a: <span class="text-indigo-600">${id}</span>`;
    const btn = document.getElementById("btn-guardar-usuario");
    if(btn) btn.innerText = "Actualizar Usuario";
    const msg = document.getElementById("cancel-edit-msg");
    if(msg) msg.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelarEdicionUsuario = () => {
    document.getElementById("edit-mode-id").value = "";
    document.getElementById("new-user").value = "";
    document.getElementById("new-user").disabled = false;
    document.getElementById("new-pass").value = "";
    document.getElementById("new-email").value = "";
    document.getElementById("new-role").value = "user";
    const title = document.getElementById("titulo-form-usuario");
    if(title) title.innerHTML = `<i class="fas fa-user-plus"></i> Crear Nuevo Acceso`;
    const btn = document.getElementById("btn-guardar-usuario");
    if(btn) btn.innerText = "Guardar";
    const msg = document.getElementById("cancel-edit-msg");
    if(msg) msg.classList.add("hidden");
};

// --- SINCRONIZACIÓN ---
function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const grid=document.getElementById("lista-inventario"), cart=document.getElementById("contenedor-lista-pedidos"), dl=document.getElementById("admin-stock-dl");
        if(grid) grid.innerHTML=""; if(cart)cart.innerHTML=""; if(dl)dl.innerHTML="";
        let totR=0, totS=0, lbls=[], dta=[];

        snap.forEach(ds => {
            const p=ds.data(), n=ds.id.toUpperCase(); totR++; totS+=p.cantidad; lbls.push(n.slice(0,10)); dta.push(p.cantidad);
            if(dl) dl.innerHTML+=`<option value="${n}">`;
            const canManage = ['admin','manager'].includes(usuarioActual.rol);
            const actions = canManage ? `<div class="flex gap-2"><button onclick="prepararEdicionProducto('${ds.id}')" class="text-slate-300 hover:text-indigo-500 transition"><i class="fas fa-cog"></i></button><button onclick="eliminarDato('inventario','${ds.id}')" class="text-slate-300 hover:text-red-400 transition"><i class="fas fa-trash"></i></button></div>` : '';
            const imgHtml = p.imagen ? `<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border border-slate-100 mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const precioHtml = p.precio ? `<span class="text-xs font-bold text-emerald-600">$${p.precio}</span>` : '';
            const alertaMin = (p.stockMinimo && p.cantidad <= p.stockMinimo) ? `<i class="fas fa-exclamation-circle text-red-500 ml-2 animate-pulse" title="Stock Bajo"></i>` : '';

            if(grid) {
                grid.innerHTML += `<div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition flex flex-col"><div class="flex justify-between items-start mb-2">${imgHtml}${actions}</div><div><h4 class="font-bold text-slate-700 uppercase text-sm truncate flex items-center">${n} ${alertaMin}</h4><div class="flex justify-between items-end mt-1"><div><p class="text-2xl font-black text-slate-800 leading-none">${p.cantidad}</p><p class="text-[10px] text-slate-400 font-bold uppercase">Unidades</p></div>${precioHtml}</div></div></div>`;
            }
            if(cart && p.cantidad > 0) {
                const enCarro = carritoGlobal[ds.id]||0, act = enCarro>0 ? "border-indigo-500 bg-indigo-50/50" : "border-transparent bg-white";
                cart.innerHTML += `<div id="row-${ds.id}" class="flex items-center justify-between p-3 rounded-xl border ${act} transition-all shadow-sm"><div class="flex items-center gap-3 overflow-hidden">${p.imagen ? `<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">` : ''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${n}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-100 flex-shrink-0"><button onclick="ajustarCantidad('${ds.id}', -1)" class="w-7 h-7 rounded-md bg-slate-50 hover:bg-slate-200 text-slate-600 font-bold">-</button><span id="cant-${ds.id}" class="w-6 text-center font-bold text-indigo-600 text-sm">${enCarro}</span><button onclick="ajustarCantidad('${ds.id}', 1)" class="w-7 h-7 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
            }
        });
        if(document.getElementById("metrica-stock")) { document.getElementById("metrica-total").innerText=totR; document.getElementById("metrica-stock").innerText=totS; renderChart('stockChart',lbls,dta,'Stock','#6366f1',stockChart,c=>stockChart=c); }
    });

    onSnapshot(collection(db,"pedidos"), s=>{ 
        const la=document.getElementById("lista-pendientes-admin"), lu=document.getElementById("lista-notificaciones"), th=document.getElementById("tabla-historial-body"); 
        if(la)la.innerHTML=""; if(lu)lu.innerHTML=""; if(th)th.innerHTML=""; 
        let pc=0, ls={}, us={}; 
        s.forEach(ds=>{ 
            const p=ds.data(), id=ds.id; 
            if(p.estado==='aprobado'||p.estado==='recibido'){ls[p.ubicacion]=(ls[p.ubicacion]||0)+1;us[p.usuarioId]=(us[p.usuarioId]||0)+1;} 
            const isStaff=['admin','manager','supervisor'].includes(usuarioActual.rol); 
            if(isStaff && p.estado==='pendiente' && la){ 
                pc++; let cts=`<span class="badge bg-slate-100 text-slate-500">Solo Lectura</span>`; 
                if(usuarioActual.rol!=='supervisor'){ cts=`<div class="flex items-center gap-2 mt-3 pt-3 border-t border-amber-100"><div class="flex flex-col"><span class="text-[8px] uppercase font-bold text-amber-700">Aprobar:</span><input type="number" id="qty-${id}" value="${p.cantidad}" class="w-16 p-1.5 text-center text-sm font-bold bg-white border border-amber-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"></div><div class="flex gap-2 ml-auto"><button onclick="gestionarPedido('${id}','aprobar','${p.insumoNom}')" class="w-9 h-9 rounded-lg bg-indigo-600 text-white shadow-md hover:bg-indigo-700 flex items-center justify-center transition"><i class="fas fa-check"></i></button><button onclick="gestionarPedido('${id}','rechazar')" class="w-9 h-9 rounded-lg bg-white border border-red-100 text-red-500 hover:bg-red-50 flex items-center justify-center transition"><i class="fas fa-times"></i></button></div></div>`; } 
                la.innerHTML+=`<div class="bg-white p-4 rounded-2xl border-l-4 border-l-amber-400 shadow-sm"><div class="flex justify-between items-start"><div><h4 class="font-black text-slate-700 uppercase text-sm">${p.insumoNom}</h4><div class="flex flex-wrap gap-2 mt-2"><span class="px-2 py-1 rounded-md bg-slate-50 text-slate-500 text-[10px] font-bold"><i class="fas fa-user"></i> ${p.usuarioId}</span><span class="px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold"><i class="fas fa-map-marker-alt"></i> ${p.ubicacion}</span></div></div><span class="text-xl font-black text-amber-500">x${p.cantidad}</span></div>${cts}</div>`; 
            } 
            if(p.estado!=='pendiente' && th){ 
                const nt=p.detalleIncidencia?`<br><span class="text-[9px] text-red-400 italic">"${p.detalleIncidencia}"</span>`:''; 
                th.innerHTML+=`<tr class="hover:bg-slate-50 transition"><td class="p-4 text-slate-400 font-mono">${p.fecha.split(',')[0]}</td><td class="p-4 font-bold uppercase text-slate-700">${p.insumoNom}</td><td class="p-4 text-slate-600">x${p.cantidad}</td><td class="p-4"><span class="px-2 py-1 rounded bg-slate-100 text-slate-500 font-bold text-[10px]">${p.ubicacion}</span></td><td class="p-4 text-slate-500">${p.usuarioId}</td><td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span>${nt}</td></tr>`; 
            } 
            if(p.usuarioId===usuarioActual.id && lu){ 
                let acts=""; 
                if(p.estado==='aprobado'){ acts=`<div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-50"><button onclick="confirmarRecibido('${id}')" class="py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold shadow hover:bg-emerald-600">Confirmar Recibido</button><button onclick="abrirIncidencia('${id}')" class="py-2 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-50 hover:text-red-500">Reportar</button></div>`; } 
                lu.innerHTML+=`<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden"><div class="absolute top-0 right-0 p-4 opacity-10 text-6xl text-slate-300 pointer-events-none"><i class="fas fa-box-open"></i></div><div class="relative z-10"><div class="flex justify-between items-start mb-2"><span class="px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider">${p.ubicacion}</span><span class="badge status-${p.estado}">${p.estado}</span></div><h3 class="text-lg font-black text-slate-800 uppercase">${p.insumoNom}</h3><p class="text-sm font-bold text-slate-400 mb-1">Cantidad: <span class="text-slate-600">${p.cantidad}</span></p><p class="text-[10px] text-slate-300 font-mono">${p.fecha}</p>${acts}</div></div>`; 
            } 
        }); 
        if(document.getElementById("metrica-pedidos")){ document.getElementById("metrica-pedidos").innerText=pc; renderChart('userChart',Object.keys(us),Object.values(us),'Pedidos','#818cf8',userChart,c=>userChart=c); renderChart('locationChart',Object.keys(ls),Object.values(ls),'Pedidos','#fbbf24',locationChart,c=>locationChart=c); } 
    });

    onSnapshot(collection(db,"entradas_stock"), s=>{ const t=document.getElementById("tabla-entradas-body"); if(t){t.innerHTML=""; let d=[]; s.forEach(x=>d.push(x.data())); d.sort((a,b)=>b.timestamp-a.timestamp); d.forEach(e=>{t.innerHTML+=`<tr class="hover:bg-emerald-50/30 transition"><td class="p-4 text-emerald-800/60 font-mono">${e.fecha}</td><td class="p-4 font-bold uppercase text-emerald-900">${e.insumo}</td><td class="p-4 font-black text-emerald-600">+${e.cantidad}</td><td class="p-4 text-emerald-800/80 text-[10px] font-bold uppercase">${e.usuario}</td></tr>`;});}});

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) { l.innerHTML = ""; snap.forEach(docSnap => { const u = docSnap.data(); const id = docSnap.id; l.innerHTML += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center group hover:shadow-md transition"><div><div class="flex items-center gap-2"><span class="font-bold text-slate-700">${id}</span><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-500">${u.rol}</span></div><p class="text-xs text-slate-400 font-mono mt-0.5">pass: ${u.pass}</p></div><div class="flex gap-2 opacity-0 group-hover:opacity-100 transition"><button onclick="prepararEdicionUsuario('${id}','${u.pass}','${u.rol}', '${u.email || ''}')" class="w-8 h-8 rounded bg-indigo-50 text-indigo-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white"><i class="fas fa-pen text-xs"></i></button><button onclick="eliminarDato('usuarios','${id}')" class="w-8 h-8 rounded bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white"><i class="fas fa-trash-alt text-xs"></i></button></div></div>`; }); }
        });
    }
}

// --- EXPORTAR A EXCEL REAL (.XLS) ---
window.descargarReporte = async () => {
    if (!confirm("¿Descargar reporte en Excel (.xls)?")) return;

    const [st, en, pe] = await Promise.all([
        getDocs(collection(db, "inventario")),
        getDocs(collection(db, "entradas_stock")),
        getDocs(collection(db, "pedidos"))
    ]);

    let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"></head>
        <body>
            <h2 style="color: #4f46e5;">STOCK ACTUAL</h2>
            <table border="1">
                <thead style="background-color: #f3f4f6;"><tr><th>INSUMO</th><th>CANTIDAD</th><th>PRECIO</th><th>STOCK MIN</th></tr></thead>
                <tbody>${(() => { let r=''; st.forEach(d => {const p=d.data(); r+=`<tr><td>${d.id.toUpperCase()}</td><td>${p.cantidad}</td><td>${p.precio||0}</td><td>${p.stockMinimo||0}</td></tr>`;}); return r; })()}</tbody>
            </table><br>
            <h2 style="color: #059669;">HISTORIAL DE ENTRADAS</h2>
            <table border="1">
                <thead style="background-color: #ecfdf5;"><tr><th>FECHA</th><th>INSUMO</th><th>CANTIDAD</th><th>USUARIO</th></tr></thead>
                <tbody>${(() => { let r=''; en.forEach(d => {const x=d.data(); r+=`<tr><td>${x.fecha}</td><td>${x.insumo}</td><td>${x.cantidad}</td><td>${x.usuario}</td></tr>`;}); return r; })()}</tbody>
            </table><br>
            <h2 style="color: #d97706;">HISTORIAL DE PEDIDOS</h2>
            <table border="1">
                <thead style="background-color: #fffbeb;"><tr><th>FECHA</th><th>INSUMO</th><th>CANTIDAD</th><th>SEDE</th><th>USUARIO</th><th>ESTADO</th><th>NOTA</th></tr></thead>
                <tbody>${(() => { let r=''; pe.forEach(d => {const x=d.data(); if(x.estado!=='pendiente') r+=`<tr><td>${x.fecha}</td><td>${x.insumoNom}</td><td>${x.cantidad}</td><td>${x.ubicacion}</td><td>${x.usuarioId}</td><td>${x.estado}</td><td>${x.detalleIncidencia||''}</td></tr>`;}); return r; })()}</tbody>
            </table>
        </body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `FCI_Reporte_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

function renderChart(id,l,d,t,c,i,s){const x=document.getElementById(id);if(!x)return;if(i)i.destroy();s(new Chart(x,{type:'bar',data:{labels:l,datasets:[{label:t,data:d,backgroundColor:c,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}}}}));}

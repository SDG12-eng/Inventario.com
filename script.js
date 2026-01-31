import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- CONFIGURACIÓN FIREBASE (Tus llaves) ---
const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

// CLOUDINARY CONFIG
const CLOUD_NAME = 'df79cjklp'; 
const UPLOAD_PRESET = 'insumos'; 

// EMAILJS CONFIG (AQUÍ ESTÁ LA CORRECCIÓN)
const EMAIL_SERVICE_ID = 'service_a7yozqh'; 
const EMAIL_TEMPLATE_ID = 'template_mlcofoo'; // <--- ID CORREGIDO
const EMAIL_PUBLIC_KEY = '2jVnfkJKKG0bpKN-U'; 
const ADMIN_EMAIL = 'archivos@fcipty.com'; 

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

// --- SESIÓN ---
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
    if(!user || !pass) return alert("Ingrese datos.");
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

// --- NOTIFICACIONES (CORREGIDO ID TEMPLATE) ---
async function enviarNotificacionGlobal(tipo, datos) {
    const insumoSafe = datos.insumo ? datos.insumo.toUpperCase() : "INSUMO";
    const usuarioSafe = datos.usuario || "Usuario";
    const sedeSafe = datos.sede || "Sede";
    const cantidadSafe = datos.cantidad || "0";

    let config = {
        to_email: datos.target_email || ADMIN_EMAIL, 
        id_solicitud: "N/A",
        estado: "INFO",
        mensaje: ""
    };

    switch (tipo) {
        case 'nuevo_pedido':
            config.id_solicitud = `${insumoSafe} (x${cantidadSafe})`;
            config.estado = "🟡 PENDIENTE";
            config.mensaje = `El usuario ${usuarioSafe} ha solicitado insumos para la sede ${sedeSafe}. Ingresa para aprobar.`;
            break;
        case 'pedido_aprobado':
            config.id_solicitud = `${insumoSafe} (x${cantidadSafe})`;
            config.estado = "🟢 APROBADO";
            config.mensaje = `Hola ${usuarioSafe}, tu solicitud para ${sedeSafe} ha sido aprobada.`;
            break;
        case 'pedido_rechazado':
            config.id_solicitud = `${insumoSafe}`;
            config.estado = "🔴 RECHAZADO";
            config.mensaje = `Hola ${usuarioSafe}, tu solicitud para ${sedeSafe} fue rechazada.`;
            break;
        case 'stock_bajo':
            config.id_solicitud = `ALERTA ${insumoSafe}`;
            config.estado = "⚠️ STOCK CRÍTICO";
            config.mensaje = `El insumo ${insumoSafe} bajó del mínimo. Stock: ${datos.cantidad_actual}`;
            break;
        case 'recibido':
            config.id_solicitud = `${insumoSafe}`;
            config.estado = "🔵 RECIBIDO";
            config.mensaje = `El usuario ${usuarioSafe} confirmó la recepción en ${sedeSafe}.`;
            break;
    }

    try {
        await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, {
            id_solicitud: config.id_solicitud,
            to_email: config.to_email,
            estado: config.estado,
            mensaje: config.mensaje
        });
        console.log(`Correo enviado (${tipo})`);
    } catch (error) {
        console.error("Error EmailJS:", error);
    }
}

// --- PEDIDOS ---
window.ajustarCantidad = (ins, d) => {
    const n = Math.max(0, (carritoGlobal[ins]||0) + d); carritoGlobal[ins] = n;
    const el = document.getElementById(`cant-${ins}`), row = document.getElementById(`row-${ins}`);
    if(el) el.innerText = n;
    if(row) row.classList.toggle("border-indigo-500", n>0);
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value, items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede y productos.");
    
    await Promise.all(items.map(async ([ins, cant]) => {
        await addDoc(collection(db, "pedidos"), { usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: Date.now() });
        enviarNotificacionGlobal('nuevo_pedido', { usuario: usuarioActual.id, insumo: ins, cantidad: cant, sede: ubi });
    }));
    alert("✅ Pedido enviado."); carritoGlobal={}; document.getElementById("sol-ubicacion").value=""; activarSincronizacion(); window.verPagina('notificaciones');
};

// --- GESTIÓN PEDIDOS ---
window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid), pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return;
    const pData = pSnap.data();
    
    let emailSolicitante = "";
    try { const uSnap = await getDoc(doc(db, "usuarios", pData.usuarioId)); if(uSnap.exists()) emailSolicitante = uSnap.data().email; } catch(e){}

    if(accion === 'aprobar') {
        const inp = document.getElementById(`qty-${pid}`), cantFinal = inp ? parseInt(inp.value) : 0;
        if(isNaN(cantFinal) || cantFinal <= 0) return alert("Cantidad inválida.");
        const iRef = doc(db, "inventario", ins.toLowerCase()), iSnap = await getDoc(iRef);
        
        if(iSnap.exists() && iSnap.data().cantidad >= cantFinal) {
            const nuevaCantidad = iSnap.data().cantidad - cantFinal;
            await updateDoc(iRef, { cantidad: nuevaCantidad });
            await updateDoc(pRef, { estado: "aprobado", cantidad: cantFinal });
            enviarNotificacionGlobal('pedido_aprobado', { usuario: pData.usuarioId, insumo: ins, cantidad: cantFinal, sede: pData.ubicacion, target_email: emailSolicitante });
            if (nuevaCantidad <= (iSnap.data().stockMinimo||0)) enviarNotificacionGlobal('stock_bajo', { insumo: ins, cantidad_actual: nuevaCantidad });
        } else alert("Stock insuficiente.");
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        enviarNotificacionGlobal('pedido_rechazado', { usuario: pData.usuarioId, insumo: ins, sede: pData.ubicacion, target_email: emailSolicitante });
    }
};

window.confirmarRecibido = async (pid) => { 
    if(confirm("¿Confirmar recepción?")) {
        const pRef = doc(db, "pedidos", pid), pSnap = await getDoc(pRef);
        await updateDoc(pRef, { estado: "recibido" });
        if(pSnap.exists()) { const d = pSnap.data(); enviarNotificacionGlobal('recibido', { usuario: d.usuarioId, insumo: d.insumoNom, sede: d.ubicacion }); }
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

// --- INVENTARIO & USUARIOS ---
window.agregarProductoRápido = async () => {
    const n = document.getElementById("nombre-prod").value.trim().toUpperCase(), c = parseInt(document.getElementById("cantidad-prod").value);
    if(n && c > 0) {
        const id = n.toLowerCase(), ref = doc(db, "inventario", id), snap = await getDoc(ref);
        if (snap.exists()) await updateDoc(ref, { cantidad: snap.data().cantidad + c }); else await setDoc(ref, { cantidad: c });
        await addDoc(collection(db, "entradas_stock"), { insumo: n, cantidad: c, usuario: usuarioActual.id, fecha: new Date().toLocaleString(), timestamp: Date.now() });
        cerrarModalInsumo(); document.getElementById("nombre-prod").value=""; document.getElementById("cantidad-prod").value="";
    } else alert("Datos inválidos.");
};

window.prepararEdicionProducto = async (id) => {
    const snap = await getDoc(doc(db, "inventario", id)); if(!snap.exists()) return;
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
    const id = document.getElementById('edit-prod-id').value, precio = parseFloat(document.getElementById('edit-prod-precio').value)||0, min = parseInt(document.getElementById('edit-prod-min').value)||0, img = document.getElementById('edit-prod-img').value;
    await updateDoc(doc(db, "inventario", id), { precio: precio, stockMinimo: min, imagen: img });
    cerrarModalDetalles(); alert("Detalles guardados.");
};

window.guardarUsuario = async () => {
    const id = document.getElementById("new-user").value.trim().toLowerCase(), pass = document.getElementById("new-pass").value.trim(), email = document.getElementById("new-email").value.trim(), rol = document.getElementById("new-role").value;
    if(!id || !pass) return alert("Faltan datos.");
    await setDoc(doc(db, "usuarios", id), { pass, rol, email }, { merge: true });
    alert("Usuario guardado."); cancelarEdicionUsuario();
};

window.prepararEdicionUsuario = (id, pass, rol, email) => {
    document.getElementById("edit-mode-id").value = id; document.getElementById("new-user").value = id; document.getElementById("new-user").disabled = true; document.getElementById("new-pass").value = pass; document.getElementById("new-email").value = email || ""; document.getElementById("new-role").value = rol;
    document.getElementById("btn-guardar-usuario").innerText = "Actualizar"; document.getElementById("cancel-edit-msg").classList.remove("hidden");
};

window.cancelarEdicionUsuario = () => {
    document.getElementById("edit-mode-id").value = ""; document.getElementById("new-user").value = ""; document.getElementById("new-user").disabled = false; document.getElementById("new-pass").value = ""; document.getElementById("new-email").value = ""; document.getElementById("btn-guardar-usuario").innerText = "Guardar"; document.getElementById("cancel-edit-msg").classList.add("hidden");
};

window.abrirModalInsumo = () => document.getElementById("modal-insumo").classList.remove("hidden");
window.cerrarModalInsumo = () => document.getElementById("modal-insumo").classList.add("hidden");
window.cerrarModalDetalles = () => { document.getElementById("modal-detalles").classList.add("hidden"); document.getElementById('preview-img').classList.add('hidden'); document.getElementById('edit-prod-img').value = ''; };
window.eliminarDato = async (c, i) => { if(confirm("¿Eliminar?")) await deleteDoc(doc(db, c, i)); };

// --- SINCRONIZACIÓN ---
function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const grid=document.getElementById("lista-inventario"), cart=document.getElementById("contenedor-lista-pedidos"), dl=document.getElementById("admin-stock-dl");
        if(grid)grid.innerHTML=""; if(cart)cart.innerHTML=""; if(dl)dl.innerHTML="";
        let totR=0, totS=0, lbls=[], dta=[];
        snap.forEach(ds => {
            const p=ds.data(), n=ds.id.toUpperCase(); totR++; totS+=p.cantidad; lbls.push(n.slice(0,10)); dta.push(p.cantidad);
            if(dl) dl.innerHTML+=`<option value="${n}">`;
            const canManage = ['admin','manager'].includes(usuarioActual.rol), actions = canManage ? `<div class="flex gap-2"><button onclick="prepararEdicionProducto('${ds.id}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="eliminarDato('inventario','${ds.id}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>` : '';
            const imgHtml = p.imagen ? `<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border mb-2">` : `<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const alert = (p.stockMinimo && p.cantidad<=p.stockMinimo) ? `<i class="fas fa-exclamation-circle text-red-500 animate-pulse ml-1"></i>` : '';
            if(grid) grid.innerHTML+=`<div class="bg-white p-4 rounded-2xl border shadow-sm hover:shadow-md transition"><div class="flex justify-between items-start">${imgHtml}${actions}</div><h4 class="font-bold text-slate-700 text-sm truncate">${n} ${alert}</h4><p class="text-2xl font-black text-slate-800">${p.cantidad}</p></div>`;
            if(cart && p.cantidad>0) {
                const enCarro = carritoGlobal[ds.id]||0, act = enCarro>0 ? "border-indigo-500 bg-indigo-50/50" : "border-transparent bg-white";
                cart.innerHTML+=`<div id="row-${ds.id}" class="flex items-center justify-between p-3 rounded-xl border ${act} transition-all shadow-sm"><div class="flex items-center gap-3 overflow-hidden">${p.imagen ? `<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">` : ''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${n}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0"><button onclick="ajustarCantidad('${ds.id}', -1)" class="w-7 h-7 rounded-md bg-slate-50 font-bold">-</button><span id="cant-${ds.id}" class="w-6 text-center font-bold text-indigo-600 text-sm">${enCarro}</span><button onclick="ajustarCantidad('${ds.id}', 1)" class="w-7 h-7 rounded-md bg-indigo-50 font-bold" ${enCarro>=p.cantidad?'disabled':''}>+</button></div></div>`;
            }
        });
        if(document.getElementById("metrica-stock")) { document.getElementById("metrica-total").innerText=totR; document.getElementById("metrica-stock").innerText=totS; renderChart('stockChart',lbls,dta,'Stock','#6366f1',stockChart,c=>stockChart=c); }
    });

    onSnapshot(collection(db,"pedidos"), s=>{ 
        const la=document.getElementById("lista-pendientes-admin"), lu=document.getElementById("lista-notificaciones"), th=document.getElementById("tabla-historial-body"); 
        if(la)la.innerHTML=""; if(lu)lu.innerHTML=""; if(th)th.innerHTML=""; 
        let pc=0, ls={}, us={}; 
        s.forEach(ds=>{ 
            const p=ds.data(), id=ds.id, isStaff=['admin','manager','supervisor'].includes(usuarioActual.rol);
            if(p.estado==='aprobado'||p.estado==='recibido'){ls[p.ubicacion]=(ls[p.ubicacion]||0)+1;us[p.usuarioId]=(us[p.usuarioId]||0)+1;} 
            if(isStaff && p.estado==='pendiente' && la){ 
                pc++; let cts=`<span class="badge bg-slate-100 text-slate-500">Solo Lectura</span>`; 
                if(usuarioActual.rol!=='supervisor') cts=`<div class="flex items-center gap-2 mt-3 pt-3 border-t border-amber-100"><input type="number" id="qty-${id}" value="${p.cantidad}" class="w-16 p-1 text-center bg-white border rounded"><div class="flex gap-2"><button onclick="gestionarPedido('${id}','aprobar','${p.insumoNom}')" class="w-8 h-8 rounded bg-indigo-600 text-white flex items-center justify-center"><i class="fas fa-check"></i></button><button onclick="gestionarPedido('${id}','rechazar')" class="w-8 h-8 rounded bg-red-100 text-red-500 flex items-center justify-center"><i class="fas fa-times"></i></button></div></div>`;
                la.innerHTML+=`<div class="bg-white p-4 rounded-2xl border-l-4 border-l-amber-400 shadow-sm"><div><h4 class="font-bold text-sm uppercase">${p.insumoNom}</h4><span class="text-xs text-slate-500">${p.usuarioId} - ${p.ubicacion}</span> <span class="font-bold text-amber-600">x${p.cantidad}</span></div>${cts}</div>`;
            }
            if(p.estado!=='pendiente'&&th) th.innerHTML+=`<tr class="hover:bg-slate-50"><td class="p-4">${p.fecha.split(',')[0]}</td><td class="p-4 font-bold">${p.insumoNom}</td><td class="p-4">x${p.cantidad}</td><td class="p-4">${p.ubicacion}</td><td class="p-4">${p.usuarioId}</td><td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span></td></tr>`;
            if(p.usuarioId===usuarioActual.id && lu){ 
                let acts=""; if(p.estado==='aprobado') acts=`<div class="flex gap-2 mt-2"><button onclick="confirmarRecibido('${id}')" class="px-3 py-1 bg-emerald-500 text-white rounded text-xs">Recibir</button><button onclick="abrirIncidencia('${id}')" class="px-3 py-1 bg-slate-100 text-slate-600 rounded text-xs">Reportar</button></div>`;
                lu.innerHTML+=`<div class="bg-white p-4 rounded-2xl border shadow-sm"><div><span class="badge status-${p.estado}">${p.estado}</span> <span class="font-bold">${p.insumoNom} (x${p.cantidad})</span></div><p class="text-xs text-slate-400">${p.ubicacion} - ${p.fecha}</p>${acts}</div>`;
            }
        }); 
        if(document.getElementById("metrica-pedidos")){ document.getElementById("metrica-pedidos").innerText=pc; renderChart('userChart',Object.keys(us),Object.values(us),'Pedidos','#818cf8',userChart,c=>userChart=c); renderChart('locationChart',Object.keys(ls),Object.values(ls),'Pedidos','#fbbf24',locationChart,c=>locationChart=c); } 
    });

    onSnapshot(collection(db,"entradas_stock"), s=>{ const t=document.getElementById("tabla-entradas-body"); if(t){t.innerHTML=""; let d=[]; s.forEach(x=>d.push(x.data())); d.sort((a,b)=>b.timestamp-a.timestamp); d.forEach(e=>{t.innerHTML+=`<tr class="hover:bg-emerald-50/30"><td class="p-4">${e.fecha}</td><td class="p-4 font-bold">${e.insumo}</td><td class="p-4 font-black text-emerald-600">+${e.cantidad}</td><td class="p-4">${e.usuario}</td></tr>`;});}});

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) { l.innerHTML = ""; snap.forEach(docSnap => { const u = docSnap.data(); const id = docSnap.id; l.innerHTML += `<div class="bg-white p-4 rounded-xl border flex justify-between items-center"><div><span class="font-bold">${id}</span> <span class="text-xs bg-slate-100 px-2 rounded">${u.rol}</span><br><span class="text-xs text-slate-400">${u.email||'Sin correo'}</span></div><div class="flex gap-2"><button onclick="prepararEdicionUsuario('${id}','${u.pass}','${u.rol}','${u.email||''}')" class="text-indigo-500"><i class="fas fa-pen"></i></button><button onclick="eliminarDato('usuarios','${id}')" class="text-red-400"><i class="fas fa-trash"></i></button></div></div>`; }); }
        });
    }
}

// --- EXCEL ---
window.descargarReporte = async () => {
    if (!confirm("¿Descargar Excel?")) return;
    const [st, en, pe] = await Promise.all([getDocs(collection(db,"inventario")), getDocs(collection(db,"entradas_stock")), getDocs(collection(db,"pedidos"))]);
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body>`;
    html += `<h2>STOCK</h2><table border="1"><thead><tr><th>INSUMO</th><th>CANTIDAD</th><th>PRECIO</th><th>MIN</th></tr></thead><tbody>`; st.forEach(d=>{const p=d.data(); html+=`<tr><td>${d.id}</td><td>${p.cantidad}</td><td>${p.precio||0}</td><td>${p.stockMinimo||0}</td></tr>`;}); html += `</tbody></table>`;
    html += `<h2>ENTRADAS</h2><table border="1"><thead><tr><th>FECHA</th><th>INSUMO</th><th>CANT</th><th>USER</th></tr></thead><tbody>`; en.forEach(d=>{const x=d.data(); html+=`<tr><td>${x.fecha}</td><td>${x.insumo}</td><td>${x.cantidad}</td><td>${x.usuario}</td></tr>`;}); html += `</tbody></table>`;
    html += `<h2>PEDIDOS</h2><table border="1"><thead><tr><th>FECHA</th><th>INSUMO</th><th>CANT</th><th>SEDE</th><th>USER</th><th>ESTADO</th></tr></thead><tbody>`; pe.forEach(d=>{const x=d.data(); if(x.estado!=='pendiente') html+=`<tr><td>${x.fecha}</td><td>${x.insumoNom}</td><td>${x.cantidad}</td><td>${x.ubicacion}</td><td>${x.usuarioId}</td><td>${x.estado}</td></tr>`;}); html += `</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Reporte_FCI.xls`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

function renderChart(id,l,d,t,c,i,s){const x=document.getElementById(id);if(!x)return;if(i)i.destroy();s(new Chart(x,{type:'bar',data:{labels:l,datasets:[{label:t,data:d,backgroundColor:c,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}}}}));}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8",
    authDomain: "mi-web-db.firebaseapp.com",
    projectId: "mi-web-db",
    storageBucket: "mi-web-db.appspot.com"
};

const CLOUD_NAME = 'df79cjklp'; 
const UPLOAD_PRESET = 'insumos'; 
const EMAIL_SERVICE_ID = 'service_a7yozqh'; 
const EMAIL_TEMPLATE_ID = 'template_mlcofoo'; 
const EMAIL_PUBLIC_KEY = '2jVnfkJKKG0bpKN-U'; 
const ADMIN_EMAIL = 'archivos@fcipty.com'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null;
let stockChart = null, userChart = null, locationChart = null;
let carritoGlobal = {};
let cloudinaryWidget = null;
// Variable para almacenar datos crudos de pedidos y poder agruparlos
let rawPedidos = []; 

emailjs.init(EMAIL_PUBLIC_KEY);

window.addEventListener('DOMContentLoaded', () => {
    const sesionGuardada = localStorage.getItem("fcilog_session");
    if (sesionGuardada) cargarSesion(JSON.parse(sesionGuardada));
    setupCloudinary();
});

function setupCloudinary() {
    if (typeof cloudinary !== "undefined") {
        cloudinaryWidget = cloudinary.createUploadWidget({
            cloudName: CLOUD_NAME, uploadPreset: UPLOAD_PRESET, sources: ['local', 'camera'], multiple: false, cropping: true, folder: 'fcilog_insumos',
            styles: { palette: {window: "#FFFFFF",windowBorder: "#90A0B3",tabIcon: "#5A67D8",menuIcons: "#5A67D8",textDark: "#2D3748",textLight: "#FFFFFF",link: "#5A67D8",action: "#5A67D8",inactiveTabIcon: "#A0AEC0",error: "#E53E3E",inProgress: "#4299E1",complete: "#48BB78",sourceBg: "#F7FAFC"} }
        }, (error, result) => { 
            if (!error && result && result.event === "success") { 
                document.getElementById('edit-prod-img').value = result.info.secure_url;
                document.getElementById('preview-img').src = result.info.secure_url;
                document.getElementById('preview-img').classList.remove('hidden');
            }
        });
        const btn = document.getElementById("upload_widget");
        if(btn) btn.addEventListener("click", () => cloudinaryWidget.open(), false);
    }
}

function cargarSesion(datos) {
    usuarioActual = datos;
    localStorage.setItem("fcilog_session", JSON.stringify(datos));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    const infoDiv = document.getElementById("info-usuario");
    if(infoDiv) infoDiv.innerHTML = `<div class="flex flex-col items-center"><div class="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-indigo-500 mb-1 shadow-sm"><i class="fas fa-user"></i></div><span class="font-bold text-slate-700">${datos.id}</span><span class="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-50 px-2 rounded-full mt-1">${datos.rol}</span></div>`;
    if(['admin','manager'].includes(datos.rol)) document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    configurarMenu();
    window.verPagina(['admin','manager','supervisor'].includes(datos.rol) ? 'stats' : 'stock');
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const user = document.getElementById("login-user").value.trim().toLowerCase();
    const pass = document.getElementById("login-pass").value.trim();
    if (user === "admin" && pass === "1130") { cargarSesion({ id: "admin", rol: "admin" }); return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user));
        if (snap.exists() && snap.data().pass === pass) cargarSesion({ id: user, ...snap.data() });
        else alert("Datos incorrectos");
    } catch (e) { alert("Error de conexión"); }
};

window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`pag-${id}`)?.classList.remove("hidden");
    if(window.innerWidth < 768) toggleMenu(false);
};

window.toggleMenu = (force) => {
    const side = document.getElementById("sidebar"), over = document.getElementById("sidebar-overlay");
    const open = force !== undefined ? force : side.classList.contains("-translate-x-full");
    side.classList.toggle("-translate-x-full", !open);
    over.classList.toggle("hidden", !open);
};

function configurarMenu() {
    const rol = usuarioActual.rol, menu = document.getElementById("menu-dinamico");
    const i = { st:{id:'stats',n:'Dashboard',i:'chart-pie'}, sk:{id:'stock',n:'Stock',i:'boxes'}, pd:{id:'solicitar',n:'Realizar Pedido',i:'cart-plus'}, pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, hs:{id:'historial',n:'Historial',i:'history'}, us:{id:'usuarios',n:'Accesos',i:'users-cog'}, mp:{id:'notificaciones',n:'Mis Pedidos',i:'shipping-fast'} };
    let r = [];
    if(rol==='admin') r=[i.st,i.sk,i.pd,i.pe,i.hs,i.us,i.mp]; 
    else if(rol==='manager'||rol==='supervisor') r=[i.st,i.sk,i.pd,i.pe,i.hs,i.mp]; 
    else r=[i.sk,i.pd,i.mp];
    menu.innerHTML = r.map(x => `<button onclick="verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');
}

// --- LÓGICA DE PEDIDOS (CON BATCH ID) ---
window.ajustarCantidad = (ins, d) => {
    const n = Math.max(0, (carritoGlobal[ins]||0) + d); carritoGlobal[ins] = n;
    document.getElementById(`cant-${ins}`).innerText = n;
    document.getElementById(`row-${ins}`).classList.toggle("border-indigo-500", n>0);
};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value, items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede y productos.");
    
    // CREAMOS UN ID DE LOTE PARA AGRUPARLOS
    const batchId = Date.now().toString();

    await Promise.all(items.map(async ([ins, cant]) => {
        await addDoc(collection(db, "pedidos"), { 
            usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi, 
            estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: Date.now(),
            batchId: batchId // Agrupador
        });
        enviarNotificacionGlobal('nuevo_pedido', { usuario: usuarioActual.id, insumo: ins, cantidad: cant, sede: ubi });
    }));
    alert("✅ Pedido enviado."); carritoGlobal={}; document.getElementById("sol-ubicacion").value=""; activarSincronizacion(); window.verPagina('notificaciones');
};

// --- GESTIÓN DE NOTIFICACIONES ---
async function enviarNotificacionGlobal(tipo, datos) {
    let config = { to_email: datos.target_email || ADMIN_EMAIL, asunto: "", titulo_principal: "", mensaje_cuerpo: "", fecha: new Date().toLocaleString() };
    switch (tipo) {
        case 'nuevo_pedido': config.asunto=`📦 Nuevo Pedido: ${datos.insumo}`; config.titulo_principal="🚀 Solicitud Entrante"; config.mensaje_cuerpo=`Usuario: ${datos.usuario}\nSede: ${datos.sede}\nInsumo: ${datos.insumo} (x${datos.cantidad})`; break;
        case 'pedido_aprobado': config.asunto=`✅ Aprobado: ${datos.insumo}`; config.titulo_principal="Solicitud Aprobada"; config.mensaje_cuerpo=`Tu pedido de ${datos.insumo} (x${datos.cantidad}) para ${datos.sede} fue aprobado.`; break;
        case 'pedido_rechazado': config.asunto=`❌ Rechazado: ${datos.insumo}`; config.titulo_principal="Solicitud Rechazada"; config.mensaje_cuerpo=`Tu pedido de ${datos.insumo} para ${datos.sede} no pudo ser procesado.`; break;
        case 'stock_bajo': config.asunto=`⚠️ ALERTA STOCK: ${datos.insumo}`; config.titulo_principal="Stock Crítico"; config.mensaje_cuerpo=`${datos.insumo} está bajo mínimos. Stock: ${datos.cantidad_actual}`; break;
        case 'recibido': config.asunto=`🔵 Entrega Exitosa - ${datos.sede}`; config.titulo_principal="Confirmación Recepción"; config.mensaje_cuerpo=`${datos.usuario} recibió ${datos.insumo} en ${datos.sede}.`; break;
    }
    try { await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, { asunto: config.asunto, titulo_principal: config.titulo_principal, mensaje_cuerpo: config.mensaje_cuerpo, to_email: config.to_email, fecha: config.fecha }); } catch (e) { console.error(e); }
}

// --- GESTIÓN DE MODALES DE GRUPO ---
window.abrirGrupo = (batchId, sede, usuario, fecha) => {
    const modal = document.getElementById("modal-grupo-detalle");
    const lista = document.getElementById("modal-grupo-lista");
    const info = document.getElementById("modal-grupo-info");
    
    // Filtrar los pedidos que pertenecen a este grupo
    const itemsDelGrupo = rawPedidos.filter(p => (p.batchId === batchId) || (p.timestamp.toString() === batchId)); // Fallback para viejos

    info.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${sede} &nbsp;|&nbsp; <i class="fas fa-user"></i> ${usuario} &nbsp;|&nbsp; <i class="fas fa-clock"></i> ${fecha}`;
    lista.innerHTML = "";

    itemsDelGrupo.forEach(p => {
        let controls = "";
        
        // CONTROLES ADMIN (Para aprobar individualmente dentro del grupo)
        if (['admin','manager'].includes(usuarioActual.rol) && p.estado === 'pendiente') {
            controls = `
            <div class="flex items-center gap-2">
                <input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 p-1 text-center border rounded text-xs">
                <button onclick="gestionarPedido('${p.id}','aprobar','${p.insumoNom}')" class="text-green-600 hover:bg-green-50 p-1 rounded"><i class="fas fa-check"></i></button>
                <button onclick="gestionarPedido('${p.id}','rechazar')" class="text-red-500 hover:bg-red-50 p-1 rounded"><i class="fas fa-times"></i></button>
            </div>`;
        } else if (usuarioActual.rol === 'supervisor' && p.estado === 'pendiente') {
            controls = `<span class="badge bg-slate-100 text-slate-400">Pendiente</span>`;
        } else {
            // Estado ya definido
            controls = `<span class="badge status-${p.estado}">${p.estado}</span>`;
        }

        lista.innerHTML += `
        <div class="flex justify-between items-center p-3 border-b last:border-0 hover:bg-slate-50">
            <div>
                <b class="text-sm text-slate-700 uppercase">${p.insumoNom}</b>
                <div class="text-xs text-slate-400">Solicitado: ${p.cantidad}</div>
            </div>
            ${controls}
        </div>`;
    });

    modal.classList.remove("hidden");
};

window.cerrarModalGrupo = () => document.getElementById("modal-grupo-detalle").classList.add("hidden");

// --- UTILIDADES ---
window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid), pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return;
    const pData = pSnap.data();
    let emailSolicitante = ""; try { const u=await getDoc(doc(db,"usuarios",pData.usuarioId)); if(u.exists()) emailSolicitante=u.data().email; } catch(e){}

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
            cerrarModalGrupo(); activarSincronizacion(); // Refrescar
        } else alert("Stock insuficiente.");
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        enviarNotificacionGlobal('pedido_rechazado', { usuario: pData.usuarioId, insumo: ins, sede: pData.ubicacion, target_email: emailSolicitante });
        cerrarModalGrupo(); activarSincronizacion();
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
    if(!det) return alert("Detalle el problema.");
    const pRef=doc(db,"pedidos",pid), pData=(await getDoc(pRef)).data();
    if(dev) { const iRef=doc(db,"inventario",pData.insumoNom.toLowerCase()), iSnap=await getDoc(iRef); if(iSnap.exists()) await updateDoc(iRef,{cantidad:iSnap.data().cantidad+pData.cantidad}); }
    await updateDoc(pRef, { estado: dev?"devuelto":"con_incidencia", detalleIncidencia: det });
    document.getElementById('modal-incidencia').classList.add('hidden'); alert("Registrado.");
};

window.agregarProductoRápido=async()=>{const n=document.getElementById("nombre-prod").value.trim().toUpperCase(), c=parseInt(document.getElementById("cantidad-prod").value); if(n&&c>0){const i=n.toLowerCase(),r=doc(db,"inventario",i),s=await getDoc(r); if(s.exists())await updateDoc(r,{cantidad:s.data().cantidad+c}); else await setDoc(r,{cantidad:c}); await addDoc(collection(db,"entradas_stock"),{insumo:n,cantidad:c,usuario:usuarioActual.id,fecha:new Date().toLocaleString(),timestamp:Date.now()}); cerrarModalInsumo(); document.getElementById("nombre-prod").value=""; document.getElementById("cantidad-prod").value="";}else alert("Datos inválidos");};
window.prepararEdicionProducto=async(id)=>{const s=await getDoc(doc(db,"inventario",id)); if(!s.exists())return; const d=s.data(); document.getElementById('edit-prod-id').value=id; document.getElementById('edit-prod-precio').value=d.precio||''; document.getElementById('edit-prod-min').value=d.stockMinimo||''; document.getElementById('edit-prod-img').value=d.imagen||''; if(d.imagen)document.getElementById('preview-img').src=d.imagen,document.getElementById('preview-img').classList.remove('hidden'); document.getElementById('modal-detalles').classList.remove('hidden');};
window.guardarDetallesProducto=async()=>{const id=document.getElementById('edit-prod-id').value, p=parseFloat(document.getElementById('edit-prod-precio').value)||0, m=parseInt(document.getElementById('edit-prod-min').value)||0, i=document.getElementById('edit-prod-img').value; await updateDoc(doc(db,"inventario",id),{precio:p,stockMinimo:m,imagen:i}); cerrarModalDetalles(); alert("Guardado");};
window.guardarUsuario=async()=>{const id=document.getElementById("new-user").value.trim().toLowerCase(), p=document.getElementById("new-pass").value.trim(), e=document.getElementById("new-email").value.trim(), r=document.getElementById("new-role").value; if(!id||!p)return alert("Faltan datos"); await setDoc(doc(db,"usuarios",id),{pass:p,rol:r,email:e},{merge:true}); alert("Guardado"); cancelarEdicionUsuario();};
window.prepararEdicionUsuario=(i,p,r,e)=>{document.getElementById("edit-mode-id").value=i; document.getElementById("new-user").value=i; document.getElementById("new-user").disabled=true; document.getElementById("new-pass").value=p; document.getElementById("new-email").value=e||""; document.getElementById("new-role").value=r; document.getElementById("btn-guardar-usuario").innerText="Actualizar"; document.getElementById("cancel-edit-msg").classList.remove("hidden");};
window.cancelarEdicionUsuario=()=>{document.getElementById("edit-mode-id").value=""; document.getElementById("new-user").value=""; document.getElementById("new-user").disabled=false; document.getElementById("new-pass").value=""; document.getElementById("new-email").value=""; document.getElementById("btn-guardar-usuario").innerText="Guardar"; document.getElementById("cancel-edit-msg").classList.add("hidden");};
window.abrirModalInsumo=()=>document.getElementById("modal-insumo").classList.remove("hidden"); window.cerrarModalInsumo=()=>document.getElementById("modal-insumo").classList.add("hidden"); window.cerrarModalDetalles=()=>{document.getElementById("modal-detalles").classList.add("hidden"); document.getElementById('preview-img').classList.add('hidden'); document.getElementById('edit-prod-img').value='';}; window.eliminarDato=async(c,i)=>{if(confirm("¿Eliminar?"))await deleteDoc(doc(db,c,i));};

// --- SINCRONIZACIÓN (AGRUPADA) ---
function activarSincronizacion() {
    onSnapshot(collection(db, "inventario"), snap => {
        const g=document.getElementById("lista-inventario"), c=document.getElementById("contenedor-lista-pedidos"), d=document.getElementById("lista-sugerencias");
        if(g)g.innerHTML=""; if(c)c.innerHTML=""; if(d)d.innerHTML="";
        let tr=0, ts=0, lbs=[], dta=[];
        snap.forEach(ds=>{ const p=ds.data(), n=ds.id.toUpperCase(); tr++; ts+=p.cantidad; lbs.push(n.slice(0,10)); dta.push(p.cantidad);
            if(d)d.innerHTML+=`<option value="${n}">`;
            const adm=['admin','manager'].includes(usuarioActual.rol), acts=adm?`<div class="flex gap-2"><button onclick="prepararEdicionProducto('${ds.id}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="eliminarDato('inventario','${ds.id}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>`:'';
            const img=p.imagen?`<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border mb-2">`:`<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const alert=(p.stockMinimo&&p.cantidad<=p.stockMinimo)?`<i class="fas fa-exclamation-circle text-red-500 animate-pulse ml-1"></i>`:'';
            if(g)g.innerHTML+=`<div class="bg-white p-4 rounded-2xl border shadow-sm hover:shadow-md transition"><div class="flex justify-between items-start">${img}${acts}</div><h4 class="font-bold text-slate-700 text-sm truncate">${n} ${alert}</h4><p class="text-2xl font-black text-slate-800">${p.cantidad}</p></div>`;
            if(c&&p.cantidad>0){ const inC=carritoGlobal[ds.id]||0, act=inC>0?"border-indigo-500 bg-indigo-50/50":"border-transparent bg-white"; c.innerHTML+=`<div id="row-${ds.id}" class="flex items-center justify-between p-3 rounded-xl border ${act} transition-all shadow-sm"><div class="flex items-center gap-3 overflow-hidden">${p.imagen?`<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">`:''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${n}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0"><button onclick="ajustarCantidad('${ds.id}', -1)" class="w-7 h-7 rounded-md bg-slate-50 font-bold">-</button><span id="cant-${ds.id}" class="w-6 text-center font-bold text-indigo-600 text-sm">${inC}</span><button onclick="ajustarCantidad('${ds.id}', 1)" class="w-7 h-7 rounded-md bg-indigo-50 font-bold" ${inC>=p.cantidad?'disabled':''}>+</button></div></div>`; }
        });
        if(document.getElementById("metrica-stock")){ document.getElementById("metrica-total").innerText=tr; document.getElementById("metrica-stock").innerText=ts; renderChart('stockChart',lbs,dta,'Stock','#6366f1',stockChart,c=>stockChart=c); }
    });

    // LISTENER DE PEDIDOS (CON AGRUPACIÓN)
    onSnapshot(collection(db,"pedidos"), s=>{
        rawPedidos = [];
        let grupos = {}; 
        let pendingCount = 0;
        const lAdmin = document.getElementById("lista-pendientes-grupos"); // Admin container
        const lUserActive = document.getElementById("lista-pedidos-activos"); // User Active
        const lUserHistory = document.getElementById("lista-pedidos-historial"); // User History
        const tHist = document.getElementById("tabla-historial-body");

        if(lAdmin) lAdmin.innerHTML = "";
        if(lUserActive) lUserActive.innerHTML = "";
        if(lUserHistory) lUserHistory.innerHTML = "";
        if(tHist) tHist.innerHTML = "";

        s.forEach(ds => {
            const p = ds.data(); p.id = ds.id;
            rawPedidos.push(p);

            // Agrupación para Admin
            const batchKey = p.batchId || p.timestamp.toString(); // Usa timestamp como ID si no hay batchId
            if(!grupos[batchKey]) {
                grupos[batchKey] = {
                    ids: [], items: [], sede: p.ubicacion, user: p.usuarioId, 
                    fecha: p.fecha, status: p.estado, timestamp: p.timestamp
                };
            }
            grupos[batchKey].ids.push(p.id);
            grupos[batchKey].items.push(p);
            
            // Contadores
            if (p.estado === 'pendiente') pendingCount++;

            // TABLA HISTORIAL (Individual)
            if (p.estado !== 'pendiente' && tHist) {
                const note = p.detalleIncidencia ? `<br><span class="text-[9px] text-red-400 italic">"${p.detalleIncidencia}"</span>` : '';
                tHist.innerHTML += `<tr class="hover:bg-slate-50"><td class="p-4 text-slate-500">${p.fecha.split(',')[0]}</td><td class="p-4 font-bold uppercase">${p.insumoNom}</td><td class="p-4">x${p.cantidad}</td><td class="p-4 text-indigo-600 font-bold">${p.ubicacion}</td><td class="p-4 text-slate-500">${p.usuarioId}</td><td class="p-4"><span class="badge status-${p.estado}">${p.estado}</span>${note}</td></tr>`;
            }

            // VISTA USUARIO (DIVIDIDA)
            if (p.usuarioId === usuarioActual.id) {
                // Generar HTML de la tarjeta
                let cardHtml = "";
                let buttons = "";

                if (p.estado === 'aprobado') {
                    buttons = `<div class="flex gap-2 mt-2 justify-end"><button onclick="confirmarRecibido('${p.id}')" class="px-3 py-1 bg-emerald-500 text-white rounded text-xs shadow hover:bg-emerald-600">Recibir</button><button onclick="abrirIncidencia('${p.id}')" class="px-3 py-1 bg-white border border-red-200 text-red-500 rounded text-xs hover:bg-red-50">Reportar</button></div>`;
                } else if (p.estado === 'recibido') {
                    buttons = `<div class="flex gap-2 mt-2 justify-end"><button onclick="abrirIncidencia('${p.id}')" class="px-3 py-1 bg-white border border-amber-200 text-amber-600 rounded text-xs hover:bg-amber-50"><i class="fas fa-exclamation-triangle"></i> Devolver / Reportar</button></div>`;
                }

                cardHtml = `
                <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-md transition">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="badge status-${p.estado}">${p.estado}</span>
                            <h4 class="font-black text-slate-700 uppercase text-sm mt-1">${p.insumoNom}</h4>
                            <p class="text-xs text-slate-400">x${p.cantidad} &bull; ${p.ubicacion}</p>
                        </div>
                    </div>
                    ${buttons}
                </div>`;

                if (['pendiente', 'aprobado'].includes(p.estado)) {
                    if (lUserActive) lUserActive.innerHTML += cardHtml;
                } else {
                    if (lUserHistory) lUserHistory.innerHTML += cardHtml;
                }
            }
        });

        // RENDERIZADO GRUPAL PARA ADMIN (COMPACTO)
        if (lAdmin && ['admin','manager','supervisor'].includes(usuarioActual.rol)) {
            const sortedGroups = Object.values(grupos).sort((a,b) => b.timestamp - a.timestamp);
            
            sortedGroups.forEach(g => {
                // Solo mostrar si al menos uno del grupo está pendiente (o si quieres ver todos, quita el if)
                const algunoPendiente = g.items.some(i => i.estado === 'pendiente');
                
                if (algunoPendiente) {
                    lAdmin.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border-l-4 border-l-amber-400 shadow-sm hover:shadow-md transition cursor-pointer" onclick="abrirGrupo('${g.items[0].batchId || g.items[0].timestamp}', '${g.sede}', '${g.user}', '${g.fecha}')">
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="font-black text-slate-700 text-sm">Solicitud de ${g.user}</h4>
                                <p class="text-xs text-slate-400"><i class="fas fa-map-marker-alt"></i> ${g.sede} &bull; ${g.items.length} productos</p>
                            </div>
                            <button class="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition">Ver Productos</button>
                        </div>
                        <div class="mt-2 text-xs text-slate-400 flex gap-1 overflow-x-auto whitespace-nowrap custom-scroll">
                            ${g.items.map(i => `<span class="bg-slate-50 px-2 py-0.5 rounded border">${i.insumoNom} (x${i.cantidad})</span>`).join('')}
                        </div>
                    </div>`;
                }
            });
        }

        if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText = pendingCount;
    });

    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) { l.innerHTML = ""; snap.forEach(docSnap => { const u = docSnap.data(); const id = docSnap.id; l.innerHTML += `<div class="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center group hover:shadow-md transition"><div><div class="flex items-center gap-2"><span class="font-bold text-slate-700">${id}</span><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold uppercase text-slate-500">${u.rol}</span></div><p class="text-xs text-slate-400 font-mono mt-0.5">pass: ${u.pass}</p></div><div class="flex gap-2 opacity-0 group-hover:opacity-100 transition"><button onclick="prepararEdicionUsuario('${id}','${u.pass}','${u.rol}','${u.email||''}')" class="w-8 h-8 rounded bg-indigo-50 text-indigo-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white"><i class="fas fa-pen text-xs"></i></button><button onclick="eliminarDato('usuarios','${id}')" class="w-8 h-8 rounded bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white"><i class="fas fa-trash-alt text-xs"></i></button></div></div>`; }); }
        });
    }
}

window.descargarReporte=async()=>{if(!confirm("Descargar Excel?"))return;const[s,e,p]=await Promise.all([getDocs(collection(db,"inventario")),getDocs(collection(db,"entradas_stock")),getDocs(collection(db,"pedidos"))]);let h=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><h2>STOCK</h2><table border="1"><thead><tr><th>INSUMO</th><th>CANT</th><th>$</th><th>MIN</th></tr></thead><tbody>`;s.forEach(d=>{const x=d.data();h+=`<tr><td>${d.id}</td><td>${x.cantidad}</td><td>${x.precio||0}</td><td>${x.stockMinimo||0}</td></tr>`;});h+=`</tbody></table><h2>PEDIDOS</h2><table border="1"><thead><tr><th>FECHA</th><th>INSUMO</th><th>CANT</th><th>SEDE</th><th>USER</th><th>ESTADO</th></tr></thead><tbody>`;p.forEach(d=>{const x=d.data();h+=`<tr><td>${x.fecha}</td><td>${x.insumoNom}</td><td>${x.cantidad}</td><td>${x.ubicacion}</td><td>${x.usuarioId}</td><td>${x.estado}</td></tr>`;});h+=`</tbody></table></body></html>`;const b=new Blob([h],{type:'application/vnd.ms-excel'}),l=document.createElement("a");l.href=URL.createObjectURL(b);l.download=`FCI_${new Date().toISOString().slice(0,10)}.xls`;document.body.appendChild(l);l.click();document.body.removeChild(l);};
function renderChart(id,l,d,t,c,i,s){const x=document.getElementById(id);if(!x)return;if(i)i.destroy();s(new Chart(x,{type:'bar',data:{labels:l,datasets:[{label:t,data:d,backgroundColor:c,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}}}}));}

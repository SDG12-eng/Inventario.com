import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// --- CONFIGURACIÓN ---
const firebaseConfig = { apiKey: "AIzaSyA3cRmakg2dV2YRuNV1fY7LE87artsLmB8", authDomain: "mi-web-db.firebaseapp.com", projectId: "mi-web-db", storageBucket: "mi-web-db.appspot.com" };
const CLOUD_NAME = 'df79cjklp'; const UPLOAD_PRESET = 'insumos'; 
const EMAIL_SERVICE_ID = 'service_a7yozqh'; const EMAIL_TEMPLATE_ID = 'template_mlcofoo'; const EMAIL_PUBLIC_KEY = '2jVnfkJKKG0bpKN-U'; 
const ADMIN_EMAIL = 'archivos@fcipty.com'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let usuarioActual = null, stockChart=null, userChart=null, locationChart=null, carritoGlobal={}, cloudinaryWidget=null;
let pedidosRaw = []; // Para agrupar

emailjs.init(EMAIL_PUBLIC_KEY);

window.addEventListener('DOMContentLoaded', () => {
    const s = localStorage.getItem("fcilog_session");
    if(s) cargarSesion(JSON.parse(s));
    setupCloudinary();
});

// CLOUDINARY
function setupCloudinary() {
    if(typeof cloudinary!=="undefined") {
        cloudinaryWidget = cloudinary.createUploadWidget({ cloudName: CLOUD_NAME, uploadPreset: UPLOAD_PRESET, sources: ['local','camera'], multiple:false, cropping:true, folder:'fcilog_insumos' }, (error, result) => { 
            if(!error && result && result.event === "success") { 
                document.getElementById('edit-prod-img').value = result.info.secure_url;
                document.getElementById('preview-img').src = result.info.secure_url;
                document.getElementById('preview-img').classList.remove('hidden');
            }
        });
        const btn = document.getElementById("upload_widget");
        if(btn) btn.addEventListener("click", () => cloudinaryWidget.open(), false);
    }
}

// SESIÓN
function cargarSesion(d) {
    usuarioActual = d; localStorage.setItem("fcilog_session", JSON.stringify(d));
    document.getElementById("pantalla-login").classList.add("hidden");
    document.getElementById("interfaz-app").classList.remove("hidden");
    const info = document.getElementById("info-usuario");
    if(info) info.innerHTML = `<div class="flex flex-col items-center"><div class="w-8 h-8 bg-white border rounded-full flex items-center justify-center text-indigo-500 mb-1"><i class="fas fa-user"></i></div><span class="font-bold text-slate-700 uppercase">${d.id}</span><span class="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-50 px-2 rounded-full mt-1">${d.rol}</span></div>`;
    if(['admin','manager'].includes(d.rol)) document.getElementById("btn-admin-stock")?.classList.remove("hidden");
    configurarMenu(); window.verPagina(['admin','manager','supervisor'].includes(d.rol)?'stats':'stock');
    activarSincronizacion();
}

window.iniciarSesion = async () => {
    const u = document.getElementById("login-user").value.trim().toLowerCase(), p = document.getElementById("login-pass").value.trim();
    if(!u||!p) return alert("Ingrese datos");
    if(u==="admin"&&p==="1130") { cargarSesion({id:"admin",rol:"admin"}); return; }
    try { const s=await getDoc(doc(db,"usuarios",u)); if(s.exists()&&s.data().pass===p) cargarSesion({id:u,...s.data()}); else alert("Datos incorrectos"); } catch(e){alert("Error red");}
};
window.cerrarSesion = () => { localStorage.removeItem("fcilog_session"); location.reload(); };

// NAVEGACIÓN & MENÚ
window.verPagina = (id) => {
    document.querySelectorAll(".view").forEach(v => {v.classList.add("hidden"); v.classList.remove("animate-fade-in")});
    const t = document.getElementById(`pag-${id}`);
    if(t){ t.classList.remove("hidden"); setTimeout(()=>t.classList.add("animate-fade-in"),10); }
    if(window.innerWidth<768) window.toggleMenu(false);
};

window.toggleMenu = (forceState) => {
    const sb = document.getElementById("sidebar"), ov = document.getElementById("sidebar-overlay");
    const isClosed = sb.classList.contains("-translate-x-full");
    const shouldOpen = forceState !== undefined ? forceState : isClosed;
    if (shouldOpen) { sb.classList.remove("-translate-x-full"); ov.classList.remove("hidden"); ov.style.zIndex="90"; sb.style.zIndex="100"; } 
    else { sb.classList.add("-translate-x-full"); ov.classList.add("hidden"); }
};

window.switchTab = (tab) => {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');
    const btnA = document.getElementById('tab-btn-activos'), btnH = document.getElementById('tab-btn-historial');
    if(tab === 'activos') { 
        btnA.className = "flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-600 shadow-sm transition-all"; 
        btnH.className = "flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-500 hover:text-slate-700 transition-all"; 
    } else { 
        btnH.className = "flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white text-indigo-600 shadow-sm transition-all"; 
        btnA.className = "flex-1 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-500 hover:text-slate-700 transition-all"; 
    }
};

function configurarMenu() {
    const rol = usuarioActual.rol, menu = document.getElementById("menu-dinamico");
    const i = { st:{id:'stats',n:'Dashboard',i:'chart-pie'}, sk:{id:'stock',n:'Stock',i:'boxes'}, pd:{id:'solicitar',n:'Realizar Pedido',i:'cart-plus'}, pe:{id:'solicitudes',n:'Aprobaciones',i:'clipboard-check'}, hs:{id:'historial',n:'Historial',i:'history'}, us:{id:'usuarios',n:'Accesos',i:'users-cog'}, mp:{id:'notificaciones',n:'Mis Solicitudes',i:'shipping-fast'} };
    let r = [];
    if(rol==='admin') r=[i.st,i.sk,i.pd,i.pe,i.hs,i.us,i.mp]; else if(rol==='manager'||rol==='supervisor') r=[i.st,i.sk,i.pd,i.pe,i.hs,i.mp]; else r=[i.sk,i.pd,i.mp];
    menu.innerHTML = r.map(x => `<button onclick="verPagina('${x.id}')" class="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all font-bold text-sm group"><div class="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-white border border-slate-100 flex items-center justify-center transition-colors"><i class="fas fa-${x.i}"></i></div>${x.n}</button>`).join('');
}

// NOTIFICACIONES
async function enviarNotificacionGrupo(tipo, datos) {
    let config = { to_email: datos.target_email || ADMIN_EMAIL, asunto: "", titulo_principal: "", mensaje_cuerpo: "", fecha: new Date().toLocaleString() };
    const lista = datos.items ? datos.items.map(i => `• ${i.insumo.toUpperCase()} (x${i.cantidad})`).join('\n') : "";

    switch (tipo) {
        case 'nuevo_pedido': config.asunto = `📦 Nuevo Pedido de ${datos.usuario}`; config.titulo_principal = "🚀 Solicitud Recibida"; config.mensaje_cuerpo = `Usuario: ${datos.usuario}\nSede: ${datos.sede}\n\n${lista}`; break;
        case 'aprobado_parcial': config.asunto = `✅ Pedido Aprobado`; config.titulo_principal = "Estado Actualizado"; config.mensaje_cuerpo = `Tu pedido de:\n\n${lista}\n\nHa sido APROBADO. Revisa "Mis Pedidos".`; break;
        case 'stock_bajo': config.asunto = `⚠️ STOCK BAJO: ${datos.insumo}`; config.titulo_principal = "Alerta Inventario"; config.mensaje_cuerpo = `Insumo: ${datos.insumo}\nStock: ${datos.actual}\nMínimo: ${datos.minimo}`; break;
        case 'recibido': config.asunto = `🔵 Recepción Confirmada`; config.titulo_principal = "Entrega Exitosa"; config.mensaje_cuerpo = `Usuario: ${datos.usuario}\nSede: ${datos.sede}\n\n${lista}`; break;
    }
    try { await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, { asunto: config.asunto, titulo_principal: config.titulo_principal, mensaje_cuerpo: config.mensaje_cuerpo, to_email: config.to_email, fecha: config.fecha }); } catch (e) { console.error(e); }
}

// PEDIDOS
window.ajustarCantidad=(i,d)=>{const n=Math.max(0,(carritoGlobal[i]||0)+d); carritoGlobal[i]=n; document.getElementById(`cant-${i}`).innerText=n; document.getElementById(`row-${i}`).classList.toggle("border-indigo-500",n>0);};

window.procesarSolicitudMultiple = async () => {
    const ubi = document.getElementById("sol-ubicacion").value, items = Object.entries(carritoGlobal).filter(([_, c]) => c > 0);
    if(!ubi || items.length === 0) return alert("Seleccione sede y productos.");
    const batchId = Date.now().toString(); 
    const itemsData = items.map(([ins, cant]) => ({ insumo: ins, cantidad: cant }));
    await Promise.all(items.map(async ([ins, cant]) => {
        await addDoc(collection(db, "pedidos"), { usuarioId: usuarioActual.id, insumoNom: ins, cantidad: cant, ubicacion: ubi, estado: "pendiente", fecha: new Date().toLocaleString(), timestamp: Date.now(), batchId: batchId });
    }));
    enviarNotificacionGrupo('nuevo_pedido', { usuario: usuarioActual.id, sede: ubi, items: itemsData });
    alert("✅ Enviado."); carritoGlobal={}; document.getElementById("sol-ubicacion").value=""; activarSincronizacion(); window.verPagina('notificaciones');
};

// SINCRONIZACIÓN Y LÓGICA PRINCIPAL
let cacheEntradas = [], cachePedidos = []; // Cache para historial unificado

function activarSincronizacion() {
    // 1. STOCK (CON DATALIST - LISTA DESPLEGABLE)
    onSnapshot(collection(db, "inventario"), snap => {
        const g=document.getElementById("lista-inventario"), c=document.getElementById("contenedor-lista-pedidos"), d=document.getElementById("lista-sugerencias");
        if(g)g.innerHTML=""; if(c)c.innerHTML=""; if(d)d.innerHTML="";
        let tr=0, ts=0, lb=[], dt=[];
        
        snap.forEach(ds=>{ const p=ds.data(), n=ds.id.toUpperCase(); tr++; ts+=p.cantidad; lb.push(n.slice(0,10)); dt.push(p.cantidad);
            // Llenar el Datalist
            if(d) d.innerHTML+=`<option value="${n}">`; 
            
            const adm=['admin','manager'].includes(usuarioActual.rol), acts=adm?`<div class="flex gap-2"><button onclick="prepararEdicionProducto('${ds.id}')" class="text-slate-300 hover:text-indigo-500"><i class="fas fa-cog"></i></button><button onclick="eliminarDato('inventario','${ds.id}')" class="text-slate-300 hover:text-red-400"><i class="fas fa-trash"></i></button></div>`:'';
            const img=p.imagen?`<img src="${p.imagen}" class="w-12 h-12 object-cover rounded-lg border mb-2">`:`<div class="w-12 h-12 bg-slate-50 rounded-lg border flex items-center justify-center text-slate-300 mb-2"><i class="fas fa-image"></i></div>`;
            const isLow=(p.stockMinimo&&p.cantidad<=p.stockMinimo), border=isLow?"border-2 border-red-500 bg-red-50":"border border-slate-100 bg-white", price=p.precio?`<span class="text-emerald-600 font-bold text-xs">$${p.precio}</span>`:'';
            const alertIco=isLow?`<i class="fas fa-exclamation-circle text-red-500 animate-pulse ml-1"></i>`:'';

            if(g)g.innerHTML+=`<div class="${border} p-4 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col"><div class="flex justify-between items-start">${img}${acts}</div><h4 class="font-bold text-slate-700 text-xs truncate" title="${n}">${n} ${alertIco}</h4><div class="flex justify-between items-end mt-1"><p class="text-2xl font-black text-slate-800">${p.cantidad}</p>${price}</div></div>`;
            if(c&&p.cantidad>0){ const inC=carritoGlobal[ds.id]||0, act=inC>0?"border-indigo-500 bg-indigo-50/50":"border-transparent bg-white"; c.innerHTML+=`<div id="row-${ds.id}" class="flex items-center justify-between p-3 rounded-xl border ${act} transition-all shadow-sm"><div class="flex items-center gap-3 overflow-hidden">${p.imagen?`<img src="${p.imagen}" class="w-8 h-8 rounded-md object-cover">`:''}<div class="truncate"><p class="font-bold text-xs uppercase text-slate-700 truncate">${n}</p><p class="text-[10px] text-slate-400">Disp: ${p.cantidad}</p></div></div><div class="flex items-center gap-2 bg-white rounded-lg p-1 border flex-shrink-0"><button onclick="ajustarCantidad('${ds.id}', -1)" class="w-7 h-7 rounded-md bg-slate-50 font-bold">-</button><span id="cant-${ds.id}" class="w-6 text-center font-bold text-indigo-600 text-sm">${inC}</span><button onclick="ajustarCantidad('${ds.id}', 1)" class="w-7 h-7 rounded-md bg-indigo-50 font-bold" ${inC>=p.cantidad?'disabled':''}>+</button></div></div>`; }
        });
        if(document.getElementById("metrica-stock")){ document.getElementById("metrica-total").innerText=tr; document.getElementById("metrica-stock").innerText=ts; renderChart('stockChart',lb,dt,'Stock','#6366f1',stockChart,c=>stockChart=c); }
    });

    // 2. PEDIDOS (AGRUPACIÓN Y TABS)
    onSnapshot(collection(db,"pedidos"), s=>{
        pedidosRaw = []; cachePedidos=[]; let grupos = {}, pendingCount = 0;
        const lAdmin = document.getElementById("lista-pendientes-admin");
        const lActive = document.getElementById("tab-content-activos");
        const lHistory = document.getElementById("tab-content-historial");

        if(lAdmin) lAdmin.innerHTML=""; if(lActive) lActive.innerHTML=""; if(lHistory) lHistory.innerHTML="";

        s.forEach(ds => {
            const p = ds.data(); p.id = ds.id; pedidosRaw.push(p); cachePedidos.push(p);
            
            const bKey = p.batchId || p.timestamp;
            if(!grupos[bKey]) grupos[bKey] = { items:[], user:p.usuarioId, sede:p.ubicacion, date:p.fecha, ts:p.timestamp };
            grupos[bKey].items.push(p);

            if(p.estado==='pendiente') pendingCount++;

            // VISTA USUARIO (TABS)
            if(p.usuarioId===usuarioActual.id) {
                let btns = "";
                // Pendiente de Recibir (En Curso)
                if(p.estado==='aprobado') btns=`<div class="mt-2 flex justify-end gap-2"><button onclick="confirmarRecibido('${p.id}')" class="bg-emerald-500 text-white px-3 py-1 rounded text-xs shadow">Recibir</button><button onclick="abrirIncidencia('${p.id}')" class="bg-white border text-red-500 border-red-200 px-3 py-1 rounded text-xs">Reportar</button></div>`;
                // Historial (Ya recibido, rechazado o devuelto)
                if(p.estado==='recibido' || p.estado==='devuelto') btns=`<div class="mt-2 flex justify-end"><button onclick="abrirIncidencia('${p.id}')" class="text-amber-600 text-xs hover:underline flex items-center gap-1"><i class="fas fa-undo"></i> Devolver / Reportar</button></div>`;
                
                const card = `<div class="bg-white p-4 rounded-xl border shadow-sm"><div class="flex justify-between"><div><span class="badge status-${p.estado}">${p.estado}</span><h4 class="font-bold text-sm mt-1 uppercase">${p.insumoNom}</h4><p class="text-xs text-slate-400">x${p.cantidad} • ${p.ubicacion}</p></div></div>${btns}</div>`;
                
                if(['pendiente','aprobado'].includes(p.estado)) { if(lActive) lActive.innerHTML+=card; } 
                else { if(lHistory) lHistory.innerHTML+=card; }
            }
        });

        // ADMIN GROUP VIEW
        if(lAdmin && ['admin','manager','supervisor'].includes(usuarioActual.rol)) {
            Object.values(grupos).sort((a,b)=>b.ts-a.ts).forEach(g => {
                const pendingItems = g.items.filter(i=>i.estado==='pendiente');
                if(pendingItems.length > 0) {
                    const itemsStr = pendingItems.map(i=>`<span class="bg-slate-100 px-2 py-1 rounded text-xs border">${i.insumoNom} (x${i.cantidad})</span>`).join('');
                    lAdmin.innerHTML += `<div class="bg-white p-4 rounded-2xl border-l-4 border-l-amber-400 shadow-sm cursor-pointer hover:shadow-md transition" onclick="abrirModalGrupo('${g.items[0].batchId || g.ts}')"><div class="flex justify-between items-center mb-2"><h4 class="font-bold text-slate-800 text-sm">${g.user}</h4><span class="text-xs text-slate-400">${g.sede} • ${pendingItems.length} items</span></div><div class="flex flex-wrap gap-1">${itemsStr}</div><div class="mt-2 text-center text-xs text-indigo-500 font-bold">Ver Detalles <i class="fas fa-chevron-right"></i></div></div>`;
                }
            });
        }
        if(document.getElementById("metrica-pedidos")) document.getElementById("metrica-pedidos").innerText=pendingCount;
        renderHistorialUnificado();
    });

    // 3. ENTRADAS (HISTORIAL)
    onSnapshot(collection(db,"entradas_stock"),s=>{
        cacheEntradas=[]; s.forEach(x=>{ const d=x.data(); d.id=x.id; cacheEntradas.push(d); });
        renderHistorialUnificado();
    });

    // 4. USUARIOS (ARREGLADO - SE MUESTRA SIEMPRE PARA ADMIN)
    if(usuarioActual.rol === 'admin') {
        onSnapshot(collection(db, "usuarios"), snap => {
            const l = document.getElementById("lista-usuarios-db");
            if(l) { 
                l.innerHTML = "";
                snap.forEach(d => {
                    const u = d.data();
                    l.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
                        <div>
                            <span class="font-bold uppercase text-slate-700">${d.id}</span>
                            <span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 rounded uppercase ml-2">${u.rol}</span>
                            <br>
                            <span class="text-xs text-slate-400"><i class="fas fa-envelope"></i> ${u.email||'Sin correo'}</span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="prepararEdicionUsuario('${d.id}','${u.pass}','${u.rol}','${u.email||''}')" class="w-8 h-8 rounded bg-slate-50 text-indigo-500 hover:bg-indigo-500 hover:text-white transition flex items-center justify-center"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="eliminarDato('usuarios','${d.id}')" class="w-8 h-8 rounded bg-slate-50 text-red-400 hover:bg-red-500 hover:text-white transition flex items-center justify-center"><i class="fas fa-trash-alt text-xs"></i></button>
                        </div>
                    </div>`;
                });
            }
        });
    }
}

// RENDER HISTORIAL UNIFICADO
function renderHistorialUnificado() {
    const t = document.getElementById("tabla-movimientos-unificados");
    if(!t) return;
    t.innerHTML="";
    
    // Formatear Entradas
    const eFmt = cacheEntradas.map(e => ({ fecha:e.fecha, ts:e.timestamp, tipo:'ENTRADA', insumo:e.insumo, cant:e.cantidad, det:`${e.usuario} (Stock)`, est:'completado' }));
    // Formatear Salidas
    const pFmt = cachePedidos.map(p => ({ fecha:p.fecha, ts:p.timestamp, tipo:'SALIDA', insumo:p.insumoNom, cant:p.cantidad, det:`${p.usuarioId} (${p.ubicacion})`, est:p.estado }));
    
    // Unir y ordenar
    const all = [...eFmt, ...pFmt].sort((a,b)=>b.ts-a.ts);

    all.forEach(h => {
        const icon = h.tipo==='ENTRADA' ? '<i class="fas fa-arrow-down text-emerald-500"></i>' : '<i class="fas fa-arrow-up text-amber-500"></i>';
        t.innerHTML += `<tr class="hover:bg-slate-50 border-b border-slate-50 last:border-0"><td class="p-3 text-slate-400 text-[10px] font-mono">${h.fecha.split(',')[0]}</td><td class="p-3 text-xs font-bold text-slate-600">${icon} ${h.tipo}</td><td class="p-3 font-bold text-slate-700 uppercase text-xs">${h.insumo}</td><td class="p-3 text-sm font-bold text-slate-800">${h.cant}</td><td class="p-3 text-xs text-slate-500 uppercase">${h.det}</td><td class="p-3"><span class="badge status-${h.est}">${h.est}</span></td></tr>`;
    });
}

// MODAL GRUPO
window.abrirModalGrupo = (bKey) => {
    const m = document.getElementById("modal-grupo-admin"), c = document.getElementById("modal-grupo-contenido"), t = document.getElementById("modal-grupo-titulo");
    const items = pedidosRaw.filter(p => (p.batchId === bKey) || (p.timestamp.toString() === bKey));
    if(items.length===0) return;
    t.innerHTML = `${items[0].usuarioId} | ${items[0].ubicacion}`; c.innerHTML = "";
    items.forEach(p => {
        let act = `<span class="badge status-${p.estado}">${p.estado}</span>`;
        if(p.estado==='pendiente' && usuarioActual.rol!=='supervisor') act = `<div class="flex gap-2 items-center"><input type="number" id="qty-${p.id}" value="${p.cantidad}" class="w-12 border rounded text-center p-1"><button onclick="gestionarPedido('${p.id}','aprobar','${p.insumoNom}')" class="text-green-600 bg-green-50 p-2 rounded"><i class="fas fa-check"></i></button><button onclick="gestionarPedido('${p.id}','rechazar')" class="text-red-600 bg-red-50 p-2 rounded"><i class="fas fa-times"></i></button></div>`;
        c.innerHTML += `<div class="flex justify-between items-center p-3 border-b hover:bg-slate-50"><div><b class="uppercase text-sm">${p.insumoNom}</b><br><span class="text-xs text-slate-400">Solicitado: ${p.cantidad}</span></div>${act}</div>`;
    });
    m.classList.remove("hidden");
};

window.gestionarPedido = async (pid, accion, ins) => {
    const pRef = doc(db, "pedidos", pid), pSnap = await getDoc(pRef);
    if(!pSnap.exists()) return;
    const pData = pSnap.data();
    let emailSolicitante = ""; try{const u=await getDoc(doc(db,"usuarios",pData.usuarioId)); if(u.exists()) emailSolicitante=u.data().email;}catch(e){}

    if(accion === 'aprobar') {
        const inp = document.getElementById(`qty-${pid}`), val = inp?parseInt(inp.value):pData.cantidad;
        const iRef = doc(db, "inventario", ins.toLowerCase()), iSnap = await getDoc(iRef);
        if(iSnap.exists() && iSnap.data().cantidad >= val) {
            const newStock = iSnap.data().cantidad - val;
            await updateDoc(iRef, { cantidad: newStock });
            await updateDoc(pRef, { estado: "aprobado", cantidad: val });
            
            if(newStock <= (iSnap.data().stockMinimo||0)) enviarNotificacionGrupo('stock_bajo', { insumo: ins, actual: newStock, minimo: iSnap.data().stockMinimo });
            
            const pendientes = pedidosRaw.filter(p => (p.batchId === pData.batchId) && p.estado === 'pendiente' && p.id !== pid);
            if(pendientes.length === 0) document.getElementById("modal-grupo-admin").classList.add("hidden");
            else window.abrirModalGrupo(pData.batchId); 

            if(emailSolicitante) enviarNotificacionGrupo('aprobado_parcial', { usuario: pData.usuarioId, items: [{insumo:ins, cantidad:val}], target_email: emailSolicitante });

        } else alert("Stock insuficiente");
    } else {
        await updateDoc(pRef, { estado: "rechazado" });
        window.abrirModalGrupo(pData.batchId);
    }
};

window.confirmarRecibido = async (pid) => { 
    if(confirm("¿Confirmar recepción?")) {
        const pRef=doc(db,"pedidos",pid), snap=await getDoc(pRef);
        await updateDoc(pRef, { estado: "recibido" });
        if(snap.exists()) enviarNotificacionGrupo('recibido', {usuario:usuarioActual.id, items:[{insumo:snap.data().insumoNom, cantidad:snap.data().cantidad}], sede:snap.data().ubicacion});
    }
};

window.agregarProductoRápido=async()=>{const n=document.getElementById("nombre-prod").value.trim().toUpperCase(), c=parseInt(document.getElementById("cantidad-prod").value); if(n&&c>0){const i=n.toLowerCase(),r=doc(db,"inventario",i),s=await getDoc(r); if(s.exists())await updateDoc(r,{cantidad:s.data().cantidad+c}); else await setDoc(r,{cantidad:c}); await addDoc(collection(db,"entradas_stock"),{insumo:n,cantidad:c,usuario:usuarioActual.id,fecha:new Date().toLocaleString(),timestamp:Date.now()}); cerrarModalInsumo(); document.getElementById("nombre-prod").value=""; document.getElementById("cantidad-prod").value="";}else alert("Datos inválidos");};
window.prepararEdicionProducto=async(id)=>{const s=await getDoc(doc(db,"inventario",id)); if(!s.exists())return; const d=s.data(); document.getElementById('edit-prod-id').value=id; document.getElementById('edit-prod-precio').value=d.precio||''; document.getElementById('edit-prod-min').value=d.stockMinimo||''; document.getElementById('edit-prod-img').value=d.imagen||''; if(d.imagen)document.getElementById('preview-img').src=d.imagen,document.getElementById('preview-img').classList.remove('hidden'); document.getElementById('modal-detalles').classList.remove('hidden');};
window.guardarDetallesProducto=async()=>{const id=document.getElementById('edit-prod-id').value, p=parseFloat(document.getElementById('edit-prod-precio').value)||0, m=parseInt(document.getElementById('edit-prod-min').value)||0, i=document.getElementById('edit-prod-img').value; await updateDoc(doc(db,"inventario",id),{precio:p,stockMinimo:m,imagen:i}); cerrarModalDetalles(); alert("Guardado");};
window.guardarUsuario=async()=>{const id=document.getElementById("new-user").value.trim().toLowerCase(), p=document.getElementById("new-pass").value.trim(), e=document.getElementById("new-email").value.trim(), r=document.getElementById("new-role").value; if(!id||!p)return alert("Faltan datos"); await setDoc(doc(db,"usuarios",id),{pass:p,rol:r,email:e},{merge:true}); alert("Guardado"); cancelarEdicionUsuario();};
window.prepararEdicionUsuario=(i,p,r,e)=>{document.getElementById("edit-mode-id").value=i; document.getElementById("new-user").value=i; document.getElementById("new-user").disabled=true; document.getElementById("new-pass").value=p; document.getElementById("new-email").value=e||""; document.getElementById("new-role").value=r; document.getElementById("btn-guardar-usuario").innerText="Actualizar"; document.getElementById("cancel-edit-msg").classList.remove("hidden");};
window.cancelarEdicionUsuario=()=>{document.getElementById("edit-mode-id").value=""; document.getElementById("new-user").value=""; document.getElementById("new-user").disabled=false; document.getElementById("new-pass").value=""; document.getElementById("new-email").value=""; document.getElementById("btn-guardar-usuario").innerText="Guardar"; document.getElementById("cancel-edit-msg").classList.add("hidden");};
window.abrirModalInsumo=()=>document.getElementById("modal-insumo").classList.remove("hidden"); window.cerrarModalInsumo=()=>document.getElementById("modal-insumo").classList.add("hidden"); window.cerrarModalDetalles=()=>{document.getElementById("modal-detalles").classList.add("hidden"); document.getElementById('preview-img').classList.add('hidden'); document.getElementById('edit-prod-img').value='';}; window.eliminarDato=async(c,i)=>{if(confirm("¿Eliminar?"))await deleteDoc(doc(db,c,i));};
window.abrirIncidencia=(pid)=>{document.getElementById('incidencia-pid').value=pid;document.getElementById('incidencia-detalle').value="";document.getElementById('modal-incidencia').classList.remove('hidden');};
window.confirmarIncidencia=async(dev)=>{const pid=document.getElementById('incidencia-pid').value,det=document.getElementById('incidencia-detalle').value.trim();if(!det)return alert("Describa el problema");const pRef=doc(db,"pedidos",pid),pData=(await getDoc(pRef)).data();if(dev){const iRef=doc(db,"inventario",pData.insumoNom.toLowerCase()),iSnap=await getDoc(iRef);if(iSnap.exists())await updateDoc(iRef,{cantidad:iSnap.data().cantidad+pData.cantidad});}await updateDoc(pRef,{estado:dev?"devuelto":"con_incidencia",detalleIncidencia:det});document.getElementById('modal-incidencia').classList.add('hidden');alert("Registrado");};

window.descargarReporte=async()=>{if(!confirm("Descargar Excel?"))return;const[s,e,p]=await Promise.all([getDocs(collection(db,"inventario")),getDocs(collection(db,"entradas_stock")),getDocs(collection(db,"pedidos"))]);let h=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><h2>STOCK</h2><table border="1"><thead><tr><th>INSUMO</th><th>CANT</th><th>$</th><th>MIN</th></tr></thead><tbody>`;s.forEach(d=>{const x=d.data();h+=`<tr><td>${d.id}</td><td>${x.cantidad}</td><td>${x.precio||0}</td><td>${x.stockMinimo||0}</td></tr>`;});h+=`</tbody></table><h2>HISTORIAL</h2><table border="1"><thead><tr><th>FECHA</th><th>TIPO</th><th>INSUMO</th><th>CANT</th><th>DETALLE</th></tr></thead><tbody>`;
const hist=[...e.docs.map(x=>({...x.data(),tipo:'ENTRADA'})),...p.docs.map(x=>({...x.data(),tipo:'SALIDA'}))].sort((a,b)=>b.timestamp-a.timestamp);
hist.forEach(h=>{h+=`<tr><td>${h.fecha}</td><td>${h.tipo}</td><td>${h.insumo||h.insumoNom}</td><td>${h.cantidad}</td><td>${h.usuario||h.ubicacion}</td></tr>`});h+=`</tbody></table></body></html>`;const b=new Blob([h],{type:'application/vnd.ms-excel'}),l=document.createElement("a");l.href=URL.createObjectURL(b);l.download=`FCI_${new Date().toISOString().slice(0,10)}.xls`;document.body.appendChild(l);l.click();document.body.removeChild(l);};
function renderChart(id,l,d,t,c,i,s){const x=document.getElementById(id);if(!x)return;if(i)i.destroy();s(new Chart(x,{type:'bar',data:{labels:l,datasets:[{label:t,data:d,backgroundColor:c,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}}}}));}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname.startsWith("/api/")) return api(request, env, u);
    if (u.pathname === "/catalog.html") return new Response(CATALOG, {headers: htmlHeaders()});
    return new Response(APP, {headers: htmlHeaders()});
  }
};

const htmlHeaders=()=>({"content-type":"text/html; charset=UTF-8"});
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json; charset=UTF-8"}});

async function init(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS routes(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,city TEXT NOT NULL,date TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,city TEXT,route_id INTEGER,token TEXT UNIQUE)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT,price REAL DEFAULT 0,photo TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,client_name TEXT,city TEXT,route_id INTEGER,route_name TEXT,route_date TEXT,payment TEXT,items TEXT,total REAL DEFAULT 0,status TEXT,created_at TEXT,paid_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER,client_name TEXT,city TEXT,route_id INTEGER,route_name TEXT,items TEXT,total REAL DEFAULT 0,created_at TEXT,status TEXT)`)
  ]);
}

async function api(req,env,u){
  try{
    await init(env.DB);
    const p=u.pathname.slice(5), m=req.method;

    if(p==="init"&&m==="GET") return json({ok:true});

    if(p==="products"&&m==="GET") return json((await env.DB.prepare("SELECT * FROM products ORDER BY id DESC").all()).results);
    if(p==="products"&&m==="POST"){
      const d=await req.json();
      const r=await env.DB.prepare("INSERT INTO products(name,code,price,photo) VALUES(?,?,?,?)").bind(d.name||"",d.code||"",+d.price||0,d.photo||"").run();
      return json({ok:true,id:r.meta.last_row_id});
    }
    if(p.startsWith("products/")&&m==="DELETE"){
      await env.DB.prepare("DELETE FROM products WHERE id=?").bind(+p.split("/")[1]).run(); return json({ok:true});
    }

    if(p==="routes"&&m==="GET") return json((await env.DB.prepare("SELECT * FROM routes ORDER BY date ASC,id DESC").all()).results);
    if(p==="routes"&&m==="POST"){
      const d=await req.json(); const r=await env.DB.prepare("INSERT INTO routes(name,city,date) VALUES(?,?,?)").bind(d.name||"",d.city||"",d.date||"").run();
      return json({ok:true,id:r.meta.last_row_id});
    }
    if(p.startsWith("routes/")&&m==="DELETE"){
      await env.DB.prepare("DELETE FROM routes WHERE id=?").bind(+p.split("/")[1]).run(); return json({ok:true});
    }

    if(p==="clients"&&m==="GET") return json((await env.DB.prepare(`
      SELECT c.*,r.name route_name,r.city route_city,r.date route_date
      FROM clients c LEFT JOIN routes r ON r.id=c.route_id ORDER BY c.id DESC`).all()).results);
    if(p==="clients"&&m==="POST"){
      const d=await req.json(), token=crypto.randomUUID().replaceAll("-","");
      const r=await env.DB.prepare("INSERT INTO clients(name,phone,city,route_id,token) VALUES(?,?,?,?,?)")
        .bind(d.name||"",d.phone||"",d.city||"",d.route_id||null,token).run();
      return json({ok:true,id:r.meta.last_row_id,token});
    }
    if(p.startsWith("clients/")&&m==="DELETE"){
      await env.DB.prepare("DELETE FROM clients WHERE id=?").bind(+p.split("/")[1]).run(); return json({ok:true});
    }

    if(p==="sales"&&m==="GET") return json((await env.DB.prepare("SELECT * FROM sales ORDER BY id DESC").all()).results);
    if(p==="sales"&&m==="POST"){
      const d=await req.json();
      const r=await env.DB.prepare(`INSERT INTO sales
      (client_id,client_name,city,route_id,route_name,route_date,payment,items,total,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
        d.client_id||null,d.client_name||"",d.city||"",d.route_id||null,d.route_name||"",
        d.route_date||"",d.payment||"60 dias",JSON.stringify(d.items||[]),+d.total||0,
        d.status||"Pendente",new Date().toISOString()
      ).run(); return json({ok:true,id:r.meta.last_row_id});
    }
    if(p.startsWith("sales/")&&p.endsWith("/paid")&&m==="POST"){
      const id=+p.split("/")[1];
      await env.DB.prepare("UPDATE sales SET status='Pago',paid_at=? WHERE id=?").bind(new Date().toISOString(),id).run();
      return json({ok:true});
    }

    if(p==="orders"&&m==="GET") return json((await env.DB.prepare("SELECT * FROM orders ORDER BY id DESC").all()).results);
    if(p==="orders"&&m==="POST"){
      const d=await req.json();
      const r=await env.DB.prepare(`INSERT INTO orders
      (client_id,client_name,city,route_id,route_name,items,total,created_at,status)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(
        d.client_id||null,d.client_name||"",d.city||"",d.route_id||null,d.route_name||"",
        JSON.stringify(d.items||[]),+d.total||0,new Date().toISOString(),"Novo"
      ).run(); return json({ok:true,id:r.meta.last_row_id});
    }
    if(p.startsWith("orders/")&&m==="POST"){
      const id=+p.split("/")[1];
      await env.DB.prepare("UPDATE orders SET status='Atendido' WHERE id=?").bind(id).run(); return json({ok:true});
    }

    if(p==="catalog-client"&&m==="GET"){
      const t=u.searchParams.get("token"); if(!t) return json({error:"Token não informado"},400);
      const r=await env.DB.prepare(`SELECT c.*,r.name route_name,r.city route_city,r.date route_date
      FROM clients c LEFT JOIN routes r ON r.id=c.route_id WHERE c.token=? LIMIT 1`).bind(t).all();
      return json(r.results[0]||null);
    }
    return json({error:"Endpoint não encontrado"},404);
  }catch(e){return json({error:e.message},500)}
}

const APP=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Meu Sistema de Vendas</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{background:#111827;color:white;padding:16px;position:sticky;top:0;z-index:20}.head{max-width:1100px;margin:auto;display:flex;justify-content:space-between;align-items:center}
h1{font-size:20px;margin:0}main{max-width:1100px;margin:auto;padding:12px 14px 80px}.nav{display:flex;gap:7px;overflow:auto;padding:8px 0;position:sticky;top:57px;background:#f3f4f6;z-index:15}
.nav button{border:0;border-radius:11px;background:white;padding:10px 13px;font-weight:700;white-space:nowrap}.nav .on{background:#111827;color:white}
.sec{display:none}.sec.on{display:block}.card{background:white;border-radius:16px;padding:15px;margin:10px 0;box-shadow:0 2px 9px #0000000b}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.stat{background:white;border-radius:15px;padding:15px}.num{font-size:26px;font-weight:900;margin-top:3px}label{display:block;font-weight:700;font-size:13px;margin:8px 0 5px}
input,select{width:100%;padding:12px;border:1px solid #d1d5db;border-radius:10px;background:white;font:inherit}.btn{border:0;border-radius:11px;padding:12px 15px;background:#111827;color:white;font-weight:800}.light{background:#e5e7eb;color:#111827}.danger{background:#fee2e2;color:#991b1b}
.row{display:flex;gap:9px;justify-content:space-between;align-items:center}.muted{color:#6b7280}.total{font-size:25px;font-weight:900}.item{display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee;padding:10px 0}.item img{width:58px;height:58px;object-fit:cover;border-radius:9px;background:#eee}.item .grow{flex:1}.qty{width:72px!important}.pill{display:inline-block;padding:5px 8px;border-radius:999px;background:#eef2ff;font-size:12px;font-weight:800}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111827;color:white;padding:12px 15px;border-radius:12px;display:none;z-index:50}
</style></head><body>
<header><div class="head"><h1>📦 Meu Sistema de Vendas</h1><span id="clock"></span></div></header><main>
<div class="nav" id="nav">
<button class="on" data-s="inicio">Início</button><button data-s="produtos">Produtos</button><button data-s="clientes">Clientes</button>
<button data-s="rotas">Rotas</button><button data-s="vendas">Vendas</button><button data-s="pedidos">Pedidos recebidos</button>
<button data-s="receber">A receber</button><button data-s="relatorios">Relatórios</button>
</div>

<section id="inicio" class="sec on"><h2>Início</h2><div class="stats">
<div class="stat"><div class="muted">Produtos</div><div id="stP" class="num">0</div></div>
<div class="stat"><div class="muted">Clientes</div><div id="stC" class="num">0</div></div>
<div class="stat"><div class="muted">Vendas</div><div id="stV" class="num">0</div></div>
<div class="stat"><div class="muted">Pedidos novos</div><div id="stO" class="num">0</div></div></div>
<div class="card"><h3>Atalho</h3><button class="btn" onclick="go('vendas')">➕ Fazer venda</button></div></section>

<section id="produtos" class="sec"><h2>Produtos</h2><div class="card"><div class="grid">
<div><label>Nome</label><input id="pn"></div><div><label>Preço de venda</label><input id="pp" type="number" step=".01"></div>
<div><label>Código</label><input id="pc"></div><div><label>Foto</label><input id="pf" type="file" accept="image/*"></div></div><br>
<button class="btn" onclick="addProduct()">Salvar produto</button></div><div class="card" id="productsList"></div></section>

<section id="clientes" class="sec"><h2>Clientes</h2><div class="card"><div class="grid">
<div><label>Nome</label><input id="cn"></div><div><label>WhatsApp</label><input id="ct"></div>
<div><label>Rota</label><select id="cr"></select></div></div><br><button class="btn" onclick="addClient()">Salvar cliente</button></div>
<div class="card" id="clientsList"></div></section>

<section id="rotas" class="sec"><h2>Rotas</h2><div class="card"><div class="grid">
<div><label>Nome da rota</label><input id="rn"></div><div><label>Cidade</label><input id="rc"></div><div><label>Data</label><input id="rd" type="date"></div>
</div><br><button class="btn" onclick="addRoute()">Salvar rota</button></div><div class="card" id="routesList"></div></section>

<section id="vendas" class="sec"><h2>Fazer venda</h2><div class="card">
<label>Cliente</label><select id="vc" onchange="saleClient()"></select>
<div class="grid"><div><label>Cidade</label><input id="vcity" readonly></div><div><label>Rota</label><input id="vroute" readonly></div><div><label>Data da rota</label><input id="vdate" readonly></div></div>
<label>Pagamento</label><select id="vpay"><option>60 dias</option><option>30 dias</option><option>À vista</option><option>Pix</option><option>Cartão</option></select>
<h3>Produtos da venda</h3><div id="saleProducts"></div><div class="row"><b>TOTAL</b><span id="saleTotal" class="total">R$ 0,00</span></div><br>
<button class="btn" onclick="finishSale()">Finalizar venda</button></div></section>

<section id="pedidos" class="sec"><h2>Pedidos recebidos</h2><div id="ordersList"></div></section>
<section id="receber" class="sec"><h2>Contas a receber</h2><div id="receiveList"></div></section>
<section id="relatorios" class="sec"><h2>Relatórios</h2><div id="reportList"></div></section>
</main><div id="toast" class="toast"></div>
<script>
let P=[],C=[],R=[],V=[],O=[],cart={};const $=x=>document.getElementById(x);
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function get(x){let r=await fetch("/api/"+x);return r.json()}async function post(x,d){let r=await fetch("/api/"+x,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});return r.json()}
function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2200)}
function go(s){document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("on",b.dataset.s===s));document.querySelectorAll(".sec").forEach(x=>x.classList.toggle("on",x.id===s));if(s==="vendas")renderSale();if(s==="receber")renderReceive();if(s==="relatorios")renderReport()}
document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>go(b.dataset.s));
function stats(){$("stP").textContent=P.length;$("stC").textContent=C.length;$("stV").textContent=V.length;$("stO").textContent=O.filter(x=>x.status==="Novo").length}
async function load(){[P,C,R,V,O]=await Promise.all([get("products"),get("clients"),get("routes"),get("sales"),get("orders")]);renderProducts();renderClients();renderRoutes();renderSelects();renderOrders();renderReceive();renderReport();stats()}
function renderProducts(){$("productsList").innerHTML=P.length?P.map(p=>`<div class="item"><img src="${p.photo||""}"><div class="grow"><b>${esc(p.name)}</b><div class="muted">${esc(p.code||"Sem código")}</div><b>${money(p.price)}</b></div><button class="btn danger" onclick="del('products/${p.id}')">Excluir</button></div>`).join(""):"Nenhum produto cadastrado."}
function renderClients(){$("clientsList").innerHTML=C.length?C.map(c=>`<div class="item"><div class="grow"><b>${esc(c.name)}</b><div>${esc(c.phone||"")}</div><div class="muted">${esc(c.city||c.route_city||"")} · ${esc(c.route_name||"")}</div></div><button class="btn light" onclick="catalog('${c.token}')">Catálogo</button><button class="btn danger" onclick="del('clients/${c.id}')">Excluir</button></div>`).join(""):"Nenhum cliente cadastrado."}
function renderRoutes(){$("routesList").innerHTML=R.length?R.map(r=>`<div class="item"><div class="grow"><b>${esc(r.name)}</b><div>${esc(r.city)} · ${r.date?new Date(r.date+"T12:00:00").toLocaleDateString("pt-BR"):""}</div></div><button class="btn danger" onclick="del('routes/${r.id}')">Excluir</button></div>`).join(""):"Nenhuma rota cadastrada."}
function renderSelects(){$("cr").innerHTML="<option value=''>Selecione</option>"+R.map(r=>`<option value="${r.id}">${esc(r.name)} — ${esc(r.city)}</option>`).join("");$("vc").innerHTML="<option value=''>Selecione o cliente</option>"+C.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}
function saleClient(){let c=C.find(x=>x.id==$("vc").value),r=c?R.find(x=>x.id==c.route_id):null;$("vcity").value=c?(c.city||r?.city||""):"";$("vroute").value=r?.name||c?.route_name||"";$("vdate").value=r?.date?new Date(r.date+"T12:00:00").toLocaleDateString("pt-BR"):(c?.route_date?new Date(c.route_date+"T12:00:00").toLocaleDateString("pt-BR"):"")}
function renderSale(){$("saleProducts").innerHTML=P.length?P.map(p=>`<div class="item"><img src="${p.photo||""}"><div class="grow"><b>${esc(p.name)}</b><div>${money(p.price)}</div></div><input class="qty" type="number" min="0" value="${cart[p.id]||0}" onchange="qty(${p.id},this.value)"></div>`).join(""):"Cadastre produtos primeiro.";total()}
function qty(id,v){v=Math.max(0,parseInt(v||0));if(v)cart[id]=v;else delete cart[id];total()}
function items(){return Object.entries(cart).map(([id,q])=>{let p=P.find(x=>x.id==id);return p?{product_id:p.id,name:p.name,price:+p.price,qty:q,total:+p.price*q}:null}).filter(Boolean)}
function total(){$("saleTotal").textContent=money(items().reduce((s,x)=>s+x.total,0))}
async function finishSale(){let c=C.find(x=>x.id==$("vc").value),r=c?R.find(x=>x.id==c.route_id):null,it=items();if(!c)return toast("Escolha o cliente");if(!it.length)return toast("Escolha os produtos");let t=it.reduce((s,x)=>s+x.total,0);
await post("sales",{client_id:c.id,client_name:c.name,city:c.city||r?.city||"",route_id:c.route_id,route_name:r?.name||"",route_date:r?.date||"",payment:$("vpay").value,items:it,total:t});
let msg=`VENDA REALIZADA\\nCliente: ${c.name}\\nCidade: ${c.city||r?.city||""}\\nRota: ${r?.name||""}\\n`+it.map(x=>`${x.qty}x ${x.name} — ${money(x.total)}`).join("\\n")+`\\nTOTAL: ${money(t)}\\nPagamento: ${$("vpay").value}`;
cart={};await load();renderSale();if(c.phone)window.open("https://wa.me/"+c.phone.replace(/\\D/g,"")+"?text="+encodeURIComponent(msg),"_blank");toast("Venda realizada")}
async function addProduct(){let n=$("pn").value.trim(),pr=+$("pp").value;if(!n||pr<=0)return toast("Informe nome e preço");let photo="",f=$("pf").files[0];if(f)photo=await new Promise(z=>{let a=new FileReader();a.onload=()=>z(a.result);a.readAsDataURL(f)});await post("products",{name:n,price:pr,code:$("pc").value.trim(),photo});$("pn").value=$("pp").value=$("pc").value="";$("pf").value="";await load();toast("Produto salvo")}
async function addRoute(){let n=$("rn").value.trim(),c=$("rc").value.trim(),d=$("rd").value;if(!n||!c)return toast("Informe rota e cidade");await post("routes",{name:n,city:c,date:d});$("rn").value=$("rc").value=$("rd").value="";await load();toast("Rota salva")}
async function addClient(){let n=$("cn").value.trim(),t=$("ct").value.trim(),rid=+$("cr").value,r=R.find(x=>x.id===rid);if(!n||!r)return toast("Informe cliente e rota");await post("clients",{name:n,phone:t,city:r.city,route_id:rid});$("cn").value=$("ct").value="";await load();toast("Cliente salvo")}
async function del(x){if(!confirm("Excluir?"))return;await fetch("/api/"+x,{method:"DELETE"});await load()}
function catalog(t){let u=location.origin+"/catalog.html?token="+t;navigator.clipboard?.writeText(u);prompt("Link do catálogo do cliente:",u)}
function renderOrders(){$("ordersList").innerHTML=O.length?O.map(o=>{let it=[];try{it=JSON.parse(o.items||"[]")}catch{}return `<div class="card"><div class="row"><b>${esc(o.client_name)}</b><span class="pill">${esc(o.status)}</span></div><div class="muted">${esc(o.city)} · ${esc(o.route_name)}</div><ul>${it.map(x=>`<li>${x.qty}x ${esc(x.name)} — ${money(x.total)}</li>`).join("")}</ul><b>${money(o.total)}</b>${o.status==="Novo"?`<br><br><button class="btn" onclick="attend(${o.id})">Marcar atendido</button>`:""}</div>`}).join(""):"Nenhum pedido recebido."}
async function attend(id){await post("orders/"+id,{});await load();toast("Pedido atendido")}
function renderReceive(){let a=V.filter(x=>x.status!=="Pago"),sum=a.reduce((s,x)=>s+x.total,0);$("receiveList").innerHTML=`<div class="card"><b>Total a receber</b><div class="total">${money(sum)}</div></div>`+(a.length?a.map(v=>`<div class="card"><div class="row"><b>${esc(v.client_name)}</b><span>${money(v.total)}</span></div><div>${esc(v.city)} · ${esc(v.payment)}</div><div class="muted">${new Date(v.created_at).toLocaleDateString("pt-BR")}</div><br><button class="btn" onclick="paid(${v.id})">Marcar como pago</button></div>`).join(""):"<div class='card'>Nenhuma conta pendente.</div>"}
async function paid(id){await post("sales/"+id+"/paid",{});await load();toast("Pagamento registrado")}
function renderReport(){let sold=V.reduce((s,x)=>s+x.total,0),received=V.filter(x=>x.status==="Pago").reduce((s,x)=>s+x.total,0),open=sold-received;let today=new Date().toISOString().slice(0,10),day=V.filter(x=>x.created_at?.slice(0,10)===today).reduce((s,x)=>s+x.total,0);$("reportList").innerHTML=`<div class="stats"><div class="stat"><div class="muted">Vendido total</div><div class="num">${money(sold)}</div></div><div class="stat"><div class="muted">Recebido</div><div class="num">${money(received)}</div></div><div class="stat"><div class="muted">Em aberto</div><div class="num">${money(open)}</div></div><div class="stat"><div class="muted">Vendido hoje</div><div class="num">${money(day)}</div></div></div>`}
load();
</script></body></html>`;

const CATALOG=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catálogo</title><style>body{margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}header{background:#111827;color:#fff;padding:20px}.wrap{max-width:700px;margin:auto;padding:12px}.card{background:#fff;border-radius:15px;padding:14px;margin:10px 0}.it{display:flex;gap:10px;align-items:center;border-bottom:1px solid #eee;padding:10px 0}.it img{width:68px;height:68px;object-fit:cover;border-radius:9px;background:#eee}.grow{flex:1}.q{width:68px;padding:10px;border:1px solid #ddd;border-radius:9px}.btn{width:100%;padding:14px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:800}.total{font-size:25px;font-weight:900}</style></head><body><header><h2>🛍️ Catálogo</h2><div id="hello"></div></header><div class="wrap"><div id="list"></div><div class="card"><label>Nome</label><input id="name" style="width:100%;padding:12px;box-sizing:border-box;border:1px solid #ddd;border-radius:9px"><br><br><button class="btn" onclick="send()">Enviar pedido</button><p id="total" class="total">R$ 0,00</p></div></div>
<script>
let token=new URLSearchParams(location.search).get("token"),c,P=[],cart={};const $=x=>document.getElementById(x),money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function load(){c=await(await fetch("/api/catalog-client?token="+encodeURIComponent(token))).json();if(!c||c.error){$("hello").textContent="Catálogo não encontrado";return}$("hello").textContent="Olá, "+c.name;P=await(await fetch("/api/products")).json();render()}
function render(){$("list").innerHTML=P.map(p=>`<div class="card it"><img src="${p.photo||""}"><div class="grow"><b>${p.name}</b><div>${money(p.price)}</div></div><input class="q" type="number" min="0" value="${cart[p.id]||0}" onchange="q(${p.id},this.value)"></div>`).join("");tot()}
function q(id,v){v=Math.max(0,parseInt(v||0));if(v)cart[id]=v;else delete cart[id];tot()}
function tot(){let t=Object.entries(cart).reduce((s,[id,q])=>{let p=P.find(x=>x.id==id);return s+(p?p.price*q:0)},0);$("total").textContent=money(t)}
async function send(){let it=Object.entries(cart).map(([id,q])=>{let p=P.find(x=>x.id==id);return p?{product_id:p.id,name:p.name,price:+p.price,qty:q,total:+p.price*q}:null}).filter(Boolean);if(!it.length)return alert("Escolha pelo menos um produto.");let t=it.reduce((s,x)=>s+x.total,0),name=$("name").value.trim()||c.name;await fetch("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_id:c.id,client_name:name,city:c.city||c.route_city||"",route_id:c.route_id,route_name:c.route_name||"",items:it,total:t})});alert("Pedido enviado com sucesso!");cart={};render()}load();
</script></body></html>`;
